import { HttpError } from './_nebius.js';
import { VARIABLES, VARIABLE_IDS, annualize, analyse, type VariableDef, type VariableId, type MonthlyPoint } from './_trends.js';
import { fdr, mannKendall, senSlope } from './_stats.js';

/**
 * Two detective tools built on NASA POWER:
 *
 * 1. sweep()     – "What is changing here?" Every POWER variable at one place, tested at once, with
 *                  Benjamini–Hochberg false-discovery correction so 29 tests do not produce
 *                  chance "discoveries".
 * 2. trendMap()  – "Where is it changing?" Sen's slope and Mann–Kendall in every NASA POWER grid
 *                  cell of a 2°–10° box (the POWER regional endpoint), again FDR-corrected, so a
 *                  variable that rises in one part of a region and falls in another shows both.
 */

const UA = { 'User-Agent': 'ATLAS-EARTH/1.1 (NASA Space Apps 2026, Team Ace Azael)' };
const FILL = -999;

const POWER_VARS = VARIABLE_IDS.filter((id) => VARIABLES[id].source !== 'water');

function monthlyFrom(raw: Record<string, number>, fill: number): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{6}$/.test(key) || key.endsWith('13')) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value === fill) continue;
    out.push({ t: `${key.slice(0, 4)}-${key.slice(4, 6)}`, v: value });
  }
  return out.sort((a, b) => (a.t < b.t ? -1 : 1));
}

/* ---------------------------------------------------------------------------------------------
 * Sweep: all variables at one place
 * ------------------------------------------------------------------------------------------- */

export interface SweepItem {
  id: VariableId;
  label: string;
  short: string;
  group: string;
  unit: string;
  description: string;
  up: string;
  down: string;
  n: number;
  mean: number;
  senPerDecade: number;
  senCi95PerDecade: [number, number];
  changeAbs: number;
  changePct: number | null;
  p: number;
  pModified: number;
  q: number;
  tau: number;
  /** Significant after false-discovery correction across every variable tested here. */
  significant: boolean;
  /** Significant under the plain test only (before FDR). */
  nominal: boolean;
  changeYear: number | null;
  series: { year: number; v: number }[];
}

export interface SweepResult {
  place: { name: string; lat: number; lon: number };
  period: { start: number; end: number };
  tested: number;
  significant: number;
  nominal: number;
  items: SweepItem[];
  failed: string[];
  source: { name: string; dataset: string; url: string; requests: string[]; accessed: string };
  method: string[];
}

async function pointBatch(params: string[], lat: number, lon: number, start: number, end: number) {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point');
  url.searchParams.set('parameters', params.join(','));
  url.searchParams.set('community', 'AG');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('format', 'JSON');
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(28_000) });
  if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, `NASA POWER answered ${res.status}`);
  const json = (await res.json()) as {
    header?: { fill_value?: number };
    properties?: { parameter?: Record<string, Record<string, number>> };
  };
  return { url: url.toString(), fill: json.header?.fill_value ?? FILL, data: json.properties?.parameter ?? {} };
}

const sweepCache = new Map<string, { at: number; data: SweepResult }>();

