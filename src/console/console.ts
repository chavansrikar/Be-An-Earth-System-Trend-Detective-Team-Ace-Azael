// ATLAS console · Apollo-era operations panel over the existing Trends station.
// The console never keeps its own copy of the analysis: every control acts through the
// existing buttons and selects, and every instrument re-reads trendSnapshot() when the
// trends module broadcasts 'atlas:state'.
import { GROUPS, VARIABLES, variableById, fmt, type TrendResult, type VariableGroup, type VariableId } from '../trends';
import { trendSnapshot } from '../trends-ui';
import { Knob, Toggle, Lamp, SegDisplay, Gauge, Scope, CrtLog, module, infoButton, reduced } from './instruments';
import { initHelp, openManual, startTour, briefed, STATIONS, type TourStep } from './help';
import { initBay } from './bay';
import { initGev, toggle as toggleGev } from './gev';
import './apollo.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};
const root = document.documentElement;
type Snap = ReturnType<typeof trendSnapshot>;
const VIEW_LABEL: Record<string, string> = { single: 'SINGLE PLACE', compare: 'COMPARE PLACES', map: 'MAP THE CHANGE', sweep: 'SCAN ALL VARIABLES' };
const VIEW_NOTE: Record<string, string> = {
  single: 'One record, full test suite: rate, significance, change point.',
  compare: 'Same sensor and window for 2–6 targets, corrected for multiple tests.',
  map: 'Every NASA POWER grid cell in a box gets its own test.',
  sweep: 'Every sensor at one target, ranked by what is really changing.',
};

// Console-only settings (they change presentation, never the data).
const ui = { alpha: 0.05, acked: '', crt: true, reticle: true };

// Instruments, created in init()
let log: CrtLog;
let scope: Scope;
let modeKnob: Knob<string>;
let groupKnob: Knob<VariableGroup>;
let fineKnob: Knob<VariableId> | null = null;
let fineHost: HTMLElement;
let startKnob: Knob<number>;
let endKnob: Knob<number>;
let alphaKnob: Knob<number>;
let yearKnob: Knob<number> | null = null;
let monthKnob: Knob<number> | null = null;
const seg: Record<string, SegDisplay> = {};
const lamp: Record<string, Lamp> = {};
const tg: Record<string, Toggle> = {};
let gRate: Gauge, gP: Gauge, gTau: Gauge;
let master: HTMLButtonElement;
const link = { power: 'off' as 'off' | 'busy' | 'ok' | 'err', powerMs: 0, gibs: 0, gibsErr: 0, ai: null as boolean | null };

export function initConsole() {
  root.dataset.console = 'apollo';
  initHelp();
  buildHeader();
  buildLeft();
  buildRight();
  buildCentre();
  initBay(q('.cn-rail')!, (c, t) => log.push(c, t));
  initGev((c, t, l) => log.push(c, t, l));
  buildPlacard();
  bindState();
  watchStation();
  startClocks();
  watchGibs();
  sync('init');
  log.push('SYS', 'ATLAS CONSOLE ONLINE · STN 01 TRENDS', 'ok');
  log.push('SYS', 'AWAITING TARGET · PRESS EXECUTE OR LOAD A PROFILE');
}

// ---------------------------------------------------------------------------
// Header rail: station select, clocks, link lamps, help
// ---------------------------------------------------------------------------
function buildHeader() {
  const bar = q('.bar')!;
  // Number the station keys. Their purpose is read out to screen readers; no hover tooltip,
  // because it landed on top of the station plate that already says the same thing.
  document.querySelectorAll<HTMLButtonElement>('.modes .mode').forEach((b) => {
    const st = STATIONS[b.dataset.mode || ''];
    if (!st) return;
    const n = h('span', 'mode-n', st.n);
    b.prepend(n);
    b.setAttribute('aria-description', `Station ${st.n}: ${st.purpose}`);
  });
  const nav = q('.modes')!;
  nav.setAttribute('aria-label', 'Station select');
  nav.after(Object.assign(infoButton('station', 'station select'), { className: 'info-btn info-nav' }));

  const right = h('div', 'cn-rail');
  const clk = (label: string, key: string, tip: string) => {
    const box = h('div', 'cn-clock');
    box.dataset.tip = tip;
    box.dataset.helpRegion = 'met';
    seg[key] = new SegDisplay(6, { color: 'amber', label });
    box.append(h('span', 'cn-clock-lab', label), seg[key].el);
    return box;
  };
  const lamps = h('div', 'cn-links');
  lamps.dataset.helpRegion = 'links';
  for (const [k, legend] of [['power', 'POWER'], ['gibs', 'GIBS'], ['ai', 'AI']] as const) {
    lamp[`link-${k}`] = new Lamp(legend, { small: true });
    lamps.append(lamp[`link-${k}`].el);
  }
  lamps.append(infoButton('links', 'data link lamps'));
  const help = h('button', 'cn-key cn-help', 'HELP') as HTMLButtonElement;
  help.type = 'button';
  help.dataset.tip = 'Open the ATLAS Flight Manual (key ?)';
  help.addEventListener('click', () => openManual());
  const brief = h('button', 'cn-key cn-brief', 'BRIEFING') as HTMLButtonElement;
  brief.type = 'button';
  brief.dataset.tip = 'A guided tour of every panel on this console';
  brief.classList.toggle('pending', !briefed());
  brief.addEventListener('click', () => { brief.classList.remove('pending'); runBriefing(); });
  const gev = h('button', 'cn-key cn-gev', "GOD'S EYE") as HTMLButtonElement;
  gev.type = 'button';
  gev.dataset.tip = "God's Eye View: clear the console and fly the globe (key G)";
  gev.addEventListener('click', () => { if (root.dataset.station !== 'trends') q<HTMLButtonElement>('.mode[data-mode="trends"]')?.click(); toggleGev(); });
  right.append(clk('MET', 'met', 'Mission Elapsed Time: time since this session began (h.m.s)'), clk('GMT', 'gmt', 'Greenwich Mean Time (UTC), used by the event log'), lamps, gev, help, brief);
  bar.append(right);

  // Station plate + breadcrumb
  const plate = h('div', 'cn-plate');
  plate.id = 'cn-plate';
  plate.innerHTML = '<span class="cn-stn"><b></b><i></i></span><span class="cn-stn-text"><strong></strong><small></small></span><nav class="cn-crumb" aria-label="Breadcrumb"></nav>';
  plate.append(infoButton('station', 'this station'));
  document.body.append(plate);
}

