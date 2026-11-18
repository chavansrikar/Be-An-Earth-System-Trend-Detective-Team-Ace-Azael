import { NasaGlobe } from './globe';
import {
  PRESETS, VARIABLES, GROUPS, variableById, fetchTrend, explain, fmt, decimalsFor, trendStrength,
  type Place, type TrendResult, type VariableId, type VariableGroup,
} from './trends';
import { onTrendRendered } from './v2';
import { initExplore, runMap, runSweep, hideExplore, showExplore, hasMap } from './explore-ui';

/**
 * The trend detective screen. NASA POWER supplies every number; NASA GIBS supplies the monthly
 * picture on the globe. The screen only says "significant" when the Mann-Kendall test actually
 * crosses the 95% line, and it always shows the p-value so the reader can judge for themselves.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  place: { name: 'Amazon Basin', lat: -3.5, lon: -62.5, mode: 'region' } as Place,
  variable: 't2m' as VariableId,
  start: 1996,
  end: 2025,
  year: 2025,
  month: 1,
  base: 'map' as 'map' | 'satellite',
  chart: 'annual' as 'annual' | 'monthly',
  result: null as TrendResult | null,
  loading: false,
  loadedOnce: false,
  ai: false,
  aiModel: '' as string,
};

let globe: NasaGlobe | null = null;
let globeVisible = false;
let globeOwner: 'trends' | 'places' | 'globe' | null = null;
let placePick: ((lat: number, lon: number) => void) | null = null;
let globePick: ((lat: number, lon: number) => void) | null = null;
let playTimer: number | null = null;
let runSeq = 0;
let activeGroup: VariableGroup = 'Atmosphere';

interface ChartPoint { x: number; y: number; label: string; value: string }
let chartMeta: { points: ChartPoint[]; left: number; right: number } | null = null;

interface CompareEntry { place: Place; result?: TrendResult; error?: string }
/** Benjamini–Hochberg q-values for the places in the current comparison. */
let compareQ = new Map<CompareEntry, number>();
type TrendView = 'single' | 'compare' | 'map' | 'sweep';
const compare = {
  view: 'single' as TrendView,
  count: 3,
  values: ['Amazon Basin', 'Sahel', 'Himalayas'] as string[],
  entries: [] as CompareEntry[],
  loading: false,
  start: 1996,
  end: 2025,
  variable: 't2m' as VariableId,
};
let compareSeq = 0;
let lastGeocodeAt = 0;

const YEAR_MIN = 1981;
const YEAR_MAX = 2025;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initTrends() {
  buildYears();
  activeGroup = variableById(state.variable).group;
  buildGroups();
  buildVariables();
  buildPresets();
  buildComparePresets();
  buildCompareRows();
  bindEvents();
  initExplore({ openSingle: openSingleFromExplore });
  bindCases();
  paintActive();
  void probeAi();
}

/**
 * Case files: three guided demonstrations, as the challenge suggests, each answering one of the
 * detective's questions with live NASA data. The note explains what to look for; the numbers
 * on screen always come from the live run, never from this text.
 */
const CASES: Record<string, { view: TrendView; place: Place; variable: VariableId; start: number; end: number; span?: number; note: string }> = {
  dimming: {
    view: 'sweep', place: { name: 'Hyderabad', lat: 17.385, lon: 78.487, mode: 'point' }, variable: 'radiation', start: 1996, end: 2025,
    note: 'What is changing here? ATLAS tests every NASA POWER variable over Hyderabad at once and corrects for running that many tests. Look at which variables survive the correction, then click one to open its record. A trend says what changed, not why: check published research before naming a cause.',
  },
  opposite: {
    view: 'map', place: { name: 'Telangana', lat: 17.9, lon: 79.6, mode: 'point' }, variable: 'humidity', start: 1996, end: 2025, span: 10,
    note: 'Where is it changing? Every NASA POWER grid cell in a 10° box around Telangana gets its own test. The challenge warns that one variable can rise in one place and fall in another: look for dotted cells of both colours. A single regional average would hide that.',
  },
  amazon: {
    view: 'single', place: { name: 'Amazon Basin', lat: -3.5, lon: -62.5, mode: 'region' }, variable: 't2m', start: 1996, end: 2025,
    note: 'Is the change real? Sen\'s slope gives the rate with its 95% interval; Mann–Kendall gives the p-value, shown again corrected for autocorrelation; Pettitt looks for the year it shifted. Then switch the variable to Rainfall, or open Map the change, to see the drying side of the story.',
  },
};

function bindCases() {
  $('trend-cases').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-case]');
    if (!b) return;
    const c = CASES[b.dataset.case || ''];
    if (!c) return;
    document.querySelectorAll<HTMLElement>('#trend-cases button').forEach((x) => x.classList.toggle('is-on', x === b));
    const note = $('trend-case-note');
    note.textContent = c.note;
    note.hidden = false;
    $<HTMLSelectElement>('trend-start').value = String(c.start);
    $<HTMLSelectElement>('trend-end').value = String(c.end);
    if (c.span) $<HTMLSelectElement>('map-span').value = String(c.span);
    state.variable = c.variable;
    activeGroup = variableById(c.variable).group;
    buildVariables();
    setView(c.view);
    setPlace(c.place);
    if (c.view === 'map') runMapView();
    else if (c.view === 'sweep') runSweepView();
    else { state.start = c.start; state.end = c.end; void run(); }
  });
}

/** A click on a map cell or a scanned variable opens the full single-place record. */
function openSingleFromExplore(place: Place, variable: VariableId) {
  setView('single');
  state.variable = variable;
  activeGroup = variableById(variable).group;
  buildVariables();
  setPlace(place);
  void run();
}

/** Run whichever detective view is open for the current place. */
function runCurrent() {
  if (compare.view === 'map') runMapView();
  else if (compare.view === 'sweep') runSweepView();
  else void run();
}

function runMapView() {
  const start = Number($<HTMLSelectElement>('trend-start').value);
  const end = Number($<HTMLSelectElement>('trend-end').value);
  state.start = start;
  state.end = end;
  if (globe) globe.setMarker(state.place.lat, state.place.lon, state.place.name);
  void runMap(state.place, state.variable, start, end, Number($<HTMLSelectElement>('map-span').value) || 8, $('trend-status'));
}

function runSweepView() {
  const start = Number($<HTMLSelectElement>('trend-start').value);
  const end = Number($<HTMLSelectElement>('trend-end').value);
  state.start = start;
  state.end = end;
  if (globe) globe.setMarker(state.place.lat, state.place.lon, state.place.name);
  void runSweep(state.place, start, end, $('trend-status'));
}

export function setTrendMode(on: boolean) {
  globeVisible = on;
  if (!on) {
    stopPlay();
    if (globeOwner === 'trends') { globeOwner = null; globe?.stop(); }
    return;
  }
  globeOwner = 'trends';
  ensureGlobe();
  globe?.start();
  applyGlobe();
  if (!state.loadedOnce) {
    state.loadedOnce = true;
    void run();
  }
}

/**
 * Places owns the same NASA globe when the Google/Cesium photoreal tiles are unavailable.
 * It shows the original MODIS true-colour Earth and flies to whatever place is selected.
 */
export function setPlaceGlobeMode(on: boolean) {
  if (on) {
    globeOwner = 'places';
    ensureGlobe();
    globe?.start();
  } else if (globeOwner === 'places') {
    globeOwner = null;
    globe?.stop();
  }
}

/** Route globe taps to the Places screen while it owns the globe. */
export function setPlaceGlobePick(fn: ((lat: number, lon: number) => void) | null) {
  placePick = fn;
}

export function showPlaceGlobe(lat: number, lon: number, name: string) {
  if (!globe) return;
  const now = new Date();
  // Blue Marble is seamless at close range; the daily MODIS scene can have swath gaps.
  globe.setBase('map', now.getUTCFullYear(), now.getUTCMonth() + 1);
  globe.setOverlay(null, now.getUTCFullYear(), now.getUTCMonth() + 1);
  // Deliberately closer than the regional trend view: Places should show one coordinate.
  globe.setMarker(lat, lon, name, 2.35);
}

