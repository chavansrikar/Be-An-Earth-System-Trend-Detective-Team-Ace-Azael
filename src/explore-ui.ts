import { variableById, decimalsFor, fmt, type Place, type VariableId } from './trends';

/**
 * Two detective views on top of the trend core:
 *
 *  - Scan every variable: "What is changing here?" All NASA POWER variables at one place, tested
 *    at once with a false-discovery correction, ranked, each one click away from its full record.
 *  - Map the change: "Where is it changing?" One trend test per NASA POWER grid cell, drawn on a
 *    NASA Blue Marble map, with dots only where the trend survives the correction.
 *
 * Every number comes from /api/sweep and /api/trendmap. Nothing here computes statistics.
 */

export interface SweepItem {
  id: VariableId; label: string; short: string; group: string; unit: string; description: string;
  up: string; down: string; n: number; mean: number; senPerDecade: number; senCi95PerDecade: [number, number];
  changeAbs: number; changePct: number | null; p: number; pModified: number; q: number; tau: number;
  significant: boolean; nominal: boolean; changeYear: number | null; series: { year: number; v: number }[];
}
export interface SweepResult {
  place: { name: string; lat: number; lon: number };
  period: { start: number; end: number };
  tested: number; significant: number; nominal: number;
  items: SweepItem[]; failed: string[];
  source: { name: string; dataset: string; url: string; requests: string[]; accessed: string };
  method: string[];
}
export interface MapCell { lat: number; lon: number; slope: number; p: number; q: number; significant: boolean; mean: number; n: number }
export interface TrendMapResult {
  variable: { id: VariableId; label: string; short: string; unit: string; up: string; down: string; description: string };
  place: { name: string; lat: number; lon: number };
  bbox: { south: number; north: number; west: number; east: number };
  grid: { dLat: number; dLon: number; rows: number; cols: number };
  period: { start: number; end: number };
  cells: MapCell[];
  summary: {
    cells: number; upSignificant: number; downSignificant: number; notSignificant: number; medianSlope: number;
    maxCell: MapCell | null; minCell: MapCell | null;
    areaMean: { senPerDecade: number; p: number; series: { year: number; v: number }[] } | null;
    opposite: boolean;
  };
  source: { name: string; dataset: string; url: string; request: string; accessed: string };
  method: string[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

let mapData: TrendMapResult | null = null;
let sweepData: SweepResult | null = null;
let seq = 0;
let openSingle: (place: Place, variable: VariableId) => void = () => {};
let mapGeom: { w: number; h: number } | null = null;

export function initExplore(opts: { openSingle: (place: Place, variable: VariableId) => void }) {
  openSingle = opts.openSingle;
  $('map-close').addEventListener('click', () => { $('map-result').hidden = true; });
  $('sweep-close').addEventListener('click', () => { $('sweep-result').hidden = true; });
  $('map-csv').addEventListener('click', downloadMapCsv);
  $('sweep-csv').addEventListener('click', downloadSweepCsv);
  const canvas = $<HTMLCanvasElement>('map-canvas');
  canvas.addEventListener('pointermove', (ev) => {
    const cell = cellAt(ev);
    const tip = $('map-tip');
    if (!cell || !mapData) { tip.hidden = true; canvas.style.cursor = 'default'; return; }
    canvas.style.cursor = 'pointer';
    const d = decimalsFor(mapData.variable.id);
    tip.hidden = false;
    tip.textContent = `${coord(cell.lat, cell.lon)} · ${sign(cell.slope)}${fmt(cell.slope, d)} ${mapData.variable.unit}/dec · ${cell.significant ? 'significant' : 'no clear trend'} (q ${cell.q < 0.001 ? '<0.001' : fmt(cell.q, 3)})`;
    const rect = canvas.getBoundingClientRect();
    tip.style.left = `${Math.min(rect.width - 90, Math.max(90, ev.clientX - rect.left))}px`;
    tip.style.top = `${Math.max(20, ev.clientY - rect.top - 8)}px`;
  });
  canvas.addEventListener('pointerleave', () => { $('map-tip').hidden = true; });
  canvas.addEventListener('click', (ev) => {
    const cell = cellAt(ev);
    if (!cell || !mapData) return;
    openSingle({ name: `Cell ${coord(cell.lat, cell.lon)}`, lat: cell.lat, lon: cell.lon, mode: 'point' }, mapData.variable.id);
  });
  $('sweep-list').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
    if (!b || !sweepData) return;
    const p = sweepData.place;
    openSingle({ name: p.name, lat: p.lat, lon: p.lon, mode: 'point' }, b.dataset.id as VariableId);
  });
  window.addEventListener('resize', () => { if (mapData && !$('map-result').hidden) drawMap(); });
}