function paintStation(mode: string) {
  const st = STATIONS[mode] ?? STATIONS.trends;
  const plate = $('cn-plate');
  q('.cn-stn b', plate)!.textContent = st.n;
  q('.cn-stn i', plate)!.textContent = st.role;
  q('.cn-stn-text strong', plate)!.textContent = `STN ${st.n} · ${st.name.toUpperCase()}`;
  q('.cn-stn-text small', plate)!.textContent = st.purpose;
  root.dataset.station = mode;
  // One dossier panel serves Library, Scan and Build: name the station it is on.
  const dossier: Record<string, string> = { library: 'STN 04 · Library · machine dossier', scan: 'STN 05 · Scan · object dossier', build: 'STN 06 · Build · model dossier' };
  if (dossier[mode]) document.getElementById('intro')?.setAttribute('data-plate', dossier[mode]);
  paintPlacard(mode);
  if (mode !== 'trends') toggleGev(false);
  paintCrumb();
}

function paintCrumb() {
  const crumb = q('.cn-crumb')!;
  const mode = root.dataset.station || 'trends';
  const parts = [STATIONS[mode]?.name.toUpperCase() ?? mode.toUpperCase()];
  if (mode === 'trends') {
    const s = trendSnapshot();
    parts.push(VIEW_LABEL[s.view] ?? s.view.toUpperCase());
    if (s.view !== 'compare') parts.push(s.place.name.toUpperCase());
    if (s.view !== 'sweep') parts.push(variableById(s.variable).short.toUpperCase());
  }
  crumb.replaceChildren(...parts.flatMap((p, i) => [i ? h('span', 'sep', '›') : null, h('span', i === parts.length - 1 ? 'here' : '', p)].filter(Boolean) as HTMLElement[]));
}

function watchStation() {
  const read = () => {
    const m = /mode-(\w+)/.exec(document.body.className)?.[1] ?? 'trends';
    if (root.dataset.station !== m) {
      paintStation(m);
      if (log) log.push('NAV', `STATION ${STATIONS[m]?.n ?? '--'} ${STATIONS[m]?.name.toUpperCase() ?? m.toUpperCase()} SELECTED`);
    }
  };
  new MutationObserver(read).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  read();
}

