// ATLAS console · reusable instrument components.
// Each component owns its DOM, exposes set()/value, and reports changes through a callback.
// None of them hold application state: the console binds them to the trends state.
const SVGNS = 'http://www.w3.org/2000/svg';
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Rotary knob / selector switch
// ---------------------------------------------------------------------------
export interface KnobPos<T> { value: T; label: string; short?: string }
export interface KnobOpts<T> {
  label: string;
  positions: KnobPos<T>[];
  value: T;
  onChange: (v: T) => void;
  /** 'selector' = chicken-head pointer with every position labelled; 'dial' = knurled knob, ticks only. */
  kind?: 'selector' | 'dial';
  sweep?: number;
  size?: number;
  help?: string;
  tip?: string;
  /** Label every nth tick on a dial. */
  every?: number;
  /** Hide the position labels (a readout elsewhere names the value). */
  labels?: boolean;
}

export class Knob<T> {
  el: HTMLElement;
  private cap: HTMLElement;
  private idx = 0;
  private opts: KnobOpts<T>;
  private sweep: number;
  constructor(opts: KnobOpts<T>) {
    this.opts = opts;
    const kind = opts.kind ?? 'selector';
    const n = opts.positions.length;
    this.sweep = opts.sweep ?? (kind === 'selector' ? Math.min(270, 60 * (n - 1)) : 270);
    const size = opts.size ?? (kind === 'selector' ? 104 : 96);
    this.el = h('div', `inst knob knob-${kind}`);
    this.el.style.setProperty('--size', `${size}px`);
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;

    // Engraved scale
    const r = size / 2;
    const scale = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: 'knob-scale', 'aria-hidden': 'true' });
    opts.positions.forEach((_p, i) => {
      const a = this.angleFor(i) - 90;
      const rad = (a * Math.PI) / 180;
      const major = kind === 'selector' || i % (opts.every ?? 5) === 0 || i === n - 1;
      const r1 = r - 2, r2 = r - (major ? 9 : 6);
      scale.append(svg('line', { x1: r + r1 * Math.cos(rad), y1: r + r1 * Math.sin(rad), x2: r + r2 * Math.cos(rad), y2: r + r2 * Math.sin(rad), class: major ? 'tk major' : 'tk' }));
    });
    this.el.append(scale);

    // Position labels around the knob (selector) or at majors (dial)
    const labels = h('div', 'knob-labels');
    opts.positions.forEach((p, i) => {
      const major = kind === 'selector' || i % (opts.every ?? 5) === 0 || i === n - 1;
      if (!major || opts.labels === false) return;
      const a = ((this.angleFor(i) - 90) * Math.PI) / 180;
      const lr = r + (kind === 'selector' ? 14 : 12);
      const b = h('button', 'knob-pos', p.short ?? p.label);
      b.type = 'button';
      b.tabIndex = -1;
      b.style.left = `${r + lr * Math.cos(a)}px`;
      b.style.top = `${r + lr * Math.sin(a)}px`;
      b.title = p.label;
      b.addEventListener('click', () => this.go(i, true));
      labels.append(b);
    });
    this.el.append(labels);

    const body = h('div', 'knob-body');
    this.cap = h('div', 'knob-cap');
    this.cap.append(h('span', 'knob-ptr'));
    body.append(this.cap);
    body.setAttribute('role', 'slider');
    body.tabIndex = 0;
    body.setAttribute('aria-label', opts.label);
    body.setAttribute('aria-valuemin', '0');
    body.setAttribute('aria-valuemax', String(n - 1));
    this.el.append(body);
    const plate = h('div', 'knob-label', opts.label);
    this.el.append(plate);

    this.bind(body);
    this.set(opts.value, true);
  }
  private angleFor(i: number) {
    const n = this.opts.positions.length;
    return n === 1 ? 0 : -this.sweep / 2 + (this.sweep * i) / (n - 1);
  }
  get value() { return this.opts.positions[this.idx].value; }
  set(v: T, silent = true) {
    const i = this.opts.positions.findIndex((p) => p.value === v);
    if (i >= 0) this.go(i, !silent);
  }
  private go(i: number, fire: boolean) {
    i = clamp(i, 0, this.opts.positions.length - 1);
    const changed = i !== this.idx;
    this.idx = i;
    this.cap.style.transform = `rotate(${this.angleFor(i)}deg)`;
    const body = this.cap.parentElement!;
    body.setAttribute('aria-valuenow', String(i));
    body.setAttribute('aria-valuetext', this.opts.positions[i].label);
    this.el.querySelectorAll<HTMLElement>('.knob-pos').forEach((b) => b.classList.toggle('is-on', b.title === this.opts.positions[i].label));
    if (changed) {
      this.el.classList.remove('detent');
      void this.el.offsetWidth;
      this.el.classList.add('detent');
    }
    if (fire && changed) this.opts.onChange(this.opts.positions[i].value);
  }
  private bind(body: HTMLElement) {
    let start = 0, startIdx = 0, dragging = false;
    const step = this.opts.kind === 'dial' ? 9 : 26;
    body.addEventListener('pointerdown', (e) => {
      // Stops the drag from selecting text across the page.
      e.preventDefault();
      body.focus({ preventScroll: true });
      dragging = true; start = e.clientY - e.clientX; startIdx = this.idx;
      body.setPointerCapture(e.pointerId);
      this.el.classList.add('grab');
    });
    body.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = (start - (e.clientY - e.clientX)) / step;
      this.go(startIdx + Math.round(d), true);
    });
    const end = () => { dragging = false; this.el.classList.remove('grab'); };
    body.addEventListener('pointerup', end);
    body.addEventListener('pointercancel', end);
    body.addEventListener('wheel', (e) => { e.preventDefault(); this.go(this.idx + (e.deltaY < 0 ? 1 : -1), true); }, { passive: false });
    body.addEventListener('keydown', (e) => {
      const map: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
      if (e.key in map) { e.preventDefault(); this.go(this.idx + map[e.key], true); }
      if (e.key === 'Home') { e.preventDefault(); this.go(0, true); }
      if (e.key === 'End') { e.preventDefault(); this.go(this.opts.positions.length - 1, true); }
    });
  }
}