export function hideExplore() {
  $('map-result').hidden = true;
  $('sweep-result').hidden = true;
}

export function showExplore(view: 'map' | 'sweep') {
  hideExplore();
  if (view === 'map' && mapData) { $('map-result').hidden = false; drawMap(); }
  if (view === 'sweep' && sweepData) $('sweep-result').hidden = false;
}

export function hasMap() { return Boolean(mapData); }

/* --------------------------------------------------------------------------------------------- */

export async function runSweep(place: Place, start: number, end: number, status: HTMLElement) {
  const mine = ++seq;
  status.classList.remove('bad');
  status.textContent = `Pulling every NASA POWER variable for ${place.name}…`;
  const q = new URLSearchParams({ lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), start: String(start), end: String(end), name: place.name });
  try {
    const data = await getJson<SweepResult>(`/api/sweep?${q}`);
    if (mine !== seq) return;
    sweepData = data;
    status.textContent = `NASA POWER · ${data.tested} variables tested at ${data.place.name} · ${start}–${end}`;
    renderSweep(data);
  } catch (err) {
    if (mine !== seq) return;
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  }
}

export async function runMap(place: Place, variable: VariableId, start: number, end: number, span: number, status: HTMLElement) {
  const mine = ++seq;
  const info = variableById(variable);
  status.classList.remove('bad');
  if (info.source === 'water') {
    status.classList.add('bad');
    status.textContent = 'Streamflow comes from single river gauges, not a NASA grid, so it cannot be mapped. Pick a NASA POWER variable.';
    return;
  }
  status.textContent = `Testing every NASA POWER grid cell around ${place.name} for ${info.label.toLowerCase()}…`;
  const q = new URLSearchParams({ variable, lat: place.lat.toFixed(4), lon: place.lon.toFixed(4), span: String(span), start: String(start), end: String(end), name: place.name });
  try {
    const data = await getJson<TrendMapResult>(`/api/trendmap?${q}`);
    if (mine !== seq) return;
    mapData = data;
    status.textContent = `NASA POWER · ${data.summary.cells} grid cells · ${info.label} · ${start}–${end}`;
    renderMap(data);
  } catch (err) {
    if (mine !== seq) return;
    status.classList.add('bad');
    status.textContent = err instanceof Error ? err.message : String(err);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    throw new Error('The analysis server did not answer with data. Run the app with `vercel dev`, or try again.');
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Request failed (${res.status})`);
  return body as T;
}

/* ---------------------------------------------------------------------------------------------
 * Scan every variable
 * ------------------------------------------------------------------------------------------- */

function renderSweep(r: SweepResult) {
  hideExplore();
  $('sweep-result').hidden = false;
  $('sweep-title').textContent = `What is changing at ${r.place.name}?`;
  $('sweep-sub').textContent = `${coord(r.place.lat, r.place.lon)} · one NASA POWER grid cell · ${r.period.start}–${r.period.end} · ${r.tested} variables tested`;
  $('sweep-headline').textContent = `${r.significant} of ${r.tested}`;
  const badge = $('sweep-badge');
  badge.textContent = r.significant ? 'Survives FDR correction' : 'Nothing survives correction';
  badge.className = `trend-badge ${r.significant ? 'strong' : 'none'}`;

  const sig = r.items.filter((i) => i.significant);
  const leads = r.items.filter((i) => !i.significant && i.nominal);
  const parts: string[] = [];
  if (sig.length) {
    parts.push(`After correcting for testing ${r.tested} variables at once, ${sig.length} show a trend we can distinguish from chance: ${list(sig.slice(0, 5).map((i) => `${i.label.toLowerCase()} (${i.senPerDecade > 0 ? 'rising' : 'falling'})`))}${sig.length > 5 ? ', and more' : ''}.`);
  } else {
    parts.push(`None of the ${r.tested} variables passes the trend test after correcting for testing them all at once.`);
  }
  if (leads.length) {
    parts.push(`${leads.length} more pass p < 0.05 on their own but not after the correction (${list(leads.slice(0, 3).map((i) => i.label.toLowerCase()))}). Treat those as leads to investigate, not findings: with ${r.tested} tests, about ${(r.tested * 0.05).toFixed(1)} would cross p < 0.05 by luck alone.`);
  }
  parts.push('Click any variable to open its full record and test.');
  $('sweep-summary').textContent = parts.join(' ');

  const listEl = $('sweep-list');
  listEl.replaceChildren();
  let dividerDone = false;
  for (const item of r.items) {
    if (!item.significant && !dividerDone) {
      dividerDone = true;
      const li = document.createElement('li');
      li.className = 'sweep-divider';
      li.textContent = sig.length ? 'No trend after correction' : 'All variables';
      listEl.appendChild(li);
    }
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sweep-row ${item.significant ? 'is-sig' : item.nominal ? 'is-lead' : ''}`;
    b.dataset.id = item.id;
    b.title = `${item.description} Open the full record.`;
    const color = variableById(item.id).color;
    b.innerHTML = `${spark(item, color)}<span class="sw-name"><b></b><small></small></span><span class="sw-rate"><b></b><small></small></span><span class="sw-tag"></span>`;
    b.querySelector('.sw-name b')!.textContent = item.label;
    b.querySelector('.sw-name small')!.textContent = `${item.group}${item.changeYear ? ` · shift around ${item.changeYear}` : ''}`;
    const d = decimalsFor(item.id);
    b.querySelector('.sw-rate b')!.textContent = `${sign(item.senPerDecade)}${fmt(item.senPerDecade, d)}`;
    b.querySelector('.sw-rate small')!.textContent = `${item.unit}/dec · q ${item.q < 0.001 ? '<0.001' : fmt(item.q, 2)}`;
    const tag = b.querySelector('.sw-tag')!;
    tag.textContent = item.significant ? (item.senPerDecade > 0 ? 'Rising' : 'Falling') : item.nominal ? 'Lead' : '—';
    li.appendChild(b);
    listEl.appendChild(li);
  }
  fillList('sweep-method', [...r.method, ...(r.failed.length ? [`Not tested here: ${r.failed.join(', ')}.`] : [])]);
  $('sweep-source').textContent = `Data: ${r.source.name} / ${r.source.dataset}, accessed ${new Date(r.source.accessed).toLocaleDateString()}. U.S. Government work (NASA); acknowledgement requested. ${r.source.requests.length} NASA POWER requests; each is linked below.`;
  const links = $('sweep-links');
  links.replaceChildren();
  r.source.requests.forEach((u, i) => {
    const a = document.createElement('a');
    a.href = u; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = `NASA POWER request ${i + 1}`;
    links.appendChild(a);
  });
}