// ---------------------------------------------------------------------------
// Left: control panels
// ---------------------------------------------------------------------------
function buildLeft() {
  const panel = $('trend-panel');
  const head = q('.trend-head', panel)!;
  head.classList.add('cn-titleblock');
  head.insertAdjacentHTML('afterbegin', '<span class="cn-doc">ATLAS-ETC · EARTH TREND CONSOLE · NASA POWER / MERRA-2</span>');

  // PNL 01 · Mission profiles
  const cases = $('trend-cases');
  const p1 = module('PNL 01', 'Mission profiles', 'profiles', 'pnl-profiles');
  q('.trend-field-label', cases)?.classList.add('visually-hidden');
  p1.body.append(cases);
  head.after(p1.el);

  // PNL 02 · Analysis mode
  const p2 = module('PNL 02', 'Analysis mode', 'mode', 'pnl-mode');
  modeKnob = new Knob<string>({
    label: 'MODE', kind: 'selector', help: 'mode', size: 92,
    positions: [{ value: 'single', label: 'Single place', short: 'SGL' }, { value: 'compare', label: 'Compare places', short: 'CMP' }, { value: 'map', label: 'Map the change', short: 'MAP' }, { value: 'sweep', label: 'Scan all variables', short: 'SCAN' }],
    value: 'single', sweep: 150,
    onChange: (v) => clickIn('#trend-view', `button[data-view="${v}"]`),
  });
  const modeRead = h('div', 'cn-lcd cn-mode-read');
  modeRead.innerHTML = '<b></b><span></span>';
  const view = $('trend-view');
  view.classList.add('cn-hidden-src');
  p2.body.append(modeKnob.el, modeRead, view);
  p1.el.after(p2.el);

  // PNL 03 · Target acquisition
  const p3 = module('PNL 03', 'Target acquisition', 'target', 'pnl-target');
  const tread = h('div', 'cn-target');
  seg.lat = new SegDisplay(7, { color: 'amber', label: 'Target latitude' });
  seg.lon = new SegDisplay(7, { color: 'amber', label: 'Target longitude' });
  lamp.pt = new Lamp('PT', { small: true, tip: 'Point: the single nearest NASA POWER grid cell' });
  lamp.rgn = new Lamp('RGN', { small: true, tip: 'Region: mean of a 3 × 3 block of grid cells' });
  const latBox = h('div', 'cn-readout'); latBox.append(h('span', 'cn-lab', 'LAT °N'), seg.lat.el);
  const lonBox = h('div', 'cn-readout'); lonBox.append(h('span', 'cn-lab', 'LON °E'), seg.lon.el);
  const kind = h('div', 'cn-kind'); kind.append(lamp.pt.el, lamp.rgn.el);
  tread.append(latBox, lonBox, kind);
  p3.body.append(tread, $('trend-locate'), $('trend-presets'), $('compare-setup'), $('map-setup'), $('sweep-setup'));
  p2.el.after(p3.el);

  // PNL 04 · Sensor select
  const p4 = module('PNL 04', 'Sensor select', 'sensor', 'pnl-sensor');
  const varField = $('trend-var-field');
  q('.trend-field-label', varField)?.classList.add('visually-hidden');
  $('trend-groups').classList.add('cn-hidden-src');
  const s0 = trendSnapshot();
  groupKnob = new Knob<VariableGroup>({
    label: 'GROUP', kind: 'selector', help: 'sensor', size: 92, sweep: 150,
    positions: GROUPS.map((g) => ({ value: g, label: g, short: g.slice(0, 3).toUpperCase() })),
    value: s0.group,
    onChange: (g) => clickIn('#trend-groups', `button[data-group="${g}"]`),
  });
  fineHost = h('div', 'cn-fine');
  const sensRead = h('div', 'cn-lcd cn-sensor-read');
  sensRead.innerHTML = '<b></b><span></span>';
  const row = h('div', 'cn-row cn-sensor-row');
  row.append(groupKnob.el, fineHost, sensRead);
  varField.prepend(row);
  p4.body.append(varField);
  p3.el.after(p4.el);

  // PNL 05 · Record window
  const p5 = module('PNL 05', 'Record window', 'window', 'pnl-window');
  const years = q('.trend-years')!;
  const yearsField = years.closest('.trend-field')!;
  yearsField.classList.add('cn-hidden-src');
  const yr = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => ({ value: a + i, label: String(a + i), short: `'${String(a + i).slice(2)}` }));
  startKnob = new Knob<number>({ label: 'START', kind: 'dial', positions: yr(1981, 2015), value: s0.start, every: 10, help: 'window', tip: 'First year of the record (drag, scroll or arrow keys)', onChange: (v) => setYear('trend-start', v) });
  endKnob = new Knob<number>({ label: 'END', kind: 'dial', positions: yr(1991, 2025), value: s0.end, every: 10, help: 'window', tip: 'Last year of the record', onChange: (v) => setYear('trend-end', v) });
  seg.start = new SegDisplay(4, { label: 'Start year' });
  seg.end = new SegDisplay(4, { label: 'End year' });
  seg.yrs = new SegDisplay(2, { color: 'green', label: 'Years in window' });
  const w1 = h('div', 'cn-dialset'); w1.append(startKnob.el, seg.start.el);
  const w2 = h('div', 'cn-dialset'); w2.append(endKnob.el, seg.end.el);
  const w3 = h('div', 'cn-readout cn-yrs'); w3.append(h('span', 'cn-lab', 'YRS'), seg.yrs.el);
  const timeline = h('div', 'cn-timeline');
  timeline.innerHTML = '<span class="tl-track"></span><span class="tl-win"></span><span class="tl-l">1981</span><span class="tl-r">2025</span>';
  timeline.dataset.tip = 'The record window against the full NASA POWER archive used here (1981–2025)';
  const wrow = h('div', 'cn-row'); wrow.append(w1, w3, w2);
  p5.body.append(wrow, timeline, yearsField);
  p4.el.after(p5.el);

  // PNL 06 · Test level α
  const p6 = module('PNL 06', 'Test level α', 'alpha', 'pnl-alpha');
  alphaKnob = new Knob<number>({
    label: 'α', kind: 'selector', help: 'alpha', size: 80, sweep: 100,
    positions: [{ value: 0.1, label: 'α 0.10 · 90% confidence', short: '.10' }, { value: 0.05, label: 'α 0.05 · 95% confidence', short: '.05' }, { value: 0.01, label: 'α 0.01 · 99% confidence', short: '.01' }],
    value: 0.05,
    onChange: (v) => { ui.alpha = v; log.push('CFG', `TEST LEVEL α ${v.toFixed(2)} · CONF ${Math.round((1 - v) * 100)}%`); paintTelemetry(); },
  });
  const aRead = h('div', 'cn-lcd cn-alpha-read');
  aRead.innerHTML = '<b>95%</b><span>CONFIDENCE · drives the VERDICT lamp and the green zone on GA 2</span>';
  p6.body.append(alphaKnob.el, aRead);

  // PNL 07 · Display control
  const p7 = module('PNL 07', 'Display control', 'display', 'pnl-display');
  const tgRow = h('div', 'cn-toggles');
  tg.series = new Toggle({ label: 'SERIES', up: 'MONTH', down: 'YEAR', on: false, help: 'display', tip: 'Plot annual totals or monthly values', onChange: (on) => clickIn('#trend-chart-legend', `button[data-chart="${on ? 'monthly' : 'annual'}"]`) });
  tg.base = new Toggle({ label: 'BASEMAP', up: 'SAT', down: 'MARBLE', on: false, help: 'display', tip: 'Blue Marble or satellite imagery under the data', onChange: (on) => clickIn('#trend-basemap', `button[data-base="${on ? 'satellite' : 'map'}"]`) });
  tg.globe = new Toggle({ label: 'GLOBE', up: '3D', down: 'NASA', on: false, help: 'display', tip: 'NASA Blue Marble globe or photoreal 3D tiles', onChange: (on) => clickIn('.trend-globe-row [data-globe-switch]', `button[data-globe-view="${on ? 'photo' : 'nasa'}"]`) });
  tg.crt = new Toggle({ label: 'CRT FX', up: 'ON', down: 'OFF', on: true, help: 'display', tip: 'Scanlines and glow on the screens', onChange: (on) => { ui.crt = on; root.classList.toggle('crt-off', !on); } });
  tg.reticle = new Toggle({ label: 'RETICLE', up: 'ON', down: 'OFF', on: true, help: 'display', tip: 'Ground-track crosshair over the globe', onChange: (on) => { ui.reticle = on; root.classList.toggle('reticle-off', !on); } });
  tgRow.append(tg.series.el, tg.base.el, tg.globe.el, tg.crt.el, tg.reticle.el);
  q('.trend-globe-row')?.classList.add('cn-hidden-src');
  // Screen: CRT phosphor or daylight print for the 3D stations, and CRT intensity.
  const curTheme = new URLSearchParams(location.search).get('theme') === 'daylight' ? 'daylight' : 'console';
  const screenKnob = new Knob<string>({
    label: 'SCREEN', kind: 'selector', size: 72, sweep: 70, help: 'screen',
    positions: [{ value: 'console', label: 'CRT · phosphor on black', short: 'CRT' }, { value: 'daylight', label: 'DAY · ink on paper', short: 'DAY' }],
    value: curTheme,
    onChange: (v) => { const u = new URL(location.href); u.searchParams.set('theme', v); log.push('DSP', `SCREEN ${v === 'console' ? 'CRT' : 'DAY'} · RELOADING`); window.setTimeout(() => location.assign(u.href), 250); },
  });
  const gains = [0.7, 0.85, 1, 1.15, 1.3];
  const intensity = new Knob<number>({
    label: 'INTENSITY', kind: 'dial', size: 72, labels: false, every: 1, help: 'screen', tip: 'Brightness of every CRT and LCD on the console',
    positions: gains.map((g) => ({ value: g, label: `${Math.round(g * 100)}%` })), value: 1,
    onChange: (g) => { root.style.setProperty('--crt-gain', String(g)); seg.gain.set(String(Math.round(g * 100))); },
  });
  seg.gain = new SegDisplay(3, { color: 'green', label: 'CRT intensity percent' });
  seg.gain.set('100');
  const gainBox = h('div', 'cn-readout'); gainBox.append(h('span', 'cn-lab', 'GAIN %'), seg.gain.el);
  const screenRow = h('div', 'cn-row cn-screen-row');
  screenRow.append(screenKnob.el, intensity.el, gainBox);
  p7.body.append(tgRow, screenRow);
  p5.el.after(p6.el);
  p6.el.after(p7.el);
  q('.trend-globe-row') && p7.body.append(q('.trend-globe-row')!);
  const pair = p7.el;

  // PNL 08 · Execute
  const p8 = module('PNL 08', 'Execute', 'execute', 'pnl-exec');
  const exec = h('div', 'cn-exec');
  const run = $<HTMLButtonElement>('trend-run');
  const guard = h('span', 'cn-guard');
  guard.setAttribute('aria-hidden', 'true');
  const well = h('div', 'cn-well');
  well.append(run, guard);
  const execLamps = h('div', 'cn-exec-lamps');
  lamp.ready = new Lamp('READY', { small: true, tip: 'Panels match the result on screen' });
  lamp.armed = new Lamp('ARMED', { small: true, tip: 'Configuration changed: execute to update' });
  lamp.busy = new Lamp('BUSY', { small: true, tip: 'Request in flight to NASA POWER' });
  execLamps.append(lamp.ready.el, lamp.armed.el, lamp.busy.el);
  exec.append(well, execLamps);
  const status = $('trend-status');
  status.classList.add('cn-status');
  p8.body.append(exec, status);
  pair.after(p8.el);

  // PNL 09 · Globe imagery (dials over the range inputs)
  const imgField = q('.trend-imagery-field');
  if (imgField) {
    const p9 = module('PNL 09', 'Globe imagery', 'imagery', 'pnl-imagery');
    q('.trend-field-label', imgField)?.classList.add('visually-hidden');
    q('.trend-imagery', imgField)?.classList.add('cn-hidden-src');
    $('trend-basemap').classList.add('cn-hidden-src');
    const yIn = $<HTMLInputElement>('trend-year'), mIn = $<HTMLInputElement>('trend-month');
    yearKnob = new Knob<number>({ label: 'YEAR', kind: 'dial', size: 80, positions: Array.from({ length: 26 }, (_, i) => ({ value: 2000 + i, label: String(2000 + i), short: `'${String(2000 + i).slice(2)}` })), value: Number(yIn.value), every: 5, help: 'imagery', tip: 'Year of the NASA GIBS picture on the globe', onChange: (v) => setRange(yIn, v) });
    const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    monthKnob = new Knob<number>({ label: 'MONTH', kind: 'selector', size: 80, sweep: 300, positions: M.map((s, i) => ({ value: i + 1, label: MN[i], short: s })), value: Number(mIn.value), help: 'imagery', tip: 'Month of the NASA GIBS picture', onChange: (v) => setRange(mIn, v) });
    seg.img = new SegDisplay(7, { color: 'green', label: 'Imagery date' });
    const ir = h('div', 'cn-row'); ir.append(yearKnob.el, seg.img.el, monthKnob.el);
    p9.body.append(ir, imgField);
    p8.el.after(p9.el);
  }
  // PNL 10 · Ask, PNL 11 · Archives
  const ask = q('.trend-ask-block');
  if (ask) { const p10 = module('PNL 10', 'Ask ATLAS', 'ask', 'pnl-ask'); q('.trend-field-label', ask)?.classList.add('visually-hidden'); p10.body.append(ask); panel.append(p10.el); }
  const arch = q('.trend-archives');
  if (arch) { const p11 = module('PNL 11', 'Data archives', 'archives', 'pnl-arch'); q('.trend-field-label', arch)?.classList.add('visually-hidden'); p11.body.append(arch); panel.append(p11.el); }
}

