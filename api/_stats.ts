/**
 * Trend statistics for ATLAS EARTH, written out in full so every number can be checked.
 *
 * - Mann–Kendall S, tie-corrected variance, continuity-corrected z and two-sided p.
 * - Hamed & Rao (1998) variance correction for serial correlation (the "modified" Mann–Kendall).
 * - Sen's slope with its non-parametric 95% interval (Gilbert 1987, as in scipy.stats.theilslopes).
 * - Pettitt (1979) change-point test.
 * - Benjamini–Hochberg (1995) false-discovery-rate q-values, for when many tests run at once.
 *
 * Verified against pymannkendall 1.4 and scipy (see tools/verify_stats.py).
 */

/** Standard normal CDF via the Abramowitz–Stegun 7.1.26 error-function approximation. */
export function normalCdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const Z975 = 1.959963984540054;

function median(sorted: number[]) {
  const n = sorted.length;
  if (!n) return Number.NaN;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Round half to even, so interval ranks match numpy's np.round. */
function roundEven(v: number) {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export function mkScore(y: number[]) {
  const n = y.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(y[j] - y[i]);
  return s;
}

export function mkVariance(y: number[]) {
  const n = y.length;
  const counts = new Map<number, number>();
  for (const v of y) counts.set(v, (counts.get(v) ?? 0) + 1);
  let v = (n * (n - 1) * (2 * n + 5)) / 18;
  for (const t of counts.values()) if (t > 1) v -= (t * (t - 1) * (2 * t + 5)) / 18;
  return v;
}

function zScore(s: number, varS: number) {
  if (!(varS > 0)) return 0;
  if (s > 0) return (s - 1) / Math.sqrt(varS);
  if (s < 0) return (s + 1) / Math.sqrt(varS);
  return 0;
}

export function twoSidedP(z: number) {
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))));
}

export interface SenResult { slope: number; intercept: number; ci95: [number, number] }

/** Sen's slope (median pairwise slope) and its 95% interval, following scipy.stats.theilslopes. */
export function senSlope(x: number[], y: number[]): SenResult {
  const n = y.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]));
  }
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const intercept = median(y.map((v, i) => v - slope * x[i]).sort((a, b) => a - b));
  // Variance of S with tie corrections for x (years, normally unique) and y.
  const counts = new Map<number, number>();
  for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
  let sigsq = n * (n - 1) * (2 * n + 5);
  for (const k of counts.values()) if (k > 1) sigsq -= k * (k - 1) * (2 * k + 5);
  // Sen (1968) eq. 2.6 also removes tied y values.
  const yCounts = new Map<number, number>();
  for (const v of y) yCounts.set(v, (yCounts.get(v) ?? 0) + 1);
  for (const k of yCounts.values()) if (k > 1) sigsq -= k * (k - 1) * (2 * k + 5);
  const sigma = Math.sqrt(sigsq / 18);
  const nt = slopes.length;
  // Gilbert (1987): the lower limit is the M1-th ordered slope, the upper the (M2 + 1)-th.
  const lower = Math.max(roundEven((nt - Z975 * sigma) / 2) - 1, 0);
  const upper = Math.min(roundEven((nt + Z975 * sigma) / 2), nt - 1);
  return { slope, intercept, ci95: [slopes[lower], slopes[upper]] };
}

function ranks(values: number[]) {
  const idx = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

function acf(x: number[], nlags: number) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const y = x.map((v) => v - mean);
  const out: number[] = [];
  let c0 = 0;
  for (const v of y) c0 += v * v;
  for (let k = 0; k <= nlags; k++) {
    let c = 0;
    for (let i = 0; i + k < n; i++) c += y[i] * y[i + k];
    out.push(c0 > 0 ? c / c0 : 0);
  }
  return out;
}

export interface MannKendall {
  s: number; varS: number; z: number; p: number; tau: number; significant: boolean;
}

export interface ModifiedMannKendall {
  /** n / n* from Hamed & Rao: above 1 means positive autocorrelation inflated the plain test. */
  varianceFactor: number;
  z: number; p: number; significant: boolean;
  lag1: number;
}

export function mannKendall(y: number[]): MannKendall {
  const n = y.length;
  const s = mkScore(y);
  const varS = mkVariance(y);
  const z = zScore(s, varS);
  const p = twoSidedP(z);
  return { s, varS, z, p, tau: n > 1 ? s / (n * (n - 1) / 2) : 0, significant: p < 0.05 };
}

/** Hamed & Rao (1998): detrend with Sen's slope, rank, keep significant lags, inflate Var(S). */
export function hamedRao(x: number[], y: number[], mk: MannKendall, sen: SenResult): ModifiedMannKendall {
  const n = y.length;
  // A constant offset does not change ranks, so detrending by slope × year matches
  // pymannkendall's slope × index for consecutive years and stays correct across gaps.
  const detrended = y.map((v, i) => v - sen.slope * x[i]);
  const r = ranks(detrended);
  const rho = acf(r, n - 1);
  const bound = Z975 / Math.sqrt(n);
  let sum = 0;
  for (let k = 1; k < n; k++) {
    if (rho[k] > bound || rho[k] < -bound) sum += (n - k) * (n - k - 1) * (n - k - 2) * rho[k];
  }
  const factor = 1 + (2 / (n * (n - 1) * (n - 2))) * sum;
  const varS = mk.varS * factor;
  const z = zScore(mk.s, varS);
  const p = twoSidedP(z);
  return { varianceFactor: factor, z, p, significant: p < 0.05, lag1: acf(y, 1)[1] };
}

export interface ChangePoint {
  /** First year of the "after" segment. */
  year: number;
  k: number; p: number; significant: boolean;
  before: number; after: number;
}

/** Pettitt (1979) non-parametric single change-point test with its approximate p-value. */
export function pettitt(x: number[], y: number[]): ChangePoint | null {
  const n = y.length;
  if (n < 6) return null;
  let best = -1, at = 0;
  for (let t = 0; t < n - 1; t++) {
    let u = 0;
    for (let i = 0; i <= t; i++) for (let j = t + 1; j < n; j++) u += Math.sign(y[i] - y[j]);
    if (Math.abs(u) > best) { best = Math.abs(u); at = t; }
  }
  const p = Math.min(1, 2 * Math.exp((-6 * best * best) / (n ** 3 + n ** 2)));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    year: x[at + 1], k: best, p, significant: p < 0.05,
    before: mean(y.slice(0, at + 1)), after: mean(y.slice(at + 1)),
  };
}

/** Benjamini–Hochberg q-values for a list of p-values (NaN stays NaN). */
export function fdr(pvalues: number[]): number[] {
  const items = pvalues.map((p, i) => ({ p, i })).filter((e) => Number.isFinite(e.p));
  const m = items.length;
  const out = pvalues.map(() => Number.NaN);
  items.sort((a, b) => a.p - b.p);
  let min = 1;
  for (let k = m - 1; k >= 0; k--) {
    const q = Math.min(1, (items[k].p * m) / (k + 1));
    min = Math.min(min, q);
    out[items[k].i] = min;
  }
  return out;
}