// ---------------------------------------------------------------------------
// Bat-handle toggle switch (two labelled states)
// ---------------------------------------------------------------------------
export class Toggle {
  el: HTMLElement;
  private btn: HTMLButtonElement;
  private on: boolean;
  constructor(opts: { label: string; up: string; down: string; on: boolean; onChange: (on: boolean) => void; help?: string; tip?: string; guard?: boolean }) {
    this.on = opts.on;
    this.el = h('div', 'inst toggle');
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;
    this.el.append(h('span', 'tg-legend up', opts.up));
    this.btn = h('button', 'tg-switch') as HTMLButtonElement;
    this.btn.type = 'button';
    this.btn.setAttribute('role', 'switch');
    this.btn.setAttribute('aria-label', `${opts.label}: ${opts.up} or ${opts.down}`);
    this.btn.innerHTML = '<span class="tg-nut"></span><span class="tg-lever"><i></i></span>';
    this.btn.addEventListener('click', () => { this.set(!this.on); opts.onChange(this.on); });
    this.el.append(this.btn, h('span', 'tg-legend down', opts.down), h('span', 'tg-label', opts.label));
    this.set(this.on);
  }
  get value() { return this.on; }
  set(on: boolean) {
    this.on = on;
    this.btn.setAttribute('aria-checked', String(on));
    this.el.classList.toggle('is-up', on);
  }
}

