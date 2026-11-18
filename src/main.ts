import '@fontsource-variable/science-gothic/full.css';
import { initV2, readTrendLink } from './v2';
import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource/monaspace-krypton/400.css';
import '@fontsource/monaspace-krypton/600.css';
import './style.css';
import * as THREE from 'three';
import { Stage } from './stage';
import { HoloModel, type Hologram } from './model';
import { LIBRARY, type LibraryEntry } from './library';
import { ui } from './ui';
import { applyCss, theme } from './theme';
import { GestureControl } from './gestures';
import { ask, listen, refreshStatus, sessionHistory, clearSession } from './agent';
import { ScanModel, identify } from './scan';
import { buildPlace, fetchPlace, sunDirection, type PlaceData } from './places';
import { LANDMARKS, type Landmark } from './landmarks';
import type { EarthAuth } from './earth';
import { LENSES, type Lens } from './lens';
import { toHologram, applyFixes, type BuiltPart } from './construct';
import { loadSplat, disposeSplat } from './splat';
import { SignalLayers, ago, type Signal, type LayerId } from './signals';
import { initTrends, setTrendMode, trendContext, setPlaceGlobeMode, setPlaceGlobePick, showPlaceGlobe, resetPlaceGlobe, openTrendAt, openCompare, setGlobeTabMode, setGlobeTabPick, showGlobeTab, globeTabBase, globeTabSpin, globeTabNight, globeTabReset, showGlobeTabMarker, flyGlobeTab } from './trends-ui';
import { fmt, decimalsFor, type TrendResult } from './trends';

applyCss(theme);

const stage = new Stage(document.getElementById('stage')!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  entry: null as LibraryEntry | null,
  explodeTarget: 0,
  loading: false,
};

const explodeInput = $('explode') as HTMLInputElement;

// ---------- library shelf ----------
const shelf = $('shelf');
for (const e of LIBRARY) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.id = e.id;
  b.innerHTML = `<span class="t">${e.title}</span><span class="k">${e.kind}</span>`;
  b.addEventListener('click', () => loadEntry(e));
  shelf.appendChild(b);
}

async function loadEntry(e: LibraryEntry) {
  if (state.loading || state.entry?.id === e.id) return;
  state.loading = true;
  shelf.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', (b as HTMLElement).dataset.id === e.id));
  // A place link opens straight into Places: the library model loads quietly behind it.
  if (!/[?&](place|at)=/.test(location.search) || state.entry) ui.log(`loading ${e.title.toLowerCase()}`, 'sys');
  try {
    const m = await HoloModel.load(e.url);
    // Opened straight into another mode (a ?place= link, say): don't let a late library model take over.
    // Library loads it again on entry.
    if (mode !== 'library') { shelf.querySelectorAll('button').forEach((b) => b.classList.remove('is-on')); return; }
    state.entry = e;
    stage.setModel(m);
    stage.frame('object');
    setExplode(0);
    ui.closeCard();
    setTitle(e.title);
    $('model-kind').textContent = e.kind;
    $('parts-n').textContent = String(m.parts.length);
    $('credit').textContent = `Model: ${e.credit} · ${e.licence}`;
    labels.rebuild(m);
    ui.log(`${m.parts.length} parts ready`, 'sys');
  } catch (err) {
    console.error(err);
    ui.log(`could not load ${e.title}`, 'hot');
  } finally {
    state.loading = false;
  }
}

// ---------- explode ----------
function setExplode(v: number) {
  state.explodeTarget = Math.max(0, Math.min(1, v));
  explodeInput.value = String(state.explodeTarget);
}
explodeInput.addEventListener('input', () => { state.explodeTarget = Number(explodeInput.value); });

// ---------- picking with mouse / touch ----------
const canvas = stage.renderer.domElement;
let downAt = { x: 0, y: 0, t: 0 };
canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (ev) => {
  if (earthActive) return; // the globe handles its own clicks (signals)
  const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
  if (moved > 6 || performance.now() - downAt.t > 400) return;
  const i = pickAt(ev.clientX, ev.clientY);
  if (i >= 0) focusPart(i); else unfocus();
});
canvas.addEventListener('pointermove', (ev) => {
  if (ev.buttons || earthActive) return;
  stage.model?.setHot(pickAt(ev.clientX, ev.clientY));
});

function pickAt(x: number, y: number): number {
  const m = stage.model;
  if (!m) return -1;
  const r = canvas.getBoundingClientRect();
  return m.pick(stage.rayFrom(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1));
}

export function focusPart(i: number) {
  const m = stage.model;
  if (!m || i < 0 || i >= m.parts.length) return;
  m.setFocus(i);
  if (state.explodeTarget < 0.6) setExplode(0.8);
  const p = m.parts[i];
  const role = partRole(i);
  const src = mode === 'places' && place ? place.facts.find((x) => x.name.toLowerCase() === p.name.toLowerCase())?.source : undefined;
  ui.openCard({ index: i + 1, total: m.parts.length, title: p.name, body: role ? `${role}. Ask anything about it.` : 'Ask what this part does, or what happens if it fails.', sources: src ? [src] : [] });
}

function unfocus() {
  stage.model?.setFocus(-1);
  ui.closeCard();
}
document.getElementById('card-close')!.addEventListener('click', unfocus);
window.addEventListener('keydown', (ev) => {
  if ((ev.target as HTMLElement).tagName === 'INPUT') return;
  if (ev.key === 'Escape') unfocus();
  if (ev.key.toLowerCase() === 'e') setExplode(state.explodeTarget > 0.5 ? 0 : 1);
});

// ---------- part labels ----------
const labels = (() => {
  const host = $('labels');
  let tags: HTMLElement[] = [];
  const v = new THREE.Vector3();
  return {
    rebuild(m: Hologram) {
      host.replaceChildren();
      tags = m.parts.map((p, i) => {
        const el = document.createElement('div');
        el.className = 'tag';
        el.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><span></span>`;
        el.querySelector('span')!.textContent = p.name;
        host.appendChild(el);
        return el;
      });
    },
    update(explode: number) {
      const m = stage.model;
      if (!m) return;
      const showAll = explode > 0.35;
      const named = m.parts.length <= 14;
      m.parts.forEach((_, i) => {
        const el = tags[i];
        if (!el) return;
        const focused = m.focused === i;
        const visible = showAll || focused;
        if (!visible) { el.style.opacity = '0'; return; }
        const s = stage.project(m.anchor(i, v));
        if (!s) { el.style.opacity = '0'; return; }
        el.style.opacity = m.focused >= 0 && !focused ? '0.25' : String(Math.min(1, (explode - 0.35) * 4 + (focused ? 1 : 0)));
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
        el.classList.toggle('hot', focused);
        el.classList.toggle('named', named && explode > 0.7);
      });
    },
  };
})();

// ---------- frame loop ----------
stage.onFrame = (dt) => {
  const m = stage.model;
  if (!m) return;
  m.explode += (state.explodeTarget - m.explode) * Math.min(1, dt * 5);
  stage.framing = m.explode;
  labels.update(m.explode);
};

// ---------- boot ----------
ui.log('ATLAS online', 'sys');
refreshStatus();

// Expose a small handle for the hand controller and agent modules.
export const app = { stage, setExplode, focusPart, unfocus, get explode() { return state.explodeTarget; }, get entry() { return state.entry; } };
(window as unknown as { atlas: typeof app }).atlas = app;

// ---------- hands ----------
const gestures = new GestureControl(app);
const handsBtn = document.getElementById('hands-btn')!;
handsBtn.addEventListener('click', async () => {
  const on = await gestures.toggle();
  handsBtn.classList.toggle('on', on);
  handsBtn.setAttribute('aria-pressed', String(on));
  document.getElementById('hands-label')!.textContent = on ? 'Hands on' : 'Use hands';
});
export { gestures };

// ---------- ask (text + voice) ----------
const agentCtx = {
  machine: () => (mode === 'trends') ? `NASA Earth trend detective. ${trendContext()}` : (mode === 'build' && built) ? `${built.name} (a 3D model ATLAS built from research; parts are the model's sections)` : (earthActive && currentLandmark) ? `${currentLandmark.name}, ${currentLandmark.city} (a real place, shown in 3D)` : earthActive ? `the whole Earth seen from orbit, centred near ${originLL ? `${originLL.lat.toFixed(1)}, ${originLL.lon.toFixed(1)}` : 'India'}` : state.entry ? `${state.entry.title} (${state.entry.kind})` : 'machine',
  layers: () => (earthActive ? signals.active : []),
  globeView: () => { if (mode === 'globe') globeBackToOrbit(); else goGlobe(); },
  showLayer: (id: string, on: boolean) => { if (id === 'quakes' || id === 'events') setLayer(id, on); },
  buildModel: (name: string) => {
    const l = LANDMARKS.find((x) => name.toLowerCase().includes(x.name.toLowerCase()));
    const go = () => runConstruct(l?.name || name.split(',')[0].trim(), l?.city || name.split(',').slice(1).join(',').trim());
    // "Take me there and build it": let the flight land first, then hand over to the build team.
    const wait = (n: number) => { if (!stage.flying || n > 40) setTimeout(go, stage.flying ? 0 : 1200); else setTimeout(() => wait(n + 1), 400); };
    setTimeout(() => wait(0), 300);
  },
  parts: () => earthActive ? [] : stage.model?.parts.map((p) => p.name) || [],
  focused: () => stage.model?.focused ?? -1,
  focusPart,
  setExplode,
  mode: () => (earthActive || mode === 'trends' ? 'earth' : 'object') as 'earth' | 'object',
  flyTo: (place: string, lat?: number, lon?: number) => {
    if (mode === 'globe') { void globeFlyByName(place, lat, lon); return; }
    const q = place.toLowerCase();
    const head = q.split(',')[0].trim();
    const preset = LANDMARKS.find((l) => q.includes(l.name.toLowerCase()) || (head.length >= 5 && l.name.toLowerCase().includes(head)));
    if (preset) { if (mode !== 'places') setMode('places'); selectLandmark(preset); return; }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (mode !== 'places') setMode('places');
      const parts = place.split(',');
      // A signal (earthquake, fire) is a region, not a building: land higher.
      const sig = signals.active.length && /earthquake|quake|fire|storm|cyclone|ice|volcano|\bM ?\d/i.test(place);
      selectLandmark({ id: `at-${Date.now()}`, name: parts[0].trim(), city: parts.slice(1).join(',').trim() || `${lat!.toFixed(3)}, ${lon!.toFixed(3)}`, lat: lat!, lon: lon!, view: sig ? 26000 : 450, lift: 20 });
      return;
    }
    searchPlace(place);
  },
  setLens: (l: string) => { if (LENSES.some((x) => x.id === l)) setLens(l as Lens); },
  isolate: (on: boolean) => setIsolate(on),
  orbit: (speed: number) => {
    stage.controls.autoRotate = speed !== 0;
    stage.orbitSpeed = THREE.MathUtils.clamp(speed, -3, 3) * 0.35;
  },
};
const askForm = document.getElementById('ask') as HTMLFormElement;
const askInput = document.getElementById('ask-input') as HTMLInputElement;
const askHint = () => (earthActive ? 'Ask ATLAS: "biggest earthquake this week?"' : 'Ask about this machine');
askForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = askInput.value.trim();
  if (!q) return;
  askInput.value = '';
  ask(q, agentCtx);
});
const mic = document.getElementById('mic')!;
let stopListening: (() => void) | null = null;
mic.addEventListener('click', () => {
  if (stopListening) { stopListening(); return; }
  mic.setAttribute('aria-pressed', 'true');
  askInput.placeholder = 'Listening';
  stopListening = listen(
    (t) => { askInput.value = t; },
    () => {
      mic.setAttribute('aria-pressed', 'false');
      askInput.placeholder = askHint();
      stopListening = null;
      const q = askInput.value.trim();
      if (q) { askInput.value = ''; ask(q, agentCtx); }
    },
  );
  if (!stopListening) mic.setAttribute('aria-pressed', 'false');
});


// ---------- modes ----------
type Mode = 'trends' | 'library' | 'scan' | 'places' | 'globe' | 'build';
let mode: Mode = 'trends';
let globeTabFallbackActive = false;
let globeTabRequest = 0;
let globePick: { name: string; lat: number; lon: number } | null = null;
let globePlace: Landmark | null = null;
let globeFlightSeq = 0;
let globeAgentLive = false;
export const currentMode = () => mode;
const scanPanel = document.getElementById('scan-panel') as HTMLElement;
const globePanel = document.getElementById('globe-panel') as HTMLElement;
const intro = document.getElementById('intro') as HTMLElement;
document.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as Mode)));