function clickIn(scope: string, sel: string) {
  const b = q<HTMLButtonElement>(`${scope} ${sel}`);
  if (b && !b.classList.contains('is-on')) b.click();
}
function setYear(id: string, v: number) {
  const s = $<HTMLSelectElement>(id);
  if (s.value === String(v)) return;
  s.value = String(v);
  s.dispatchEvent(new Event('change', { bubbles: true }));
  // Keep the window legal: END stays at least 9 years after START.
  const st = Number($<HTMLSelectElement>('trend-start').value), en = Number($<HTMLSelectElement>('trend-end').value);
  if (en - st < 9) {
    if (id === 'trend-start') setYear('trend-end', Math.min(2025, st + 9));
    else setYear('trend-start', Math.max(1981, en - 9));
  }
}
function setRange(input: HTMLInputElement, v: number) {
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  paintImagery();
}
function paintImagery() {
  if (!seg.img) return;
  const y = $<HTMLInputElement>('trend-year').value, m = $<HTMLInputElement>('trend-month').value.padStart(2, '0');
  seg.img.set(`${y}-${m}`);
}

function buildFine(group: VariableGroup, current: VariableId) {
  const vars = VARIABLES.filter((v) => v.group === group);
  fineKnob = new Knob<VariableId>({
    label: 'FINE', kind: 'dial', size: 80, labels: false, every: 1,
    positions: vars.map((v) => ({ value: v.id, label: v.short })),
    value: vars.some((v) => v.id === current) ? current : vars[0].id,
    help: 'sensor', tip: 'Step through the sensors in this group',
    onChange: (id) => q<HTMLButtonElement>(`#trend-vars .trend-var[data-id="${id}"]`)?.click(),
  });
  fineHost.replaceChildren(fineKnob.el);
  fineHost.dataset.group = group;
}

