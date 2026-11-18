// ATLAS v2 · Deep Read.
// Four extra readings of the same NASA POWER record that is already on screen:
//   Stripes   one stripe per year, coloured by its anomaly from the period mean
//   Seasons   Sen's slope + Mann–Kendall for each calendar month, BH-FDR across the 12
//   Then/Now  the average seasonal cycle of the first decade against the last
//   Records   the highest and lowest years, and how many fell in the latest decade
// Nothing here calls the network: it reads r.series, which /api/trends already returned.
import { senSlope, mannKendall, fdr } from '../api/_stats';
import { type TrendResult, decimalsFor, fmt } from './trends';

type Tab = 'stripes' | 'seasons' | 'shift' | 'records';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BLUE = '#2B44B8', DEEP = '#1D2E80', PINK = '#FF4FA3', PINK_DEEP = '#A3125C', CREAM = '#F4EFE4';

let current: TrendResult | null = null;
let tab: Tab = 'stripes';
let hit: { x0: number; x1: number; y0: number; y1: number; text: string }[] = [];
let raf = 0;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function initDeepRead() {
  const legend = document.getElementById('trend-chart-legend');
  if (!legend || document.getElementById('deep-read')) return;
  const sec = document.createElement('section');
  sec.className = 'deep-read';
  sec.id = 'deep-read';
  sec.innerHTML = `
    <div class="deep-head">
      <span class="deep-kicker">Deep read</span>
      <div class="deep-tabs" role="tablist" aria-label="Deep read views">
        <button type="button" role="tab" data-tab="stripes" aria-selected="true">Stripes</button>
        <button type="button" role="tab" data-tab="seasons" aria-selected="false">Seasons</button>
        <button type="button" role="tab" data-tab="shift" aria-selected="false">Then / now</button>
        <button type="button" role="tab" data-tab="records" aria-selected="false">Records</button>
      </div>
    </div>
    <div class="deep-stage" role="tabpanel">
      <canvas id="deep-canvas" aria-describedby="deep-caption"></canvas>
      <div class="deep-tip" id="deep-tip" hidden></div>
    </div>
    <p class="deep-caption" id="deep-caption"></p>`;
  legend.after(sec);

  const tabs = sec.querySelectorAll<HTMLButtonElement>('[data-tab]');
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.tab as Tab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      select(next.dataset.tab as Tab);
    });
  });

  const canvas = $<HTMLCanvasElement>('deep-canvas');
  const tip = $('deep-tip');
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const h = hit.find((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    if (!h) { tip.hidden = true; return; }
    tip.textContent = h.text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, x - w / 2), rect.width - w)}px`;
    tip.style.top = `${Math.max(0, y - 34)}px`;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  window.addEventListener('resize', () => { if (current) draw(false); });
}

function select(t: Tab) {
  tab = t;
  document.querySelectorAll<HTMLButtonElement>('#deep-read [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  draw(true);
}

export function renderDeepRead(r: TrendResult) {
  current = r;
  const sec = document.getElementById('deep-read');
  if (!sec) return;
  sec.hidden = r.series.annual.length < 10;
  if (!sec.hidden) draw(true);
}

// ---------- helpers ----------

function monthMatrix(r: TrendResult) {
  const byMonth: { year: number; v: number }[][] = MONTHS.map(() => []);
  for (const p of r.series.monthly) {
    const y = Number(p.t.slice(0, 4)), m = Number(p.t.slice(5, 7)) - 1;
    if (Number.isFinite(p.v) && m >= 0 && m < 12) byMonth[m].push({ year: y, v: p.v });
  }
  return byMonth;
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
function diverge(t: number) {
  // t in [-1, 1]: deep blue ← cream → deep pink
  const a = Math.min(1, Math.abs(t));
  if (t < 0) return a < 0.6 ? mix(CREAM, BLUE, a / 0.6) : mix(BLUE, DEEP, (a - 0.6) / 0.4);
  return a < 0.6 ? mix(CREAM, PINK, a / 0.6) : mix(PINK, PINK_DEEP, (a - 0.6) / 0.4);
}
const sign = (v: number, d: number) => `${v > 0 ? '+' : ''}${fmt(v, d)}`;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function setup() {
  const canvas = $<HTMLCanvasElement>('deep-canvas');
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 380, h = rect.height || 150;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--panel-text').trim() || '#120e0c';
  ctx.font = '10px "Monaspace Krypton", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  return { ctx, w, h, ink };
}

function draw(animate: boolean) {
  cancelAnimationFrame(raf);
  const r = current;
  if (!r) return;
  const caption = $('deep-caption');
  const t0 = performance.now();
  const dur = animate && !reduced() ? 650 : 0;
  const frame = () => {
    const p = dur ? ease(Math.min(1, (performance.now() - t0) / dur)) : 1;
    hit = [];
    const g = setup();
    g.ctx.clearRect(0, 0, g.w, g.h);
    const text = tab === 'stripes' ? stripes(r, g, p)
      : tab === 'seasons' ? seasons(r, g, p)
      : tab === 'shift' ? shift(r, g, p)
      : records(r, g, p);
    if (caption.textContent !== text) caption.textContent = text;
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  frame();
}

type G = ReturnType<typeof setup>;

// ---------- Stripes ----------
function stripes(r: TrendResult, { ctx, w, h, ink }: G, p: number): string {
  const a = r.series.annual.filter((x) => Number.isFinite(x.v));
  const d = decimalsFor(r.variable.id), u = r.variable.annualUnit;
  const mean = a.reduce((s, x) => s + x.v, 0) / a.length;
  const maxAbs = Math.max(...a.map((x) => Math.abs(x.v - mean))) || 1;
  const top = 6, bottom = h - 20, sw = w / a.length;
  const shown = Math.ceil(a.length * p);
  a.slice(0, shown).forEach((x, i) => {
    const an = x.v - mean;
    ctx.fillStyle = diverge(an / maxAbs);
    ctx.fillRect(Math.floor(i * sw), top, Math.ceil(sw) + 0.5, bottom - top);
    hit.push({ x0: i * sw, x1: (i + 1) * sw, y0: top, y1: bottom, text: `${x.year} · ${sign(an, d)} ${u} vs average` });
  });
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'left';
  ctx.fillText(String(a[0].year), 0, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText(String(a[a.length - 1].year), w, h - 8);
  ctx.textAlign = 'center';
  ctx.fillText(`below ◂  average ${fmt(mean, d)} ${u}  ▸ above`, w / 2, h - 8);
  ctx.globalAlpha = 1;
  const hi = a.reduce((m, x) => (x.v > m.v ? x : m));
  const lo = a.reduce((m, x) => (x.v < m.v ? x : m));
  return `Each stripe is one year, coloured by how far it sat from the ${a[0].year}–${a[a.length - 1].year} average. Highest year: ${hi.year} (${sign(hi.v - mean, d)} ${u}). Lowest: ${lo.year} (${sign(lo.v - mean, d)} ${u}). Hover a stripe for its value.`;
}

// ---------- Seasons ----------
interface MonthTrend { m: number; slope: number; p: number; q: number; n: number }
function monthTrends(r: TrendResult): MonthTrend[] {
  const mm = monthMatrix(r);
  const raw = mm.map((rows, m) => {
    if (rows.length < 10) return { m, slope: NaN, p: NaN, n: rows.length };
    const x = rows.map((o) => o.year), y = rows.map((o) => o.v);
    return { m, slope: senSlope(x, y).slope * 10, p: mannKendall(y).p, n: rows.length };
  });
  const q = fdr(raw.map((o) => o.p));
  return raw.map((o, i) => ({ ...o, q: q[i] }));
}
function seasons(r: TrendResult, { ctx, w, h, ink }: G, p: number): string {
  const t = monthTrends(r);
  const ok = t.filter((o) => Number.isFinite(o.slope));
  if (ok.length < 6) return 'Not enough monthly values to test each calendar month.';
  const d = decimalsFor(r.variable.id) + 1, u = `${r.variable.unit}/decade`;
  const maxAbs = Math.max(...ok.map((o) => Math.abs(o.slope))) || 1;
  const top = 8, bottom = h - 20, zero = (top + bottom) / 2, half = (bottom - top) / 2 - 2;
  const bw = w / 12;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(0, zero); ctx.lineTo(w, zero); ctx.stroke();
  ctx.globalAlpha = 1;
  t.forEach((o, i) => {
    const x = i * bw + bw * 0.18, bwi = bw * 0.64;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.6;
    ctx.textAlign = 'center';
    ctx.fillText(MONTHS[i][0], i * bw + bw / 2, h - 8);
    ctx.globalAlpha = 1;
    if (!Number.isFinite(o.slope)) return;
    const len = (o.slope / maxAbs) * half * p;
    const y = len >= 0 ? zero - len : zero;
    const hgt = Math.max(1, Math.abs(len));
    const sig = o.q < 0.05;
    if (sig) {
      ctx.fillStyle = o.slope >= 0 ? PINK : BLUE;
      ctx.fillRect(x, y, bwi, hgt);
    } else {
      ctx.strokeStyle = o.slope >= 0 ? PINK : BLUE;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.6, y + 0.6, bwi - 1.2, Math.max(0, hgt - 1.2));
    }
    hit.push({ x0: i * bw, x1: (i + 1) * bw, y0: top, y1: bottom, text: `${MONTHS[i]} · ${sign(o.slope, d)} ${u} · p ${o.p < 0.001 ? '<0.001' : fmt(o.p, 3)} · q ${o.q < 0.001 ? '<0.001' : fmt(o.q, 3)}` });
  });
  const sig = ok.filter((o) => o.q < 0.05);
  const fast = ok.reduce((m, o) => (Math.abs(o.slope) > Math.abs(m.slope) ? o : m));
  return `Sen's slope for each calendar month on its own (solid = significant after Benjamini–Hochberg correction across the 12 months, outline = not). ${sig.length} of ${ok.length} months pass. Largest change: ${MONTHS[fast.m]}, ${sign(fast.slope, d)} ${u}${fast.q < 0.05 ? '' : ' (not significant)'}.`;
}

