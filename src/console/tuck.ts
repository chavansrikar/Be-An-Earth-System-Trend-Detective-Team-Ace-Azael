// TUCK: slide every panel to its nearest edge and give the screen to the view. T toggles it,
// so does the TUCK key in the top rail and the PANELS tab left on the edge while tucked.
// The bar, the NAV pad and the map credit stay. Only transform and opacity animate, so the
// compositor moves the panels without repainting them, and tucked panels leave rendering
// (and the tab order) once they are off screen.

const root = document.documentElement;
const OWNS_KEYS = 'input, textarea, select, [contenteditable], [role="slider"], [role="spinbutton"], .knob-body, dialog[open]';

let key: HTMLButtonElement;
let tab: HTMLButtonElement;

export const tucked = () => root.classList.contains('tucked');

export function setTucked(on: boolean, log?: (code: string, text: string) => void) {
  if (on === tucked()) return;
  root.classList.toggle('tucked', on);
  key.setAttribute('aria-pressed', String(on));
  key.querySelector('span')!.textContent = on ? 'UNTUCK' : 'TUCK';
  tab.hidden = !on;
  // A part or place card is a one-off answer: tucking puts it away instead of leaving it floating.
  if (on) (document.getElementById('card-close') as HTMLButtonElement | null)?.click();
  // Keep keyboard focus out of panels that are sliding away.
  const a = document.activeElement as HTMLElement | null;
  if (on && a && a !== key && !a.closest('.bar, #nav-pad')) a.blur();
  log?.('TUCK', on ? 'PANELS TUCKED · T TO BRING THEM BACK' : 'PANELS DEPLOYED');
}

export function initTuck(rail: HTMLElement, log?: (code: string, text: string) => void) {
  key = document.createElement('button');
  key.type = 'button';
  key.className = 'cn-key cn-tuck';
  key.setAttribute('aria-pressed', 'false');
  key.innerHTML = '<span>TUCK</span>';
  key.dataset.tip = 'Tuck every panel to the edges and clear the view (key T)';
  key.addEventListener('click', () => setTucked(!tucked(), log));
  // Right after PANELS, its sibling control.
  const panels = rail.querySelector('.cn-panels');
  if (panels) panels.after(key); else rail.prepend(key);

  tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'cn-tucktab';
  tab.hidden = true;
  tab.setAttribute('aria-label', 'Bring the panels back (key T)');
  tab.innerHTML = '<span>PANELS</span>';
  tab.addEventListener('click', () => setTucked(false, log));
  document.body.append(tab);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.(OWNS_KEYS) || root.classList.contains('gev')) return;
    const tour = document.querySelector('.c-tour');
    if (tour && !tour.hasAttribute('hidden')) return;
    e.preventDefault();
    setTucked(!tucked(), log);
  });
}