export function resetPlaceGlobe() {
  if (!globe) return;
  globe.clearMarker();
  globe.focus(8, 22, true, 5.0, 1.6);
  globe.setSpin(true);
}

/**
 * The dedicated Globe tab. It owns the token-free NASA globe only when no photoreal map
 * token is configured; with a token the main stage shows the Google/Cesium tiles instead.
 */
export function setGlobeTabMode(on: boolean) {
  if (on) {
    globeOwner = 'globe';
    ensureGlobe();
    globe?.start();
  } else if (globeOwner === 'globe') {
    globeOwner = null;
    globe?.stop();
  }
}

export function setGlobeTabPick(fn: ((lat: number, lon: number) => void) | null) {
  globePick = fn;
}

/** Open the NASA globe as a whole planet: no marker, actual day/night terminator, city lights. */
export function showGlobeTab() {
  if (!globe) return;
  const now = new Date();
  globe.setBase('map', now.getUTCFullYear(), now.getUTCMonth() + 1);
  globe.setOverlay(null, now.getUTCFullYear(), now.getUTCMonth() + 1);
  globe.clearMarker();
  globe.setLiveSun(true);
  globe.setNight(true);
  globe.settle();
  globe.focus(12, 40, false, 4.5);
  globe.setSpin(true);
}

/** Switch the NASA basemap without losing the marker or the lighting. */
export function globeTabBase(mode: 'map' | 'satellite' | 'clouds') {
  if (!globe) return;
  const now = new Date();
  globe.setBase(mode, now.getUTCFullYear(), now.getUTCMonth() + 1, 2048);
}

export function globeTabSpin(on: boolean) {
  globe?.setSpin(on);
}

export function globeTabNight(on: boolean) {
  globe?.setNight(on);
}

export function globeTabReset() {
  if (!globe) return;
  globe.setLiveSun(true);
  globeTabBase('map');
  globe.clearMarker();
  globe.focus(12, 40, true, 4.5, 1.4);
  globe.setSpin(true);
}

export function showGlobeTabMarker(lat: number, lon: number, name: string) {
  globe?.setMarker(lat, lon, name);
}

/** Fly the NASA fallback globe to a searched place at a fitting orbit distance. */
export function flyGlobeTab(lat: number, lon: number, name: string, distance = 2.75) {
  globe?.setMarker(lat, lon, name, distance);
  globe?.setSpin(false);
}

/** Open the Trend Detective at a place, reusing the same 30-year NASA record. */
export function openTrendAt(place: Place, variable: VariableId = 't2m', from = 1996, to = 2025) {
  setView('single');
  const start = document.getElementById('trend-start') as HTMLSelectElement | null;
  const end = document.getElementById('trend-end') as HTMLSelectElement | null;
  const input = document.getElementById('trend-place') as HTMLInputElement | null;
  state.place = place;
  state.variable = variable;
  state.start = from;
  state.end = to;
  const group = variableById(variable).group;
  if (group !== activeGroup) {
    activeGroup = group;
    buildVariables();
  }
  if (start) start.value = String(state.start);
  if (end) end.value = String(state.end);
  if (input) input.value = place.name;
  state.loadedOnce = true;
  paintActive();
  void run();
}

/** A short, factual line for the existing Ask ATLAS console. */
export function trendContext() {
  if (compare.view === 'compare' && compare.entries.length) {
    const info = variableById(compare.variable);
    const ok = compare.entries.filter((e) => e.result?.stats);
    const list = ok.map((e) => {
      const s = e.result!.stats!;
      return `${e.place.name}: Sen ${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, decimalsFor(info.id))} ${info.annualUnit}/decade, p=${s.mk.p < 0.001 ? '<0.001' : s.mk.p.toFixed(3)} (${s.mk.significant ? 'significant' : 'not significant'})`;
    }).join('; ');
    return `NASA POWER comparison for ${info.label}, ${compare.start}-${compare.end}: ${list || 'no place had enough complete years for a trend test'}.`;
  }
  const r = state.result;
  if (!r) return 'No NASA trend has been run yet.';
  const s = r.stats;
  if (!s) return `ATLAS has ${r.series.annual.length} complete years for ${r.place.name}; not enough for a trend test.`;
  const g = r.place.gauge;
  const subject = g ? `${g.name} gauge near ${r.place.name}` : r.place.name;
  return `${r.source.name} ${r.period.start}-${r.period.end} trend for ${subject}: ${r.variable.label}, Sen's slope ${fmt(s.senPerDecade, decimalsFor(r.variable.id))} ${r.variable.annualUnit} per decade, Mann-Kendall p=${s.mk.p < 0.001 ? '<0.001' : s.mk.p.toFixed(3)} (${s.mk.significant ? 'significant at 95%' : 'not significant at 95%'}).`;
}

function ensureGlobe() {
  if (globe) return;
  const host = $('globe');
  globe = new NasaGlobe(host);
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { trendGlobe?: NasaGlobe }).trendGlobe = globe;
  }
  globe.onPick = (lat, lon) => {
    if (globePick) { globePick(lat, lon); return; }
    if (placePick) { placePick(lat, lon); return; }
    if (state.loading || !globeVisible) return;
    setPlace({ name: coordName(lat, lon), lat, lon, mode: 'point' }, false);
    runCurrent();
  };
  globe.onStatus = (text) => {
    $('trend-imagery-note').textContent = text;
    // The NASA texture callback fires after load; don't overwrite a searched place's status.
    const row = document.getElementById('globe-place');
    if (!document.body.classList.contains('globe-fallback') || (row && !row.hidden)) return;
    const status = document.getElementById('globe-status');
    if (status) status.textContent = text;
  };
}