export async function sweep(opts: { lat: number; lon: number; start: number; end: number; name?: string }): Promise<SweepResult> {
  const lat = Math.round(opts.lat * 1000) / 1000;
  const lon = Math.round(opts.lon * 1000) / 1000;
  const key = `${lat}:${lon}:${opts.start}:${opts.end}`;
  const hit = sweepCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return { ...hit.data, place: { ...hit.data.place, name: cleanName(opts.name, lat, lon) } };

  const defs = POWER_VARS.map((id) => VARIABLES[id]);
  // A POWER point request accepts up to 25 parameters: two requests cover the catalogue.
  const batches: VariableDef[][] = [defs.slice(0, 15), defs.slice(15)];
  const replies = await Promise.allSettled(batches.map((b) => pointBatch(b.map((d) => d.power), lat, lon, opts.start, opts.end)));
  const ok = replies.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof pointBatch>>> => r.status === 'fulfilled');
  if (!ok.length) {
    const first = replies.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw new HttpError(502, first?.reason instanceof Error ? first.reason.message : 'NASA POWER is not responding');
  }

  const rows: Omit<SweepItem, 'q' | 'significant'>[] = [];
  const failed: string[] = [];
  for (const def of defs) {
    const reply = ok.find((r) => r.value.data[def.power]);
    const raw = reply?.value.data[def.power];
    if (!raw) { failed.push(def.label); continue; }
    const annual = annualize(monthlyFrom(raw, reply!.value.fill), def);
    const stats = analyse(annual);
    if (!stats) { failed.push(def.label); continue; }
    // Variables that never change (for example snow in the tropics) have no trend to test.
    const spread = Math.max(...annual.map((a) => a.v)) - Math.min(...annual.map((a) => a.v));
    if (!(spread > 0)) { failed.push(`${def.label} (constant here)`); continue; }
    rows.push({
      id: def.id, label: def.label, short: def.short, group: def.group, unit: def.annualUnit,
      description: def.description, up: def.up, down: def.down,
      n: stats.n, mean: stats.mean,
      senPerDecade: stats.senPerDecade,
      senCi95PerDecade: [stats.senCi95[0] * 10, stats.senCi95[1] * 10],
      changeAbs: stats.changeAbs, changePct: stats.changePct,
      p: stats.mk.p, pModified: stats.mkModified.p, tau: stats.mk.tau,
      nominal: stats.mk.p < 0.05,
      changeYear: stats.changePoint?.significant ? stats.changePoint.year : null,
      series: annual.map((a) => ({ year: a.year, v: a.v })),
    });
  }
  // A trend only counts if it passes both the classic test and the autocorrelation-corrected
  // one, so FDR runs on the larger of the two p-values: the conservative choice.
  const q = fdr(rows.map((r) => Math.max(r.p, r.pModified)));
  const items: SweepItem[] = rows.map((r, i) => ({ ...r, q: q[i], significant: q[i] < 0.05 }))
    .sort((a, b) => (a.q - b.q) || (Math.abs(b.tau) - Math.abs(a.tau)));

  const data: SweepResult = {
    place: { name: cleanName(opts.name, lat, lon), lat, lon },
    period: { start: opts.start, end: opts.end },
    tested: items.length,
    significant: items.filter((i) => i.significant).length,
    nominal: items.filter((i) => i.nominal).length,
    items,
    failed,
    source: {
      name: 'NASA POWER',
      dataset: 'MERRA-2 monthly via NASA POWER, community AG, single grid cell',
      url: 'https://power.larc.nasa.gov/',
      requests: ok.map((r) => r.value.url),
      accessed: new Date().toISOString(),
    },
    method: [
      'Each variable is reduced to one value per year (day-weighted mean, or yearly total for rain, snow, evaporation, frost and degree days).',
      "Trend size: Sen's slope per decade with its non-parametric 95% interval.",
      'Trend test: Mann–Kendall and the Hamed & Rao (1998) version corrected for year-to-year autocorrelation. A variable must pass both, so the larger p-value is used.',
      `Many tests at once: Benjamini–Hochberg false-discovery correction across all ${items.length} variables (q < 0.05). Testing ${items.length} variables at p < 0.05 would otherwise expect about ${(items.length * 0.05).toFixed(1)} false alarms.`,
    ],
  };
  sweepCache.set(key, { at: Date.now(), data });
  if (sweepCache.size > 100) sweepCache.delete(sweepCache.keys().next().value as string);
  return data;
}

