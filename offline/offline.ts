// ATLAS · offline preview shim.
// Only bundled into the offline preview build (vite.offline.config.ts). The preview page cannot
// reach the network, so /api/trends answers from NASA POWER records captured on 18 Nov 2026
// through the same API code, and re-runs the same analysis (annualize + analyse) for whatever
// window the dials select. Anything not recorded says so plainly.
import { annualize, analyse } from '../api/_trends';

const RECORDED = '18 Nov 2026';
const realFetch = window.fetch.bind(window);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const PRESET_NOTE = 'Offline preview: recorded NASA POWER data covers the seven preset places (press a preset key on PNL 03). The live build answers anywhere on Earth.';

function key(v: string, lat: number, lon: number, mode: string) {
  return `${v}_${mode}_${lat.toFixed(3)}_${lon.toFixed(3)}`.replace(/-/g, 'm');
}

interface Rec {
  variable: { id: string; aggregate: 'mean' | 'sum'; [k: string]: unknown };
  place: { lat: number; lon: number; mode: 'point' | 'region'; samples: number };
  monthly: [string, number][];
  source: Record<string, string>;
  notes: string[];
}
// All recordings ship as one file, fetched once.
let all: Promise<Record<string, Rec>> | null = null;
async function load(k: string): Promise<Rec | null> {
  all ??= realFetch('./data/trends.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return (await all)[k] ?? null;
}

async function trends(u: URL) {
  const q = u.searchParams;
  const view = q.get('view');
  if (view === 'sweep' || view === 'map') {
    const isCase = view === 'sweep'
      ? Math.abs(Number(q.get('lat')) - 17.385) < 0.01 && Math.abs(Number(q.get('lon')) - 78.487) < 0.01 && q.get('start') === '1996' && q.get('end') === '2025'
      : q.get('variable') === 'humidity' && Math.abs(Number(q.get('lat')) - 17.9) < 0.01 && Math.abs(Number(q.get('lon')) - 79.6) < 0.01 && q.get('span') === '10' && q.get('start') === '1996' && q.get('end') === '2025';
    if (!isCase) return json({ error: `Offline preview: ${view === 'map' ? 'Map the change' : 'Scan all variables'} is recorded only for its case file (PNL 01, Case ${view === 'map' ? 2 : 1}). The live build runs it for any place.` }, 404);
    const r = await realFetch(`./data/${view === 'map' ? 'map_telangana_humidity' : 'sweep_hyderabad'}.json`);
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  const v = q.get('variable') || 't2m';
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  const mode = q.get('mode') === 'region' ? 'region' : 'point';
  const start = Number(q.get('start')) || 1996, end = Number(q.get('end')) || 2025;
  if (v === 'streamflow') return json({ error: 'Offline preview: streamflow comes from live USGS / ECCC gauges and is not recorded. Pick another sensor.' }, 404);
  const rec = await load(key(v, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, mode));
  if (!rec) return json({ error: PRESET_NOTE }, 404);
  // Recorded server refusals (e.g. no NASA POWER values over the ice sheet) replay as they were.
  if ((rec as unknown as { error?: string }).error) return json({ error: (rec as unknown as { error: string }).error }, 422);
  const monthly = rec.monthly.filter(([t]) => { const y = Number(t.slice(0, 4)); return y >= start && y <= end; }).map(([t, val]) => ({ t, v: val }));
  // Same functions the server uses, so every statistic matches the live build.
  const annual = annualize(monthly, rec.variable as never);
  const stats = analyse(annual);
  const name = (q.get('name') || '').slice(0, 80);
  return json({
    variable: rec.variable,
    place: { name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat: rec.place.lat, lon: rec.place.lon, mode: rec.place.mode, samples: rec.place.samples },
    period: { start, end, years: annual.length },
    series: { monthly, annual },
    stats,
    source: { ...rec.source, accessed: '2026-11-18T10:30:00.000Z', note: `${rec.source.note} Offline preview: recorded ${RECORDED}.` },
    notes: [...rec.notes, `Offline preview: NASA POWER values recorded ${RECORDED}; statistics recomputed in the browser with ATLAS's own code.`],
  });
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(raw, location.href);
  if (u.origin === location.origin && u.pathname.endsWith('/api/trends')) return trends(u);
  if (u.origin === location.origin && u.pathname.endsWith('/api/status')) return json({ provider: null, label: null, explain: null, keyless: null, earth: null, search: false, fallbacks: [], listed: [] });
  if (u.origin === location.origin && u.pathname.endsWith('/api/geocode')) return json({ error: `Offline preview: place search needs the network. ${PRESET_NOTE}` }, 503);
  if (u.origin === location.origin && u.pathname.includes('/api/')) return json({ error: 'Offline preview: this service needs the live build.' }, 503);
  return realFetch(input, init);
};

document.documentElement.dataset.offline = '1';
window.addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.className = 'offline-banner';
  b.innerHTML = '<b>OFFLINE PREVIEW</b><span>Real NASA POWER records captured 18 Nov 2026 for the 7 preset places · every dial, test and lamp is live · the Trends station works offline; other stations need the live build</span>';
  document.body.append(b);
});