// ---------------------------------------------------------------------------
// Right: telemetry readout
// ---------------------------------------------------------------------------
function buildRight() {
  const card = $('trend-result');
  card.dataset.helpRegion = 'telemetry';
  const top = q('.trend-result-top', card)!;
  top.insertBefore(infoButton('telemetry', 'telemetry readout'), q('.x', top));
  const headline = q('.trend-headline', card)!;

  // TLM 01 · Instrument cluster: three gauges over the rate readout
  const m1 = module('TLM 01', 'Instrument cluster', 'g-rate', 'pnl-cluster');
  const cluster = h('div', 'cn-cluster');
  gRate = new Gauge({ label: 'RATE', unit: 'per decade', map: (v) => (v + 1) / 2, ticks: [], zones: [], help: 'g-rate', tip: "Sen's slope per decade; shaded arc = 95% interval" });
  gP = new Gauge({ label: 'P-VALUE', unit: 'MK · log scale', map: pMap, ticks: [{ at: 1, label: '1' }, { at: 0.3 }, { at: 0.1, label: '.1' }, { at: 0.03 }, { at: 0.01, label: '.01' }, { at: 0.003 }, { at: 0.001, label: '.001' }, { at: 0.0003 }, { at: 0.0001, label: '1e-4' }], zones: [], second: true, help: 'g-p', tip: 'White: Mann–Kendall p. Amber: Hamed–Rao p. Green zone: below α' });
  gTau = new Gauge({ label: 'KENDALL τ', unit: 'consistency', map: (v) => (v + 1) / 2, ticks: [{ at: -1, label: '-1' }, { at: -0.75 }, { at: -0.5, label: '-.5' }, { at: -0.25 }, { at: 0, label: '0' }, { at: 0.25 }, { at: 0.5, label: '.5' }, { at: 0.75 }, { at: 1, label: '1' }], help: 'g-tau', tip: 'Kendall τ: −1 always falling, +1 always rising' });
  for (const [g, k, nm] of [[gRate, 'g-rate', 'trend rate gauge'], [gP, 'g-p', 'significance gauge'], [gTau, 'g-tau', 'Kendall tau gauge']] as const) {
    const cell = h('div', 'cn-gcell');
    cell.dataset.helpRegion = k;
    cell.append(g.el, infoButton(k, nm));
    cluster.append(cell);
  }
  headline.dataset.helpRegion = 'readout';
  headline.append(infoButton('readout', 'rate readout'));
  headline.before(m1.el);
  m1.body.append(cluster, headline);

  // C&W · Caution and warning
  const m2 = module('C&W', 'Caution and warning', 'annunciator', 'pnl-cw');
  const grid = h('div', 'cn-cw-grid');
  const defs: [string, string, string][] = [['l-sig', 'VERDICT', 'p below your α'], ['l-agree', 'TESTS AGREE', 'Plain and autocorrelation-corrected tests agree'], ['l-cp', 'SHIFT', 'Pettitt change point found'], ['l-ac', 'MEMORY', 'Lag-1 autocorrelation above 0.3'], ['l-ci', 'CI SPANS 0', "Sen's 95% interval includes zero"], ['l-short', 'SHORT REC', 'Fewer than 20 years'], ['l-config', 'CONFIG Δ', 'Panels differ from the result on screen'], ['l-link', 'DATA LINK', 'NASA POWER request state']];
  for (const [k, legend, tip] of defs) {
    lamp[k] = new Lamp(legend, { help: k, tip });
    lamp[k].el.dataset.info = k;
    lamp[k].el.tabIndex = 0;
    lamp[k].el.setAttribute('role', 'button');
    grid.append(lamp[k].el);
  }
  master = h('button', 'cn-master') as HTMLButtonElement;
  master.type = 'button';
  master.innerHTML = '<span>MASTER</span><span>CAUTION</span>';
  master.dataset.tip = 'Lights when any caution is on. Press to acknowledge.';
  master.addEventListener('click', () => {
    ui.acked = cautionKey();
    paintMaster();
    if (ui.acked) log.push('C&W', 'MASTER CAUTION ACKNOWLEDGED');
  });
  const cwBody = h('div', 'cn-cw cn-cw-body');
  cwBody.append(grid, master);
  m2.body.append(cwBody);
  m1.el.after(m2.el);

  // TLM 02 · Teleprinter
  const m3 = module('TLM 02', 'Teleprinter', 'teleprinter', 'pnl-tp');
  const tp = h('div', 'cn-teleprinter');
  tp.append(h('span', 'cn-tp-head', 'NASA POWER · TREND SUMMARY · AUTO-PRINT'), $('trend-summary'), $('trend-var-note'));
  m3.body.append(tp);
  m2.el.after(m3.el);

  // TLM 03 · Record plot
  const m4 = module('TLM 03', 'Record plot', 'plot', 'pnl-plot');
  const plot = q('.trend-chart-wrap', card)!;
  plot.classList.add('crt');
  plot.append(h('span', 'crt-glass'));
  m4.body.append(plot, $('trend-chart-legend'));
  m3.el.after(m4.el);

  // TLM 04 · Deep read
  const dr = $('deep-read');
  const m5 = module('TLM 04', 'Deep read', 'deepread', 'pnl-deep');
  if (dr) { dr.classList.add('crt'); m5.body.append(dr); }
  m4.el.after(m5.el);

  // TLM 05 · Data log
  const m6 = module('TLM 05', 'Data log', 'telemetry', 'pnl-data');
  const stats = $('trend-stats');
  stats.classList.add('cn-datalog');
  m6.body.append(stats);
  for (const sel of ['#trend-explain-text', '#trend-source', '.trend-source-links']) { const el = q(sel, card); if (el) m6.body.append(el); }
  m5.el.after(m6.el);
  const actions = q('.trend-actions', card);
  if (actions) m6.el.after(actions);
}
const pMap = (p: number) => -Math.log10(Math.min(1, Math.max(1e-4, p))) / 4;

function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

let lastResult: TrendResult | null = null;
function paintTelemetry(r: TrendResult | null = lastResult) {
  lastResult = r;
  const st = r?.stats ?? null;
  const conf = Math.round((1 - ui.alpha) * 100);
  q('.cn-alpha-read b')!.textContent = `${conf}%`;
  gP.paintZones([{ from: ui.alpha, to: 0.0001, cls: 'z-go' }]);
  if (!r || !st) {
    for (const g of [gRate, gP, gTau]) g.set(null, '—');
    for (const k of ['l-sig', 'l-agree', 'l-cp', 'l-ac', 'l-ci', 'l-short']) lamp[k].set('off');
    paintMaster();
    return;
  }
  const d = st.senPerDecade;
  const ci = (st.senCi95 ?? st.olsCi95).map((x) => x * 10) as [number, number];
  const R = niceMax(Math.max(Math.abs(d), Math.abs(ci[0]), Math.abs(ci[1])) * 1.15);
  const dec = R >= 100 ? 0 : R >= 10 ? 1 : R >= 1 ? 2 : 3;
  gRate.scale((v) => (v + R) / (2 * R), [-R, -R / 2, 0, R / 2, R].flatMap((t, i, a) => i < a.length - 1 ? [{ at: t, label: fmtTick(t, R) }, { at: (t + a[i + 1]) / 2 }] : [{ at: t, label: fmtTick(t, R) }]));
  q('.g-unit', gRate.el)!.textContent = `${r.variable.annualUnit}/decade`;
  gRate.setBand(ci[0], ci[1]);
  gRate.set(d, `${d > 0 ? '+' : ''}${fmt(d, dec)}`);
  const pm = st.mkModified?.p;
  gP.set(st.mk.p, `p ${st.mk.p < 0.001 ? '<0.001' : fmt(st.mk.p, 3)}${pm !== undefined ? ` · HR ${pm < 0.001 ? '<0.001' : fmt(pm, 3)}` : ''}`, pm ?? null);
  gTau.set(st.mk.tau, `τ ${st.mk.tau > 0 ? '+' : ''}${fmt(st.mk.tau, 2)}`);

  lamp['l-sig'].set(st.mk.p < ui.alpha ? 'green' : 'off');
  q('.lamp-legend', lamp['l-sig'].el)!.textContent = st.mk.p < ui.alpha ? `SIG @ ${conf}%` : `NOT SIG @ ${conf}%`;
  lamp['l-agree'].set(st.mkModified ? (st.mkModified.significant === st.mk.significant ? 'green' : 'amber') : 'off');
  lamp['l-cp'].set(st.changePoint?.significant ? 'amber' : 'off');
  q('.lamp-legend', lamp['l-cp'].el)!.textContent = st.changePoint?.significant ? `SHIFT ${st.changePoint.year}` : 'SHIFT';
  lamp['l-ac'].set((st.mkModified?.lag1 ?? 0) > 0.3 ? 'amber' : 'off');
  lamp['l-ci'].set(ci[0] <= 0 && ci[1] >= 0 ? 'amber' : 'off');
  lamp['l-short'].set(st.n < 20 ? 'amber' : 'off');
  paintMaster();
}
function fmtTick(t: number, R: number) {
  if (t === 0) return '0';
  const s = R >= 10 ? String(Math.round(t)) : R >= 1 ? t.toFixed(R % 1 ? 1 : 0) : t.toFixed(2).replace('0.', '.');
  return t > 0 ? `+${s}` : s;
}
function cautionKey() {
  return ['l-agree', 'l-cp', 'l-ac', 'l-ci', 'l-short'].filter((k) => lamp[k].state === 'amber').join(',');
}
function paintMaster() {
  const key = cautionKey();
  master.classList.toggle('lit', Boolean(key));
  master.classList.toggle('flash', Boolean(key) && key !== ui.acked && !reduced());
  master.setAttribute('aria-pressed', String(Boolean(key) && key === ui.acked));
  master.setAttribute('aria-label', key ? `Master caution on${key === ui.acked ? ', acknowledged' : ''}. Press to acknowledge.` : 'Master caution off');
}