function spark(item: SweepItem, color: string) {
  const w = 84, h = 26, pad = 2;
  const ys = item.series.map((p) => p.v);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const pts = item.series.map((p, i) => `${(pad + (i / Math.max(1, ys.length - 1)) * (w - pad * 2)).toFixed(1)},${(h - pad - ((p.v - lo) / span) * (h - pad * 2)).toFixed(1)}`).join(' ');
  const stroke = item.significant ? color : 'currentColor';
  const op = item.significant ? 1 : 0.42;
  return `<svg class="sw-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-opacity="${op}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function downloadSweepCsv() {
  if (!sweepData) return;
  const r = sweepData;
  const lines = [
    `# ATLAS EARTH variable scan · ${r.place.name} (${r.place.lat}, ${r.place.lon}) · ${r.period.start}-${r.period.end}`,
    `# Source: NASA POWER / MERRA-2 monthly, accessed ${r.source.accessed}`,
    '# Test: max(p) of classic Mann-Kendall and Hamed & Rao autocorrelation-corrected Mann-Kendall; Benjamini-Hochberg FDR across all variables',
    'variable,group,unit,sen_per_decade,sen_ci95_low,sen_ci95_high,p_mann_kendall,p_corrected_autocorrelation,q_fdr,significant_after_fdr,years',
    ...r.items.map((i) => [i.label, i.group, i.unit, i.senPerDecade, i.senCi95PerDecade[0], i.senCi95PerDecade[1], i.p, i.pModified, i.q, i.significant, i.n].map(csvCell).join(',')),
  ];
  save(lines.join('\n'), `atlas-scan-${slug(r.place.name)}-${r.period.start}-${r.period.end}.csv`);
}

