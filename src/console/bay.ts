// ATLAS console · panel bay.
// Every module can fold to its nameplate or be stowed; whole columns slide away; the PANELS
// key in the top rail lists everything and brings it back. Choices persist per browser.
const root = document.documentElement;
const KEY = 'atlas-console-panels-v1';
type Col = 'left' | 'right' | 'deck';
interface Saved { stowed: string[]; folded: string[]; cols: Col[] }
const COLS: { id: Col; label: string; sel: string }[] = [
  { id: 'left', label: 'CONTROLS', sel: '#trend-panel' },
  { id: 'right', label: 'TELEMETRY', sel: '#trend-result' },
  { id: 'deck', label: 'DISPLAYS', sel: '#cn-deck' },
];

let saved: Saved = { stowed: [], folded: [], cols: [] };
let menu: HTMLElement;
let key: HTMLButtonElement;
let onChange: (what: string) => void = () => {};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.stowed)) saved = { stowed: s.stowed, folded: s.folded ?? [], cols: s.cols ?? [] };
  } catch { /* storage unavailable */ }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } }
const panels = () => [...document.querySelectorAll<HTMLElement>('[data-panel]')];
const colOf = (el: HTMLElement): Col | 'other' => (el.closest('#trend-panel') ? 'left' : el.closest('#trend-result') ? 'right' : el.closest('#cn-deck') ? 'deck' : 'other');

export function initBay(rail: HTMLElement, log: (code: string, text: string) => void) {
  load();
  onChange = (t) => log('PNL', t);
  // Fold and stow buttons on every plate (delegated, so panels built later work too).
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.pnl-btn');
    if (!b) return;
    const p = b.closest<HTMLElement>('[data-panel]');
    if (!p) return;
    if (b.dataset.act === 'fold') setFolded(p, !p.classList.contains('folded'));
    if (b.dataset.act === 'close') setStowed(p, true);
  });
  // Double-click a nameplate to fold it, like flipping a cover shut.
  document.addEventListener('dblclick', (e) => {
    const plate = (e.target as HTMLElement).closest('.pnl-plate');
    if (!plate || (e.target as HTMLElement).closest('button')) return;
    const p = plate.closest<HTMLElement>('[data-panel]');
    if (p) setFolded(p, !p.classList.contains('folded'));
  });

  // Column tabs: a slim labelled tab sits on the screen edge while a column is away.
  for (const c of COLS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `cn-coltab cn-coltab-${c.id}`;
    tab.dataset.col = c.id;
    tab.innerHTML = `<span>${c.label}</span>`;
    tab.setAttribute('aria-label', `Show ${c.label.toLowerCase()}`);
    tab.dataset.tip = `Bring back the ${c.label.toLowerCase()}`;
    tab.addEventListener('click', () => setCol(c.id, true));
    document.body.append(tab);
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = `cn-colhide cn-colhide-${c.id}`;
    hide.setAttribute('aria-label', `Hide ${c.label.toLowerCase()}`);
    hide.dataset.tip = `Slide the ${c.label.toLowerCase()} away`;
    hide.innerHTML = '<span aria-hidden="true"></span>';
    hide.addEventListener('click', () => setCol(c.id, false));
    document.querySelector(c.sel)?.append(hide);
  }

  // PANELS key + menu
  key = document.createElement('button');
  key.type = 'button';
  key.className = 'cn-key cn-panels';
  key.setAttribute('aria-haspopup', 'true');
  key.setAttribute('aria-expanded', 'false');
  key.innerHTML = 'PANELS <b class="cn-panels-n"></b>';
  key.dataset.tip = 'Fold, stow and restore every panel';
  rail.prepend(key);
  menu = document.createElement('div');
  menu.className = 'cn-bay';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Panel bay');
  document.body.append(menu);
  key.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== key) toggleMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { toggleMenu(false); key.focus(); } });
  menu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.code) { const p = panels().find((x) => x.dataset.panel === b.dataset.code); if (p) setStowed(p, !p.classList.contains('stowed')); }
    if (b.dataset.colToggle) setCol(b.dataset.colToggle as Col, root.classList.contains(`col-${b.dataset.colToggle}-off`));
    if (b.dataset.all === 'show') { panels().forEach((p) => { setStowed(p, false, true); setFolded(p, false, true); }); COLS.forEach((c) => setCol(c.id, true, true)); persist('ALL PANELS RESTORED'); }
    if (b.dataset.all === 'stow') { COLS.forEach((c) => setCol(c.id, false, true)); persist('ALL COLUMNS STOWED · GLOBE CLEAR'); }
    if (b.dataset.all === 'fold') { panels().filter((p) => colOf(p) === 'left').forEach((p) => setFolded(p, true, true)); persist('CONTROL PANELS FOLDED TO NAMEPLATES'); }
    renderMenu();
  });

  // Apply what this browser saved last time.
  for (const p of panels()) {
    if (saved.stowed.includes(p.dataset.panel!)) p.classList.add('stowed');
    if (saved.folded.includes(p.dataset.panel!)) { p.classList.add('folded'); p.querySelector('.pnl-fold')?.setAttribute('aria-expanded', 'false'); }
  }
  for (const c of saved.cols) root.classList.add(`col-${c}-off`);
  paintCount();
}