// ---------------------------------------------------------------------------
// Annunciator lamp
// ---------------------------------------------------------------------------
export type LampState = 'off' | 'green' | 'amber' | 'red' | 'white';
export class Lamp {
  el: HTMLElement;
  state: LampState = 'off';
  constructor(legend: string, opts: { help?: string; tip?: string; small?: boolean } = {}) {
    this.el = h('div', `lamp${opts.small ? ' lamp-sm' : ''}`);
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = '<span class="lamp-glass"></span><span class="lamp-legend"></span>';
    this.el.querySelector('.lamp-legend')!.textContent = legend;
    this.el.setAttribute('aria-label', `${legend}: off`);
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;
    this.legend = legend;
  }
  private legend: string;
  set(state: LampState, flash = false) {
    this.state = state;
    this.el.dataset.state = state;
    this.el.classList.toggle('flash', flash && !reduced());
    this.el.setAttribute('aria-label', `${this.legend}: ${state === 'off' ? 'off' : state === 'green' ? 'on' : state === 'amber' ? 'caution' : state === 'red' ? 'warning' : 'on'}`);
  }
}

// ---------------------------------------------------------------------------
// Seven-segment display
// ---------------------------------------------------------------------------
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g', ' ': '', A: 'abcefg', B: 'fedcg', C: 'afed', D: 'bcdeg', E: 'afged', F: 'afge', G: 'afedc', H: 'fbceg', I: 'fe', J: 'bcde',
  L: 'fed', N: 'ceg', O: 'cdeg', P: 'abefg', R: 'eg', S: 'afgcd', T: 'fged', U: 'fedcb', Y: 'fbgcd', _: 'd',
};
export class SegDisplay {
  el: HTMLElement;
  private digits: SVGGElement[] = [];
  private dots: SVGCircleElement[] = [];
  constructor(n: number, opts: { color?: 'amber' | 'green' | 'red'; label?: string; help?: string; tip?: string } = {}) {
    this.el = h('div', `seg seg-${opts.color ?? 'amber'}`);
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;
    const W = 22, H = 36;
    const s = svg('svg', { viewBox: `0 0 ${n * W + 4} ${H + 4}`, class: 'seg-svg', 'aria-hidden': 'true' });
    const paths: Record<string, string> = {
      a: 'M5 2 L17 2 L15 5 L7 5 Z', b: 'M18 3 L18 17 L15.5 15.5 L15.5 6 Z', c: 'M18 21 L18 35 L15.5 32 L15.5 22.5 Z',
      d: 'M5 36 L17 36 L15 33 L7 33 Z', e: 'M4 21 L4 35 L6.5 32 L6.5 22.5 Z', f: 'M4 3 L4 17 L6.5 15.5 L6.5 6 Z', g: 'M5 19 L7 17.5 L15 17.5 L17 19 L15 20.5 L7 20.5 Z',
    };
    for (let i = 0; i < n; i++) {
      const g = svg('g', { transform: `translate(${i * W + 2} 2) skewX(-6)` });
      for (const [k, d] of Object.entries(paths)) g.append(svg('path', { d, 'data-s': k, class: 'sg' }));
      const dot = svg('circle', { cx: 20.8, cy: 35, r: 2.1, class: 'sg dp' });
      g.append(dot);
      this.dots.push(dot);
      s.append(g);
      this.digits.push(g);
    }
    this.el.append(s);
    const sr = h('span', 'visually-hidden');
    this.el.append(sr);
    if (opts.label) this.el.setAttribute('aria-label', opts.label);
  }
  set(text: string) {
    // Dots attach to the previous digit.
    const chars: { c: string; dp: boolean }[] = [];
    for (const ch of text.toUpperCase()) {
      if (ch === '.' && chars.length) chars[chars.length - 1].dp = true;
      else chars.push({ c: ch, dp: false });
    }
    const pad = Math.max(0, this.digits.length - chars.length);
    this.digits.forEach((g, i) => {
      const item = chars[i - pad];
      const on = item ? SEG[item.c] ?? '' : '';
      g.querySelectorAll<SVGPathElement>('path').forEach((p) => p.classList.toggle('on', on.includes(p.dataset.s!)));
      this.dots[i].classList.toggle('on', Boolean(item?.dp));
    });
    (this.el.querySelector('.visually-hidden') as HTMLElement).textContent = text;
  }
}