/* ---------------------------------------------------------------------------------------------
 * Map the change
 * ------------------------------------------------------------------------------------------- */

function renderMap(r: TrendMapResult) {
  hideExplore();
  $('map-result').hidden = false;
  const s = r.summary;
  const d = decimalsFor(r.variable.id);
  $('map-kicker').textContent = `NASA POWER · ${r.variable.label} · trend map`;
  $('map-title').textContent = `Where is ${r.variable.short.toLowerCase()} changing?`;
  $('map-sub').textContent = `${s.cells} grid cells around ${r.place.name} · ${fmtLat(r.bbox.south)}–${fmtLat(r.bbox.north)}, ${fmtLon(r.bbox.west)}–${fmtLon(r.bbox.east)} · ${r.period.start}–${r.period.end}`;
  const changing = s.upSignificant + s.downSignificant;
  $('map-headline').textContent = `${Math.round((changing / Math.max(1, s.cells)) * 100)}%`;
  $('map-headline-label').textContent = `of cells change significantly`;
  const badge = $('map-badge');
  badge.textContent = s.opposite ? 'Opposite trends in one region' : changing ? (s.upSignificant >= s.downSignificant ? `Mostly ${r.variable.up}` : `Mostly ${r.variable.down}`) : 'No clear trend';
  badge.className = `trend-badge ${s.opposite ? 'weak' : changing ? 'strong' : 'none'}`;

  const parts: string[] = [];
  parts.push(`Across ${s.cells} NASA POWER cells, ${r.variable.label.toLowerCase()} rose significantly in ${s.upSignificant} and fell significantly in ${s.downSignificant}, after correcting for testing every cell. The other ${s.notSignificant} show no trend we can tell apart from year-to-year noise.`);
  if (s.opposite) parts.push('The same variable is moving in opposite directions inside one box: a regional average would hide both signals.');
  if (s.areaMean) parts.push(`The area-weighted mean of the whole box changes by ${sign(s.areaMean.senPerDecade)}${fmt(s.areaMean.senPerDecade, d)} ${r.variable.unit} per decade (Mann–Kendall p ${s.areaMean.p < 0.001 ? '< 0.001' : `= ${fmt(s.areaMean.p, 3)}`}).`);
  $('map-summary').textContent = parts.join(' ');

  const stats = $('map-stats');
  stats.replaceChildren();
  const rows: [string, string][] = [
    ['Cells tested', `${s.cells} (${r.grid.rows} × ${r.grid.cols})`],
    ['Cell size', `${r.grid.dLat}° × ${r.grid.dLon}°`],
    [`Significant ${r.variable.up}`, String(s.upSignificant)],
    [`Significant ${r.variable.down}`, String(s.downSignificant)],
    ['Median cell slope', `${sign(s.medianSlope)}${fmt(s.medianSlope, d)} ${r.variable.unit}/dec`],
    ['Area-mean slope', s.areaMean ? `${sign(s.areaMean.senPerDecade)}${fmt(s.areaMean.senPerDecade, d)} ${r.variable.unit}/dec` : '—'],
    ['Strongest rise', s.maxCell ? `${sign(s.maxCell.slope)}${fmt(s.maxCell.slope, d)} at ${coord(s.maxCell.lat, s.maxCell.lon)}` : '—'],
    ['Strongest fall', s.minCell ? `${sign(s.minCell.slope)}${fmt(s.minCell.slope, d)} at ${coord(s.minCell.lat, s.minCell.lon)}` : '—'],
  ];
  for (const [dt, dd] of rows) {
    const div = document.createElement('div');
    const t = document.createElement('dt'); t.textContent = dt;
    const v = document.createElement('dd'); v.textContent = dd;
    div.append(t, v);
    stats.appendChild(div);
  }
  fillList('map-method', r.method);
  $('map-source').textContent = `Data: ${r.source.name} / ${r.source.dataset}, accessed ${new Date(r.source.accessed).toLocaleDateString()}. Base map: NASA GIBS Blue Marble and coastlines. U.S. Government work (NASA); acknowledgement requested.`;
  $<HTMLAnchorElement>('map-api').href = r.source.request;

  const b = r.bbox;
  const stage = $('map-stage');
  stage.style.aspectRatio = `${(b.east - b.west).toFixed(3)} / ${(b.north - b.south).toFixed(3)}`;
  const px = 1024;
  const pxH = Math.round(px * (b.north - b.south) / (b.east - b.west));
  const wms = (layer: string, fmtType: string) => `${GIBS}?${new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', CRS: 'EPSG:4326',
    BBOX: `${b.south},${b.west},${b.north},${b.east}`, WIDTH: String(px), HEIGHT: String(pxH), FORMAT: fmtType,
    ...(fmtType === 'image/png' ? { TRANSPARENT: 'TRUE' } : {}),
  })}`;
  $<HTMLImageElement>('map-base').src = wms('BlueMarble_ShadedRelief_Bathymetry', 'image/jpeg');
  $<HTMLImageElement>('map-coast').src = wms('Coastlines_15m', 'image/png');
  requestAnimationFrame(drawMap);
}