function setMode(m: Mode) {
  const prev = mode;
  mode = m;
  document.body.className = `mode-${m}`;
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) => {
    const on = b.dataset.mode === m;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  shelf.hidden = m !== 'library';
  scanPanel.hidden = m !== 'scan' || scanned;
  intro.hidden = (m === 'scan' && !scanned) || (m === 'build' && !built) || m === 'globe';
  buildPanel.hidden = m !== 'build';
  if (m === 'build' && built && stage.model !== built.model) showBuilt();
  if (m === 'library' && state.entry === null) loadEntry(LIBRARY[0]);
  if (m === 'library' && (scanned || built) && state.entry) { const e = state.entry; state.entry = null; loadEntry(e); }
  if (m !== 'places' && sunLine) { stage.pivot.remove(sunLine); sunLine.geometry.dispose(); sunLine = null; }
  if (prev === 'globe' && m !== 'globe') leaveGlobe();
  if (m !== 'places' && m !== 'globe') { leaveReconstruction(); exitEarth(); }
  placePanel.hidden = m !== 'places';
  sunBox.hidden = m !== 'places' || !place || earthActive;
  // Trend mode owns the screen: pause the hologram renderer so a laptop or phone is not
  // running two WebGL loops, and let the NASA globe take over.
  if (m !== 'places') disablePlaceGlobe();
  if (m !== 'globe') disableGlobeTabFallback();
  globePanel.hidden = m !== 'globe';
  setTrendMode(m === 'trends');
  if (m === 'trends' || placeGlobeActive || globeTabFallbackActive) stage.pause();
  else if (m !== 'globe') stage.resume();
  if (m === 'trends') {
    if (globeViewPref.trends === 'photo') void setTrendsGlobeView('photo');
    else updateGlobeViewToggles('nasa');
  }
  if (m === 'places') enterPlaces();
  else if (m === 'globe') void enterGlobeTab();
  const u = new URL(location.href);
  if (m === 'globe') u.searchParams.set('mode', 'globe');
  else if (u.searchParams.get('mode') === 'globe') u.searchParams.delete('mode');
  if (u.href !== location.href) history.replaceState(null, '', u);
}

// ---------- scan ----------
let scanned = false;
const scanStatus = document.getElementById('scan-status')!;
const captureBtn = document.getElementById('scan-capture') as HTMLButtonElement;
captureBtn.addEventListener('click', async () => {
  if (!gestures.enabled) {
    const on = await gestures.toggle();
    if (!on) return;
    handsBtn.classList.add('on');
    document.getElementById('hands-label')!.textContent = 'Hands on';
    scanStatus.textContent = 'Camera on. Hold the object up, then press capture again.';
    return;
  }
  const frame = gestures.camera.snapshot();
  if (frame) runScan(frame);
});
(document.getElementById('scan-file') as HTMLInputElement).addEventListener('change', (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => downscale(String(r.result)).then(runScan);
  r.readAsDataURL(f);
});

async function downscale(dataUrl: string, maxSide = 1024): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88);
}

async function runScan(image: string) {
  captureBtn.disabled = true;
  const step = (t: string) => { scanStatus.textContent = t; };
  try {
    step('identifying the object');
    ui.log('scan captured', 'sys');
    const [scan] = await Promise.all([identify(image)]);
    if (scan) {
      ui.log(`identified: ${scan.object}`, 'tool');
      ui.log(`${scan.parts.length} parts located`, 'tool');
    } else {
      ui.log('could not identify the object, building the shape anyway', 'hot');
    }
    const m = await ScanModel.build(image, scan, step);
    stage.setModel(m);
    stage.frame('scan');
    stage.userZoomed = false;
    scanned = true;
    state.entry = null;
    setExplode(0);
    ui.closeCard();
    intro.hidden = false;
    scanPanel.hidden = true;
    setTitle(scan?.object || 'Scanned object');
    $('model-kind').textContent = scan ? `Scanned · ${scan.category}` : 'Scanned · unidentified';
    $('parts-n').textContent = String(m.parts.length);
    $('credit').textContent = `Scanned live · depth: Depth Anything V2 · identified by ${scan?.model || 'nobody (offline)'}`;
    labels.rebuild(m);
    scanRoles = m.roles;
    step(scan?.summary || 'Done. Open your palm or drag the slider to pull it apart.');
    setTimeout(() => setExplode(0.75), 900);
  } catch (err) {
    console.error(err);
    step('Scan failed. Try again with the object closer and better lit.');
  } finally {
    captureBtn.disabled = false;
  }
}
let scanRoles: string[] = [];
export function partRole(i: number) {
  if (mode === 'places' && place) {
    const name = stage.model?.parts[i]?.name || '';
    const f = place.facts.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return f ? f.fact.replace(/\.$/, '') : '';
  }
  if (mode === 'build' && built) {
    const id = (stage.model?.parts[i] as { id?: string } | undefined)?.id;
    return built.parts.find((p) => p.id === id)?.role.replace(/\.$/, '') || '';
  }
  return scanned ? scanRoles[i] || '' : '';
}

function setTitle(t: string) {
  const h = $('model-title');
  h.textContent = t;
  h.classList.toggle('long', t.length > 22);
}
document.getElementById('rescan')!.addEventListener('click', () => {
  scanPanel.hidden = false;
  intro.hidden = true;
  scanStatus.textContent = '';
});

// ---------- places ----------
let place: PlaceData | null = null;
const placePanel = document.getElementById('place-panel') as HTMLElement;
const placeStatus = document.getElementById('place-status')!;
const sunBox = document.getElementById('sun') as HTMLElement;
const sunInput = document.getElementById('sun-time') as HTMLInputElement;
let sunLine: THREE.Line | null = null;

(document.getElementById('place-form') as HTMLFormElement).addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = (document.getElementById('place-input') as HTMLInputElement).value.trim();
  if (q) searchPlace(q);
});

document.getElementById('place-compare')?.addEventListener('click', () => {
  setMode('trends');
  openCompare(place ? { name: place.name, lat: place.lat, lon: place.lon, mode: 'point' } : undefined);
});

export async function loadPlace(q: string) {
  placeStatus.textContent = `finding ${q} on OpenStreetMap`;
  ui.log(`place: ${q}`, 'you');
  const slow = setTimeout(() => { placeStatus.textContent = 'pulling building footprints, this can take 20 to 30 seconds the first time'; }, 4000);
  try {
    const d = await fetchPlace(q);
    clearTimeout(slow);
    showPlace(d);
  } catch (err) {
    clearTimeout(slow);
    placeStatus.textContent = err instanceof Error ? err.message : String(err);
  }
}

export function showPlace(d: PlaceData) {
  place = d;
  const { model, exaggeration } = buildPlace(d);
  stage.setModel(model);
  stage.frame('place');
  stage.userZoomed = false;
  state.entry = null;
  setExplode(0);
  ui.closeCard();
  setTitle(d.name);
  $('model-kind').textContent = `Place · ${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}`;
  $('parts-n').textContent = String(model.parts.length);
  $('credit').textContent = `${d.attribution} · heights x${exaggeration}${d.model ? ` · facts by ${d.model} with Tavily` : ''}`;
  labels.rebuild(model);
  ui.log(`${d.features.length} buildings, ${d.facts.length} cited facts`, 'tool');
  for (const f of d.facts.slice(0, 2)) ui.log(`${f.name}: ${f.fact}`, 'answer');
  intro.hidden = false;
  sunBox.hidden = false;
  updateSun();
}

function updateSun() {
  if (!place) return;
  const hours = Number(sunInput.value);
  const now = new Date();
  // Local solar-ish clock: the slider is the place's local time, estimated from longitude.
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + (hours - place.lon / 15) * 3600e3;
  const s = sunDirection(place.lat, place.lon, new Date(utc));
  const hh = Math.floor(hours), mm = Math.round((hours - hh) * 60);
  $('sun-read').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('sun-meta').textContent = s.altitudeDeg > 0 ? `Azimuth ${s.azimuthDeg.toFixed(0)}°, altitude ${s.altitudeDeg.toFixed(0)}°` : 'Sun below the horizon';
  if (sunLine) { stage.pivot.remove(sunLine); sunLine.geometry.dispose(); }
  const end = s.dir.clone().multiplyScalar(2.6);
  end.y = Math.max(end.y, 0.02);
  sunLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, 0), end]), new THREE.LineDashedMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff4fa3', dashSize: 0.06, gapSize: 0.04 }));
  sunLine.computeLineDistances();
  stage.pivot.add(sunLine);
}
sunInput.addEventListener('input', updateSun);
(window as unknown as { atlasPlace: typeof showPlace }).atlasPlace = showPlace;

// ---------- earth: real places in photoreal 3D ----------
let earthAuth: EarthAuth | null | undefined;
let earthActive = false;
let placeGlobeActive = false;
let currentLandmark: Landmark | null = null;
let earthStarted = false;
const landmarkList = document.getElementById('landmarks')!;
const placeTag = document.createElement('div');
placeTag.className = 'place-tag';
placeTag.hidden = true;
document.body.appendChild(placeTag);

const GROUP_LABEL: Record<string, string> = { Wonders: 'Wonders of the world', Icons: 'Icons in sharp 3D', India: 'India · coarse Google 3D, rebuilt by ATLAS' };
let lastGroup = '';
for (const l of LANDMARKS) {
  if (l.group && l.group !== lastGroup) {
    lastGroup = l.group;
    const h = document.createElement('li');
    h.className = 'group-head';
    h.textContent = GROUP_LABEL[l.group] || l.group;
    landmarkList.appendChild(h);
  }
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.id = l.id;
  b.innerHTML = `<span class="t"></span><span class="k"></span>`;
  b.querySelector('.t')!.textContent = l.name;
  b.querySelector('.k')!.textContent = l.city;
  if (l.lowDetail) { b.classList.add('low'); b.title = 'Google’s 3D is coarse here'; }
  b.addEventListener('click', () => selectLandmark(l));
  li.appendChild(b);
  landmarkList.appendChild(li);
}