// ---------------------------------------------------------------------------
// Offline placard (preview build only) and plates for the 3D stations
// ---------------------------------------------------------------------------
const OFFLINE_NOTE: Record<string, string> = {
  places: 'Photoreal 3D cities stream from Google 3D Tiles through Cesium, which this offline preview cannot reach.',
  globe: 'The Cesium globe streams NASA GIBS imagery live, which this offline preview cannot reach.',
  library: 'The spacecraft and machine models are large 3D files that are not bundled into this preview.',
  scan: 'Scanning uses your camera and a vision model on the server, which this preview cannot reach.',
  build: 'Building a model uses research and modelling agents on the server, which this preview cannot reach.',
};
function buildPlacard() {
  const labels: Record<string, string> = { intro: 'STN 04 · Library · machine dossier', 'scan-panel': 'STN 05 · Scan · capture control', 'build-panel': 'STN 06 · Build · fabrication control', 'place-panel': 'STN 02 · Places · reconnaissance', 'globe-panel': 'STN 03 · Globe · observation', card: 'Part dossier' };
  for (const [id, l] of Object.entries(labels)) document.getElementById(id)?.setAttribute('data-plate', l);
  if (!root.dataset.offline) return;
  const pl = h('div', 'cn-placard');
  pl.id = 'cn-placard';
  pl.innerHTML = '<span class="hp-code">LIVE BUILD ONLY</span><strong></strong><p></p><button type="button" class="cn-key">Return to STN 01 · Trends</button>';
  pl.querySelector('button')!.addEventListener('click', () => q<HTMLButtonElement>('.mode[data-mode="trends"]')?.click());
  document.body.append(pl);
}
function paintPlacard(mode: string) {
  const pl = document.getElementById('cn-placard');
  if (!pl) return;
  const st = STATIONS[mode];
  q('strong', pl)!.textContent = st ? `STN ${st.n} · ${st.name}` : mode;
  q('p', pl)!.textContent = `${OFFLINE_NOTE[mode] ?? ''} On the live site this station is fully working. Everything on STN 01 runs here.`;
}

// ---------------------------------------------------------------------------
// Centre: ground track reticle, event log, scope, diagnostics
// ---------------------------------------------------------------------------
function buildCentre() {
  const ret = h('div', 'cn-reticle');
  ret.id = 'cn-reticle';
  ret.setAttribute('aria-hidden', 'true');
  ret.innerHTML = `<svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="190" class="r-ring"/><circle cx="200" cy="200" r="120" class="r-ring r-dash"/><circle cx="200" cy="200" r="46" class="r-ring"/>
    ${Array.from({ length: 72 }, (_, i) => { const a = (i * 5 * Math.PI) / 180, r1 = 190, r2 = i % 6 === 0 ? 176 : 184; return `<line x1="${200 + r1 * Math.cos(a)}" y1="${200 + r1 * Math.sin(a)}" x2="${200 + r2 * Math.cos(a)}" y2="${200 + r2 * Math.sin(a)}" class="r-tk"/>`; }).join('')}
    <line x1="200" y1="0" x2="200" y2="150" class="r-x"/><line x1="200" y1="250" x2="200" y2="400" class="r-x"/><line x1="0" y1="200" x2="150" y2="200" class="r-x"/><line x1="250" y1="200" x2="400" y2="200" class="r-x"/>
    <g class="r-sweep"><path d="M200 200 L200 10 A190 190 0 0 1 300 38 Z"/></g></svg>
    <span class="r-lab r-tl">DSP 01 · GROUND TRACK</span><span class="r-lab r-tr" id="cn-ret-tgt">TGT —</span><span class="r-lab r-bl" id="cn-ret-layer">NASA GIBS · BLUE MARBLE</span><span class="r-lab r-br" id="cn-ret-ll">—</span>`;
  document.body.append(ret);

  const deck = h('div', 'cn-deck');
  deck.id = 'cn-deck';
  const dl = module('DSP 02', 'Event log', 'log', 'pnl-log');
  log = new CrtLog('Console event log', { help: 'log' });
  dl.body.append(log.el);
  const ds = module('DSP 03', 'Signal scope', 'scope', 'pnl-scope');
  scope = new Scope('Monthly series replayed as an oscilloscope trace', { help: 'scope' });
  const scopeLab = h('div', 'cn-scope-lab');
  scopeLab.innerHTML = '<span id="cn-scope-ch">CH1 · NO SIGNAL</span><span>MONTHLY · MEAN-CENTRED</span>';
  ds.body.append(scope.el, scopeLab);
  const dd = module('DSP 04', 'Diagnostics', 'diag', 'pnl-diag');
  const dg = h('div', 'cn-diag');
  for (const [k, lab, n, tip] of [['fps', 'FPS', 3, 'Frames per second in this browser'], ['ms', 'LINK MS', 4, 'Latency of the last NASA POWER request through ATLAS'], ['recs', 'RECS', 3, 'Monthly values in the current record'], ['tiles', 'TILES', 4, 'NASA GIBS imagery tiles received this session']] as const) {
    seg[k] = new SegDisplay(n, { color: k === 'fps' ? 'green' : 'amber', label: lab, tip });
    const b = h('div', 'cn-readout'); b.append(h('span', 'cn-lab', lab), seg[k].el);
    dg.append(b);
  }
  dd.body.append(dg);
  deck.append(dl.el, ds.el, dd.el);
  document.body.append(deck);
  // Log the status line for compare/map/sweep runs (single runs log their own TX/RX).
  new MutationObserver(() => {
    const s = trendSnapshot();
    const t = $('trend-status').textContent?.trim();
    if (s.view !== 'single' && t) log.push('STS', t.toUpperCase().slice(0, 120), $('trend-status').classList.contains('bad') ? 'err' : 'info');
  }).observe($('trend-status'), { childList: true, characterData: true, subtree: true });
  startFps();
}