function palette(id: VariableId) {
  const info = variableById(id);
  const wet = info.group === 'Water' || ['humidity', 'qv2m', 't2mdew', 'cloud'].includes(id);
  return wet
    ? { pos: [24, 104, 179], neg: [176, 102, 22] }   // wetter = blue, drier = brown
    : { pos: [210, 52, 28], neg: [33, 102, 172] };   // more = red, less = blue
}

function scaleLimit(cells: MapCell[]) {
  const mags = cells.map((c) => Math.abs(c.slope)).sort((a, b) => a - b);
  return mags[Math.min(mags.length - 1, Math.floor(mags.length * 0.95))] || mags[mags.length - 1] || 1;
}

function drawMap() {
  const r = mapData;
  const canvas = $<HTMLCanvasElement>('map-canvas');
  if (!r || $('map-result').hidden) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const w = rect.width, h = rect.height;
  mapGeom = { w, h };
  const b = r.bbox;
  const X = (lon: number) => ((lon - b.west) / (b.east - b.west)) * w;
  const Y = (lat: number) => ((b.north - lat) / (b.north - b.south)) * h;
  const lim = scaleLimit(r.cells);
  const pal = palette(r.variable.id);
  const { dLat, dLon } = r.grid;

  for (const c of r.cells) {
    const t = Math.max(-1, Math.min(1, c.slope / lim));
    const col = t >= 0 ? pal.pos : pal.neg;
    const a = (c.significant ? 0.2 + 0.46 * Math.abs(t) : 0.04 + 0.2 * Math.abs(t));
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
    const x0 = X(c.lon - dLon / 2), x1 = X(c.lon + dLon / 2);
    const y0 = Y(c.lat + dLat / 2), y1 = Y(c.lat - dLat / 2);
    ctx.fillRect(x0, y0, x1 - x0 + 0.5, y1 - y0 + 0.5);
  }
  // Stipple the cells whose trend survives the false-discovery correction.
  const cellW = (dLon / (b.east - b.west)) * w;
  const cellH = (dLat / (b.north - b.south)) * h;
  const rad = Math.max(1.2, Math.min(cellW, cellH) * 0.13);
  for (const c of r.cells) {
    if (!c.significant) continue;
    ctx.beginPath();
    ctx.arc(X(c.lon), Y(c.lat), rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,12,16,.78)';
    ctx.fill();
  }
  // The place the viewer asked about.
  const px = X(r.place.lon), py = Y(r.place.lat);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(12,12,16,.9)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '600 11px "Monaspace Krypton", ui-monospace, monospace';
  const label = r.place.name.toUpperCase();
  const tw = ctx.measureText(label).width;
  const lx = Math.min(w - tw - 10, Math.max(4, px + 12)), ly = Math.max(14, py - 10);
  ctx.fillStyle = 'rgba(12,12,16,.78)';
  ctx.fillRect(lx - 4, ly - 11, tw + 8, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, lx, ly + 1);

  // Legend
  const d = decimalsFor(r.variable.id);
  const neg = `rgb(${pal.neg.join(',')})`, pos = `rgb(${pal.pos.join(',')})`;
  $('map-legend-bar').style.background = `linear-gradient(90deg, ${neg}, rgba(255,255,255,.35) 50%, ${pos})`;
  $('map-legend-lo').textContent = `−${fmt(lim, d)}`;
  $('map-legend-hi').textContent = `+${fmt(lim, d)} ${r.variable.unit}/decade`;
}

