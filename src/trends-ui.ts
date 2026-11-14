import { NasaGlobe } from './globe';
import {
  PRESETS, VARIABLES, GROUPS, variableById, fetchTrend, explain, fmt, decimalsFor, trendStrength,
  type Place, type TrendResult, type VariableId, type VariableGroup,
} from './trends';

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

const YEAR_MIN = 1981;
const YEAR_MAX = 2025;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initTrends() {
  buildYears();
  activeGroup = variableById(state.variable).group;
  buildGroups();
  buildVariables();
  buildPresets();
  bindEvents();
  paintActive();
  void probeAi();
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
export function openTrendAt(place: Place, variable: VariableId = 't2m') {
  const start = document.getElementById('trend-start') as HTMLSelectElement | null;
  const end = document.getElementById('trend-end') as HTMLSelectElement | null;
  const input = document.getElementById('trend-place') as HTMLInputElement | null;
  state.place = place;
  state.variable = variable;
  state.start = 1996;
  state.end = 2025;
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
    void run();
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
      if (state.loadedOnce) void run();
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
      void run();
    });
    box.appendChild(b);
  }
}

function paintActive() {
  paintGroups();
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
  $('trend-run').addEventListener('click', () => void run());
  $('trend-close').addEventListener('click', () => { $('trend-result').hidden = true; });
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
  window.addEventListener('resize', () => { if (state.result && !$('trend-result').hidden) drawChart(state.result); });
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
    await run();
  } catch (err) {
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function run() {
  const start = Number($<HTMLSelectElement>('trend-start').value);
  const end = Number($<HTMLSelectElement>('trend-end').value);
  const status = $('trend-status');
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
    const ci: [number, number] = [s.olsCi95[0] * 10, s.olsCi95[1] * 10];
    const rows: [string, string][] = [
      ['Sen slope', `${s.senPerDecade > 0 ? '+' : ''}${fmt(s.senPerDecade, d)} ${r.variable.annualUnit}/decade`],
      ['95% interval (OLS)', `${fmt(ci[0], d)} to ${fmt(ci[1], d)} ${r.variable.annualUnit}/decade`],
      ['Mann–Kendall p', s.mk.p < 0.001 ? '< 0.001' : fmt(s.mk.p, 3)],
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
      const midX = (r.stats.firstYear + r.stats.lastYear) / 2;
      const yAt = (x: number) => r.stats!.mean + r.stats!.senPerYear * (x - midX);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(r.stats.firstYear), sy(yAt(r.stats.firstYear)));
      ctx.lineTo(sx(r.stats.lastYear), sy(yAt(r.stats.lastYear)));
      ctx.stroke();
      ctx.setLineDash([]);
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