// Lenses: the same world through a different sensor. Keys 1 to 5 while in Places.
let lens: Lens = 'photo';
const lensBoxes = [document.getElementById('lenses'), document.getElementById('globe-lenses')].filter(Boolean) as HTMLElement[];
for (const box of lensBoxes) {
  for (const l of LENSES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'look-btn';
    b.dataset.lens = l.id;
    b.title = `${l.label} (key ${l.key})`;
    b.innerHTML = `<span class="lk"></span>`;
    b.firstElementChild!.textContent = l.key;
    b.append(l.label);
    b.addEventListener('click', () => setLens(l.id));
    box.appendChild(b);
  }
}
function setLens(l: Lens) {
  lens = l;
  for (const box of lensBoxes) box.querySelectorAll<HTMLButtonElement>('.look-btn').forEach((x) => { const on = x.dataset.lens === l; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
  document.body.dataset.lens = l;
  stage.earth.setLook(l === 'hologram' ? 'hologram' : 'photo');
  stage.lens.set(earthActive ? l : 'photo');
  if (earthActive) shareState(currentLandmark);
}

/** The URL carries the place and lens, so a shared link lands on exactly this view. */
function shareState(l: Landmark | null) {
  const u = new URL(location.href);
  for (const k of ['place', 'at', 'lens']) u.searchParams.delete(k);
  if (l) {
    if (LANDMARKS.includes(l)) u.searchParams.set('place', l.id);
    else u.searchParams.set('at', `${l.lat.toFixed(5)},${l.lon.toFixed(5)},${l.name}`);
    if (lens !== 'photo') u.searchParams.set('lens', lens);
  }
  history.replaceState(null, '', u);
}
setLens('photo');

// Isolate: cut the landmark out of the city so it floats on the stage as an object.
let isolate = false;
const isoBtn = document.getElementById('iso-btn')!;
function applyIsolate() {
  const l = currentLandmark;
  const on = isolate && earthActive && !!l && !stage.flying && stage.earth.ground !== null;
  stage.setIsolate(on ? (l!.iso ?? l!.view * 0.45) : 0, stage.earth.ground ?? 0);
}
function setIsolate(on: boolean) {
  isolate = on;
  isoBtn.setAttribute('aria-pressed', String(on));
  applyIsolate();
  const l = currentLandmark;
  if (earthActive && l && stage.earth.ground !== null && !stage.flying) {
    const g = stage.earth.ground;
    if (on) stage.frameBlock(l.iso ?? l.view * 0.45, g + l.lift);
    else stage.frameBlock(l.view / 3.1, g + l.lift);
  }
  if (on && earthActive) ui.log('isolated: drag to turn it, scroll to zoom', 'sys');
}
isoBtn.addEventListener('click', () => setIsolate(!isolate));
window.addEventListener('keydown', (e) => {
  if (!earthActive || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.('input, textarea, [contenteditable]')) return;
  const hit = LENSES.find((x) => x.key === e.key);
  if (hit) { setLens(hit.id); e.preventDefault(); }
  if (e.key === 'i' || e.key === 'I') { setIsolate(!isolate); e.preventDefault(); }
});

async function getEarthAuth(): Promise<EarthAuth | null> {
  if (earthAuth !== undefined) return earthAuth;
  const debug = new URLSearchParams(location.search).get('tileset');
  if (debug) return (earthAuth = { kind: 'url', url: debug });
  try {
    const j = await (await fetch('/api/status')).json();
    earthAuth = j.earth || null;
  } catch { earthAuth = null; }
  return earthAuth ?? null;
}

async function enterPlaces() {
  const auth = await getEarthAuth();
  if (mode !== 'places') return;
  if (globeViewPref.places === 'nasa') {
    enablePlaceGlobe(true);
    updateGlobeViewToggles('nasa');
    placeStatus.textContent = 'NASA Blue Marble globe · live day/night · city lights';
    return;
  }
  if (!auth) {
    enablePlaceGlobe();
    updateGlobeViewToggles('nasa', false);
    return;
  }
  if (placeGlobeActive) disablePlaceGlobe();
  updateGlobeViewToggles('photo', true);
  if (!earthStarted) { if (currentLandmark) selectLandmark(currentLandmark); else goGlobe(); }
  else earthOn();
}

/**
 * The NASA satellite globe is the honest fallback when no Google/Cesium token is configured.
 * It is not a photoreal city mesh; it is the original Blue Marble Earth plus the 30-year
 * NASA POWER record for the selected place.
 */
function enablePlaceGlobe(showCurrent = true) {
  if (placeGlobeActive) {
    if (showCurrent && currentLandmark) showNasaPlace(currentLandmark);
    return;
  }
  placeGlobeActive = true;
  document.body.classList.add('earth-fallback');
  stage.pause();
  setPlaceGlobeMode(true);
  setPlaceGlobePick((lat, lon) => {
    const name = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    showNasaPlace({ id: `pick-${lat.toFixed(3)}-${lon.toFixed(3)}`, name, city: 'Picked on the globe', lat, lon, view: 450, lift: 20 });
  });
  if (showCurrent && currentLandmark) showNasaPlace(currentLandmark);
  else {
    resetPlaceGlobe();
    $('place-science').hidden = true;
    placeStatus.textContent = 'NASA satellite globe · search any place or tap the Earth.';
    if (!place) intro.hidden = true;
  }
}

function disablePlaceGlobe() {
  if (!placeGlobeActive) return;
  placeGlobeActive = false;
  setPlaceGlobeMode(false);
  setPlaceGlobePick(null);
  document.body.classList.remove('earth-fallback');
}

// ---------- globe tab: photoreal when a token exists, NASA Blue Marble otherwise ----------
function setGlobeStatus(text: string) {
  const el = document.getElementById('globe-status');
  if (el) el.textContent = text;
}

function setGlobeToggle(id: string, on: boolean) {
  const b = document.getElementById(id) as HTMLButtonElement | null;
  if (!b) return;
  b.classList.toggle('is-on', on);
  b.setAttribute('aria-pressed', String(on));
}

const fmtView = (m: number) => (m >= 1000 ? `${Math.round(m / 1000)} km` : `${Math.round(m)} m`);

function globeRow(target: Landmark | null) {
  const row = document.getElementById('globe-place');
  const name = document.getElementById('globe-place-name');
  if (!row || !name) return;
  row.hidden = !target;
  if (target) name.textContent = `${target.name} · ${target.lat.toFixed(3)}, ${target.lon.toFixed(3)}`;
}

function showGlobeAnswer(text: string) {
  const el = document.getElementById('globe-answer');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
}

async function refreshGlobeAgent() {
  try {
    const j = await (await fetch('/api/status')).json();
    globeAgentLive = !!j.provider;
  } catch { globeAgentLive = false; }
  applyAgentAvailability();
}

/** Show the ask boxes only when a keyed model is actually live. */
function applyAgentAvailability() {
  const globeForm = document.getElementById('globe-ask') as HTMLFormElement | null;
  if (globeForm) globeForm.hidden = !globeAgentLive;
  const trendForm = document.getElementById('trend-ask') as HTMLFormElement | null;
  if (trendForm) trendForm.hidden = !globeAgentLive;
  const note = document.getElementById('trend-ask-note');
  if (note) note.hidden = globeAgentLive;
}

/** Draw the session history in every list that shows it. */
function renderSessionHistory() {
  const entries = sessionHistory();
  for (const id of ['globe-history-list', 'trend-history-list']) {
    const list = document.getElementById(id);
    if (!list) continue;
    list.replaceChildren();
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No questions yet in this session.';
      list.appendChild(li);
      continue;
    }
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = e.role;
      const when = document.createElement('time');
      when.textContent = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const who = document.createElement('b');
      who.textContent = e.role === 'user' ? 'You' : 'ATLAS';
      const body = document.createElement('span');
      body.textContent = e.content;
      li.append(when, who, body);
      list.appendChild(li);
    }
  }
}
window.addEventListener('atlas:session', renderSessionHistory);
renderSessionHistory();

document.getElementById('globe-history-clear')?.addEventListener('click', () => clearSession());
document.getElementById('trend-history-clear')?.addEventListener('click', () => clearSession());

// Ask ATLAS about the record on screen, with the session history kept beside it.
const trendAskCtx = {
  ...agentCtx,
  onAnswer: (answer: string) => {
    const box = document.getElementById('trend-ask-answer');
    if (!box) return;
    box.hidden = false;
    box.textContent = answer;
  },
  onError: (message: string) => {
    const box = document.getElementById('trend-ask-answer');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
  },
};
(document.getElementById('trend-ask') as HTMLFormElement).addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = document.getElementById('trend-ask-input') as HTMLInputElement;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  const box = document.getElementById('trend-ask-answer');
  if (box) { box.hidden = false; box.textContent = 'Thinking…'; }
  void ask(q, trendAskCtx);
});

/** The NASA Blue Marble fallback also answers searches, at a fitting whole-globe distance. */
function globeFallbackFlyTo(target: Landmark) {
  globePlace = target;
  globeLanded = true;
  globePick = { name: target.name, lat: target.lat, lon: target.lon };
  const view = target.view;
  const dist = view >= 200000 ? 4.8 : view >= 40000 ? 4.2 : view >= 7000 ? 3.6 : 2.8;
  flyGlobeTab(target.lat, target.lon, target.name, dist);
  setGlobeToggle('globe-spin', false);
  globeRow(target);
  const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (trend) trend.hidden = false;
  setGlobeStatus(`NASA Blue Marble · ${target.name} · ${fmtView(view)} view`);
}

function globeDetails() {
  const target = globePlace;
  if (!target) return;
  setMode('places');
  void selectLandmark(target, { science: true });
}

async function globeGo(target: Landmark) {
  if (mode !== 'globe') return;
  if (globeTabFallbackActive) { globeFallbackFlyTo(target); return; }
  await globeFlyTo(target);
}

/** Geocode a typed name or use exact coordinates, then traverse from orbit to a fitting depth. */
async function globeFlyByName(place: string, lat?: number, lon?: number) {
  if (mode !== 'globe') return;
  const q = place.toLowerCase();
  const head = q.split(',')[0].trim();
  const preset = LANDMARKS.find((l) => q.includes(l.name.toLowerCase()) || (head.length >= 5 && l.name.toLowerCase().includes(head)));
  const point = Number.isFinite(lat) && Number.isFinite(lon) ? { lat: Number(lat), lon: Number(lon) } : parseLatLon(place);
  if (!point && preset) {
    // A curated landmark keeps its own coordinates and depth (Eiffel 720 m, Liberty 330 m).
    await globeGo({
      id: `globe-${preset.id}`,
      name: preset.name,
      city: preset.city,
      lat: preset.lat,
      lon: preset.lon,
      view: preset.view,
      lift: preset.lift,
    });
    return;
  }
  if (point) {
    const sig = signals.active.length && /earthquake|quake|fire|storm|cyclone|ice|volcano|\bM ?\d/i.test(place);
    await globeGo({
      id: `globe-${Date.now()}`,
      name: preset?.name || place.split(',')[0].trim() || 'Shared place',
      city: preset?.city || `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`,
      lat: preset?.lat ?? point.lat,
      lon: preset?.lon ?? point.lon,
      view: sig ? 26000 : preset?.view ?? 1200,
      lift: preset?.lift ?? 20,
    });
    return;
  }
  setGlobeStatus(`Finding ${place}…`);
  try {
    const r = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: place }) });
    const g = await r.json();
    if (!r.ok || g.error) throw new Error(g.error || 'not found');
    if (mode !== 'globe') return;
    const parts = String(g.name).split(',');
    const fit = viewForGeo(g);
    await globeGo({
      id: `globe-${Date.now()}`,
      name: parts[0].trim() || place,
      city: parts.slice(1).join(',').trim() || place,
      lat: Number(g.lat),
      lon: Number(g.lon),
      view: fit.view,
      lift: fit.lift,
    });
  } catch (err) {
    if (mode === 'globe') setGlobeStatus(err instanceof Error ? err.message : String(err));
  }
}

async function globeFlyTo(target: Landmark) {
  const seq = ++globeFlightSeq;
  const auth = await getEarthAuth();
  if (mode !== 'globe' || seq !== globeFlightSeq) return;
  if (!auth) { globeFallbackFlyTo(target); return; }

  disableGlobeTabFallback();
  earthOn();
  stage.resume();
  setGlobeToggle('globe-lights', false);
  setGlobeToggle('globe-satellite', false);
  updateGlobeViewToggles('photo', true);
  globe = null;
  globePlace = target;
  globeRow(target);
  const oldTrend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (oldTrend) oldTrend.hidden = true;
  setGlobeStatus(`Flying to ${target.name} · ${fmtView(target.view)} view`);
  $('credit').textContent = 'Imagery and 3D tiles © Google · streamed through Cesium ion';

  const prediction = fetch(`/api/elevation?lat=${target.lat}&lon=${target.lon}`)
    .then((r) => r.json())
    .then((j) => (Number.isFinite(j.ellipsoid) ? Number(j.ellipsoid) : null))
    .catch(() => null);

  const height = globeDist();
  const from = originLL ?? { lat: target.lat, lon: target.lon };
  const startDist = stage.camera.position.distanceTo(stage.controls.target);

  // From a street-level view, pull up first; from orbit, stay out and turn the planet.
  if (startDist < 1.2e6) {
    await new Promise<void>((resolve) => stage.rise(height, 2.0, resolve));
    if (mode !== 'globe' || seq !== globeFlightSeq) return;
  }

  // Settle into a true whole-Earth hold (camera and target both shift by one Earth radius).
  await new Promise<void>((resolve) => {
    const fromP = stage.camera.position.clone(), fromT = stage.controls.target.clone();
    const toP = stage.earth.center.clone().addScaledVector(stage.earth.upAxis, height);
    const toT = stage.earth.center.clone();
    const whole = fromP.distanceTo(fromT) > height * 0.85 && fromT.distanceTo(stage.earth.center) < 1e5;
    if (whole) { stage.holdWholeEarth(height); resolve(); return; }
    stage.run(1.6, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      stage.camera.position.lerpVectors(fromP, toP, e);
      stage.controls.target.lerpVectors(fromT, toT, e);
    }, resolve);
  });
  if (mode !== 'globe' || seq !== globeFlightSeq) return;

  // Traverse the planet along the shortest arc, with the camera held in orbit.
  const a = llToVec(from.lat, from.lon), b = llToVec(target.lat, target.lon);
  const angle = a.angleTo(b);
  if (angle > 1e-4) {
    await new Promise<void>((resolve) => {
      const v = new THREE.Vector3();
      stage.run(THREE.MathUtils.clamp(1 + angle * 1.6, 1, 4), (k) => {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        slerpUnit(a, b, angle, e, v);
        const ll = vecToLl(v);
        stage.earth.setOrigin(ll.lat, ll.lon);
        stage.holdWholeEarth(height);
      }, resolve);
    });
  } else {
    stage.earth.setOrigin(target.lat, target.lon);
    stage.holdWholeEarth(height);
  }
  if (mode !== 'globe' || seq !== globeFlightSeq) return;
  originLL = { lat: target.lat, lon: target.lon };
  stage.earth.goTo(target.lat, target.lon);

  const predicted = await Promise.race([
    prediction,
    new Promise<number | null>((resolve) => setTimeout(() => resolve(null), 2600)),
  ]);
  if (mode !== 'globe' || seq !== globeFlightSeq) return;
  if (predicted !== null) stage.earth.predictGround(predicted);
  const land = new THREE.Vector3(0, (predicted ?? 0) + target.lift, 0);
  let landed = predicted;
  stage.earth.onGround = (y) => {
    if (mode !== 'globe' || globePlace !== target) return;
    stage.shiftGround(y - (landed ?? 0));
    landed = y;
  };

  setGlobeStatus(`Descending to ${target.name} · ${fmtView(target.view)} view`);
  const fromDistance = Math.max(height - 6371000, target.view);
  await new Promise<void>((resolve) => stage.dive(land, target.view, fromDistance, 7.2, resolve, target.view >= 100000));
  if (mode !== 'globe' || seq !== globeFlightSeq) return;
  globeLanded = true;
  stage.controls.enabled = true;
  setGlobeStatus(`${target.name} · ${fmtView(target.view)} view · drag to look around · Back to orbit returns to the planet`);
  globeRow(target);
}