// ---------- Then / now ----------
function shift(r: TrendResult, { ctx, w, h, ink }: G, p: number): string {
  const mm = monthMatrix(r);
  const years = r.series.annual.map((a) => a.year);
  const y0 = years[0], y1 = years[years.length - 1];
  const k = Math.min(10, Math.floor(years.length / 2));
  const early = [y0, y0 + k - 1] as const, late = [y1 - k + 1, y1] as const;
  const avg = (rows: { year: number; v: number }[], [a, b]: readonly [number, number]) => {
    const s = rows.filter((o) => o.year >= a && o.year <= b);
    return s.length ? s.reduce((t, o) => t + o.v, 0) / s.length : NaN;
  };
  const A = mm.map((rows) => avg(rows, early)), B = mm.map((rows) => avg(rows, late));
  const all = [...A, ...B].filter(Number.isFinite);
  if (all.length < 12) return 'Not enough monthly values to compare the two decades.';
  let lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  lo -= span * 0.1; hi += span * 0.1;
  const L = 36, R = 6, top = 8, bottom = h - 20;
  const sx = (i: number) => L + (i / 11) * (w - L - R);
  const sy = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const d = decimalsFor(r.variable.id), u = r.variable.unit;
  ctx.fillStyle = ink;
  for (let i = 0; i <= 2; i++) {
    const v = lo + ((hi - lo) * i) / 2;
    ctx.globalAlpha = 0.14; ctx.fillRect(L, sy(v), w - L - R, 1);
    ctx.globalAlpha = 0.55; ctx.textAlign = 'right'; ctx.fillText(fmt(v, d), L - 5, sy(v));
  }
  ctx.textAlign = 'center';
  MONTHS.forEach((m, i) => ctx.fillText(m[0], sx(i), h - 8));
  ctx.globalAlpha = 1;
  // Shaded difference, revealed left to right.
  const upto = 11 * p;
  for (let i = 0; i < 11; i++) {
    if (i > upto) break;
    const f = Math.min(1, upto - i);
    const a0 = A[i], a1 = A[i] + (A[i + 1] - A[i]) * f, b0 = B[i], b1 = B[i] + (B[i + 1] - B[i]) * f;
    ctx.beginPath();
    ctx.moveTo(sx(i), sy(a0)); ctx.lineTo(sx(i + f), sy(a1)); ctx.lineTo(sx(i + f), sy(b1)); ctx.lineTo(sx(i), sy(b0)); ctx.closePath();
    ctx.fillStyle = (b0 + b1) / 2 >= (a0 + a1) / 2 ? PINK : BLUE;
    ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
  }
  const line = (vals: number[], color: string, dash: number[]) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
    for (let i = 0; i <= Math.floor(upto); i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, sx(i), sy(vals[i]));
    if (upto < 11) { const i = Math.floor(upto), f = upto - i; ctx.lineTo(sx(i + f), sy(vals[i] + (vals[i + 1] - vals[i]) * f)); }
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(A, BLUE, [4, 3]);
  line(B, PINK, []);
  MONTHS.forEach((m, i) => hit.push({ x0: sx(i) - 12, x1: sx(i) + 12, y0: top, y1: bottom, text: `${m} · ${early[0]}–${early[1]} ${fmt(A[i], d)} → ${late[0]}–${late[1]} ${fmt(B[i], d)} ${u} (${sign(B[i] - A[i], d)})` }));
  ctx.font = '9.5px "Monaspace Krypton", ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = PINK; ctx.fillText(`── ${late[0]}–${late[1]}`, w - R, bottom - 8);
  ctx.fillStyle = BLUE; ctx.fillText(`- - ${early[0]}–${early[1]}`, w - R, bottom - 22);
  const diffs = B.map((b, i) => b - A[i]);
  const meanDiff = diffs.reduce((s, x) => s + x, 0) / 12;
  const big = diffs.reduce((m, x, i) => (Math.abs(x) > Math.abs(diffs[m]) ? i : m), 0);
  return `The average year in ${early[0]}–${early[1]} against ${late[0]}–${late[1]}. Across all months the difference is ${sign(meanDiff, d)} ${u}; the biggest shift is in ${MONTHS[big]} (${sign(diffs[big], d)} ${u}). This compares averages; the significance test is in Seasons.`;
}

