import { send, HttpError } from './_nebius.js';
import { trendMap } from './_explore.js';
import { VARIABLE_IDS, type VariableId } from './_trends.js';
import { readCommon } from './sweep.js';

/**
 * GET /api/trendmap?variable=t2m&lat=17.4&lon=78.5&span=8&start=1996&end=2025&name=Hyderabad
 *
 * "Where is it changing?" Sen's slope and an autocorrelation-corrected, FDR-controlled
 * Mann–Kendall test in every NASA POWER grid cell of a 2°–10° box around the place.
 */
export default async function handler(
  req: { method: string; query: Record<string, string | string[]> },
  res: { status: (n: number) => { json: (b: unknown) => void }; setHeader?: (k: string, v: string) => void },
) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'GET only');
    const variable = String(req.query.variable || 't2m') as VariableId;
    if (!VARIABLE_IDS.includes(variable)) throw new HttpError(400, `variable must be one of ${VARIABLE_IDS.join(', ')}`);
    const { lat, lon, start, end } = readCommon(req.query);
    const span = Number(req.query.span) || 8;
    const data = await trendMap({ variable, lat, lon, span, start, end, name: req.query.name ? String(req.query.name) : undefined });
    res.setHeader?.('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=2592000');
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof HttpError && err.status >= 500) res.setHeader?.('Cache-Control', 'no-store');
    send(res, err);
  }
}