/** Pull back from a place to the whole photoreal Earth. */
function globeBackToOrbit() {
  if (mode !== 'globe') return;
  if (globeTabFallbackActive) {
    globeTabReset();
    globePick = null;
    globePlace = null;
    globeRow(null);
    const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
    if (trend) trend.hidden = true;
    setGlobeStatus('NASA Blue Marble · live day/night terminator · VIIRS city lights');
    return;
  }
  const at = globePlace ?? originLL ?? { lat: 18, lon: 78 };
  ++globeFlightSeq;
  globeLanded = false;
  stage.earth.onGround = null;
  globePlace = null;
  globeRow(null);
  setGlobeStatus('Returning to orbit…');
  const height = globeDist();
  const fromP = stage.camera.position.clone(), fromT = stage.controls.target.clone();
  const toP = stage.earth.center.clone().addScaledVector(stage.earth.upAxis, height);
  const toT = stage.earth.center.clone();
  stage.run(2.4, (k) => {
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    stage.camera.position.lerpVectors(fromP, toP, e);
    stage.controls.target.lerpVectors(fromT, toT, e);
  }, () => {
    if (mode !== 'globe') return;
    originLL = { lat: at.lat, lon: at.lon };
    stage.earth.setOrigin(at.lat, at.lon);
    globe = { lat: at.lat, lon: at.lon, dist: height, spin: document.getElementById('globe-spin')?.getAttribute('aria-pressed') === 'true' };
    setGlobeStatus('Google Photorealistic 3D Tiles · drag to orbit · scroll to zoom');
  });
}

function pickGlobePoint(lat: number, lon: number) {
  if (mode !== 'globe' || !globeTabFallbackActive) return;
  const name = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  globePick = { name, lat, lon };
  showGlobeTabMarker(lat, lon, name);
  setGlobeStatus(`Picked ${name} · Open in Trends, or Reset the globe`);
  const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (trend) trend.hidden = false;
}

function enableGlobeTabFallback() {
  if (mode !== 'globe') return;
  ++globeFlightSeq;
  globeTabFallbackActive = true;
  document.body.classList.add('globe-fallback');
  stage.pause();
  setGlobeTabMode(true);
  setGlobeTabPick(pickGlobePoint);
  showGlobeTab();
  globePick = null;
  setGlobeToggle('globe-spin', true);
  setGlobeToggle('globe-lights', true);
  setGlobeToggle('globe-satellite', false);
  const actions = document.getElementById('globe-layer-actions');
  if (actions) actions.hidden = false;
  const setup = document.getElementById('globe-setup');
  if (setup) setup.hidden = false;
  const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (trend) trend.hidden = true;
  $('globe-mode').textContent = 'NASA Blue Marble';
  $('globe-hint').textContent = 'Drag to turn · scroll to zoom · tap to mark';
  $('credit').textContent = 'NASA GIBS Blue Marble + VIIRS city lights · NASA POWER for trends';
  updateGlobeViewToggles('nasa');
  setGlobeStatus('NASA Blue Marble · live day/night terminator · VIIRS city lights');
}

function disableGlobeTabFallback() {
  if (!globeTabFallbackActive) return;
  globeTabFallbackActive = false;
  setGlobeTabMode(false);
  setGlobeTabPick(null);
  document.body.classList.remove('globe-fallback');
  globePick = null;
}

type GlobeView = 'photo' | 'nasa';

/** Which renderer each screen last chose: Trends, Places and Globe keep their own pick. */
const globeViewPref: Record<'trends' | 'places' | 'globe', GlobeView> = { trends: 'nasa', places: 'photo', globe: 'photo' };

/** The renderer switch: Google's photoreal tiles or the NASA Blue Marble globe. */
function updateGlobeViewToggles(view: GlobeView, photoAvailable = earthAuth !== null) {
  document.querySelectorAll<HTMLElement>('[data-globe-switch]').forEach((box) => {
    box.querySelectorAll<HTMLButtonElement>('[data-globe-view]').forEach((b) => {
      const on = b.dataset.globeView === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = b.dataset.globeView === 'photo' && !photoAvailable;
      b.title = b.dataset.globeView === 'photo'
        ? (photoAvailable ? 'Google Photorealistic 3D Tiles streamed through Cesium ion' : 'Add a Cesium ion or Google Maps token to enable photoreal tiles')
        : 'NASA GIBS Blue Marble with live day/night and VIIRS city lights';
    });
  });
  const lights = document.getElementById('globe-lights');
  const clouds = document.getElementById('globe-satellite');
  if (lights) lights.title = view === 'photo' ? 'City lights (switches to the NASA renderer)' : 'VIIRS city lights';
  if (clouds) clouds.title = view === 'photo' ? 'Live clouds (switches to the NASA renderer)' : 'Today’s MODIS Terra clouds';
}

/** Apply the renderer choice to whichever screen is showing a globe right now. */
async function setGlobeView(view: GlobeView) {
  if (mode === 'trends') { globeViewPref.trends = view; await setTrendsGlobeView(view); return; }
  if (mode === 'places') { globeViewPref.places = view; await setPlaceGlobeView(view); return; }
  globeViewPref.globe = view;
  if (mode !== 'globe') return;
  if (view === 'nasa') {
    if (globeTabFallbackActive) { updateGlobeViewToggles('nasa'); return; }
    enableGlobeTabFallback();
    setGlobeStatus('NASA Blue Marble · live day/night terminator · VIIRS city lights');
    return;
  }
  const auth = await getEarthAuth();
  if (mode !== 'globe') return;
  if (!auth) {
    enableGlobeTabFallback();
    updateGlobeViewToggles('nasa', false);
    setGlobeStatus('Photoreal tiles need a Cesium ion or Google Maps token · NASA Blue Marble is showing');
    return;
  }
  await enterGlobeTab();
}

/** Places: photoreal tiles or the NASA globe, with the same controls either way. */
async function setPlaceGlobeView(view: GlobeView) {
  if (mode !== 'places') return;
  if (view === 'nasa') {
    disablePlaceGlobe();
    enablePlaceGlobe(true);
    updateGlobeViewToggles('nasa');
    placeStatus.textContent = 'NASA Blue Marble globe · live day/night · city lights';
    return;
  }
  const auth = await getEarthAuth();
  if (mode !== 'places') return;
  if (!auth) {
    enablePlaceGlobe(true);
    updateGlobeViewToggles('nasa', false);
    placeStatus.textContent = 'Photoreal tiles need a Cesium ion or Google Maps token · NASA globe is showing';
    return;
  }
  disablePlaceGlobe();
  await enterPlaces();
  updateGlobeViewToggles('photo', true);
}

/** Trends: the NASA globe with the GIBS overlays, or the photoreal Earth behind the data. */
async function setTrendsGlobeView(view: GlobeView) {
  if (mode !== 'trends') return;
  if (view === 'nasa') {
    document.body.classList.remove('photo-globe');
    if (earthActive) exitEarth();
    stage.pause();
    setTrendMode(true);
    updateGlobeViewToggles('nasa');
    return;
  }
  const auth = await getEarthAuth();
  if (mode !== 'trends') return;
  if (!auth) {
    updateGlobeViewToggles('nasa', false);
    setGlobeStatus('Photoreal tiles need a Cesium ion or Google Maps token · NASA Blue Marble is showing');
    return;
  }
  document.body.classList.add('photo-globe');
  setTrendMode(false);
  earthOn();
  stage.resume();
  ui.closeCard();
  const at = originLL ?? { lat: 18, lon: 78 };
  const enter = () => { globe = { lat: at.lat, lon: at.lon, dist: globeDist(), spin: !reducedMotion }; originLL = { ...at }; };
  if (!earthStarted || !originLL) {
    stage.earth.start(auth, at.lat, at.lon);
    stage.earth.setLook('photo');
    earthStarted = true;
    originLL = { ...at };
    stage.holdUntil(globeDist(), () => stage.earth.visibleTiles > 4, 0.4, 4, enter, true);
  } else {
    stage.rise(globeDist(), 2.2, enter);
  }
  updateGlobeViewToggles('photo', true);
}

/**
 * A full-screen Earth as its own mode. With CESIUM_ION_TOKEN or GOOGLE_MAPS_KEY the stage
 * streams Google Photorealistic 3D Tiles; without one it falls back to the NASA globe,
 * with the real subsolar point, VIIRS city lights and a 4096 px NASA basemap.
 */
async function enterGlobeTab() {
  const seq = ++globeTabRequest;
  ++globeFlightSeq;
  globeLanded = false;
  stage.earth.onGround = null;
  globePlace = null;
  globeRow(null);
  showGlobeAnswer('');
  $('globe-mode').textContent = 'Opening globe…';
  setGlobeStatus('Opening the globe…');
  void refreshGlobeAgent();
  if (globeViewPref.globe === 'nasa') {
    enableGlobeTabFallback();
    updateGlobeViewToggles('nasa');
    return;
  }
  const auth = await getEarthAuth();
  if (mode !== 'globe' || seq !== globeTabRequest) return;
  if (!auth) { enableGlobeTabFallback(); updateGlobeViewToggles('nasa', false); return; }

  disableGlobeTabFallback();
  earthOn();
  stage.resume();
  ui.closeCard();
  signals.select(null);
  stage.setIsolate(0, 0);
  currentLandmark = null;
  placeTag.hidden = true;
  sunBox.hidden = true;
  intro.hidden = true;
  setTitle('Earth');
  $('model-kind').textContent = 'Google Photorealistic 3D Tiles';
  $('parts-n').textContent = '';
  document.body.classList.add('globe');
  const actions = document.getElementById('globe-layer-actions');
  if (actions) actions.hidden = false;
  const setup = document.getElementById('globe-setup');
  if (setup) setup.hidden = true;
  const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (trend) trend.hidden = true;
  setGlobeToggle('globe-spin', !reducedMotion);
  setGlobeToggle('globe-lights', false);
  setGlobeToggle('globe-satellite', false);
  updateGlobeViewToggles('photo', true);
  $('globe-mode').textContent = auth.kind === 'ion' ? 'Photoreal · Cesium ion' : auth.kind === 'google' ? 'Photoreal · Google tiles' : 'Photoreal · 3D Tiles';
  $('globe-hint').textContent = 'Drag to orbit · scroll to zoom · Spin turns the planet';
  setGlobeStatus('Google Photorealistic 3D Tiles · drag to orbit · scroll to zoom');
  stage.earth.onAttribution = (html) => { $('credit').innerHTML = html; };
  $('credit').textContent = 'Imagery and 3D tiles © Google · streamed through Cesium ion';

  const at = originLL ?? { lat: 18, lon: 78 };
  const enter = () => { globe = { lat: at.lat, lon: at.lon, dist: globeDist(), spin: !reducedMotion }; originLL = { ...at }; };
  if (!earthStarted || !originLL) {
    stage.earth.start(auth, at.lat, at.lon);
    stage.earth.setLook('photo');
    earthStarted = true;
    originLL = { ...at };
    stage.holdWholeEarth(globeDist());
    stage.holdUntil(globeDist(), () => stage.earth.visibleTiles > 4, 0.4, 4, enter, true);
  } else {
    stage.rise(globeDist(), 2.2, enter);
  }
}