// ---------- Records ----------
function records(r: TrendResult, { ctx, w, h, ink }: G, p: number): string {
  const a = r.series.annual.filter((x) => Number.isFinite(x.v));
  const d = decimalsFor(r.variable.id), u = r.variable.annualUnit;
  const sorted = [...a].sort((x, y) => y.v - x.v);
  const n = Math.min(5, Math.floor(a.length / 3));
  const top5 = sorted.slice(0, n), bot5 = sorted.slice(-n).reverse();
  const lastYear = a[a.length - 1].year, cut = lastYear - 9;
  const recent = (xs: typeof a) => xs.filter((x) => x.year >= cut).length;
  const expected = (n * Math.min(10, a.length)) / a.length;
  const vmin = sorted[sorted.length - 1].v, vmax = sorted[0].v, span = vmax - vmin || 1;
  const col = (w - 12) / 2, rowH = (h - 26) / n;
  const block = (xs: typeof a, x0: number, label: string, color: string) => {
    ctx.fillStyle = ink; ctx.globalAlpha = 0.6; ctx.textAlign = 'left';
    ctx.fillText(label, x0, 7);
    ctx.globalAlpha = 1;
    xs.forEach((x, i) => {
      const y = 18 + i * rowH;
      const frac = 0.25 + 0.75 * ((label.startsWith('Highest') ? x.v - vmin : vmax - x.v) / span);
      const bw = (col - 46) * frac * p;
      ctx.fillStyle = x.year >= cut ? color : mix(CREAM, color, 0.35);
      ctx.fillRect(x0 + 34, y + 2, bw, rowH - 6);
      ctx.fillStyle = ink; ctx.textAlign = 'left';
      ctx.fillText(String(x.year), x0, y + rowH / 2);
      hit.push({ x0, x1: x0 + col, y0: y, y1: y + rowH, text: `#${i + 1} · ${x.year} · ${fmt(x.v, d)} ${u}${x.year >= cut ? ' · latest decade' : ''}` });
    });
  };
  block(top5, 0, `Highest ${n}`, PINK);
  block(bot5, col + 12, `Lowest ${n}`, BLUE);
  return `Solid bars fall in the latest decade (${cut}–${lastYear}). ${recent(top5)} of the ${n} highest years and ${recent(bot5)} of the ${n} lowest are from that decade; with no trend you would expect about ${fmt(expected, 1)} in each.`;
}