// ---------------------------------------------------------------------------
// State binding
// ---------------------------------------------------------------------------
function bindState() {
  document.addEventListener('atlas:state', (e) => {
    const d = (e as CustomEvent).detail as { type: string; [k: string]: unknown };
    switch (d.type) {
      case 'place': { const p = d.place as Snap['place']; log.push('GNC', `TARGET ${p.name.toUpperCase()} · ${p.lat.toFixed(2)} ${p.lon.toFixed(2)} · ${p.mode === 'region' ? 'REGION' : 'POINT'}`); break; }
      case 'view': log.push('CFG', `MODE ${VIEW_LABEL[d.view as string] ?? d.view}`); break;
      case 'years': break;
      case 'chart': log.push('DSP', `PLOT SERIES ${(d.chart as string).toUpperCase()}`); break;
      case 'run-start': {
        if (d.view === 'compare') { link.power = 'busy'; log.push('TX', `COMPARE · ${variableById(d.variable as VariableId).short.toUpperCase()} · ${d.start}–${d.end}`); break; }
        const p = d.place as Snap['place'];
        link.power = 'busy';
        log.push('TX', `REQ NASA POWER · ${variableById(d.variable as VariableId).short.toUpperCase()} · ${p.name.toUpperCase()} · ${d.start}–${d.end}`);
        break;
      }
      case 'run-ok': {
        const r = d.result as TrendResult;
        link.power = 'ok';
        link.powerMs = d.ms as number;
        log.push('RX', `200 OK · ${r.period.years} YRS · ${r.series.monthly.length} MONTHLY VALUES · ${d.ms} MS`, 'ok');
        if (r.stats) {
          const s = r.stats;
          log.push('ANL', `SEN ${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, 3)} ${r.variable.annualUnit}/DEC · MK p ${s.mk.p < 0.001 ? '<0.001' : fmt(s.mk.p, 3)} · τ ${fmt(s.mk.tau, 2)}`, s.mk.significant ? 'ok' : 'info');
          if (s.changePoint?.significant) log.push('ANL', `PETTITT SHIFT ${s.changePoint.year} · p ${fmt(s.changePoint.p, 3)}`, 'warn');
          if (s.mkModified && s.mkModified.significant !== s.mk.significant) log.push('C&W', 'TESTS DISAGREE AFTER AUTOCORRELATION CORRECTION', 'warn');
        }
        scope.setData(r.series.monthly.map((m) => m.v));
        $('cn-scope-ch').textContent = `CH1 · ${r.variable.short.toUpperCase()} · ${r.variable.unit}`;
        seg.recs.set(String(r.series.monthly.length));
        ui.acked = '';
        paintTelemetry(r);
        break;
      }
      case 'run-error': link.power = 'err'; log.push('ERR', String(d.message ?? 'REQUEST FAILED').toUpperCase().slice(0, 140), 'err'); break;
      case 'run-end': if (link.power === 'busy') link.power = 'ok'; break;
      case 'ai': link.ai = Boolean(d.ai); log.push('COMM', d.ai ? `AI LINK UP · ${String(d.model || '').toUpperCase()}` : 'AI LINK DOWN · ASK ATLAS DISABLED', d.ai ? 'ok' : 'warn'); break;
    }
    sync(d.type);
  });
  // Enter on any console dial executes.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).closest('#trend-panel .knob-body')) { e.preventDefault(); $<HTMLButtonElement>('trend-run').click(); }
  });
}

function sync(_type: string) {
  const s = trendSnapshot();
  // Mode
  modeKnob.set(s.view);
  const mr = q('.cn-mode-read')!;
  q('b', mr)!.textContent = VIEW_LABEL[s.view];
  q('span', mr)!.textContent = VIEW_NOTE[s.view];
  // Target
  seg.lat.set(s.place.lat.toFixed(2));
  seg.lon.set(s.place.lon.toFixed(2));
  lamp.pt.set(s.place.mode === 'point' ? 'green' : 'off');
  lamp.rgn.set(s.place.mode === 'region' ? 'green' : 'off');
  $('cn-ret-tgt').textContent = `TGT ${s.place.name.toUpperCase()}`;
  $('cn-ret-ll').textContent = `${Math.abs(s.place.lat).toFixed(2)}°${s.place.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.place.lon).toFixed(2)}°${s.place.lon >= 0 ? 'E' : 'W'}`;
  // Sensor
  groupKnob.set(s.group);
  if (!fineKnob || fineHost.dataset.group !== s.group) buildFine(s.group, s.variable);
  else fineKnob.set(s.variable);
  const v = variableById(s.variable);
  const sr = q('.cn-sensor-read')!;
  q('b', sr)!.textContent = v.short.toUpperCase();
  q('span', sr)!.textContent = `${v.unit} · ${v.group.toUpperCase()}`;
  // Window
  startKnob.set(s.start);
  endKnob.set(s.end);
  seg.start.set(String(s.start));
  seg.end.set(String(s.end));
  seg.yrs.set(String(s.end - s.start + 1));
  const win = q<HTMLElement>('.cn-timeline .tl-win')!;
  win.style.left = `${((s.start - 1981) / 45) * 100}%`;
  win.style.width = `${((s.end - s.start + 1) / 45) * 100}%`;
  // Display switches follow the real state
  tg.series.set(s.chart === 'monthly');
  tg.base.set(s.base === 'satellite');
  tg.globe.set(Boolean(q('.trend-globe-row [data-globe-view="photo"].is-on')));
  q('#cn-ret-layer')!.textContent = `NASA GIBS · ${s.base === 'satellite' ? 'SATELLITE' : 'BLUE MARBLE'}`;
  if (yearKnob) yearKnob.set(Number($<HTMLInputElement>('trend-year').value));
  if (monthKnob) monthKnob.set(Number($<HTMLInputElement>('trend-month').value));
  paintImagery();
  // Execute + CONFIG Δ
  const key = `${s.place.name}|${s.place.lat}|${s.place.lon}|${s.variable}|${s.start}|${s.end}`;
  const stale = s.view === 'single' && Boolean(s.result) && key !== s.lastRunKey;
  root.classList.toggle('cn-busy', s.loading);
  lamp.busy.set(s.loading ? 'white' : 'off', s.loading);
  lamp.armed.set(!s.loading && (stale || !s.result) ? 'amber' : 'off', !s.loading && stale);
  lamp.ready.set(!s.loading && !stale && Boolean(s.result) ? 'green' : 'off');
  lamp['l-config'].set(stale ? 'white' : 'off');
  q('.cn-exec')!.classList.toggle('armed', !s.loading && (stale || !s.result));
  // Links
  const lp = link.power === 'busy' ? 'amber' : link.power === 'ok' ? 'green' : link.power === 'err' ? 'red' : 'off';
  lamp['link-power'].set(lp, link.power === 'busy');
  lamp['link-power'].el.dataset.tip = link.power === 'ok' ? `NASA POWER via /api/trends · last reply ${link.powerMs} ms` : link.power === 'err' ? 'NASA POWER: last request failed' : link.power === 'busy' ? 'NASA POWER: request in flight' : 'NASA POWER: not contacted yet';
  lamp['l-link'].set(lp, link.power === 'busy');
  lamp['link-ai'].set(link.ai === null ? 'off' : link.ai ? 'green' : 'red');
  lamp['link-ai'].el.dataset.tip = link.ai === null ? 'AI explainer: checking…' : link.ai ? 'AI explainer online: Ask ATLAS available' : 'AI explainer offline: Ask ATLAS hidden';
  if (link.powerMs) seg.ms.set(String(Math.min(9999, link.powerMs)));
  paintCrumb();
  paintGibs();
}