// Globe tab controls (the renderer switch and layers work in both views).
(document.getElementById('globe-spin') as HTMLButtonElement).addEventListener('click', (ev) => {
  const b = ev.currentTarget as HTMLButtonElement;
  const on = b.getAttribute('aria-pressed') !== 'true';
  setGlobeToggle('globe-spin', on);
  if (globeTabFallbackActive) {
    globeTabSpin(on);
  } else if (globe) {
    globe.spin = on;
    setGlobeStatus(on ? 'Spinning eastward · click Spin to stop' : 'Spin stopped · drag to orbit');
  } else {
    setGlobeStatus(on ? 'Spin on · Back to orbit to see the planet turn' : 'Spin off');
  }
});
(document.getElementById('globe-lights') as HTMLButtonElement).addEventListener('click', (ev) => {
  const b = ev.currentTarget as HTMLButtonElement;
  const on = b.getAttribute('aria-pressed') !== 'true';
  if (!globeTabFallbackActive) {
    // VIIRS lights are part of the NASA globe, not the Google tile pyramid.
    enableGlobeTabFallback();
    setGlobeToggle('globe-lights', true);
    globeTabNight(true);
    setGlobeStatus('VIIRS city lights · switched to NASA Blue Marble');
    return;
  }
  setGlobeToggle('globe-lights', on);
  globeTabNight(on);
});
(document.getElementById('globe-satellite') as HTMLButtonElement).addEventListener('click', (ev) => {
  const b = ev.currentTarget as HTMLButtonElement;
  const on = b.getAttribute('aria-pressed') !== 'true';
  if (!globeTabFallbackActive) {
    // Live clouds are a NASA GIBS layer; switch renderer and apply it straight away.
    enableGlobeTabFallback();
    setGlobeToggle('globe-satellite', true);
    globeTabBase('clouds');
    setGlobeStatus('NASA GIBS · switched to NASA Blue Marble · loading today’s MODIS Terra clouds…');
    return;
  }
  setGlobeToggle('globe-satellite', on);
  globeTabBase(on ? 'clouds' : 'map');
  setGlobeStatus(on ? 'NASA GIBS · loading today’s MODIS Terra clouds…' : 'NASA Blue Marble · live day/night terminator');
});
(document.getElementById('globe-reset') as HTMLButtonElement).addEventListener('click', () => {
  globePick = null;
  setGlobeToggle('globe-spin', true);
  setGlobeToggle('globe-lights', globeTabFallbackActive);
  setGlobeToggle('globe-satellite', false);
  const trend = document.getElementById('globe-trend') as HTMLButtonElement | null;
  if (trend) trend.hidden = true;
  if (!globeTabFallbackActive) {
    updateGlobeViewToggles('photo');
    globeBackToOrbit();
    return;
  }
  globeTabReset();
  globeRow(null);
  setGlobeStatus('NASA Blue Marble · live day/night terminator · VIIRS city lights');
});
// One switch, wherever a globe is on screen: Trends, Places and the Globe tab.
document.querySelectorAll<HTMLButtonElement>('[data-globe-view]').forEach((b) => {
  b.addEventListener('click', () => void setGlobeView((b.dataset.globeView === 'nasa' ? 'nasa' : 'photo') as GlobeView));
});
(document.getElementById('globe-search') as HTMLFormElement).addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = document.getElementById('globe-search-input') as HTMLInputElement;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  showGlobeAnswer('');
  void globeFlyByName(q);
});
(document.getElementById('globe-back') as HTMLButtonElement).addEventListener('click', () => globeBackToOrbit());
(document.getElementById('globe-details') as HTMLButtonElement).addEventListener('click', () => globeDetails());
(document.getElementById('globe-place-trend') as HTMLButtonElement).addEventListener('click', () => {
  if (!globePlace) return;
  const p = globePlace;
  setMode('trends');
  openTrendAt({ name: p.name, lat: p.lat, lon: p.lon, mode: 'point' }, 't2m');
});
// Build a hologram of the place on the globe, like the Build tab does.
(document.getElementById('globe-place-build') as HTMLButtonElement).addEventListener('click', () => {
  const p = globePlace;
  if (!p) return;
  runConstruct(p.name, p.city);
});
// Compare the place on the globe with other places, using the same NASA variable and test.
(document.getElementById('globe-place-compare') as HTMLButtonElement).addEventListener('click', () => {
  const p = globePlace ?? globePick;
  setMode('trends');
  openCompare(p ? { name: p.name, lat: p.lat, lon: p.lon, mode: 'point' } : undefined);
});

const globeAskCtx = {
  ...agentCtx,
  onAnswer: (answer: string) => showGlobeAnswer(answer),
  onError: (message: string) => showGlobeAnswer(message),
};
(document.getElementById('globe-ask') as HTMLFormElement).addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = document.getElementById('globe-ask-input') as HTMLInputElement;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  showGlobeAnswer('Thinking…');
  void ask(q, globeAskCtx);
});
(document.getElementById('globe-trend') as HTMLButtonElement).addEventListener('click', () => {
  if (!globePick) return;
  const p = globePick;
  setMode('trends');
  openTrendAt({ name: p.name, lat: p.lat, lon: p.lon, mode: 'point' }, 't2m');
});

function showNasaPlace(l: Landmark) {
  if (!placeGlobeActive) enablePlaceGlobe(false);
  currentLandmark = l;
  landmarkList.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', (b as HTMLElement).dataset.id === l.id));
  earthStarted = false;
  originLL = null;
  ui.closeCard();
  intro.hidden = false;
  setTitle(l.name);
  $('model-kind').textContent = `NASA Earth view · ${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`;
  $('parts-n').textContent = '30 yr';
  $('credit').textContent = 'NASA Blue Marble · NASA POWER 1996–2025 · USGS / ECCC gauge';
  placeStatus.textContent = 'Flying the NASA globe to this place…';
  placeTag.hidden = true;
  sunBox.hidden = true;
  showPlaceGlobe(l.lat, l.lon, l.name);
  window.setTimeout(() => {
    if (mode !== 'places' || currentLandmark !== l || !placeGlobeActive) return;
    placeStatus.textContent = `NASA Blue Marble view · ${Math.abs(l.lat).toFixed(4)}°${l.lat >= 0 ? 'N' : 'S'}, ${Math.abs(l.lon).toFixed(4)}°${l.lon >= 0 ? 'E' : 'W'} · science card open`;
  }, 2600);
  shareState(l);
  void loadPlaceScience(l);
}

async function fetchScience(variable: 't2m' | 'precip' | 'streamflow', l: Landmark): Promise<TrendResult> {
  const q = new URLSearchParams({
    variable, lat: l.lat.toFixed(4), lon: l.lon.toFixed(4), start: '1996', end: '2025', mode: 'point', name: l.name,
  });
  const res = await fetch(`/api/trends?${q.toString().replace(/\+/g, '%20')}`);
  const body = (await res.json().catch(() => null)) as (TrendResult & { error?: string }) | null;
  if (body?.error) throw new Error(body.error);
  if (!res.ok) throw new Error(`NASA request failed (HTTP ${res.status})`);
  if (!body || !body.variable || !body.place || !Array.isArray(body.series?.annual)) {
    throw new Error('The NASA API returned an unexpected response. Open the app through `vercel dev` or the deployed site, not `vite preview` alone.');
  }
  return body;
}

async function loadPlaceScience(l: Landmark) {
  const panel = $('place-science');
  panel.hidden = false;
  $('ps-place').textContent = l.name;
  $('ps-coords').textContent = `${Math.abs(l.lat).toFixed(4)}°${l.lat >= 0 ? 'N' : 'S'}, ${Math.abs(l.lon).toFixed(4)}°${l.lon >= 0 ? 'E' : 'W'}${l.city ? ` · ${l.city}` : ''} · 1996–2025`;
  const body = $('ps-body');
  body.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'ps-loading';
  loading.textContent = 'Reading 30 years of NASA POWER data and the nearest stream gauge…';
  body.appendChild(loading);
  $('ps-source').textContent = 'NASA POWER / MERRA-2 · NASA GIBS Blue Marble · USGS Water Services / ECCC MSC GeoMet';
  $<HTMLAnchorElement>('ps-power').href = 'https://power.larc.nasa.gov/data-access-viewer/';

  const [temp, precip, water] = await Promise.allSettled([
    fetchScience('t2m', l), fetchScience('precip', l), fetchScience('streamflow', l),
  ]);
  if (currentLandmark !== l || mode !== 'places') return;
  body.replaceChildren();

  const addRow = (name: string, r: TrendResult | null, err: string | null) => {
    const row = document.createElement('div');
    row.className = 'ps-row';
    const left = document.createElement('div');
    const n = document.createElement('div');
    n.className = 'ps-name';
    n.textContent = name;
    left.appendChild(n);
    const rate = document.createElement('div');
    rate.className = 'ps-rate';
    const meta = document.createElement('div');
    meta.className = 'ps-meta';
    if (r?.stats) {
      const s = r.stats;
      const d = decimalsFor(r.variable.id);
      rate.textContent = `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)} ${r.variable.annualUnit}/dec`;
      meta.textContent = `Mean ${fmt(s.mean, d)} ${r.variable.annualUnit} · p = ${s.mk.p < 0.001 ? '<0.001' : fmt(s.mk.p, 3)} · ${s.n} years`;
      const badge = document.createElement('span');
      badge.className = `ps-badge ${s.mk.significant ? 'sig' : 'none'}`;
      badge.textContent = s.mk.significant ? 'Significant' : 'Not significant';
      meta.appendChild(badge);
      if (r.place.gauge) {
        const g = document.createElement('div');
        g.textContent = `${r.place.gauge.source} ${r.place.gauge.id} · ${r.place.gauge.name} · ${r.place.gauge.distanceKm} km away`;
        meta.appendChild(g);
      }
    } else {
      rate.textContent = 'no test';
      meta.textContent = r ? `${r.series.annual.length} complete years; too few for a trend test.` : err || 'Data unavailable.';
    }
    row.append(left, rate, meta);
    body.appendChild(row);
  };

  const pick = (x: PromiseSettledResult<TrendResult>) => (x.status === 'fulfilled' ? x.value : null);
  const why = (x: PromiseSettledResult<TrendResult>) => (x.status === 'rejected' ? (x.reason instanceof Error ? x.reason.message : String(x.reason)) : null);
  addRow('Air temperature', pick(temp), why(temp));
  addRow('Precipitation', pick(precip), why(precip));
  addRow('Streamflow · gauge', pick(water), why(water));

  const stamp = new Date().toLocaleDateString();
  $('ps-source').textContent = `NASA POWER / MERRA-2 and NASA GIBS, accessed ${stamp}. Streamflow: nearest active USGS (US) or ECCC (Canada) gauge. ` +
    'Trends are Sen’s slope with a Mann–Kendall test; p < 0.05 is called significant.';
}

$('place-science-close').addEventListener('click', () => { $('place-science').hidden = true; });
$('ps-open').addEventListener('click', () => {
  const l = currentLandmark;
  if (!l) return;
  setMode('trends');
  openTrendAt({ name: l.name, lat: l.lat, lon: l.lon, mode: 'point' }, 't2m');
});

function earthOn() {
  // setMode() rebuilds body.className, so restore the class even when the stage is already in Earth mode.
  document.body.classList.add('earth');
  if (earthActive) return;
  earthActive = true;
  stage.setEarth(true);
  stage.lens.set(lens);
  askInput.placeholder = askHint();
  ($('labels') as HTMLElement).hidden = true;
  sunBox.hidden = true;
}

