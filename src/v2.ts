// ATLAS v2 · motion, sharing and mobile sheet.
// Kept apart from trends-ui.ts so the judged v1 logic stays easy to diff.
import { type Place, type TrendResult, type VariableId, VARIABLES } from './trends';
import { initDeepRead, renderDeepRead } from './deepread';
import './v2.css';
import './looks.css';

const LOOKS = ['field', 'modern', 'survey', 'skeuo', 'editorial', 'mission', 'riso'] as const;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let last: TrendResult | null = null;

export function initV2() {
  // ?look= picks a skin from the style study; field (the v2 default) keeps html.v2.
  const look = new URLSearchParams(location.search).get('look') ?? 'field';
  if (look === 'field' || !(LOOKS as readonly string[]).includes(look)) document.documentElement.classList.add('v2');
  else document.documentElement.dataset.look = look;
  initDeepRead();
  addShareButton();
  addSheetGrip();
  stagePanelIntro();
}

/** Called by trends-ui render() once the result card is filled. */
export function onTrendRendered(r: TrendResult) {
  last = r;
  renderDeepRead(r);
  countUp(document.getElementById('trend-rate'));
  revealChart();
  staggerStats();
  stamp();
  writeUrl(r);
}

// ---------- motion ----------

function stamp() {
  const b = document.getElementById('trend-badge');
  if (!b) return;
  b.classList.remove('v2-stamp');
  void b.offsetWidth;
  b.classList.add('v2-stamp');
}

function countUp(el: HTMLElement | null) {
  if (!el || reduced()) return;
  const text = el.textContent ?? '';
  const m = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) return;
  const target = Number(text);
  const dec = m[3]?.length ?? 0;
  const t0 = performance.now(), dur = 700;
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const v = target * (1 - Math.pow(1 - t, 3));
    el.textContent = `${target > 0 ? '+' : ''}${t < 1 ? v.toFixed(dec) : text.replace(/^\+/, '')}`;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
}

function revealChart() {
  const c = document.getElementById('trend-chart');
  if (!c || reduced() || !c.animate) return;
  c.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.2,1)' });
}

function staggerStats() {
  const rows = document.querySelectorAll<HTMLElement>('#trend-stats > div');
  rows.forEach((row, i) => {
    row.style.setProperty('--i', String(i));
    row.classList.remove('v2-in');
    void row.offsetWidth;
    row.classList.add('v2-in');
  });
}

function stagePanelIntro() {
  const kids = document.querySelectorAll<HTMLElement>('.trend-panel > *');
  kids.forEach((k, i) => k.style.setProperty('--i', String(Math.min(i, 10))));
  document.documentElement.classList.add('v2-intro');
  window.setTimeout(() => document.documentElement.classList.remove('v2-intro'), 1800);
}

// ---------- sharing / deep links ----------

function urlFor(r: TrendResult) {
  const u = new URL(location.href);
  for (const k of ['trend', 'var', 'from', 'to', 'name', 'kind']) u.searchParams.delete(k);
  u.searchParams.set('trend', `${r.place.lat.toFixed(3)},${r.place.lon.toFixed(3)}`);
  u.searchParams.set('name', r.place.name);
  u.searchParams.set('kind', r.place.mode);
  u.searchParams.set('var', r.variable.id);
  u.searchParams.set('from', String(r.period.start));
  u.searchParams.set('to', String(r.period.end));
  return u;
}

function writeUrl(r: TrendResult) {
  if (document.body.classList.contains('mode-trends')) history.replaceState(null, '', urlFor(r));
}

function addShareButton() {
  const actions = document.querySelector('#trend-result .trend-actions');
  if (!actions || document.getElementById('trend-share')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'trend-share';
  b.className = 'iso-btn';
  b.textContent = 'Copy link';
  b.addEventListener('click', async () => {
    if (!last) return;
    const href = urlFor(last).href;
    try {
      await navigator.clipboard.writeText(href);
      b.textContent = 'Link copied';
    } catch {
      window.prompt('Copy this link', href);
    }
    window.setTimeout(() => { b.textContent = 'Copy link'; }, 1800);
  });
  actions.appendChild(b);
}

/** ?trend=lat,lon&name=…&kind=point|region&var=t2m&from=1996&to=2025 */
export function readTrendLink(): { place: Place; variable: VariableId; start: number; end: number } | null {
  const q = new URLSearchParams(location.search);
  const at = q.get('trend');
  if (!at) return null;
  const [la, lo] = at.split(',').map(Number);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const v = q.get('var') as VariableId | null;
  const variable = v && VARIABLES.some((x) => x.id === v) ? v : 't2m';
  const start = clampYear(q.get('from'), 1996), end = clampYear(q.get('to'), 2025);
  return {
    place: { name: (q.get('name') || `${la.toFixed(2)}, ${lo.toFixed(2)}`).slice(0, 60), lat: la, lon: lo, mode: q.get('kind') === 'region' ? 'region' : 'point' },
    variable,
    start: Math.min(start, end - 9),
    end,
  };
}
function clampYear(s: string | null, fallback: number) {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1981 && n <= 2025 ? n : fallback;
}

// ---------- mobile sheet ----------

function addSheetGrip() {
  const card = document.getElementById('trend-result');
  if (!card || card.querySelector('.sheet-grip')) return;
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'sheet-grip';
  grip.setAttribute('aria-label', 'Expand result');
  grip.setAttribute('aria-expanded', 'false');
  const toggle = (open?: boolean) => {
    const on = card.classList.toggle('is-expanded', open);
    grip.setAttribute('aria-expanded', String(on));
    grip.setAttribute('aria-label', on ? 'Collapse result' : 'Expand result');
  };
  grip.addEventListener('click', () => toggle());
  let y0 = 0;
  grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  grip.addEventListener('pointerup', (e) => {
    const dy = e.clientY - y0;
    if (Math.abs(dy) > 30) { e.preventDefault(); toggle(dy < 0); }
  });
  card.prepend(grip);
}