function coordName(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function buildYears() {
  const start = $<HTMLSelectElement>('trend-start');
  const end = $<HTMLSelectElement>('trend-end');
  start.replaceChildren();
  end.replaceChildren();
  for (let y = YEAR_MIN; y <= YEAR_MAX - 10; y++) start.add(new Option(String(y), String(y)));
  for (let y = YEAR_MIN + 10; y <= YEAR_MAX; y++) end.add(new Option(String(y), String(y)));
  start.value = String(state.start);
  end.value = String(state.end);
}

function buildGroups() {
  const box = $('trend-groups');
  box.replaceChildren();
  for (const g of GROUPS) {
    const n = VARIABLES.filter((v) => v.group === g).length;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.group = g;
    b.textContent = `${g} ${n}`;
    b.title = `${n} NASA Earth variables in ${g.toLowerCase()}`;
    b.addEventListener('click', () => {
      if (activeGroup === g) return;
      activeGroup = g;
      buildVariables();
      paintActive();
    });
    box.appendChild(b);
  }
  paintGroups();
}

function paintGroups() {
  document.querySelectorAll<HTMLElement>('#trend-groups button').forEach((b) => {
    const on = b.dataset.group === activeGroup;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function buildVariables() {
  const box = $('trend-vars');
  box.replaceChildren();
  for (const v of VARIABLES.filter((x) => x.group === activeGroup)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trend-var';
    b.dataset.id = v.id;
    b.title = v.description;
    b.innerHTML = `<span class="swatch" style="--vc:${v.color}"></span><span class="t"></span><span class="u"></span>`;
    b.querySelector('.t')!.textContent = v.short;
    b.querySelector('.u')!.textContent = v.unit;
    b.addEventListener('click', () => {
      if (state.variable === v.id) return;
      state.variable = v.id;
      paintActive();
      // Supersede any in-flight request: the newest variable wins.
      if (compare.view === 'map') {
        if (hasMap()) runMapView();
        return;
      }
      if (compare.view === 'sweep') return;
      if (compare.view === 'compare') {
        if (compare.entries.length) void runCompare();
        else updateOverlay();
      } else if (state.loadedOnce) void run();
      else updateOverlay();
    });
    box.appendChild(b);
  }
  paintGroups();
}

function buildPresets() {
  const box = $('trend-presets');
  box.replaceChildren();
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.name = p.name;
    b.title = `${p.name} · ${p.blurb}`;
    b.innerHTML = `<span></span><span class="b"></span>`;
    b.firstElementChild!.textContent = p.name;
    b.lastElementChild!.textContent = p.blurb;
    b.addEventListener('click', () => {
      setPlace({ name: p.name, lat: p.lat, lon: p.lon, mode: p.mode });
      runCurrent();
    });
    box.appendChild(b);
  }
}

function buildComparePresets() {
  const dl = $('compare-presets');
  dl.replaceChildren();
  for (const p of PRESETS) {
    const o = document.createElement('option');
    o.value = p.name;
    o.label = p.blurb;
    dl.appendChild(o);
  }
}

function readCompareInputs() {
  document.querySelectorAll<HTMLInputElement>('#compare-rows input').forEach((input, i) => {
    if (i < compare.values.length) compare.values[i] = input.value;
  });
}

function updateRunLabel() {
  $('trend-run').textContent = compare.view === 'compare'
    ? `Compare ${compare.count} place${compare.count === 1 ? '' : 's'}`
    : compare.view === 'map'
      ? 'Map the change'
      : compare.view === 'sweep'
        ? 'Scan every NASA variable'
        : 'Run the NASA numbers';
}

/** The result card is a bottom sheet on narrow screens: the panel has to make room. */
function setResultOpen(on: boolean) {
  document.body.classList.toggle('result-open', on);
}

function buildCompareRows() {
  const select = $<HTMLSelectElement>('compare-count');
  const count = Math.min(6, Math.max(2, Number(select.value) || 3));
  compare.count = count;
  select.value = String(count);
  readCompareInputs();
  const defaults = ['Amazon Basin', 'Sahel', 'Himalayas', 'Greenland', 'California', 'Hyderabad'];
  while (compare.values.length < count) compare.values.push(defaults[compare.values.length] || '');
  const box = $('compare-rows');
  box.replaceChildren();
  for (let i = 0; i < count; i++) {
    const row = document.createElement('label');
    row.className = 'compare-row';
    const index = document.createElement('span');
    index.className = 'compare-index';
    index.textContent = String(i + 1);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = compare.values[i] || '';
    input.placeholder = i === 0 ? 'e.g. Amazon Basin' : 'Place name or lat, lon';
    input.setAttribute('list', 'compare-presets');
    input.setAttribute('aria-label', `Comparison place ${i + 1}`);
    input.addEventListener('input', () => { compare.values[i] = input.value; });
    row.append(index, input);
    box.appendChild(row);
  }
  updateRunLabel();
}

function setView(view: TrendView) {
  compare.view = view;
  document.querySelectorAll<HTMLElement>('#trend-view button').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('trend-locate').hidden = view === 'compare';
  $('trend-presets').hidden = view === 'compare';
  $('compare-setup').hidden = view !== 'compare';
  $('map-setup').hidden = view !== 'map';
  $('sweep-setup').hidden = view !== 'sweep';
  $('trend-var-field').hidden = view === 'sweep';
  document.querySelectorAll<HTMLElement>('.trend-imagery-field').forEach((el) => { el.hidden = view !== 'single'; });
  updateRunLabel();
  $('trend-status').classList.remove('bad');
  $('trend-result').hidden = true;
  $('compare-result').hidden = true;
  hideExplore();
  if (view === 'single') {
    if (state.result) $('trend-result').hidden = false;
    setResultOpen(!$('trend-result').hidden);
  } else if (view === 'compare') {
    if (compare.entries.length) $('compare-result').hidden = false;
    setResultOpen(!$('compare-result').hidden);
    buildCompareRows();
    drawCompareChart();
  } else {
    showExplore(view);
    setResultOpen(!$('map-result').hidden || !$('sweep-result').hidden);
  }
}

/** Open comparison mode, optionally seeded with the place the viewer is already looking at. */
export function openCompare(seed?: Place) {
  setView('compare');
  if (seed) {
    const picks = [seed.name, ...PRESETS.filter((p) => p.name !== seed.name).map((p) => p.name)];
    compare.values = picks.slice(0, Math.max(2, compare.count));
    buildCompareRows();
    const first = document.querySelector<HTMLInputElement>('#compare-rows input');
    first?.focus();
    first?.select();
  }
}

/** Benjamini–Hochberg: the false discovery rate across the places being compared. */
function bhQ(pvalues: number[]): number[] {
  const n = pvalues.length;
  if (!n) return [];
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array(n).fill(1);
  let prev = 1;
  for (let k = n - 1; k >= 0; k--) {
    const val = Math.min(1, (order[k].p * n) / (k + 1));
    prev = Math.min(prev, val);
    q[order[k].i] = prev;
  }
  return q;
}

/** NASA's brief asks for simple definitions: show what the chosen variable actually is. */
function paintVariableHelp() {
  const el = $('trend-var-help');
  if (!el) return;
  const v = variableById(state.variable);
  const src = v.source === 'water'
    ? 'measured at the nearest active USGS or ECCC river gauge'
    : 'NASA POWER / MERRA-2 monthly, ' + v.unit;
  el.textContent = `${v.label} — ${v.description} Measured as ${src}.`;
}

function paintActive() {
  paintGroups();
  paintVariableHelp();
  document.querySelectorAll<HTMLElement>('#trend-vars .trend-var').forEach((b) => {
    const on = b.dataset.id === state.variable;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll<HTMLElement>('#trend-presets button').forEach((b) => {
    const on = b.dataset.name === state.place.name;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll<HTMLElement>('#trend-basemap button').forEach((b) => {
    const on = b.dataset.base === state.base;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const info = variableById(state.variable);
  $('trend-imagery-note').textContent = info.gibs
    ? `NASA GIBS · ${info.short} monthly composite`
    : info.source === 'water'
      ? 'Ground gauge · no NASA GIBS layer for streamflow.'
      : 'No matching NASA GIBS image for this variable. The time series is still NASA POWER.';
}

function bindEvents() {
  $<HTMLFormElement>('trend-locate').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $<HTMLInputElement>('trend-place').value.trim();
    if (q) void locate(q);
  });
  $('trend-run').addEventListener('click', () => {
    if (compare.view === 'compare') void runCompare();
    else if (compare.view === 'map') runMapView();
    else if (compare.view === 'sweep') runSweepView();
    else void run();
  });
  document.querySelectorAll<HTMLElement>('#trend-view button').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.view;
      setView(v === 'compare' || v === 'map' || v === 'sweep' ? v : 'single');
    });
  });
  $('compare-count').addEventListener('change', buildCompareRows);
  $('compare-close').addEventListener('click', () => { $('compare-result').hidden = true; setResultOpen(false); });
  $('compare-csv').addEventListener('click', downloadCompareCsv);
  $('trend-close').addEventListener('click', () => { $('trend-result').hidden = true; setResultOpen(false); });
  $('trend-explain').addEventListener('click', () => {
    const el = $('trend-explain-text');
    el.hidden = !el.hidden;
    const btn = $('trend-explain');
    btn.setAttribute('aria-pressed', String(!el.hidden));
    btn.textContent = el.hidden ? 'Explain the test' : 'Hide explanation';
  });
  $('trend-ai').addEventListener('click', () => void askAi());
  $('trend-play').addEventListener('click', () => togglePlay());
  $('trend-csv').addEventListener('click', downloadCsv);
  $('trend-year').addEventListener('input', () => {
    state.year = Number($<HTMLInputElement>('trend-year').value);
    $('trend-year-read').textContent = String(state.year);
    updateOverlay();
  });
  $('trend-month').addEventListener('input', () => {
    state.month = Number($<HTMLInputElement>('trend-month').value);
    $('trend-month-read').textContent = MONTHS[state.month - 1];
    updateOverlay();
  });
  $('trend-basemap').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-base]');
    if (!b) return;
    const base = b.dataset.base === 'satellite' ? 'satellite' : 'map';
    if (base === state.base) return;
    state.base = base;
    paintActive();
    updateOverlay();
  });
  $('trend-chart-legend').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-chart]');
    if (!b) return;
    const mode = b.dataset.chart === 'monthly' ? 'monthly' : 'annual';
    if (mode === state.chart) return;
    state.chart = mode;
    document.querySelectorAll<HTMLButtonElement>('#trend-chart-legend button').forEach((x) => x.classList.toggle('is-on', x.dataset.chart === mode));
    if (state.result) drawChart(state.result);
  });
  window.addEventListener('resize', () => {
    if (state.result && !$('trend-result').hidden) drawChart(state.result);
    if (compare.entries.length && !$('compare-result').hidden) drawCompareChart();
  });
  const canvas = $<HTMLCanvasElement>('trend-chart');
  canvas.addEventListener('pointermove', (ev) => {
    if (!chartMeta) return;
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    if (px < chartMeta.left - 8 || px > chartMeta.right + 8) { $('trend-tip').hidden = true; return; }
    let best = chartMeta.points[0], dist = Infinity;
    for (const p of chartMeta.points) {
      const d = Math.abs(p.x - px);
      if (d < dist) { dist = d; best = p; }
    }
    if (!best || dist > 26) { $('trend-tip').hidden = true; return; }
    const tip = $('trend-tip');
    tip.hidden = false;
    tip.textContent = `${best.label} · ${best.value}`;
    tip.style.left = `${Math.min(rect.width - 50, Math.max(50, best.x))}px`;
    tip.style.top = `${Math.max(18, best.y + 6)}px`;
  });
  canvas.addEventListener('pointerleave', () => { $('trend-tip').hidden = true; });
}