function exitEarth() {
  if (globe) leaveGlobe();
  if (!earthActive) return;
  earthActive = false;
  earthStarted = false;
  originLL = null;
  document.body.classList.remove('earth');
  stage.setEarth(false);
  stage.lens.set('photo');
  askInput.placeholder = askHint();
  shareState(null);
  ($('labels') as HTMLElement).hidden = false;
  placeTag.hidden = true;
  if (state.entry) { setTitle(state.entry.title); $('model-kind').textContent = state.entry.kind; $('credit').textContent = `Model: ${state.entry.credit} · ${state.entry.licence}`; }
  else if (!scanned && mode !== 'build' && mode !== 'trends' && !recon) loadEntry(LIBRARY[0]);
}

// ---------- photo reconstructions (Gaussian splats) ----------
let recon: { l: Landmark; root: THREE.Group | null } | null = null;
const reconBtn = document.getElementById('recon-btn') as HTMLButtonElement;
const splatOverride = new URLSearchParams(location.search).get('splat');
function splatFor(l: Landmark | null) {
  if (!l) return null;
  if (splatOverride) return { url: splatOverride, credit: 'preview', photos: 0, rot: undefined as [number, number, number] | undefined };
  return l.splat ?? null;
}
function updateReconBtn() {
  const sp = splatFor(currentLandmark);
  reconBtn.hidden = !sp;
  if (sp) reconBtn.lastChild!.textContent = recon ? 'Back to Google 3D' : `Photo reconstruction${sp.photos ? ` · ${sp.photos} photos` : ''}`;
}
async function showReconstruction(l: Landmark) {
  const sp = splatFor(l);
  if (!sp) return;
  recon = { l, root: null };
  exitEarth();
  document.body.classList.add('recon');
  stage.setModel(null);
  stage.frame('object');
  intro.hidden = false;
  setTitle(l.name);
  $('model-kind').textContent = sp.photos ? `Reconstructed from ${sp.photos} public photos` : 'Photo reconstruction';
  $('parts-n').textContent = '1';
  const credit = $('credit');
  credit.textContent = sp.credit === 'preview' ? 'Preview splat' : `Gaussian splat trained by ATLAS from ${sp.credit} · `;
  if (sp.credit !== 'preview') {
    const a = document.createElement('a');
    a.href = sp.url.replace(/\.splat$/, '.credits.json'); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'photo credits';
    credit.appendChild(a);
  }
  placeStatus.textContent = 'loading the reconstruction';
  ui.log(`loading the photo reconstruction of ${l.name}`, 'sys');
  updateReconBtn();
  try {
    const root = await loadSplat(stage.scene, stage.renderer, { url: sp.url, rot: sp.rot });
    if (recon?.l !== l) { disposeSplat(root); return; }
    recon.root = root;
    stage.pivot.add(root);
    // Reconstructions from tourist photos are strong from the front only.
    stage.setSway(0.42);
    placeStatus.textContent = 'Drag to turn it, scroll to zoom. Press R to go back to Google 3D.';
  } catch (err) {
    placeStatus.textContent = `Could not load the reconstruction (${err instanceof Error ? err.message.slice(0, 80) : 'error'})`;
  }
}
function leaveReconstruction() {
  if (!recon) return;
  disposeSplat(recon.root);
  stage.setSway(null);
  recon = null;
  document.body.classList.remove('recon');
  updateReconBtn();
}
reconBtn.addEventListener('click', () => {
  if (!currentLandmark) return;
  if (recon) { const l = recon.l; leaveReconstruction(); earthStarted = false; originLL = null; selectLandmark(l); }
  else showReconstruction(currentLandmark);
});
window.addEventListener('keydown', (e) => {
  if (mode !== 'places' || e.metaKey || e.ctrlKey || (e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
  if ((e.key === 'r' || e.key === 'R') && splatFor(currentLandmark)) reconBtn.click();
});

async function selectLandmark(l: Landmark, opts: { facts?: boolean; science?: boolean } = {}) {
  if (recon) { leaveReconstruction(); earthStarted = false; originLL = null; }
  if (globe) leaveGlobe();
  const auth = await getEarthAuth();
  if (!auth) { showNasaPlace(l); return; }
  if (placeGlobeActive) disablePlaceGlobe();
  landmarkList.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', (b as HTMLElement).dataset.id === l.id));
  currentLandmark = l;
  updateReconBtn();
  earthOn();
  ui.closeCard();
  intro.hidden = false;
  setTitle(l.name);
  $('model-kind').textContent = `${l.city} · ${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`;
  placeStatus.textContent = `streaming ${l.name} in 3D`;
  ui.log(`flying to ${l.name}`, 'sys');
  placeTag.hidden = true;
  stage.setIsolate(0, 0);
  const look = lens === 'hologram' ? 'hologram' : 'photo';
  // Where the camera lands. Ground readings move it (the dive reads it every frame).
  const land = new THREE.Vector3(0, l.lift, 0);
  // Ground readings only count once the globe is turned to this landmark.
  let arrived = false;
  let landed: number | null = null;
  // Predict the ground before the tiles arrive (elevation above sea level + geoid).
  let predicted: number | null = null;
  const prediction = fetch(`/api/elevation?lat=${l.lat}&lon=${l.lon}`).then((r) => r.json()).then((j) => { if (Number.isFinite(j.ellipsoid)) predicted = j.ellipsoid; }).catch(() => {});
  const whenPredicted = (go: () => void) => Promise.race([prediction, new Promise((r) => setTimeout(r, 2500))]).then(() => { if (currentLandmark === l) go(); });
  const dive = (from: number) => {
    stage.earth.goTo(l.lat, l.lon);
    landed = predicted;
    land.set(0, (predicted ?? 0) + l.lift, 0);
    if (predicted !== null) stage.earth.predictGround(predicted);
    arrived = true;
    stage.dive(land, l.view, from, from > 1e6 ? 8 : 5.5, () => {
      applyIsolate();
      if (l.lowDetail && splatFor(l)) {
        // Google's mesh is flat here: show the site for a beat, then hand over to the reconstruction.
        placeStatus.textContent = `Google’s 3D is coarse at ${l.name}. Switching to ATLAS’s reconstruction from ${l.splat?.photos || 'public'} photos…`;
        setTimeout(() => { if (currentLandmark === l && !recon && mode === 'places') showReconstruction(l); }, 2200);
        return;
      }
      placeStatus.textContent = l.lowDetail ? `Google’s 3D is coarse at ${l.name}. Press B and ATLAS agents will build a model you can take apart.` : '';
    });
  };
  stage.earth.onGround = (y) => {
    if (currentLandmark !== l || !arrived) return;
    stage.shiftGround(y - (landed ?? 0));
    landed = y;
  };
  stage.earth.onAttribution = (html) => { $('credit').innerHTML = html; };

  if (!earthStarted || !originLL) {
    // First arrival: start on the whole planet, then fall in.
    stage.earth.start(auth, l.lat, l.lon);
    stage.earth.setLook(look);
    signals.rebuild();
    earthStarted = true;
    stage.holdTopDown(ORBIT);
    originLL = { lat: l.lat, lon: l.lon };
    // Show the whole planet for a beat while the globe streams in, then fall.
    stage.holdUntil(ORBIT, () => stage.earth.visibleTiles > 4, 1.4, 6, () => whenPredicted(() => dive(ORBIT)));
  } else {
    // A satellite pass: climb, turn the globe under the camera along the great circle, dive.
    const from = originLL, to = { lat: l.lat, lon: l.lon };
    const a = llToVec(from.lat, from.lon), b = llToVec(to.lat, to.lon);
    const angle = a.angleTo(b);
    const height = THREE.MathUtils.clamp(angle * 6.371e6 * 1.3, 40000, ORBIT);
    stage.rise(height, angle < 0.002 ? 0.6 : 2.2, () => {
      const v = new THREE.Vector3();
      stage.run(THREE.MathUtils.clamp(1 + angle * 1.6, 1, 4), (k) => {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        slerpUnit(a, b, angle, e, v);
        const ll = vecToLl(v);
        stage.earth.setOrigin(ll.lat, ll.lon);
        stage.holdTopDown(height);
      }, () => { originLL = to; whenPredicted(() => dive(height)); });
    });
  }
  shareState(l);
  if (opts.facts !== false) loadFacts(l);
  if (opts.science) void loadPlaceScience(l);
}

const ORBIT = 1.25e7;
let originLL: { lat: number; lon: number } | null = null;
function llToVec(lat: number, lon: number) {
  const la = lat * THREE.MathUtils.DEG2RAD, lo = lon * THREE.MathUtils.DEG2RAD;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
}
function vecToLl(v: THREE.Vector3) {
  return { lat: Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) * THREE.MathUtils.RAD2DEG, lon: Math.atan2(v.z, v.x) * THREE.MathUtils.RAD2DEG };
}
function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, angle: number, t: number, out: THREE.Vector3) {
  if (angle < 1e-6) return out.copy(b);
  const s = Math.sin(angle);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s).normalize();
}

