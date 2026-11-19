// ATLAS console · God's Eye View.
// The panels slide off and the NASA globe takes the whole screen, with an orbital HUD:
// a DSKY readout of latitude, longitude and altitude (Apollo AGC Verb 06 Noun 43), layer
// keys, an altitude tape, preset targets, a command line and an in-view PROBE that runs the
// real trend test on the target. Every number on the HUD comes from the globe camera, the
// cursor or a real NASA POWER result.
import { trendGlobe, trendSnapshot } from '../trends-ui';
import { PRESETS, fmt, variableById, type TrendResult } from '../trends';
import { SegDisplay, Lamp, reduced } from './instruments';

const root = document.documentElement;
const EARTH_KM = 6371;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let hud: HTMLElement;
let raf = 0;
let cursor: { lat: number; lon: number } | null = null;
let pointer = { x: 0, y: 0, inside: false };
const seg: Record<string, SegDisplay> = {};
const lamp: Record<string, Lamp> = {};
const opt = { grid: true, night: false, sun: false, data: true };
let logFn: (code: string, text: string, level?: 'ok' | 'info' | 'warn' | 'err') => void = () => {};

export const gevActive = () => root.classList.contains('gev');

export function initGev(log: typeof logFn) {
  logFn = log;
  hud = document.createElement('div');
  hud.className = 'gev-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = `
    <div class="gev-top">
      <div class="gev-title"><span class="hp-code">GEV · STN 01</span><strong>God's Eye View</strong><small>Orbital observation · NASA Blue Marble, VIIRS night lights, NASA GIBS layers</small></div>
      <button type="button" class="cn-key gev-exit" data-gev="exit">EXIT VIEW <kbd>G</kbd></button>
    </div>
    <section class="gev-dsky gev-box" aria-label="DSKY: latitude, longitude, altitude">
      <header><span>DSKY</span><button type="button" class="info-btn" data-info="dsky" aria-label="About the DSKY">i</button></header>
      <div class="dsky-grid">
        <div class="dsky-lamps"></div>
        <div class="dsky-regs">
          <div class="dsky-pvn"><label>PROG<span id="gev-prog"></span></label><label>VERB<span id="gev-verb"></span></label><label>NOUN<span id="gev-noun"></span></label></div>
          <div class="dsky-r"><i>R1</i><em id="gev-s1">+</em><span id="gev-r1"></span><small>LAT °</small></div>
          <div class="dsky-r"><i>R2</i><em id="gev-s2">+</em><span id="gev-r2"></span><small>LON °</small></div>
          <div class="dsky-r"><i>R3</i><em id="gev-s3">+</em><span id="gev-r3"></span><small>ALT KM</small></div>
        </div>
      </div>
      <p class="gev-cap" id="gev-cap">V06 N43 · display latitude, longitude, altitude</p>
    </section>
    <section class="gev-layers gev-box" aria-label="Layers">
      <header><span>LAYERS</span><button type="button" class="info-btn" data-info="gevlayers" aria-label="About layers">i</button></header>
      <div class="gev-keys">
        <button type="button" data-gev="base" data-v="map">MARBLE</button>
        <button type="button" data-gev="base" data-v="satellite">SAT</button>
        <button type="button" data-gev="data">DATA</button>
        <button type="button" data-gev="night">NIGHT</button>
        <button type="button" data-gev="sun">LIVE SUN</button>
        <button type="button" data-gev="grid">GRID</button>
        <button type="button" data-gev="spin">SPIN</button>
      </div>
    </section>
    <section class="gev-targets gev-box" aria-label="Targets">
      <header><span>TARGETS</span><button type="button" class="info-btn" data-info="gevtargets" aria-label="About targets">i</button></header>
      <div class="gev-keys gev-tgt">${PRESETS.map((p) => `<button type="button" data-gev="goto" data-v="${p.name}">${p.name.toUpperCase()}</button>`).join('')}</div>
      <button type="button" class="gev-probe-key" data-gev="probe">PROBE TARGET</button>
    </section>
    <div class="gev-alt" aria-label="Altitude tape"><span class="gev-alt-lab">ALT · 1000 KM</span><div class="gev-tape" id="gev-tape"></div><b class="gev-alt-ptr" id="gev-alt-ptr"></b>
      <button type="button" data-gev="zoom" data-v="in" aria-label="Zoom in">+</button><button type="button" data-gev="zoom" data-v="out" aria-label="Zoom out">−</button></div>
    <section class="gev-probe gev-box" id="gev-probe" hidden aria-live="polite">
      <header><span>PROBE TLM</span><button type="button" class="info-btn" data-info="gevprobe" aria-label="About the probe">i</button></header>
      <div class="gp-body"></div>
    </section>
    <form class="gev-cmd gev-box" id="gev-cmd" autocomplete="off">
      <ol class="gev-out" id="gev-out" aria-live="polite"></ol>
      <label><span>ATLAS&gt;</span><input id="gev-in" spellcheck="false" placeholder="GOTO AMAZON · LAYER SAT · PROBE · HELP" aria-label="Command line" /></label>
    </form>
    <div class="gev-cross" aria-hidden="true"></div>
    <div class="gev-cursor" id="gev-cursor" hidden></div>`;
  document.body.append(hud);

  seg.prog = mk('gev-prog', 2, 'green'); seg.verb = mk('gev-verb', 2, 'green'); seg.noun = mk('gev-noun', 2, 'green');
  seg.r1 = mk('gev-r1', 5, 'green'); seg.r2 = mk('gev-r2', 5, 'green'); seg.r3 = mk('gev-r3', 5, 'green');
  seg.prog.set('01'); seg.verb.set('06'); seg.noun.set('43');
  const lamps = hud.querySelector('.dsky-lamps')!;
  for (const [k, l, tip] of [['comp', 'COMP ACTY', 'Lit while a NASA POWER request is in flight'], ['trk', 'TRACK', 'Lit while R1/R2 follow the cursor; dark when they show the view centre'], ['spin', 'SPIN', 'Globe auto-rotation'], ['tgt', 'TGT LOCK', 'A target is set'], ['link', 'LINK', 'Last NASA POWER request succeeded'], ['opr', 'OPR ERR', 'The last command or request failed']] as const) {
    lamp[k] = new Lamp(l, { tip });
    lamps.append(lamp[k].el);
  }
  buildTape();

  hud.addEventListener('click', onKey);
  $('gev-cmd').addEventListener('submit', (e) => { e.preventDefault(); const i = $<HTMLInputElement>('gev-in'); run(i.value); i.value = ''; });
  window.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY, inside: !(e.target as HTMLElement).closest('.gev-box, .bar, .gev-alt, .gev-top') }; });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && gevActive() && !document.querySelector('dialog[open]') && (t.id === 'gev-in' || !t.closest('input, textarea'))) { toggle(false); return; }
    if (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey && root.dataset.station === 'trends') { e.preventDefault(); toggle(); }
    if (e.key === 'Escape' && gevActive()) toggle(false);
  });
  document.addEventListener('atlas:state', (e) => {
    const d = (e as CustomEvent).detail as { type: string; result?: TrendResult; message?: string };
    if (d.type === 'run-start') { lamp.comp.set('white', true); }
    if (d.type === 'run-end') lamp.comp.set('off');
    if (d.type === 'run-ok' && d.result) { lamp.link.set('green'); lamp.opr.set('off'); paintProbe(d.result); if (gevActive()) say(`PROBE COMPLETE · ${d.result.place.name.toUpperCase()}`, 'ok'); }
    if (d.type === 'run-error') { lamp.link.set('red'); lamp.opr.set('amber', true); if (gevActive()) say(String(d.message || 'REQUEST FAILED').toUpperCase().slice(0, 110), 'err'); }
    if (d.type === 'place') { const r = trendSnapshot().result; $('gev-probe').hidden = !(r && r.place.name === trendSnapshot().place.name); }
  });
}
function mk(id: string, n: number, color: 'green' | 'amber') { const s = new SegDisplay(n, { color }); $(id).append(s.el); return s; }

export function toggle(on = !gevActive()) {
  const g = trendGlobe();
  if (on === gevActive()) return;
  root.classList.toggle('gev', on);
  hud.setAttribute('aria-hidden', String(!on));
  if (on) {
    g?.setGrid(opt.grid);
    paintKeys();
    const r = trendSnapshot().result;
    if (r) paintProbe(r);
    say('GOD\'S EYE VIEW ENGAGED · DRAG TO TURN · SCROLL TO CHANGE ALTITUDE · CLICK TO SET TARGET', 'ok');
    logFn('GEV', 'GOD\'S EYE VIEW ENGAGED');
    loop();
    window.setTimeout(() => $<HTMLInputElement>('gev-in').focus({ preventScroll: true }), reduced() ? 0 : 500);
  } else {
    g?.setGrid(false);
    cancelAnimationFrame(raf);
    $('gev-cursor').hidden = true;
    logFn('GEV', 'GOD\'S EYE VIEW DISENGAGED · PANELS RESTORED');
  }
}

function loop() {
  const g = trendGlobe();
  if (!gevActive() || !g) return;
  const v = g.view;
  cursor = pointer.inside ? g.pickAt(pointer.x, pointer.y) : null;
  const lat = cursor ? cursor.lat : v.lat, lon = cursor ? cursor.lon : v.lon;
  const alt = (v.dist - 1) * EARTH_KM;
  setReg(1, lat, 2); setReg(2, lon, 2); setReg(3, alt, 0);
  lamp.trk.set(cursor ? 'white' : 'off');
  lamp.spin.set(v.spinning ? 'green' : 'off');
  lamp.tgt.set(trendSnapshot().place ? 'green' : 'off');
  const c = $('gev-cursor');
  if (cursor) {
    c.hidden = false;
    c.textContent = `${Math.abs(cursor.lat).toFixed(2)}°${cursor.lat >= 0 ? 'N' : 'S'}  ${Math.abs(cursor.lon).toFixed(2)}°${cursor.lon >= 0 ? 'E' : 'W'}`;
    c.style.transform = `translate(${pointer.x + 16}px, ${pointer.y + 14}px)`;
  } else c.hidden = true;
  const ptr = $('gev-alt-ptr');
  ptr.style.top = `${altPos(alt) * 100}%`;
  ptr.textContent = `${Math.round(alt).toLocaleString('en-US')}`;
  raf = requestAnimationFrame(loop);
}
function setReg(n: 1 | 2 | 3, v: number, dec: number) {
  $(`gev-s${n}`).textContent = v < 0 ? '−' : '+';
  seg[`r${n}`].set(Math.abs(v).toFixed(dec));
}

// Altitude tape: 2,000 to 30,000 km, linear.
const ALT_MIN = 2000, ALT_MAX = 30000;
const altPos = (km: number) => 1 - (Math.min(ALT_MAX, Math.max(ALT_MIN, km)) - ALT_MIN) / (ALT_MAX - ALT_MIN);
function buildTape() {
  const tape = $('gev-tape');
  for (let km = ALT_MIN; km <= ALT_MAX; km += 1000) {
    const t = document.createElement('i');
    t.className = km % 5000 === 0 ? 'major' : '';
    t.style.top = `${altPos(km) * 100}%`;
    if (km % 5000 === 0) t.dataset.l = String(km / 1000);
    tape.append(t);
  }
  tape.addEventListener('click', (e) => {
    const r = tape.getBoundingClientRect();
    const km = ALT_MAX - ((e.clientY - r.top) / r.height) * (ALT_MAX - ALT_MIN);
    trendGlobe()?.setDistance(1 + km / EARTH_KM);
  });
}

function onKey(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-gev]');
  if (!b) return;
  const a = b.dataset.gev!, v = b.dataset.v;
  if (a === 'exit') toggle(false);
  else if (a === 'base') run(`LAYER ${v === 'satellite' ? 'SAT' : 'MARBLE'}`);
  else if (a === 'data') run(`DATA ${opt.data ? 'OFF' : 'ON'}`);
  else if (a === 'night') run(`NIGHT ${opt.night ? 'OFF' : 'ON'}`);
  else if (a === 'sun') run(`SUN ${opt.sun ? 'OFF' : 'ON'}`);
  else if (a === 'grid') run(`GRID ${opt.grid ? 'OFF' : 'ON'}`);
  else if (a === 'spin') run(`SPIN ${trendGlobe()?.view.spinning ? 'OFF' : 'ON'}`);
  else if (a === 'goto') run(`GOTO ${v}`);
  else if (a === 'probe') run('PROBE');
  else if (a === 'zoom') run(`ZOOM ${v === 'in' ? 'IN' : 'OUT'}`);
}

function paintKeys() {
  const s = trendSnapshot(), g = trendGlobe();
  hud.querySelectorAll<HTMLButtonElement>('[data-gev]').forEach((b) => {
    const a = b.dataset.gev;
    const on = a === 'base' ? s.base === b.dataset.v : a === 'grid' ? opt.grid : a === 'night' ? opt.night : a === 'sun' ? opt.sun : a === 'data' ? opt.data : a === 'spin' ? Boolean(g?.view.spinning) : a === 'goto' ? s.place.name === b.dataset.v : null;
    if (on === null) return;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function say(text: string, level: 'ok' | 'info' | 'warn' | 'err' = 'info') {
  const out = $('gev-out');
  const li = document.createElement('li');
  li.className = `log-${level}`;
  li.textContent = text;
  out.append(li);
  while (out.children.length > 5) out.firstElementChild!.remove();
}

const HELP_LINES = ['GOTO <PRESET> · GOTO <LAT>,<LON>', 'LAYER MARBLE|SAT · DATA|NIGHT|SUN|GRID|SPIN ON|OFF', 'ZOOM IN|OUT|<KM> · PROBE · EXIT'];
/** The command line: a small, honest set of verbs. */
export function run(raw: string) {
  const cmd = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cmd) return;
  const g = trendGlobe();
  say(`ATLAS> ${cmd}`);
  const [verb, ...rest] = cmd.split(' ');
  const arg = rest.join(' ');
  const onoff = (x: string) => (x === 'ON' ? true : x === 'OFF' ? false : null);
  const fail = (m: string) => { say(m, 'err'); lamp.opr.set('amber', true); };
  lamp.opr.set('off');
  switch (verb) {
    case 'HELP': case '?': HELP_LINES.forEach((l) => say(l)); break;
    case 'EXIT': case 'QUIT': toggle(false); break;
    case 'GOTO': case 'GO': {
      const ll = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(arg);
      if (ll) {
        const lat = Number(ll[1]), lon = Number(ll[2]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { fail('COORDINATES OUT OF RANGE'); break; }
        g?.onPick?.(lat, lon);
        say(`TARGET SET ${lat.toFixed(2)}, ${lon.toFixed(2)} · POINT`, 'ok');
        break;
      }
      const p = PRESETS.find((x) => x.name.toUpperCase().startsWith(arg)) ?? PRESETS.find((x) => x.name.toUpperCase().includes(arg));
      if (!p || !arg) { fail(`NO TARGET "${arg}" · TRY ${PRESETS.map((x) => x.name.split(/[ ,]/)[0].toUpperCase()).join(' ')}`); break; }
      document.querySelector<HTMLButtonElement>(`#trend-presets button[data-name="${p.name}"]`)?.click();
      say(`TARGET ${p.name.toUpperCase()} · ${p.mode === 'region' ? 'REGION' : 'POINT'}`, 'ok');
      break;
    }
    case 'LAYER': {
      const base = arg === 'SAT' || arg === 'SATELLITE' ? 'satellite' : arg === 'MARBLE' || arg === 'MAP' ? 'map' : null;
      if (!base) { fail('LAYER MARBLE OR LAYER SAT'); break; }
      document.querySelector<HTMLButtonElement>(`#trend-basemap button[data-base="${base}"]`)?.click();
      say(`BASE LAYER ${base === 'map' ? 'BLUE MARBLE' : 'SATELLITE'}`, 'ok');
      break;
    }
    case 'GRID': case 'NIGHT': case 'SUN': case 'DATA': case 'SPIN': {
      const v = onoff(arg);
      if (v === null) { fail(`${verb} ON OR ${verb} OFF`); break; }
      if (verb === 'GRID') { opt.grid = v; g?.setGrid(v); }
      if (verb === 'NIGHT') { opt.night = v; g?.setNight(v); }
      if (verb === 'SUN') { opt.sun = v; g?.setLiveSun(v); if (v) { opt.night = true; g?.setNight(true); } }
      if (verb === 'SPIN') g?.setSpin(v);
      if (verb === 'DATA') {
        opt.data = v;
        const s = trendSnapshot(), info = variableById(s.variable);
        const y = Number((document.getElementById('trend-year') as HTMLInputElement).value), m = Number((document.getElementById('trend-month') as HTMLInputElement).value);
        g?.setOverlay(v && info.gibs ? info.id : null, Math.min(y, info.gibsLastYear ?? y), m);
        if (v && !info.gibs) say(`NO NASA GIBS LAYER FOR ${info.short.toUpperCase()}`, 'warn');
      }
      say(`${verb} ${v ? 'ON' : 'OFF'}`, 'ok');
      break;
    }
    case 'ZOOM': {
      if (!g) break;
      const d = g.view.dist;
      if (arg === 'IN') g.setDistance(1 + (d - 1) * 0.7);
      else if (arg === 'OUT') g.setDistance(1 + (d - 1) / 0.7);
      else if (/^\d+$/.test(arg)) g.setDistance(1 + Number(arg) / EARTH_KM);
      else { fail('ZOOM IN, ZOOM OUT OR ZOOM <KM>'); break; }
      say(`ALTITUDE ${Math.round((g.view.dist - 1) * EARTH_KM).toLocaleString('en-US')} KM`, 'ok');
      break;
    }
    case 'PROBE': case 'RUN': case 'EXECUTE': {
      const view = document.querySelector<HTMLButtonElement>('#trend-view button[data-view="single"]');
      if (view && !view.classList.contains('is-on')) view.click();
      const s = trendSnapshot();
      say(`PROBING ${s.place.name.toUpperCase()} · ${variableById(s.variable).short.toUpperCase()} · ${s.start}–${s.end}`);
      document.getElementById('trend-run')?.click();
      break;
    }
    case 'V06N43': say('V06 N43 · DISPLAYING LAT, LON, ALT', 'ok'); break;
    default: fail(`UNKNOWN VERB ${verb} · TYPE HELP`);
  }
  paintKeys();
}