// ---------------------------------------------------------------------------
// Clocks, GIBS watcher, frame-rate meter
// ---------------------------------------------------------------------------
const t0 = Date.now();
function two(n: number) { return String(n).padStart(2, '0'); }
function startClocks() {
  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    seg.met.set(`${two(Math.floor(s / 3600) % 100)}.${two(Math.floor(s / 60) % 60)}.${two(s % 60)}`);
    const d = new Date();
    seg.gmt.set(`${two(d.getUTCHours())}.${two(d.getUTCMinutes())}.${two(d.getUTCSeconds())}`);
  };
  tick();
  window.setInterval(tick, 1000);
}
function watchGibs() {
  if (!('PerformanceObserver' in window)) return;
  try {
    new PerformanceObserver((list) => {
      let changed = false;
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (!e.name.includes('gibs.earthdata.nasa.gov')) continue;
        const status = (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
        // responseStatus 0 means the browser blocked or dropped the tile.
        if (status !== undefined && (status === 0 || status >= 400)) link.gibsErr++;
        else if (e.transferSize > 0 || e.decodedBodySize > 0 || status) link.gibs++;
        else link.gibsErr++;
        changed = true;
      }
      if (changed) paintGibs();
    }).observe({ type: 'resource', buffered: true });
  } catch { /* resource timing unavailable */ }
}
function paintGibs() {
  const l = lamp['link-gibs'];
  if (!l) return;
  l.set(link.gibs ? 'green' : link.gibsErr ? 'red' : 'off');
  l.el.dataset.tip = link.gibs ? `NASA GIBS imagery: ${link.gibs} tiles received${link.gibsErr ? `, ${link.gibsErr} failed` : ''}` : link.gibsErr ? 'NASA GIBS: tiles failing' : 'NASA GIBS: no tiles yet';
  seg.tiles?.set(String(Math.min(9999, link.gibs)));
}
function startFps() {
  let frames = 0, last = performance.now();
  const loop = (t: number) => {
    frames++;
    if (t - last >= 1000) {
      if (!document.hidden && root.dataset.station === 'trends') seg.fps.set(String(Math.min(999, Math.round((frames * 1000) / (t - last)))));
      frames = 0; last = t;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Briefing (guided tour of the console)
// ---------------------------------------------------------------------------
function runBriefing() {
  const steps: TourStep[] = [
    { sel: '.modes', title: 'Station select', text: 'Six stations, one console. The lit key is where you are. You are at STN 01 · TRENDS, the trend detective.' },
    { sel: '#cn-plate', title: 'Where you are', text: 'The station plate names the station and its job. The breadcrumb follows your mode, target and sensor.' },
    { sel: '.cn-rail', title: 'Clocks and links', text: 'MET is your session time. POWER, GIBS and AI lamps show the real state of each data link.' },
    { sel: '.pnl-profiles', title: 'PNL 01 · Mission profiles', text: 'Three guided cases. Each loads a complete configuration and runs it with live NASA data. A good first press.' },
    { sel: '.pnl-mode', title: 'PNL 02 · Analysis mode', text: 'Turn the selector: one place, compare places, map a region, or scan every variable.' },
    { sel: '.pnl-target', title: 'PNL 03 · Target acquisition', text: 'Search a place, press a preset or click the globe. LAT/LON show exactly which grid cell you are testing.' },
    { sel: '.pnl-sensor', title: 'PNL 04 · Sensor select', text: 'GROUP picks the family, the keys or the FINE dial pick the NASA POWER variable.' },
    { sel: '.pnl-window', title: 'PNL 05 · Record window', text: 'Drag, scroll or use arrow keys on START and END. Aim for 20 years or more.' },
    { sel: '.pnl-alpha', title: 'PNL 06 · Test level', text: 'α sets how strict the verdict lamp is. It never changes the data.' },
    { sel: '.pnl-display', title: 'PNL 07 · Display control', text: 'Switches for the plot, basemap, globe and screen effects; SCREEN picks CRT or daylight; INTENSITY dims every display.' },
    { sel: '.pnl-exec', title: 'PNL 08 · Execute', text: 'ARMED means the panels changed. Press EXECUTE to request the record from NASA POWER.' },
    { sel: '.cn-cluster', title: 'Instrument cluster', text: 'Rate with its 95% band, significance on a log scale, and consistency (Kendall τ).' },
    { sel: '.cn-cw', title: 'Caution and warning', text: 'Lamps light from the real statistics. Any amber lamp lights MASTER CAUTION: check it before you quote the result.' },
    { sel: '.trend-chart-wrap', title: 'Record plot', text: 'Every year of the record, Sen\'s trend line, its band and any shift year.' },
    { sel: '#cn-deck', title: 'Event log, scope, diagnostics', text: 'Everything the console does is logged in GMT. The scope replays the monthly signal.' },
    { sel: '.cn-panels', title: 'Panels', text: 'Every panel folds (the bar button) or stows (×). PANELS lists them all and brings them back; the edge tabs slide whole columns away.' },
    { sel: '.cn-gev', title: "God's Eye View", text: 'Clears the console and gives you the whole globe with an orbital HUD, layers, targets and a command line. Press G any time.' },
    { sel: '.cn-help', title: 'Help is always here', text: 'Every panel has an i button. HELP (or the ? key) opens the full Flight Manual.' },
  ];
  // Make sure the telemetry side exists to point at.
  if ($('trend-result').hidden && !trendSnapshot().result) steps.splice(10, 3);
  startTour(steps);
}