function cellAt(ev: PointerEvent | MouseEvent): MapCell | null {
  const r = mapData;
  if (!r || !mapGeom) return null;
  const rect = (ev.target as HTMLElement).getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const b = r.bbox;
  const lon = b.west + (x / rect.width) * (b.east - b.west);
  const lat = b.north - (y / rect.height) * (b.north - b.south);
  let best: MapCell | null = null, dist = Infinity;
  for (const c of r.cells) {
    const dx = (c.lon - lon) / r.grid.dLon, dy = (c.lat - lat) / r.grid.dLat;
    const dd = dx * dx + dy * dy;
    if (dd < dist) { dist = dd; best = c; }
  }
  return dist <= 0.5 ? best : null;
}

function downloadMapCsv() {
  if (!mapData) return;
  const r = mapData;
  const lines = [
    `# ATLAS EARTH trend map · ${r.variable.label} (${r.variable.unit}) · ${r.place.name} · ${r.period.start}-${r.period.end}`,
    `# Box: ${r.bbox.south},${r.bbox.west} to ${r.bbox.north},${r.bbox.east} · NASA POWER regional, accessed ${r.source.accessed}`,
    '# Test per cell: max(p) of classic and Hamed & Rao autocorrelation-corrected Mann-Kendall; Benjamini-Hochberg FDR across all cells',
    'lat,lon,sen_per_decade,p_conservative,q_fdr,significant_after_fdr,period_mean,years',
    ...r.cells.map((c) => [c.lat, c.lon, c.slope, c.p, c.q, c.significant, c.mean, c.n].map(csvCell).join(',')),
  ];
  save(lines.join('\n'), `atlas-map-${r.variable.id}-${slug(r.place.name)}-${r.period.start}-${r.period.end}.csv`);
}

/* --------------------------------------------------------------------------------------------- */

function fillList(id: string, items: string[]) {
  const ul = $(id);
  ul.replaceChildren();
  for (const t of items) {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  }
}
function list(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const sign = (v: number) => (v > 0 ? '+' : '');
const fmtLat = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
const coord = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'place';
function csvCell(v: unknown) {
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function save(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