async function loadFacts(l: Landmark) {
  try {
    const r = await fetch('/api/facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: l.name, city: l.city }) });
    const j = await r.json();
    if (currentLandmark !== l || !j.facts?.length) return;
    ui.openCard({ index: 1, total: 1, title: l.name, body: j.facts.map((f: { fact: string }) => f.fact).join(' '), sources: j.facts.map((f: { source?: { title: string; url: string } }) => f.source).filter(Boolean) });
    $('card-index').textContent = l.city.toUpperCase();
  } catch { /* facts are a bonus; the place still shows */ }
}

interface GeoInfo {
  lat: number;
  lon: number;
  name: string;
  type?: string | null;
  class?: string | null;
  addresstype?: string | null;
  rank?: number | null;
}

/** Choose a camera distance from what the geocoder says the place is. */
function viewForGeo(g: Pick<GeoInfo, 'type' | 'class' | 'addresstype' | 'rank'>): { view: number; lift: number } {
  const t = String(g.addresstype || g.type || '').toLowerCase();
  const cls = String(g.class || '').toLowerCase();
  const rank = Number(g.rank) || 0;
  if (t === 'country' || rank <= 4) return { view: 3000000, lift: 0 };
  if (['state', 'province', 'region'].includes(t) || rank <= 8) return { view: 1600000, lift: 0 };
  if (['county', 'district', 'municipality'].includes(t) || rank <= 10) return { view: 250000, lift: 0 };
  if (t === 'city' || rank === 12) return { view: 6500, lift: 10 };
  if (t === 'town' || rank === 18) return { view: 3800, lift: 10 };
  if (['village', 'hamlet'].includes(t) || rank === 19) return { view: 2000, lift: 10 };
  if (['suburb', 'borough', 'quarter'].includes(t) || rank === 20) return { view: 2400, lift: 10 };
  if (['neighbourhood', 'neighborhood'].includes(t) || rank === 22) return { view: 1400, lift: 10 };
  if (['nature_reserve', 'park', 'protected_area', 'forest'].includes(t) || rank === 24) return { view: 60000, lift: 10 };
  if (cls === 'waterway' || ['river', 'lake', 'bay', 'strait', 'water'].includes(t)) return { view: 30000, lift: 0 };
  if (['peak', 'mountain', 'volcano', 'hill'].includes(t)) return { view: 2600, lift: 20 };
  if (['building', 'house'].includes(t) || cls === 'building' || rank >= 30) return { view: 420, lift: 15 };
  if (cls === 'tourism' || cls === 'historic' || ['attraction', 'monument', 'memorial', 'museum'].includes(t)) return { view: 450, lift: 15 };
  if (rank >= 26) return { view: 700, lift: 15 };
  return { view: 1600, lift: 15 };
}

/** "40.6892, -74.0445" or "40.6892 -74.0445" typed into either search box. */
function parseLatLon(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

async function searchPlace(q: string) {
  placeStatus.textContent = `finding ${q}`;
  try {
    const point = parseLatLon(q);
    if (point) {
      const name = `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`;
      const target: Landmark = { id: `q-${Date.now()}`, name, city: 'Typed coordinates', lat: point.lat, lon: point.lon, view: 1200, lift: 20 };
      if (placeGlobeActive) showNasaPlace(target);
      else void selectLandmark(target, { science: true });
      return;
    }
    const r = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    const g = (await r.json()) as GeoInfo & { error?: string };
    if (!r.ok || g.error) throw new Error(g.error || 'not found');
    const parts = String(g.name).split(',');
    const fit = viewForGeo(g);
    const target: Landmark = { id: `q-${Date.now()}`, name: parts[0].trim(), city: parts.slice(1).join(',').trim() || q, lat: g.lat, lon: g.lon, view: fit.view, lift: fit.lift };
    if (placeGlobeActive) showNasaPlace(target);
    else void selectLandmark(target, { science: true });
  } catch (err) {
    placeStatus.textContent = err instanceof Error ? err.message : String(err);
  }
}

// Keep the place marker pinned over the landmark.
const prevFrame = stage.onFrame;
stage.onFrame = (dt, t) => {
  prevFrame?.(dt, t);
  if (!earthActive || !currentLandmark || stage.earth.ground === null) { placeTag.hidden = true; return; }
  // The label floats above the landmark; its stem runs down to the ground point.
  const g = stage.earth.ground;
  const base = stage.project(new THREE.Vector3(0, g, 0));
  const top = stage.project(new THREE.Vector3(0, g + Math.max(currentLandmark.lift * 2.2, 40), 0));
  if (!base || !top) { placeTag.hidden = true; return; }
  placeTag.hidden = false;
  if (placeTag.textContent !== currentLandmark.name) placeTag.textContent = currentLandmark.name;
  const stem = THREE.MathUtils.clamp(base.y - top.y, 24, 220);
  placeTag.style.setProperty('--stem', `${stem}px`);
  placeTag.style.left = `${base.x}px`;
  placeTag.style.top = `${base.y}px`;
};

// ---------- build: agents construct a model you can take apart ----------
const buildPanel = document.getElementById('build-panel') as HTMLElement;
const buildSteps = document.getElementById('build-steps') as HTMLOListElement;
const buildRef = document.getElementById('build-ref') as HTMLElement;
let built: { name: string; parts: BuiltPart[]; model: Hologram; sources: { title: string; url: string }[]; summary: string } | null = null;
let building = false;

for (const n of ['Charminar', 'Taj Mahal', 'Eiffel Tower', 'Big Ben', 'Colosseum', 'Golden Gate Bridge']) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = n;
  b.addEventListener('click', () => { const l = LANDMARKS.find((x) => x.name === n); runConstruct(n, l?.city || ''); });
  document.getElementById('build-picks')!.appendChild(b);
}
document.getElementById('build-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (document.getElementById('build-input') as HTMLInputElement).value.trim();
  if (v) runConstruct(v, '');
});
document.getElementById('build-this')!.addEventListener('click', () => { if (currentLandmark) runConstruct(currentLandmark.name, currentLandmark.city); });
window.addEventListener('keydown', (e) => {
  if (!earthActive || !currentLandmark || e.metaKey || e.ctrlKey || (e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
  if (e.key === 'b' || e.key === 'B') runConstruct(currentLandmark.name, currentLandmark.city);
});

/** "NVIDIA API catalog · nvidia/nemotron-3.5-super-vl-120b-a12b" → "nemotron-3.5-super-vl-120b-a12b" */
const shortModel = (m?: string) => (m ? m.split('·').pop()!.trim().split('/').pop()! : '');
function stepRow(who: string, text: string, cls = 'run', by?: string) {
  const li = document.createElement('li');
  li.className = cls;
  li.innerHTML = '<span class="who"></span><span class="what"></span><span class="by"></span>';
  li.querySelector('.who')!.textContent = who;
  li.querySelector('.what')!.textContent = text;
  const setBy = (m?: string) => { li.querySelector('.by')!.textContent = m ? `by ${shortModel(m)}` : ''; };
  setBy(by);
  buildSteps.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
  return {
    done(t?: string, m?: string) { li.className = 'done'; if (t) li.querySelector('.what')!.textContent = t; if (m) setBy(m); },
    fail(t: string) { li.className = 'bad'; li.querySelector('.what')!.textContent = t; },
  };
}

/** Build render on the left, the real photo on the right, as one picture (one image per request). */
async function sideBySide(render: string, refUrl?: string): Promise<{ image: string; combined: boolean }> {
  if (!refUrl) return { image: render, combined: false };
  try {
    const load = (src: string, cors: boolean) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = bad; i.src = src; });
    const [a, b] = await Promise.all([load(render, false), load(refUrl, true)]);
    const c = document.createElement('canvas');
    c.width = a.width * 2; c.height = a.height;
    const g = c.getContext('2d')!;
    g.drawImage(a, 0, 0);
    g.fillStyle = '#000'; g.fillRect(a.width, 0, a.width, a.height);
    const s = Math.min(a.width / b.width, a.height / b.height);
    g.drawImage(b, a.width + (a.width - b.width * s) / 2, (a.height - b.height * s) / 2, b.width * s, b.height * s);
    return { image: c.toDataURL('image/jpeg', 0.85), combined: true };
  } catch {
    return { image: render, combined: false };
  }
}

async function post<T>(body: Record<string, unknown>, tries = 2): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('/api/construct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (r.ok && !j.error) return j as T;
    // The free model endpoints drop the odd request under parallel load: one quiet retry after a pause.
    if (attempt >= tries || r.status === 400) throw new Error(j.error || `HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1500));
  }
}

function showBuilt() {
  if (!built) return;
  const m = toHologram(built.parts);
  built.model = m;
  stage.setModel(m);
  stage.frame('object');
  state.entry = null;
  labels.rebuild(m);
  intro.hidden = false;
  setTitle(built.name);
  $('model-kind').textContent = 'Built by ATLAS agents';
  $('parts-n').textContent = String(m.parts.length);
  $('credit').textContent = `Model built live from cited research · ${built.sources.length} sources`;
}

async function runConstruct(name: string, city: string) {
  if (building) return;
  building = true;
  if (mode !== 'build') setMode('build');
  (document.getElementById('build-input') as HTMLInputElement).value = city ? `${name}, ${city}` : name;
  buildSteps.replaceChildren();
  buildRef.hidden = true;
  ui.closeCard();
  ui.log(`building ${name}`, 'sys');
  try {
    // 1. Research and plan.
    const s1 = stepRow('Research', `Reading up on ${name}: dimensions, plan, features`);
    type Zone = { id: string; name: string; brief: string; box: unknown; parts: string[] };
    type PlanRes = { plan: { name: string; summary: string; height_m: number; footprint_m: number[]; zones: Zone[]; facts: { text: string }[] }; sources: { title: string; url: string }[]; reference: { image: string; page: string; title: string } | null; model?: string };
    const planned = await post<PlanRes>({ step: 'plan', name, city });
    const P = planned.plan;
    s1.done(`${planned.sources.length} sources. ${P.height_m ? `About ${Math.round(P.height_m)} m tall` : ''}${P.footprint_m?.length ? `, ${Math.round(P.footprint_m[0])} × ${Math.round(P.footprint_m[1])} m footprint` : ''}.`, 'Tavily web search + Wikipedia');
    stepRow('Architect', `${P.zones.length} zones: ${P.zones.map((z) => z.name).join(', ')}`, 'done', planned.model);
    if (planned.reference) {
      (document.getElementById('build-ref-img') as HTMLImageElement).src = planned.reference.image;
      (document.getElementById('build-ref-img') as HTMLImageElement).alt = `Photo of ${planned.reference.title}`;
      const a = document.getElementById('build-ref-link') as HTMLAnchorElement;
      a.href = planned.reference.page; a.textContent = 'Wikipedia';
      buildRef.hidden = false;
    }
    built = { name: P.name || name, parts: [], model: stage.model!, sources: planned.sources, summary: P.summary };

    // 2. Builders, one per zone, two at a time (free-tier rate limits). Each zone appears as soon as it lands.
    const rows = P.zones.map((z, i) => ({ z, i }));
    const pool = async () => { for (let next = rows.shift(); next; next = rows.shift()) await buildZone(next.z, next.i); };
    const buildZone = async (z: Zone, i: number) => {
      const row = stepRow(`Builder ${i + 1}`, `${z.name}: ${z.parts.slice(0, 4).join(', ')}${z.parts.length > 4 ? '…' : ''}`);
      try {
        const r = await post<{ parts: BuiltPart[]; model?: string }>({ step: 'build', name, plan: P, zone: z });
        if (!built) return;
        built.parts.push(...r.parts);
        row.done(`${z.name}: ${r.parts.length} parts`, r.model);
        showBuilt();
      } catch (err) {
        row.fail(`${z.name}: failed (${err instanceof Error ? err.message.slice(0, 80) : 'error'})`);
      }
    };
    await Promise.all([pool(), pool(), pool()]);
    if (!built.parts.length) throw new Error('no zone came back');

    // 3. Critic: compare the build with a real photo and fix what is off. Up to two rounds.
    for (let round = 1; round <= 2; round++) {
      setExplode(0);
      await new Promise((r) => setTimeout(r, 700));
      const { image: shot, combined } = await sideBySide(stage.snapshot(), planned.reference?.image);
      const c = stepRow('Critic', round === 1 ? 'Comparing the build with the reference photo' : 'Checking the fixes');
      try {
        const fix = await post<{ score: number; issues: string[]; replace: BuiltPart[]; add: BuiltPart[]; remove: string[]; model?: string }>({ step: 'critique', name, blueprint: { parts: built.parts.map(({ id, name: n, role, prims }) => ({ id, name: n, role, prims })) }, render: shot, combined });
        const changes = fix.replace.length + fix.add.length + fix.remove.length;
        c.done(`Likeness ${fix.score}/10. ${fix.issues.slice(0, 2).join(' ')}${changes ? ` Fixing ${changes} part${changes > 1 ? 's' : ''}.` : ''}`, fix.model);
        // The score is unreliable; the issues are not. Always apply the first round's fixes.
        if (!changes || (round > 1 && fix.score >= 7)) break;
        built.parts = applyFixes(built.parts, fix);
        showBuilt();
      } catch (err) {
        c.fail(`Critic unavailable (${err instanceof Error ? err.message.slice(0, 60) : 'error'})`);
        break;
      }
    }

    stepRow('Done', `${built.parts.length} parts. Pull it apart with the slider, an open palm, or ask about any part.`, 'done');
    ui.log(`${built.name}: ${built.parts.length} parts built`, 'sys');
    ui.openCard({ index: 1, total: 1, title: built.name, body: built.summary || '', sources: built.sources.slice(0, 4) });
    $('card-index').textContent = 'BUILT BY ATLAS';
    setTimeout(() => setExplode(0.55), 900);
  } catch (err) {
    stepRow('Stopped', err instanceof Error ? err.message.slice(0, 160) : String(err), 'bad');
    ui.log(`build failed: ${err instanceof Error ? err.message.slice(0, 100) : err}`, 'hot');
  } finally {
    building = false;
  }
}

// ---------- the intelligence globe: live signals on the whole Earth ----------
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const signals = new SignalLayers(stage.camera, stage.renderer, () => stage.earth.tiles, reducedMotion);
stage.earth.group.add(signals.group);
/** Non-null while the camera is out in orbit showing the whole planet. */
let globe: { lat: number; lon: number; dist: number; spin: boolean } | null = null;
/** True once the camera has landed on a place: the orbit hold must stop snapping it back. */
let globeLanded = false;
/** Far enough out that the whole disc fits on screen (32° vertical FOV, with margin). */
const GLOBE_DIST = 2.6e7;
/** Tall, narrow screens need the planet further away to fit across. */
const globeDist = () => GLOBE_DIST * (innerWidth / innerHeight < 0.8 ? 1.5 : 1);
const LAYER_META: Record<LayerId, { label: string; blurb: string }> = {
  quakes: { label: 'Earthquakes', blurb: 'M2.5+ · past 7 days' },
  events: { label: 'Natural events', blurb: 'Wildfires, storms, sea ice' },
};

async function goGlobe(focus?: { lat: number; lon: number }) {
  if (mode !== 'places') { setMode('places'); if (!focus) return; }
  const auth = await getEarthAuth();
  if (!auth) return;
  if (recon) { leaveReconstruction(); earthStarted = false; originLL = null; }
  currentLandmark = null;
  updateReconBtn();
  landmarkList.querySelectorAll('button').forEach((b) => b.classList.remove('is-on'));
  earthOn();
  updateGlobeViewToggles('photo', true);
  ui.closeCard();
  signals.select(null);
  stage.setIsolate(0, 0);
  placeTag.hidden = true;
  intro.hidden = false;
  setTitle('Earth');
  document.body.classList.add('globe');
  updateGlobeKind();
  placeStatus.textContent = 'Drag to turn the globe, scroll to zoom. Click a dot to inspect it, or ask ATLAS.';
  shareState(null);
  const at = focus ?? originLL ?? { lat: 18, lon: 78 };
  const look = lens === 'hologram' ? 'hologram' : 'photo';
  const enter = () => { globe = { lat: at.lat, lon: at.lon, dist: globeDist(), spin: !reducedMotion }; originLL = { ...at }; };
  if (!earthStarted || !originLL) {
    stage.earth.start(auth, at.lat, at.lon);
    stage.earth.setLook(look);
    signals.rebuild();
    earthStarted = true;
    originLL = { ...at };
    stage.holdWholeEarth(globeDist());
    stage.holdUntil(globeDist(), () => stage.earth.visibleTiles > 4, 0.4, 4, enter, true);
  } else {
    stage.rise(globeDist(), 2.2, enter);
  }
  // First visit: switch the live layers on so the planet is never an empty ball.
  for (const id of ['quakes', 'events'] as LayerId[]) if (signals.state(id).status === 'off') setLayer(id, true);
}

function leaveGlobe() {
  globe = null;
  ++globeFlightSeq;
  stage.earth.onGround = null;
  globePlace = null;
  globeRow(null);
  document.body.classList.remove('globe');
  stage.camera.clearViewOffset();
  stage.controls.autoRotate = !reducedMotion;
}

function updateGlobeKind() {
  if (currentLandmark || !earthActive) return;
  const q = signals.state('quakes').data?.signals.length, e = signals.state('events').data?.signals.length;
  const bits = [q !== undefined && signals.state('quakes').on ? `${q} earthquakes` : '', e !== undefined && signals.state('events').on ? `${e} natural events` : ''].filter(Boolean);
  $('model-kind').textContent = bits.length ? `Live: ${bits.join(' · ')}` : 'Live signals off';
}

// Layer switches: the same live layers in the Places panel and in the Globe tab.
const sigBoxes = [$('signals'), $('globe-signals')].filter(Boolean) as HTMLElement[];
for (const box of sigBoxes) {
  for (const id of ['quakes', 'events'] as LayerId[]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sig sig-${id}`;
    b.dataset.layer = id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<i class="dot" aria-hidden="true"></i><span class="t"></span><span class="m"></span>';
    b.querySelector('.t')!.textContent = LAYER_META[id].label;
    b.addEventListener('click', () => {
      const st = signals.state(id);
      setLayer(id, st.status === 'failed' ? true : !st.on);
    });
    box.appendChild(b);
  }
}
function setLayer(id: LayerId, on: boolean) { signals.set(id, on); }
function renderLayers() {
  for (const id of ['quakes', 'events'] as LayerId[]) {
    const st = signals.state(id);
    for (const box of sigBoxes) {
      const b = box.querySelector<HTMLButtonElement>(`[data-layer="${id}"]`);
      if (!b) continue;
      b.setAttribute('aria-pressed', String(st.on));
      b.dataset.status = st.status;
      const m = b.querySelector('.m')!;
      if (st.status === 'loading') m.textContent = 'loading…';
      else if (st.status === 'failed') m.textContent = `unavailable: ${st.error?.slice(0, 60)} · tap to retry`;
      else if (st.data) {
        const age = Date.now() - Date.parse(st.data.updated);
        const stale = id === 'quakes' ? age > 3 * 3600e3 : age > 3 * 86400e3;
        m.textContent = `${st.data.signals.length} · ${LAYER_META[id].blurb} · ${st.data.source.replace(' Earthquake Hazards Program', '')} · updated ${ago(st.data.updated)}${stale ? ' (stale)' : ''}`;
        b.title = `${st.data.name}. Source: ${st.data.source} (${st.data.license}). Feed updated ${new Date(st.data.updated).toUTCString()}, fetched ${ago(st.data.fetchedAt)}.`;
      } else m.textContent = LAYER_META[id].blurb;
    }
  }
  updateGlobeKind();
}
signals.onChange = renderLayers;
renderLayers();
setInterval(renderLayers, 60e3);

