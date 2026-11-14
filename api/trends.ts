import { send, HttpError } from './_nebius.js';
import { trend, VARIABLE_IDS, type VariableId } from './_trends.js';

/**
 * GET /api/trends?variable=t2m&lat=17.385&lon=78.487&start=1996&end=2025&mode=point&name=Hyderabad
 *
 * Returns a NASA POWER monthly + annual time series, Sen's slope, Mann-Kendall significance and
 * the source metadata. Results are cached for 12 hours server-side and at the CDN.
 */
export default async function handler(
  req: { method: string; query: Record<string, string | string[]> },
  res: {
    status: (n: number) => { json: (b: unknown) => void };
    setHeader?: (k: string, v: string) => void;
  },
) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'GET only');

    const variable = String(req.query.variable || 't2m') as VariableId;
    if (!VARIABLE_IDS.includes(variable)) throw new HttpError(400, `variable must be one of ${VARIABLE_IDS.join(', ')}`);

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new HttpError(400, 'lat must be between -90 and 90');
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new HttpError(400, 'lon must be between -180 and 180');

    const mode = req.query.mode === 'region' ? 'region' : 'point';
    const nowYear = new Date().getUTCFullYear();
    const maxEnd = Math.min(nowYear - 1, 2025);
    const end = Number(req.query.end) || maxEnd;
    const start = Number(req.query.start) || Math.max(1981, end - 29);
    if (!Number.isInteger(start) || !Number.isInteger(end)) throw new HttpError(400, 'start and end must be years');
    if (start < 1981) throw new HttpError(400, 'NASA POWER monthly data start in 1981');
    if (end > maxEnd) throw new HttpError(400, `choose an end year of ${maxEnd} or earlier so the year is complete`);
    if (end - start < 9) throw new HttpError(400, 'choose at least 10 years');
    if (end - start > 44) throw new HttpError(400, 'choose at most 45 years');

    const data = await trend({ variable, lat, lon, start, end, mode, name: req.query.name ? String(req.query.name) : undefined });
    res.setHeader?.('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=2592000');
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof HttpError && err.status === 502) res.setHeader?.('Cache-Control', 'no-store');
    send(res, err);
  }
}