// ---------------------------------------------------------------------------
// Analog gauge
// ---------------------------------------------------------------------------
export interface GaugeOpts {
  label: string;
  unit: string;
  /** Map a value to 0..1 along the dial. */
  map: (v: number) => number;
  ticks: { at: number; label?: string }[];
  zones?: { from: number; to: number; cls: string }[];
  help?: string;
  tip?: string;
  second?: boolean;
}
export class Gauge {
  el: HTMLElement;
  private needle: SVGGElement;
  private needle2?: SVGGElement;
  private zoneG: SVGGElement;
  private band: SVGPathElement;
  private tickG: SVGGElement;
  private read: HTMLElement;
  private opts: GaugeOpts;
  private readonly A0 = -120;
  private readonly A1 = 120;
  constructor(opts: GaugeOpts) {
    this.opts = opts;
    this.el = h('div', 'inst gauge');
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;
    const s = svg('svg', { viewBox: '0 0 120 104', class: 'gauge-svg', role: 'img', 'aria-label': opts.label });
    s.append(svg('circle', { cx: 60, cy: 60, r: 56, class: 'g-bezel' }), svg('circle', { cx: 60, cy: 60, r: 51, class: 'g-face' }));
    this.zoneG = svg('g');
    s.append(this.zoneG);
    this.band = svg('path', { class: 'g-band', d: '' });
    this.tickG = svg('g');
    s.append(this.band, this.tickG);
    this.drawTicks();
    const lab = svg('text', { x: 60, y: 82, class: 'g-lab', 'text-anchor': 'middle' });
    lab.textContent = opts.label;
    const unit = svg('text', { x: 60, y: 90, class: 'g-unit', 'text-anchor': 'middle' });
    unit.textContent = opts.unit;
    s.append(lab, unit);
    if (opts.second) {
      this.needle2 = svg('g', { class: 'g-needle g-needle2' });
      this.needle2.append(svg('path', { d: 'M59.2 60 L60 18 L60.8 60 Z' }));
      s.append(this.needle2);
    }
    this.needle = svg('g', { class: 'g-needle' });
    this.needle.append(svg('path', { d: 'M58.4 62 L60 14 L61.6 62 Z' }), svg('path', { class: 'g-tail', d: 'M58.6 60 L60 72 L61.4 60 Z' }));
    s.append(this.needle, svg('circle', { cx: 60, cy: 60, r: 5, class: 'g-hub' }), svg('circle', { cx: 60, cy: 60, r: 1.6, class: 'g-hub-dot' }), svg('path', { d: 'M18 40 A50 50 0 0 1 96 20 A60 60 0 0 0 18 40 Z', class: 'g-glare' }));
    this.el.append(s);
    this.read = h('div', 'gauge-read', '—');
    this.el.append(this.read);
    this.paintZones(opts.zones ?? []);
    this.needle.style.transform = `rotate(${this.A0}deg)`;
    if (this.needle2) this.needle2.style.transform = `rotate(${this.A0}deg)`;
  }
  /** Re-scale the dial: a new value→position map and new tick marks. */
  scale(map: (v: number) => number, ticks: { at: number; label?: string }[], zones?: { from: number; to: number; cls: string }[]) {
    this.opts.map = map;
    this.opts.ticks = ticks;
    this.drawTicks();
    if (zones) this.paintZones(zones);
  }
  private drawTicks() {
    const out: SVGElement[] = [];
    for (const t of this.opts.ticks) {
      const rad = ((this.ang(t.at) - 90) * Math.PI) / 180;
      const major = t.label !== undefined;
      const r1 = 47, r2 = major ? 40 : 43;
      out.push(svg('line', { x1: 60 + r1 * Math.cos(rad), y1: 60 + r1 * Math.sin(rad), x2: 60 + r2 * Math.cos(rad), y2: 60 + r2 * Math.sin(rad), class: major ? 'g-tk major' : 'g-tk' }));
      if (major) {
        const tx = svg('text', { x: 60 + 32 * Math.cos(rad), y: 60 + 32 * Math.sin(rad) + 2.6, class: 'g-num', 'text-anchor': 'middle' });
        tx.textContent = t.label!;
        out.push(tx);
      }
    }
    this.tickG.replaceChildren(...out);
  }
  private ang(v: number) { return this.A0 + (this.A1 - this.A0) * clamp(this.opts.map(v), 0, 1); }
  private arc(v0: number, v1: number, r: number) {
    const a0 = ((this.ang(v0) - 90) * Math.PI) / 180, a1 = ((this.ang(v1) - 90) * Math.PI) / 180;
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    const sweep = a1 > a0 ? 1 : 0;
    return `M${60 + r * Math.cos(a0)} ${60 + r * Math.sin(a0)} A${r} ${r} 0 ${large} ${sweep} ${60 + r * Math.cos(a1)} ${60 + r * Math.sin(a1)}`;
  }
  paintZones(zones: { from: number; to: number; cls: string }[]) {
    this.zoneG.replaceChildren(...zones.map((z) => svg('path', { d: this.arc(z.from, z.to, 45), class: `g-zone ${z.cls}` })));
  }
  setBand(lo: number | null, hi: number | null) {
    this.band.setAttribute('d', lo === null || hi === null ? '' : this.arc(lo, hi, 49.5));
  }
  set(v: number | null, text: string, v2?: number | null) {
    this.read.textContent = text;
    this.el.classList.toggle('dead', v === null);
    this.needle.style.transform = `rotate(${v === null ? this.A0 : this.ang(v)}deg)`;
    if (this.needle2) this.needle2.style.transform = `rotate(${v2 == null ? this.A0 : this.ang(v2)}deg)`;
  }
}