// Inspect a signal: what it is, when, how big, and the source's own page.
function openSignal(s: Signal) {
  signals.select(s);
  const d = signals.state(s.layer).data;
  const when = `${ago(s.time)} (${s.time.slice(0, 16).replace('T', ' ')} UTC)`;
  const body = s.layer === 'quakes'
    ? `Magnitude ${s.mag}${s.depthKm !== undefined ? `, ${Math.round(s.depthKm)} km deep` : ''}, ${when}.${s.tsunami ? ' USGS set its tsunami flag for this event.' : ''}${s.alert ? ` USGS PAGER alert level: ${s.alert}.` : ''} Epicentre ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}.`
    : `${s.kind[0].toUpperCase()}${s.kind.slice(1)}${s.mag ? `, ${s.mag.toLocaleString()} ${s.magUnit ?? ''}` : ''}. Last observed ${when}. Position ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}.`;
  ui.openCard({ index: 1, total: 1, title: s.title, body, sources: [{ title: `${d?.source ?? 'Source'}: this ${s.kind}`, url: s.url }] });
  $('card-index').textContent = `${s.kind.toUpperCase()} · ${(d?.source ?? '').replace(' Earthquake Hazards Program', '').toUpperCase()}`;
  const acts = $('card-actions');
  acts.replaceChildren();
  const fly = document.createElement('button');
  fly.type = 'button'; fly.className = 'iso-btn'; fly.textContent = 'Fly here';
  fly.addEventListener('click', async () => {
    // A live signal keeps its own sourced card; the web-facts card is for landmarks.
    await selectLandmark({ id: `sig-${s.id}`, name: s.title.replace(/^M [\d.]+ - /, ''), city: s.layer === 'quakes' ? `M${s.mag} earthquake · ${ago(s.time)}` : `${s.kind} · ${ago(s.time)}`, lat: s.lat, lon: s.lon, view: 26000, lift: 20 }, { facts: false });
    openSignal(s);
    $('card-actions').hidden = true;
  });
  const askB = document.createElement('button');
  askB.type = 'button'; askB.className = 'iso-btn'; askB.textContent = 'Ask ATLAS';
  askB.addEventListener('click', () => ask(`Tell me about this ${s.kind}: ${s.title} (${s.time.slice(0, 10)}). What happened and what is nearby?`, agentCtx));
  acts.append(fly, askB);
  acts.hidden = false;
}

// Drag to turn the globe, wheel to zoom, click a dot to inspect it.
let globeDrag: { x: number; y: number; moved: number } | null = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!earthActive) return;
  globeDrag = { x: ev.clientX, y: ev.clientY, moved: 0 };
});
canvas.addEventListener('pointermove', (ev) => {
  if (!globeDrag || !ev.buttons) return;
  const dx = ev.clientX - globeDrag.x, dy = ev.clientY - globeDrag.y;
  globeDrag.x = ev.clientX; globeDrag.y = ev.clientY;
  globeDrag.moved += Math.abs(dx) + Math.abs(dy);
  if (globe && !stage.flying && !globeLanded) {
    const k = 0.16 * (globe.dist / ORBIT);
    globe.lon = ((globe.lon - dx * k + 540) % 360) - 180;
    globe.lat = THREE.MathUtils.clamp(globe.lat + dy * k, -75, 75);
    globe.spin = false;
  }
});
canvas.addEventListener('pointerup', (ev) => {
  const d = globeDrag;
  globeDrag = null;
  if (!earthActive || !d || d.moved > 6) return;
  const s = signals.pick(ev.clientX, ev.clientY);
  if (s) { openSignal(s); if (globe) globe.spin = false; }
});
// A drag that leaves the canvas must still end, or the globe stays stuck in drag mode.
window.addEventListener('pointerup', () => { globeDrag = null; });
window.addEventListener('pointercancel', () => { globeDrag = null; });
canvas.addEventListener('wheel', (ev) => {
  if (!globe || stage.flying || globeLanded) return;
  globe.dist = THREE.MathUtils.clamp(globe.dist * Math.exp(ev.deltaY * 0.0012), 3.2e6, 3.4e7);
  ev.preventDefault();
}, { passive: false });
$('globe-btn').addEventListener('click', () => {
  if (placeGlobeActive) {
    resetPlaceGlobe();
    currentLandmark = null;
    $('place-science').hidden = true;
    intro.hidden = true;
    placeStatus.textContent = 'NASA satellite globe · search any place or tap the Earth.';
    return;
  }
  goGlobe();
});
window.addEventListener('keydown', (e) => {
  if (mode !== 'places' || e.metaKey || e.ctrlKey || (e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
  if (e.key === 'g' || e.key === 'G') goGlobe();
});

// Each frame: keep signals in the globe's frame; in orbit, hold the camera and turn the planet.
{
  const prev = stage.onFrame;
  stage.onFrame = (dt, t) => {
    prev?.(dt, t);
    if (!earthActive) return;
    signals.update(t);
    if (globe && globeLanded && !stage.flying) {
      // Landed on a place: hand the camera back so the viewer can look around.
      stage.controls.enabled = true;
    } else if (globe && !stage.flying) {
      // Eastward rotation: the ground moves left as the planet turns under the camera.
      if (globe.spin && !globeDrag) globe.lon = ((globe.lon - dt * 2.2 + 540) % 360) - 180;
      stage.controls.autoRotate = false;
      stage.controls.enabled = false;
      stage.earth.setOrigin(globe.lat, globe.lon);
      originLL = { lat: globe.lat, lon: globe.lon };
      stage.holdWholeEarth(globe.dist);
      // On wide screens, centre the planet in the space right of the panel, not behind it.
      const w = canvas.clientWidth, h = canvas.clientHeight;
      // Phones in Places: the panel sits on top, so lower the planet into the space under it instead.
      const panelMode = mode === 'places' || mode === 'trends';
      const shiftX = panelMode && w > 900 ? Math.min(230, w * 0.15) : 0;
      const shiftY = panelMode && w <= 760 ? h * 0.17 : 0;
      if (shiftX || shiftY) stage.camera.setViewOffset(w, h, -shiftX, -shiftY, w, h); else stage.camera.clearViewOffset();
    }
  };
}

// Test hook for automated checks (?debug only).
if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).atlas = { signals, openSignal, goGlobe, stage, get globe() { return globe; } };

// Example questions under the ask box: a one-tap way into what ATLAS can do.
{
  const chips = $('chips');
  const EXAMPLES = ['What was the biggest earthquake this week?', 'Any wildfires burning in California right now?', 'Take me to Charminar and build it'];
  for (const q of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ask-chip'; b.textContent = q;
    b.addEventListener('click', () => ask(q, agentCtx));
    chips.appendChild(b);
  }
}

// The NASA trend screen is the front door. The hologram modes stay one tap away.
initTrends();
initV2();
// The ask boxes only appear once we know a keyed model is live.
void refreshGlobeAgent();

// Open straight into a shared view: ?place=taj&lens=thermal or ?at=lat,lon,Name
{
  const q = new URLSearchParams(location.search);
  const id = q.get('place'), at = q.get('at'), l0 = q.get('lens');
  if (l0 && LENSES.some((x) => x.id === l0)) setLens(l0 as Lens);
  const preset = id ? LANDMARKS.find((l) => l.id === id) : undefined;
  let target: Landmark | undefined = preset;
  if (!target && at) {
    const [la, lo, ...name] = at.split(',');
    if (Number.isFinite(+la) && Number.isFinite(+lo)) target = { id: 'shared', name: name.join(',') || 'Shared place', city: `${(+la).toFixed(3)}, ${(+lo).toFixed(3)}`, lat: +la, lon: +lo, view: 450, lift: 20 };
  }
  if (target) { currentLandmark = target; setMode('places'); }
  else if (q.get('mode') === 'globe') setMode('globe');
  else if (q.get('mode') === 'library') setMode('library');
  else setMode('trends');
  // v2: ?trend=lat,lon&var=… reopens a shared trend result.
  const link = !target ? readTrendLink() : null;
  if (link) openTrendAt(link.place, link.variable, link.start, link.end);
}