function setPlace(place: Place, updateInput = true) {
  state.place = place;
  if (updateInput) $<HTMLInputElement>('trend-place').value = place.name;
  paintActive();
  if (!globe) return;
  globe.setMarker(place.lat, place.lon, place.name);
  if (state.result) updateOverlay();
}

function applyAiVisibility() {
  const ready = state.ai && Boolean(state.result?.stats);
  $('trend-ai').hidden = !ready;
}

/** Ask the small server-side model to translate the computed numbers, never to compute them. */
async function askAi() {
  const r = state.result;
  if (!r || !r.stats) return;
  const btn = $<HTMLButtonElement>('trend-ai');
  const panel = $('trend-explain-text');
  const explainBtn = $('trend-explain');
  const label = btn.textContent || 'Ask ATLAS';
  btn.disabled = true;
  btn.textContent = 'Thinking…';
  panel.hidden = false;
  panel.textContent = 'ATLAS is reading the NASA numbers…';
  explainBtn.textContent = 'Hide explanation';
  explainBtn.setAttribute('aria-pressed', 'true');
  try {
    const res = await fetch('/api/trend-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variable: r.variable.id,
        place: { name: r.place.name },
        period: r.period,
        stats: r.stats,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const j = (await res.json()) as { text?: string; model?: string; error?: string };
    if (!res.ok || j.error || !j.text) throw new Error(j.error || `HTTP ${res.status}`);
    panel.textContent = j.text;
    if (j.model) $('trend-source').textContent = `${$('trend-source').textContent} AI explanation: ${j.model}.`;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    panel.textContent = `${explainDetails(r)} ATLAS could not reach the explanation model (${why.slice(0, 120)}), so this is the built-in reading.`;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
    applyAiVisibility();
  }
}

async function probeAi() {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(6000) });
    const j = (await res.json()) as { provider?: string | null; explain?: string | null; label?: string | null };
    state.ai = Boolean(j.provider || j.explain);
    state.aiModel = j.explain || j.provider || '';
  } catch {
    state.ai = false;
    state.aiModel = '';
  }
  applyAiVisibility();
}