function persist(msg?: string) {
  saved.stowed = panels().filter((p) => p.classList.contains('stowed')).map((p) => p.dataset.panel!);
  saved.folded = panels().filter((p) => p.classList.contains('folded')).map((p) => p.dataset.panel!);
  saved.cols = COLS.filter((c) => root.classList.contains(`col-${c.id}-off`)).map((c) => c.id);
  save();
  paintCount();
  if (msg) onChange(msg);
}
export function setFolded(p: HTMLElement, on: boolean, quiet = false) {
  p.classList.toggle('folded', on);
  p.querySelector('.pnl-fold')?.setAttribute('aria-expanded', String(!on));
  if (!quiet) persist(`${p.dataset.panel} ${on ? 'FOLDED' : 'OPENED'}`);
}
export function setStowed(p: HTMLElement, on: boolean, quiet = false) {
  if (on && p.contains(document.activeElement)) key?.focus();
  p.classList.toggle('stowed', on);
  if (!quiet) persist(`${p.dataset.panel} ${on ? 'STOWED' : 'RESTORED'}`);
  if (!menu.hidden) renderMenu();
}
export function setCol(c: Col, open: boolean, quiet = false) {
  root.classList.toggle(`col-${c}-off`, !open);
  // A closed telemetry card reopens when there is a result to show.
  if (open && c === 'right') {
    const r = document.getElementById('trend-result');
    if (r?.hidden && r.querySelector('#trend-rate')?.textContent?.trim()) r.hidden = false;
  }
  if (!quiet) persist(`${COLS.find((x) => x.id === c)!.label} ${open ? 'DEPLOYED' : 'STOWED'}`);
}
function paintCount() {
  if (!key) return;
  const n = panels().filter((p) => p.classList.contains('stowed')).length + COLS.filter((c) => root.classList.contains(`col-${c.id}-off`)).length;
  const b = key.querySelector('.cn-panels-n')!;
  b.textContent = n ? String(n) : '';
  key.classList.toggle('has-stowed', n > 0);
  key.setAttribute('aria-label', n ? `Panels, ${n} stowed` : 'Panels');
}
function toggleMenu(open = menu.hidden) {
  menu.hidden = !open;
  key.setAttribute('aria-expanded', String(open));
  if (open) {
    renderMenu();
    const r = key.getBoundingClientRect();
    menu.style.top = `${r.bottom + 8}px`;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth))}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }
}
function renderMenu() {
  const group = (c: Col) => panels().filter((p) => colOf(p) === c);
  const row = (p: HTMLElement) => {
    const on = !p.classList.contains('stowed');
    return `<button type="button" class="bay-row" data-code="${p.dataset.panel}" aria-pressed="${on}"><i class="bay-led ${on ? 'on' : ''}"></i><b>${p.dataset.panel}</b><span>${p.dataset.panelTitle}</span><em>${on ? (p.classList.contains('folded') ? 'FOLDED' : 'ON') : 'STOWED'}</em></button>`;
  };
  menu.innerHTML = `<header><span class="hp-code">BAY</span><strong>Panel bay</strong></header>
    ${COLS.map((c) => {
      const off = root.classList.contains(`col-${c.id}-off`);
      return `<section><button type="button" class="bay-col" data-col-toggle="${c.id}" aria-pressed="${!off}"><i class="bay-led ${off ? '' : 'on'}"></i>${c.label}<em>${off ? 'AWAY' : 'DEPLOYED'}</em></button>${group(c.id).map(row).join('')}</section>`;
    }).join('')}
    <footer><button type="button" data-all="show">Restore all</button><button type="button" data-all="fold">Fold controls</button><button type="button" data-all="stow">Clear to globe</button></footer>`;
}