function cleanName(name: string | undefined, lat: number, lon: number) {
  const n = (name || '').replace(/[<>]/g, '').trim().slice(0, 80);
  return n || `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

/* ---------------------------------------------------------------------------------------------
 * Trend map: every grid cell in a box
 * ------------------------------------------------------------------------------------------- */

export interface MapCell {
  lat: number;
  lon: number;
  slope: number;   // per decade, annual units
  p: number;
  q: number;
  significant: boolean;
  mean: number;
  n: number;
}

export interface TrendMapResult {
  variable: { id: VariableId; label: string; short: string; unit: string; up: string; down: string; description: string };
  place: { name: string; lat: number; lon: number };
  bbox: { south: number; north: number; west: number; east: number };
  grid: { dLat: number; dLon: number; rows: number; cols: number };
  period: { start: number; end: number };
  cells: MapCell[];
  summary: {
    cells: number;
    upSignificant: number;
    downSignificant: number;
    notSignificant: number;
    medianSlope: number;
    maxCell: MapCell | null;
    minCell: MapCell | null;
    /** Area-mean series (cos-latitude weighted) and its own trend. */
    areaMean: { senPerDecade: number; p: number; series: { year: number; v: number }[] } | null;
    opposite: boolean;
  };
  source: { name: string; dataset: string; url: string; request: string; accessed: string };
  method: string[];
}

const mapCache = new Map<string, { at: number; data: TrendMapResult }>();

export async function trendMap(opts: {
  variable: VariableId; lat: number; lon: number; span: number; start: number; end: number; name?: string;
}): Promise<TrendMapResult> {
  const def = VARIABLES[opts.variable];
  if (!def || def.source === 'water') throw new HttpError(400, 'Choose a NASA POWER variable: streamflow is a ground gauge, not a grid.');
  const span = Math.max(2, Math.min(10, opts.span));
  const half = span / 2;
  let south = Math.max(-90, opts.lat - half), north = Math.min(90, opts.lat + half);
  if (north - south < 2) { if (south <= -90) north = south + 2; else south = north - 2; }
  let west = opts.lon - half, east = opts.lon + half;
  if (west < -180) { east += -180 - west; west = -180; }
  if (east > 180) { west -= east - 180; east = 180; }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  south = r2(south); north = r2(north); west = r2(west); east = r2(east);

  const key = `${def.id}:${south}:${north}:${west}:${east}:${opts.start}:${opts.end}`;
  const hit = mapCache.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return { ...hit.data, place: { ...hit.data.place, name: cleanName(opts.name, opts.lat, opts.lon) } };

  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/regional');
  url.searchParams.set('parameters', def.power);
  url.searchParams.set('community', 'AG');
  url.searchParams.set('latitude-min', String(south));
  url.searchParams.set('latitude-max', String(north));
  url.searchParams.set('longitude-min', String(west));
  url.searchParams.set('longitude-max', String(east));
  url.searchParams.set('start', String(opts.start));
  url.searchParams.set('end', String(opts.end));
  url.searchParams.set('format', 'JSON');
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) {
    let why = '';
    try { const j = await res.json() as { messages?: string[] }; why = j.messages?.length ? `: ${j.messages.join('; ')}` : ''; } catch { /* ignore */ }
    throw new HttpError(res.status === 429 ? 429 : 502, `NASA POWER regional answered ${res.status}${why}`);
  }
  const json = (await res.json()) as {
    header?: { fill_value?: number };
    features?: { geometry: { coordinates: number[] }; properties: { parameter: Record<string, Record<string, number>> } }[];
  };
  const fill = json.header?.fill_value ?? FILL;
  const feats = json.features ?? [];
  if (!feats.length) throw new HttpError(502, 'NASA POWER returned no grid cells for this box');

  const raw: { lat: number; lon: number; annual: { year: number; v: number }[]; stats: ReturnType<typeof analyse> }[] = [];
  for (const f of feats) {
    const [lon, lat] = f.geometry.coordinates;
    const series = f.properties?.parameter?.[def.power];
    if (!series) continue;
    const annual = annualize(monthlyFrom(series, fill), def);
    const spread = annual.length ? Math.max(...annual.map((a) => a.v)) - Math.min(...annual.map((a) => a.v)) : 0;
    const stats = spread > 0 ? analyse(annual) : null;
    raw.push({ lat, lon, annual: annual.map((a) => ({ year: a.year, v: a.v })), stats });
  }
  const tested = raw.filter((r) => r.stats);
  if (!tested.length) throw new HttpError(422, `${def.label} does not vary in this box, so there is no trend to map.`);
  // Conservative: each cell uses the larger of the classic and autocorrelation-corrected p.
  const pCell = tested.map((r) => Math.max(r.stats!.mk.p, r.stats!.mkModified.p));
  const q = fdr(pCell);
  const cells: MapCell[] = tested.map((r, i) => ({
    lat: r.lat, lon: r.lon,
    slope: r.stats!.senPerDecade,
    p: pCell[i],
    q: q[i],
    significant: q[i] < 0.05,
    mean: r.stats!.mean,
    n: r.stats!.n,
  }));

  const lats = [...new Set(cells.map((c) => c.lat))].sort((a, b) => a - b);
  const lons = [...new Set(cells.map((c) => c.lon))].sort((a, b) => a - b);
  const step = (v: number[], d: number) => v.length > 1 ? Math.min(...v.slice(1).map((x, i) => x - v[i])) : d;

  // Area mean: cos(latitude)-weighted average of every cell, year by year.
  const years = new Map<number, { s: number; w: number; c: number }>();
  for (const r of raw) {
    const w = Math.cos(r.lat * Math.PI / 180);
    for (const a of r.annual) {
      const e = years.get(a.year) ?? { s: 0, w: 0, c: 0 };
      e.s += a.v * w; e.w += w; e.c += 1;
      years.set(a.year, e);
    }
  }
  const areaSeries = [...years.entries()].filter(([, e]) => e.c === raw.length).sort((a, b) => a[0] - b[0])
    .map(([year, e]) => ({ year, v: e.s / e.w }));
  let areaMean: TrendMapResult['summary']['areaMean'] = null;
  if (areaSeries.length >= 10) {
    const x = areaSeries.map((a) => a.year), y = areaSeries.map((a) => a.v);
    areaMean = { senPerDecade: senSlope(x, y).slope * 10, p: mannKendall(y).p, series: areaSeries };
  }

  const sorted = [...cells].sort((a, b) => a.slope - b.slope);
  const upSig = cells.filter((c) => c.significant && c.slope > 0).length;
  const downSig = cells.filter((c) => c.significant && c.slope < 0).length;
  const data: TrendMapResult = {
    variable: { id: def.id, label: def.label, short: def.short, unit: def.annualUnit, up: def.up, down: def.down, description: def.description },
    place: { name: cleanName(opts.name, opts.lat, opts.lon), lat: opts.lat, lon: opts.lon },
    bbox: { south, north, west, east },
    grid: { dLat: step(lats, 0.5), dLon: step(lons, 0.625), rows: lats.length, cols: lons.length },
    period: { start: opts.start, end: opts.end },
    cells,
    summary: {
      cells: cells.length,
      upSignificant: upSig,
      downSignificant: downSig,
      notSignificant: cells.length - upSig - downSig,
      medianSlope: sorted[sorted.length >> 1]?.slope ?? 0,
      maxCell: sorted[sorted.length - 1] ?? null,
      minCell: sorted[0] ?? null,
      areaMean,
      opposite: sorted[0].slope < 0 && sorted[sorted.length - 1].slope > 0 && upSig > 0 && downSig > 0,
    },
    source: {
      name: 'NASA POWER',
      dataset: 'MERRA-2 monthly via the NASA POWER regional endpoint (about 0.5° × 0.625° cells)',
      url: 'https://power.larc.nasa.gov/',
      request: url.toString(),
      accessed: new Date().toISOString(),
    },
    method: [
      `${cells.length} NASA POWER grid cells, each reduced to one value per year.`,
      "Colour: Sen's slope per decade in each cell. Dots: the trend is significant after correction.",
      'Each cell must pass both the classic Mann–Kendall test and the Hamed & Rao (1998) autocorrelation-corrected version; the larger p-value is used.',
      `Benjamini–Hochberg false-discovery correction across all ${cells.length} cells (q < 0.05), so neighbouring cells do not pass by chance.`,
      'Area mean: cos(latitude)-weighted average of every cell, with its own Sen slope and Mann–Kendall p.',
    ],
  };
  mapCache.set(key, { at: Date.now(), data });
  if (mapCache.size > 60) mapCache.delete(mapCache.keys().next().value as string);
  return data;
}