async function locate(q: string) {
  if (compare.view === 'compare') setView('single');
  const status = $('trend-status');
  status.classList.remove('bad');
  status.textContent = `Finding ${q}…`;
  try {
    const res = await fetch('/api/geocode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
    });
    const j = (await res.json()) as { name?: string; lat?: number; lon?: number; error?: string };
    if (!res.ok || j.error || !Number.isFinite(j.lat) || !Number.isFinite(j.lon)) throw new Error(j.error || 'That place was not found');
    setPlace({ name: j.name || q, lat: j.lat!, lon: j.lon!, mode: 'point' });
    status.textContent = '';
    runCurrent();
  } catch (err) {
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function runCompare() {
  const start = Number($<HTMLSelectElement>('trend-start').value);
  const end = Number($<HTMLSelectElement>('trend-end').value);
  const status = $('trend-status');
  if (end - start < 9) {
    status.classList.add('bad');
    status.textContent = 'Choose at least 10 years so every comparison has something to test.';
    return;
  }
  buildCompareRows();
  const count = compare.count;
  const queries = compare.values.slice(0, count).map((v) => v.trim());
  if (queries.some((q) => !q)) {
    status.classList.add('bad');
    status.textContent = `Fill in all ${count} places, or lower the number of comparisons.`;
    return;
  }
  if (new Set(queries.map((q) => q.toLowerCase())).size < count) {
    status.classList.add('bad');
    status.textContent = 'Use distinct places: the same place twice would duplicate the same NASA grid.';
    return;
  }
  const seq = ++compareSeq;
  const variable = state.variable;
  const info = variableById(variable);
  compare.loading = true;
  state.loading = true;
  state.start = start;
  state.end = end;
  const btn = $<HTMLButtonElement>('trend-run');
  btn.disabled = true;
  status.classList.remove('bad');
  status.textContent = `Resolving ${count} places…`;
  try {
    const resolved: ({ place: Place } | { error: string })[] = [];
    for (let i = 0; i < count; i++) {
      if (seq !== compareSeq) return;
      status.textContent = `Locating ${queries[i]} (${i + 1}/${count})…`;
      try {
        resolved.push({ place: await resolveComparePlace(queries[i]) });
      } catch (err) {
        resolved.push({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (seq !== compareSeq) return;
    status.textContent = info.source === 'water'
      ? `Finding USGS or ECCC gauges for ${count} places…`
      : `Pulling NASA POWER ${info.label.toLowerCase()} for ${count} places…`;
    const settled = await Promise.allSettled(resolved.map((p) => 'error' in p
      ? Promise.reject(new Error(p.error))
      : fetchTrend(p.place, variable, start, end)));
    if (seq !== compareSeq) return;
    const entries: CompareEntry[] = resolved.map((p, i) => {
      if ('error' in p) {
        return { place: { name: queries[i], lat: Number.NaN, lon: Number.NaN, mode: 'point' }, error: p.error };
      }
      const outcome = settled[i];
      if (outcome.status === 'rejected') {
        return { place: p.place, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) };
      }
      return { place: p.place, result: outcome.value };
    });
    compare.entries = entries;
    compare.start = start;
    compare.end = end;
    compare.variable = variable;
    const ok = entries.filter((e) => e.result).length;
    status.textContent = ok === count
      ? `NASA POWER · ${count} places compared · ${info.label} · ${start}–${end}`
      : `NASA POWER · ${ok} of ${count} places compared · ${start}–${end}`;
    renderCompare(entries, start, end);
  } catch (err) {
    if (seq !== compareSeq) return;
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    if (seq === compareSeq) {
      compare.loading = false;
      state.loading = false;
      btn.disabled = false;
      updateRunLabel();
    }
  }
}

/** Use a preset when it matches; otherwise a typed name or coordinate goes through Nominatim. */
async function resolveComparePlace(query: string): Promise<Place> {
  const q = query.trim();
  const preset = presetFor(q);
  if (preset) return preset;
  const point = parseLatLonText(q);
  if (point) return { name: coordName(point.lat, point.lon), lat: point.lat, lon: point.lon, mode: 'point' };
  // Nominatim asks for at most one request per second; comparisons resolve sequentially.
  const wait = 900 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
  lastGeocodeAt = Date.now();
  const res = await fetch('/api/geocode', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
  });
  const j = (await res.json().catch(() => null)) as { name?: string; lat?: number; lon?: number; error?: string } | null;
  if (!res.ok || !j || j.error || !Number.isFinite(j.lat) || !Number.isFinite(j.lon)) {
    throw new Error(j?.error || `Could not find “${q}”`);
  }
  return { name: j.name || q, lat: j.lat!, lon: j.lon!, mode: 'point' };
}

function presetFor(query: string): Place | null {
  const q = query.trim().toLowerCase();
  const exact = PRESETS.find((p) => p.name.toLowerCase() === q);
  if (exact) return { name: exact.name, lat: exact.lat, lon: exact.lon, mode: exact.mode };
  if (q.length >= 4) {
    const hits = PRESETS.filter((p) => p.name.toLowerCase().includes(q));
    if (hits.length === 1) {
      const p = hits[0];
      return { name: p.name, lat: p.lat, lon: p.lon, mode: p.mode };
    }
  }
  return null;
}

function parseLatLonText(q: string): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function run() {
  const start = Number($<HTMLSelectElement>('trend-start').value);
  const end = Number($<HTMLSelectElement>('trend-end').value);
  const status = $('trend-status');
  $('compare-result').hidden = true;
  if (end - start < 9) {
    status.classList.add('bad');
    status.textContent = 'Choose at least 10 years so the trend test has something to work with.';
    return;
  }
  // A new request supersedes any request still in flight (fast preset/place/variable switches).
  const seq = ++runSeq;
  const place = state.place;
  const variable = state.variable;
  const info = variableById(variable);
  state.start = start;
  state.end = end;
  state.loading = true;
  const btn = $<HTMLButtonElement>('trend-run');
  btn.disabled = true;
  status.classList.remove('bad');
  status.textContent = info.source === 'water'
    ? `Finding the nearest USGS or ECCC streamflow gauge for ${place.name}…`
    : `Pulling NASA POWER ${info.label.toLowerCase()} for ${place.name}…`;
  try {
    const r = await fetchTrend(place, variable, start, end);
    if (seq !== runSeq) return;
    state.result = r;
    const g = r.place.gauge;
    status.textContent = g
      ? `${g.source} gauge ${g.id} · ${r.period.years} complete years · ${g.distanceKm} km from the centre · updated ${new Date(r.source.accessed).toLocaleDateString()}`
      : `NASA POWER · ${r.period.years} complete years · ${r.place.samples} sample${r.place.samples === 1 ? '' : 's'} · updated ${new Date(r.source.accessed).toLocaleDateString()}`;
    render(r);
  } catch (err) {
    if (seq !== runSeq) return;
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    if (seq === runSeq) {
      state.loading = false;
      btn.disabled = false;
    }
  }
}

function render(r: TrendResult) {
  $('trend-result').hidden = false;
  $('compare-result').hidden = true;
  setResultOpen(true);
  hideExplore();
  $('trend-result-place').textContent = r.place.name;
  const g = r.place.gauge;
  const mode = g
    ? `${g.source} gauge ${g.id}, ${g.distanceKm} km from the selected centre`
    : r.place.mode === 'region'
      ? `regional mean of ${r.place.samples} NASA POWER grid points`
      : 'single NASA POWER grid point';
  $('trend-coords').textContent = `${coordName(r.place.lat, r.place.lon)} · ${mode} · ${r.period.start}–${r.period.end}`;
  $('trend-kicker').textContent = g ? `${g.source} Water Services · ${r.variable.label}` : `NASA POWER · ${r.variable.label}`;

  const s = r.stats;
  const d = decimalsFor(r.variable.id);
  const rate = s ? `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)}` : '—';
  $('trend-rate').textContent = rate;
  $('trend-rate-label').textContent = s ? `${r.variable.annualUnit} per decade` : 'not enough years';
  const strength = trendStrength(r);
  const badge = $('trend-badge');
  badge.textContent = strength.label;
  badge.className = `trend-badge ${strength.tone}`;
  $('trend-summary').textContent = explain(r);
  const note = $('trend-var-note');
  if (note) {
    const bits = [`${r.variable.label}: ${r.variable.description}`];
    if (s && !s.mk.significant) {
      // The brief's own hint: a trend that is not significant yet may become significant
      // over a longer window, and the trend itself is still worth knowing.
      bits.push('This trend is not significant at 95% for this window — but it is not “no trend” either. Try a longer period, or read it as “no change detected”.');
    }
    note.textContent = bits.join(' ');
    note.hidden = !bits.length;
  }
  $('trend-explain-text').textContent = explainDetails(r);
  $('trend-explain-text').hidden = true;
  $('trend-explain').textContent = 'Explain the test';
  $('trend-explain').setAttribute('aria-pressed', 'false');
  const aiBtn = $<HTMLButtonElement>('trend-ai');
  aiBtn.textContent = 'Ask ATLAS';
  aiBtn.disabled = false;
  applyAiVisibility();

  const stats = $('trend-stats');
  stats.replaceChildren();
  if (s) {
    const ci: [number, number] = s.senCi95 ? [s.senCi95[0] * 10, s.senCi95[1] * 10] : [s.olsCi95[0] * 10, s.olsCi95[1] * 10];
    const pText = (p: number) => (p < 0.001 ? '< 0.001' : fmt(p, 3));
    const cp = s.changePoint;
    const rows: [string, string][] = [
      ['Sen slope', `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)} ${r.variable.annualUnit}/decade`],
      [s.senCi95 ? '95% interval (Sen)' : '95% interval (OLS)', `${fmt(ci[0], d)} to ${fmt(ci[1], d)} ${r.variable.annualUnit}/decade`],
      ['Mann–Kendall p', pText(s.mk.p)],
      ...(s.mkModified ? [['p, autocorrelation-corrected', `${pText(s.mkModified.p)}${s.robust ? ' · robust' : ''}`] as [string, string]] : []),
      ...(cp ? [['Change point (Pettitt)', cp.significant ? `${cp.year} · p ${pText(cp.p)}` : `none (p ${pText(cp.p)})`] as [string, string]] : []),
      ['Kendall τ', fmt(s.mk.tau, 2)],
      ['Change over period', `${s.changeAbs > 0 ? '+' : ''}${fmt(s.changeAbs, d)} ${r.variable.annualUnit}`],
      ['Period mean', `${fmt(s.mean, d)} ${r.variable.annualUnit}`],
      ['Years used', String(s.n)],
      ['Samples', g ? `${g.name}` : r.place.mode === 'region' ? `${r.place.samples} grid points` : '1 grid point'],
    ];
    for (const [dt, dd] of rows) {
      const div = document.createElement('div');
      const t = document.createElement('dt');
      t.textContent = dt;
      const v = document.createElement('dd');
      v.textContent = dd;
      div.append(t, v);
      stats.appendChild(div);
    }
  } else {
    const div = document.createElement('div');
    const t = document.createElement('dt');
    t.textContent = 'Complete years';
    const v = document.createElement('dd');
    v.textContent = String(r.series.annual.length);
    div.append(t, v);
    stats.appendChild(div);
  }

  $('trend-source').textContent = g
    ? `Data: ${r.source.name} / ${r.source.dataset}, accessed ${new Date(r.source.accessed).toLocaleDateString()}. ${r.source.note} ${r.source.licence}. Imagery: NASA GIBS.`
    : `Data: ${r.source.name} / ${r.source.dataset}, accessed ${new Date(r.source.accessed).toLocaleDateString()}. ${r.source.note} ${r.source.licence}. Imagery: NASA GIBS.`;

  const api = $<HTMLAnchorElement>('trend-api');
  if (r.variable.power) {
    api.href = powerApiUrl(r);
    api.hidden = false;
  } else {
    api.hidden = true;
  }
  const gauge = $<HTMLAnchorElement>('trend-gauge');
  if (g) {
    gauge.href = g.url;
    gauge.hidden = false;
  } else {
    gauge.hidden = true;
  }

  state.year = Math.min(state.end, variableById(r.variable.id).gibsLastYear ?? state.end);
  const yearInput = $<HTMLInputElement>('trend-year');
  yearInput.min = String(Math.max(2000, r.period.start));
  yearInput.max = String(Math.max(Number(yearInput.min), state.year));
  yearInput.value = String(state.year);
  $('trend-year-read').textContent = String(state.year);
  applyGlobe();
  drawChart(r);
  onTrendRendered(r);
}

function renderCompare(entries: CompareEntry[], start: number, end: number) {
  const info = variableById(compare.variable);
  const ok = entries.filter((e) => e.result);
  $('compare-result').hidden = false;
  $('trend-result').hidden = true;
  setResultOpen(true);
  hideExplore();
  $('compare-kicker').textContent = 'NASA POWER / MERRA-2 · comparison';
  $('compare-title').textContent = ok.length === entries.length
    ? `${entries.length} places compared`
    : `${ok.length} of ${entries.length} places compared`;
  $('compare-sub').textContent = `${info.label} · ${start}–${end} · same variable, period and Mann–Kendall test`;
  // False discovery rate across the places being compared (Benjamini–Hochberg).
  const withP = entries.filter((e) => e.result?.stats);
  const qList = bhQ(withP.map((e) => e.result!.stats!.mk.p));
  compareQ = new Map<CompareEntry, number>();
  withP.forEach((e, i) => compareQ.set(e, qList[i]));
  (window as unknown as { atlasCompareQ?: number[] }).atlasCompareQ = qList;
  $('compare-summary').textContent = compareSummary(entries, start, end, info);

  const limits = $('compare-limits');
  limits.replaceChildren();
  for (const line of compareLimits(entries, start, end, info)) {
    const li = document.createElement('li');
    li.textContent = line;
    limits.appendChild(li);
  }

  const body = $('compare-table-body');
  body.replaceChildren();
  const ordered = [...entries].sort((a, b) => {
    if (a.result?.stats && b.result?.stats) return b.result.stats.senPerDecade - a.result.stats.senPerDecade;
    if (a.result?.stats) return -1;
    if (b.result?.stats) return 1;
    return 0;
  });
  const d = decimalsFor(info.id);
  for (const e of ordered) {
    const tr = document.createElement('tr');
    const place = document.createElement('td');
    const name = document.createElement('b');
    name.textContent = e.place.name;
    place.appendChild(name);
    const detail = document.createElement('small');
    const gauge = e.result?.place.gauge;
    const sample = gauge
      ? `${gauge.source} gauge ${gauge.id}`
      : e.result
        ? `${e.result.place.samples} NASA grid point${e.result.place.samples === 1 ? '' : 's'}`
        : 'not resolved';
    detail.textContent = Number.isFinite(e.place.lat)
      ? `${Math.abs(e.place.lat).toFixed(2)}°${e.place.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.place.lon).toFixed(2)}°${e.place.lon >= 0 ? 'E' : 'W'} · ${sample}`
      : sample;
    place.appendChild(detail);
    tr.appendChild(place);

    const s = e.result?.stats;
    if (!s) {
      const failed = document.createElement('td');
      failed.colSpan = 4;
      failed.className = 'failed';
      failed.textContent = e.error
        ? e.error
        : e.result
          ? `Only ${e.result.series.annual.length} complete years; not enough for a trend test.`
          : 'No result.';
      tr.appendChild(failed);
      body.appendChild(tr);
      continue;
    }

    const rate = document.createElement('td');
    rate.textContent = `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)} ${info.annualUnit}/dec`;
    const p = document.createElement('td');
    p.textContent = s.mk.p < 0.001 ? '<0.001' : fmt(s.mk.p, 3);
    const q = document.createElement('td');
    const qv = compareQ.get(e) ?? 1;
    q.textContent = qv < 0.001 ? '<0.001' : fmt(qv, 3);
    q.title = 'Benjamini–Hochberg false discovery rate across the compared places';
    const sig = document.createElement('td');
    sig.textContent = s.mk.significant ? 'Yes' : 'No';
    sig.className = s.mk.significant ? 'sig-yes' : 'sig-no';
    const years = document.createElement('td');
    years.textContent = String(s.n);
    tr.append(rate, p, q, sig, years);
    body.appendChild(tr);
  }

  const source = ok.find((e) => e.result)?.result?.source;
  $('compare-source').textContent = source
    ? `Data: ${source.name} / ${source.dataset}, accessed ${new Date(source.accessed).toLocaleDateString()}. Each trend uses its own NASA POWER sample: one grid cell, or the mean of nine grid points for a region preset. ${source.licence}. Place names: OpenStreetMap Nominatim; no trend value comes from a map token or imagery.`
    : 'No NASA POWER source was returned. Nothing is filled in.';
  drawCompareChart();
}

function compareSummary(entries: CompareEntry[], start: number, end: number, info: ReturnType<typeof variableById>): string {
  const ok = entries.filter((e) => e.result?.stats);
  const failed = entries.filter((e) => !e.result?.stats);
  if (!ok.length) {
    const why = failed.map((e) => `${e.place.name}: ${e.error || 'too few complete years'}`).join('; ');
    return `None of the ${entries.length} places returned a long enough NASA POWER record for a trend test between ${start} and ${end}. ${why}.`;
  }
  const sorted = [...ok].sort((a, b) => b.result!.stats!.senPerDecade - a.result!.stats!.senPerDecade);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  const d = decimalsFor(info.id);
  const rate = (e: CompareEntry) => {
    const s = e.result!.stats!;
    return `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)} ${info.annualUnit}/decade`;
  };
  const pText = (e: CompareEntry) => {
    const p = e.result!.stats!.mk.p;
    return p < 0.001 ? '< 0.001' : p.toFixed(3);
  };
  const sig = ok.filter((e) => e.result!.stats!.mk.significant);
  const weak = ok.filter((e) => !e.result!.stats!.mk.significant && e.result!.stats!.mk.p < 0.1);
  const parts: string[] = [];
  if (high === low) {
    parts.push(`For ${info.label.toLowerCase()} over ${start}–${end}, ${high.place.name} has a Sen slope of ${rate(high)} (p = ${pText(high)}).`);
  } else {
    parts.push(`For ${info.label.toLowerCase()} over ${start}–${end}, ${high.place.name} has the highest Sen slope (${rate(high)}, p = ${pText(high)}) and ${low.place.name} the lowest (${rate(low)}, p = ${pText(low)}).`);
  }
  const qOk = ok.filter((e) => (compareQ.get(e) ?? 1) < 0.05);
  if (qOk.length !== sig.length) {
    parts.push(`After the false discovery rate correction across the compared places, ${qOk.length} of ${ok.length} still hold at q < 0.05.`);
  }
  if (sig.length === ok.length) parts.push(`All ${ok.length} places show a statistically significant trend at the 95% level.`);
  else if (!sig.length) parts.push(`None of the ${ok.length} places show a statistically significant trend at the 95% level.`);
  else {
    const noun = ok.length === 1 ? 'place' : 'places';
    parts.push(`${sig.length} of ${ok.length} ${noun} ${sig.length === 1 ? 'shows' : 'show'} a statistically significant trend at the 95% level; ${ok.length - sig.length} ${ok.length - sig.length === 1 ? 'does' : 'do'} not.`);
  }
  if (weak.length) parts.push(`${weak.map((e) => e.place.name).join(', ')} ${weak.length === 1 ? 'shows' : 'show'} weak evidence only (p < 0.1).`);
  if (failed.length) parts.push(`No trend could be tested for ${failed.map((e) => e.place.name).join(', ')}.`);
  parts.push('These are rates of change, not absolute levels: a larger slope does not mean a hotter, wetter or worse place.');
  return parts.join(' ');
}

function compareLimits(entries: CompareEntry[], start: number, end: number, info: ReturnType<typeof variableById>): string[] {
  const ok = entries.filter((e) => e.result?.stats);
  const years = ok.map((e) => e.result!.stats!.n);
  const minN = years.length ? Math.min(...years) : 0;
  const maxN = years.length ? Math.max(...years) : 0;
  const samples = Array.from(new Set(ok.map((e) => e.result!.place.samples))).sort((a, b) => a - b);
  const sampleText = !samples.length
    ? 'one or more NASA grid points'
    : samples.length === 1
      ? `${samples[0]} grid point${samples[0] === 1 ? '' : 's'}`
      : `${samples[0]}–${samples[samples.length - 1]} grid points`;
  const limits = [
    `NASA POWER is a coarse reanalysis grid (about 0.5° × 0.625°), not a local weather station. Each place is represented by ${sampleText}${info.source === 'water' ? ' or the nearest ground gauge' : ''}.`,
    minN === maxN
      ? `All tested places have ${minN} complete years. Missing months are dropped, never interpolated.`
      : `Complete years differ across these places (${minN}–${maxN}). Missing months are dropped, never interpolated, so a place with fewer years has a less certain slope.`,
    'Mann–Kendall assumes independent annual values. Serial correlation can make p-values look smaller than they should, and this test does not correct for it.',
    `The q column is the Benjamini–Hochberg false discovery rate across the ${ok.length} compared place${ok.length === 1 ? '' : 's'}: it controls the expected share of false positives, so a q below 0.05 survives looking at several places at once. Read p for the single place and q for the group.`,
    `A Sen slope is a fitted rate over ${start}–${end}, not a forecast or a current value. A difference between places does not prove why they differ.`,
    'Place names and coordinates come from OpenStreetMap Nominatim. A geocoding error moves the NASA sample point; the trend itself is still NASA POWER.',
  ];
  if (info.source === 'water') {
    limits.push('Streamflow comes from different USGS or ECCC gauges, each with its own record length, regulation and siting. A gauge is not a basin average.');
  }
  if (info.id === 'precip' || info.id === 'precip_snow' || info.id === 'evap' || info.id === 'frost' || info.id === 'hdd18') {
    limits.push('This variable is annualised as a sum of monthly values, so one missing month removes the whole year.');
  }
  if (ok.some((e) => e.result!.place.mode === 'region')) {
    limits.push('Region presets are fixed equal-area sample boxes, not political or hydrological boundaries.');
  }
  return limits;
}

function drawCompareChart() {
  const canvas = $<HTMLCanvasElement>('compare-chart');
  if (!canvas || $('compare-result').hidden) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const entries = compare.entries
    .filter((e) => e.result?.stats)
    .sort((a, b) => b.result!.stats!.senPerDecade - a.result!.stats!.senPerDecade);
  const host = canvas.parentElement;
  const cssW = Math.max(260, Math.floor(host?.clientWidth || 480));
  const rowH = 36;
  const cssH = Math.max(96, entries.length * rowH + 14);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!entries.length) return;

  const info = variableById(compare.variable);
  const d = decimalsFor(info.id);
  const values = entries.map((e) => e.result!.stats!.senPerDecade);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const labelW = Math.min(150, Math.max(88, cssW * 0.3));
  const valueW = 74;
  const barLeft = 4 + labelW;
  const barRight = cssW - valueW;
  const xOf = (v: number) => barLeft + ((v - min) / span) * Math.max(30, barRight - barLeft);
  const zero = xOf(0);
  const ink = '#120e0c';

  ctx.strokeStyle = 'rgba(18,14,12,.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(zero, 2);
  ctx.lineTo(zero, cssH - 4);
  ctx.stroke();

  entries.forEach((entry, i) => {
    const s = entry.result!.stats!;
    const y = 8 + i * rowH;
    ctx.font = '10px "Monaspace Krypton", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.86;
    drawCompareLabel(ctx, entry.place.name, 4, y + 7, labelW - 10);
    ctx.globalAlpha = 0.48;
    ctx.font = '8.5px "Monaspace Krypton", monospace';
    const p = s.mk.p < 0.001 ? '<0.001' : s.mk.p.toFixed(3);
    ctx.fillText(`p = ${p}${s.mk.significant ? '' : ' · n.s.'}`, 4, y + 20);

    const end = xOf(s.senPerDecade);
    const left = Math.min(zero, end);
    const width = Math.max(2, Math.abs(end - zero));
    ctx.globalAlpha = s.mk.significant ? 0.95 : 0.32;
    ctx.fillStyle = info.color;
    ctx.fillRect(left, y + 2, width, 16);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(18,14,12,.28)';
    ctx.strokeRect(left + 0.5, y + 2.5, Math.max(1, width - 1), 15);

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'right';
    ctx.font = '10px "Monaspace Krypton", monospace';
    ctx.fillText(`${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)}`, cssW - 4, y + 9);
    ctx.globalAlpha = 0.46;
    ctx.font = '8px "Monaspace Krypton", monospace';
    ctx.fillText(info.annualUnit, cssW - 4, y + 20);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawCompareLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  if (ctx.measureText(text).width <= max || text.length < 2) {
    ctx.fillText(text, x, y);
    return;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  ctx.fillText(`${cut}…`, x, y);
}

function downloadCompareCsv() {
  if (!compare.entries.length) return;
  const info = variableById(compare.variable);
  const esc = (v: unknown) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    '# ATLAS EARTH / NASA Space Apps 2026 · comparison',
    `# variable,${esc(info.label)} (${info.source === 'water' ? 'ground gauge' : 'NASA POWER'})`,
    `# period,${compare.start}-${compare.end}`,
    '# source,NASA POWER / MERRA-2',
    'place,latitude,longitude,mode,samples,gauge,sen_slope_per_decade,unit,p_value,significant,years,period_mean,change_over_period,error',
  ];
  for (const e of compare.entries) {
    const s = e.result?.stats;
    lines.push([
      esc(e.place.name),
      Number.isFinite(e.place.lat) ? e.place.lat.toFixed(4) : '',
      Number.isFinite(e.place.lon) ? e.place.lon.toFixed(4) : '',
      e.place.mode,
      e.result?.place.samples ?? '',
      esc(e.result?.place.gauge?.id || ''),
      s ? s.senPerDecade.toFixed(6) : '',
      esc(info.annualUnit),
      s ? s.mk.p.toFixed(6) : '',
      s ? (s.mk.significant ? 'yes' : 'no') : '',
      s ? s.n : '',
      s ? s.mean.toFixed(6) : '',
      s ? s.changeAbs.toFixed(6) : '',
      esc(e.error || ''),
    ].join(','));
  }
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atlas-earth-compare-${info.id}-${compare.start}-${compare.end}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function powerApiUrl(r: TrendResult) {
  const q = new URLSearchParams({
    parameters: r.variable.power,
    community: 'AG',
    latitude: r.place.lat.toFixed(4),
    longitude: r.place.lon.toFixed(4),
    start: String(r.period.start),
    end: String(r.period.end),
    format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${q.toString()}`;
}

function downloadCsv() {
  const r = state.result;
  if (!r) return;
  const esc = (v: unknown) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    '# ATLAS EARTH / NASA Space Apps 2026',
    `# variable,${esc(r.variable.label)} (${r.variable.power || 'ground gauge'})`,
    `# place,${esc(r.place.name)}`,
    `# coordinates,${r.place.lat.toFixed(4)},${r.place.lon.toFixed(4)}`,
    `# period,${r.period.start}-${r.period.end}`,
    `# source,${esc(r.source.name)} / ${esc(r.source.dataset)}`,
    `# accessed,${r.source.accessed}`,
    'date,resolution,value,unit',
  ];
  for (const m of r.series.monthly) lines.push(`${m.t},monthly,${m.v},${esc(r.variable.unit)}`);
  for (const a of r.series.annual) lines.push(`${a.year},annual,${a.v},${esc(r.variable.annualUnit)}`);
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atlas-earth-${r.place.name}-${r.variable.id}-${r.period.start}-${r.period.end}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function explainDetails(r: TrendResult): string {
  const s = r.stats;
  if (!s) return explain(r);
  const d = decimalsFor(r.variable.id);
  const ci = `[${fmt(s.olsCi95[0] * 10, d)}, ${fmt(s.olsCi95[1] * 10, d)}] ${r.variable.annualUnit}/decade`;
  const pct = s.mk.p < 0.001 ? '< 0.001' : s.mk.p.toFixed(3);
  const r2 = s.olsR2.toFixed(2);
  return `How to read this: Sen's slope is the median of all pairwise slopes between years, so one unusual year cannot drag it far. Mann–Kendall asks whether the annual values rise or fall consistently; p is the chance of seeing a pattern this strong if nothing were changing. Here p = ${pct}, Kendall's τ = ${s.mk.tau.toFixed(2)}, and the ordinary-least-squares 95% interval is ${ci} (R² = ${r2}). A 95% interval that crosses zero is consistent with no trend. The test assumes independent annual values; real climate series can be autocorrelated, which can make p look smaller than it should.`;
}

function applyGlobe() {
  if (!globe || !globeVisible) return;
  const place = state.result?.place ?? state.place;
  if (!place) return;
  const g = state.result?.place?.gauge;
  if (g) globe.setMarker(g.lat, g.lon, `${g.name} · ${g.source}`);
  else globe.setMarker(place.lat, place.lon, place.name);
  updateOverlay();
}

function updateOverlay() {
  if (!globe || !globeVisible) return;
  const info = variableById(state.variable);
  globe.setBase(state.base, Math.min(state.year, 2025), state.month);
  if (!info.gibs) {
    globe.setOverlay(null, state.year, state.month);
    return;
  }
  globe.setOverlay(info.id, Math.min(state.year, info.gibsLastYear ?? state.year), state.month);
}

function togglePlay() {
  if (playTimer !== null) { stopPlay(); return; }
  const btn = $('trend-play');
  btn.setAttribute('aria-pressed', 'true');
  btn.textContent = 'Stop';
  const from = state.start;
  const to = state.end;
  state.year = from;
  applyGlobe();
  $<HTMLInputElement>('trend-year').value = String(state.year);
  $('trend-year-read').textContent = String(state.year);
  playTimer = window.setInterval(() => {
    state.year = state.year >= to ? from : state.year + 1;
    $<HTMLInputElement>('trend-year').value = String(state.year);
    $('trend-year-read').textContent = String(state.year);
    updateOverlay();
  }, 700);
}

function stopPlay() {
  if (playTimer !== null) { window.clearInterval(playTimer); playTimer = null; }
  const btn = $('trend-play');
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = 'Play years';
}

function drawChart(r: TrendResult) {
  const canvas = $<HTMLCanvasElement>('trend-chart');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const h = rect.height || 190;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, h);

  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--panel-text').trim() || '#111';
  const color = variableById(r.variable.id).color;
  const d = decimalsFor(r.variable.id);

  const monthly = state.chart === 'monthly';
  const annual = r.series.annual;
  const data = monthly
    ? r.series.monthly.map((p) => ({ x: Number(p.t.slice(0, 4)) + (Number(p.t.slice(5, 7)) - 0.5) / 12, y: p.v, label: p.t }))
    : annual.map((p) => ({ x: p.year, y: p.v, label: String(p.year) }));
  if (data.length < 2) { chartMeta = null; return; }

  const pad = { l: 46, r: 10, t: 12, b: 24 };
  const plotW = Math.max(10, rect.width - pad.l - pad.r);
  const plotH = Math.max(10, h - pad.t - pad.b);
  const x0 = data[0].x, x1 = data[data.length - 1].x;
  let yMin = Math.min(...data.map((p) => p.y));
  let yMax = Math.max(...data.map((p) => p.y));
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;
  const span = yMax - yMin || Math.abs(yMax) * 0.1 || 1;
  yMin -= span * 0.08;
  yMax += span * 0.08;
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * plotW;
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  ctx.font = '10px "Monaspace Krypton", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  // Horizontal grid + value labels.
  for (let i = 0; i <= 3; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3;
    const y = sy(v);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.fillText(fmt(v, d), pad.l - 6, y);
  }

  // Year ticks.
  const ticks = 4;
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.55;
  for (let i = 0; i <= ticks; i++) {
    const xv = x0 + ((x1 - x0) * i) / ticks;
    ctx.fillText(monthly ? String(Math.round(xv)) : String(Math.round(xv)), sx(xv), h - 10);
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = monthly ? 1.1 : 1.7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((p, i) => { const x = sx(p.x), y = sy(p.y); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke();

  if (!monthly) {
    // Dots for annual values; the final year gets the accent.
    data.forEach((p, i) => {
      ctx.beginPath();
      ctx.fillStyle = i === data.length - 1 ? '#FF4FA3' : color;
      ctx.arc(sx(p.x), sy(p.y), i === data.length - 1 ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    });

    if (r.stats) {
      const st = r.stats;
      const xs = annual.map((p) => p.year), ys = annual.map((p) => p.v);
      // Sen line through the median intercept (scipy.stats.theilslopes), with the 95% band
      // drawn as the two Gilbert-interval slopes pivoting on the median year.
      const med = (a: number[]) => { const b = [...a].sort((u, v) => u - v); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
      const b0 = med(ys.map((y, i) => y - st.senPerYear * xs[i]));
      const xm = med(xs), ym = st.senPerYear * xm + b0;
      const at = (slope: number, x: number) => ym + slope * (x - xm);
      const ci = st.senCi95 ?? st.olsCi95;
      const xa = st.firstYear, xb = st.lastYear;
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.09;
      ctx.beginPath();
      ctx.moveTo(sx(xa), sy(at(ci[0], xa)));
      ctx.lineTo(sx(xm), sy(ym));
      ctx.lineTo(sx(xb), sy(at(ci[1], xb)));
      ctx.lineTo(sx(xb), sy(at(ci[0], xb)));
      ctx.lineTo(sx(xm), sy(ym));
      ctx.lineTo(sx(xa), sy(at(ci[1], xa)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(xa), sy(at(st.senPerYear, xa)));
      ctx.lineTo(sx(xb), sy(at(st.senPerYear, xb)));
      ctx.stroke();
      ctx.setLineDash([]);
      const cp = st.changePoint;
      if (cp && cp.significant) {
        const cx = sx(cp.year - 0.5);
        ctx.strokeStyle = '#FF4FA3';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, pad.t + plotH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx(xa), sy(cp.before)); ctx.lineTo(cx, sy(cp.before)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, sy(cp.after)); ctx.lineTo(sx(xb), sy(cp.after)); ctx.stroke();
        ctx.fillStyle = '#FF4FA3';
        ctx.textAlign = cx > pad.l + plotW * 0.7 ? 'right' : 'left';
        ctx.fillText(`shift ${cp.year}`, cx + (ctx.textAlign === 'right' ? -4 : 4), pad.t + 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = 'left';
  ctx.fillText(r.variable.annualUnit, pad.l, 6);
  ctx.globalAlpha = 1;

  chartMeta = {
    left: pad.l,
    right: pad.l + plotW,
    points: data.map((p) => ({ x: sx(p.x), y: sy(p.y), label: p.label, value: `${fmt(p.y, d)} ${r.variable.annualUnit}` })),
  };
}