// ---------------------------------------------------------------------------
// CRT: oscilloscope trace and scrolling log
// ---------------------------------------------------------------------------
export class Scope {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private data: number[] = [];
  private raf = 0;
  private t = 0;
  private running = false;
  constructor(label: string, opts: { help?: string; tip?: string } = {}) {
    this.el = h('div', 'crt scope');
    if (opts.help) this.el.dataset.help = opts.help;
    if (opts.tip) this.el.dataset.tip = opts.tip;
    this.canvas = h('canvas', 'scope-canvas') as HTMLCanvasElement;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.el.append(this.canvas, h('span', 'crt-glass'));
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
  }
  setData(values: number[]) {
    this.data = values.filter(Number.isFinite);
    this.t = 0;
    this.start();
  }
  start() {
    if (this.running || !this.data.length) { this.draw(1); return; }
    if (reduced()) { this.draw(1); return; }
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.t = (this.t + 0.0035) % 1.25;
      this.draw(Math.min(1, this.t));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  private draw(p: number) {
    const c = this.canvas;
    const w = c.clientWidth || 300, hgt = c.clientHeight || 90;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    // graticule
    ctx.strokeStyle = 'rgba(140,255,168,.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { const x = (w * i) / 10; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hgt); ctx.stroke(); }
    for (let i = 1; i < 4; i++) { const y = (hgt * i) / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(140,255,168,.28)';
    ctx.beginPath(); ctx.moveTo(0, hgt / 2); ctx.lineTo(w, hgt / 2); ctx.stroke();
    const d = this.data;
    if (!d.length) return;
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const amp = Math.max(...d.map((v) => Math.abs(v - mean))) || 1;
    const n = d.length, upto = Math.max(2, Math.floor(n * p));
    const X = (i: number) => (i / (n - 1)) * (w - 8) + 4;
    const Y = (v: number) => hgt / 2 - ((v - mean) / amp) * (hgt / 2 - 6);
    // phosphor: faint full trace, bright recent beam
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(140,255,168,.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); d.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
    const tail = Math.max(0, upto - Math.floor(n * 0.35));
    for (let i = Math.max(1, tail); i < upto; i++) {
      const a = (i - tail) / Math.max(1, upto - tail);
      ctx.strokeStyle = `rgba(160,255,185,${0.15 + 0.85 * a})`;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(120,255,150,.8)';
      ctx.shadowBlur = 6 * a;
      ctx.beginPath(); ctx.moveTo(X(i - 1), Y(d[i - 1])); ctx.lineTo(X(i), Y(d[i])); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (p < 1) { ctx.fillStyle = '#E8FFEE'; ctx.beginPath(); ctx.arc(X(upto - 1), Y(d[upto - 1]), 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
}

export class CrtLog {
  el: HTMLElement;
  private list: HTMLOListElement;
  constructor(label: string, opts: { help?: string } = {}) {
    this.el = h('div', 'crt crt-log');
    if (opts.help) this.el.dataset.help = opts.help;
    this.list = h('ol', 'log-lines') as HTMLOListElement;
    this.list.setAttribute('aria-label', label);
    this.list.setAttribute('aria-live', 'polite');
    this.el.append(this.list, h('span', 'crt-glass'));
  }
  push(code: string, text: string, level: 'ok' | 'info' | 'warn' | 'err' = 'info') {
    const li = h('li', `log-${level}`);
    const t = new Date();
    const ts = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')}`;
    li.innerHTML = '<time></time><b></b><span></span>';
    li.querySelector('time')!.textContent = ts;
    li.querySelector('b')!.textContent = code;
    li.querySelector('span')!.textContent = text;
    this.list.append(li);
    while (this.list.children.length > 80) this.list.firstElementChild!.remove();
    this.list.scrollTop = this.list.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Panel module frame: engraved plate with code, title, purpose and an INFO button
// ---------------------------------------------------------------------------
/** Part numbers stamped on each plate: derived from the code so they stay stable. */
function partNo(code: string) {
  let n = 0;
  for (const ch of code) n = (n * 31 + ch.charCodeAt(0)) % 9973;
  return `P/N ATL-${code.replace(/[^A-Z0-9]/gi, '')}-${String(n).padStart(4, '0')}`;
}
export function module(code: string, title: string, help: string, cls = '') {
  const el = h('section', `pnl ${cls}`);
  el.dataset.helpRegion = help;
  el.dataset.panel = code;
  el.dataset.panelTitle = title;
  el.setAttribute('aria-label', `${code} ${title}`);
  const head = h('header', 'pnl-plate');
  head.innerHTML = '<span class="pnl-screw"></span><span class="pnl-code"></span><span class="pnl-title"></span><span class="pnl-pn"></span>'
    + '<button type="button" class="info-btn" aria-label="">i</button>'
    + '<button type="button" class="pnl-btn pnl-fold" data-act="fold" aria-expanded="true"><span aria-hidden="true"></span></button>'
    + '<button type="button" class="pnl-btn pnl-close" data-act="close"><span aria-hidden="true">×</span></button><span class="pnl-screw"></span>';
  head.querySelector('.pnl-code')!.textContent = code;
  head.querySelector('.pnl-title')!.textContent = title;
  head.querySelector('.pnl-pn')!.textContent = partNo(code);
  const info = head.querySelector<HTMLButtonElement>('.info-btn')!;
  info.dataset.info = help;
  info.setAttribute('aria-label', `About ${title}`);
  const fold = head.querySelector<HTMLButtonElement>('.pnl-fold')!;
  fold.setAttribute('aria-label', `Fold ${title}`);
  fold.dataset.tip = 'Fold this panel to its nameplate';
  const close = head.querySelector<HTMLButtonElement>('.pnl-close')!;
  close.setAttribute('aria-label', `Stow ${title}`);
  close.dataset.tip = 'Stow this panel. Bring it back from PANELS in the top rail.';
  const body = h('div', 'pnl-body');
  const wrap = h('div', 'pnl-fold-wrap');
  wrap.append(body);
  el.append(head, wrap);
  return { el, body };
}

export function infoButton(key: string, label: string) {
  const b = h('button', 'info-btn', 'i') as HTMLButtonElement;
  b.type = 'button';
  b.dataset.info = key;
  b.setAttribute('aria-label', `About ${label}`);
  return b;
}