function paintProbe(r: TrendResult) {
  const box = $('gev-probe');
  const st = r.stats;
  box.hidden = false;
  const body = box.querySelector('.gp-body')!;
  if (!st) { body.innerHTML = `<p>${r.place.name}: not enough complete years to test.</p>`; return; }
  const a = r.series.annual.map((x) => x.v);
  const lo = Math.min(...a), hi = Math.max(...a), W = 220, H = 46;
  const pts = a.map((v, i) => `${((i / Math.max(1, a.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2).toFixed(1)}`).join(' ');
  const sig = st.mk.p < 0.05;
  body.innerHTML = `<div class="gp-head"><b></b><span></span></div>
    <div class="gp-rate"><strong>${st.senPerDecade > 0 ? '+' : ''}${fmt(st.senPerDecade, 2)}</strong><span>${r.variable.annualUnit} / decade</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="gp-spark" role="img" aria-label="Annual record"><polyline points="${pts}" /></svg>
    <div class="gp-row"><span class="gp-lamp ${sig ? 'go' : ''}">${sig ? 'SIG @ 95%' : 'NOT SIG'}</span><span>MK p ${st.mk.p < 0.001 ? '<0.001' : fmt(st.mk.p, 3)}</span><span>${r.period.start}–${r.period.end}</span></div>
    <button type="button" class="gp-open">Open full telemetry</button>`;
  body.querySelector('.gp-head b')!.textContent = r.place.name.toUpperCase();
  body.querySelector('.gp-head span')!.textContent = r.variable.short.toUpperCase();
  body.querySelector('.gp-open')!.addEventListener('click', () => toggle(false));
}
