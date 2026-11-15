import pptxgen from 'pptxgenjs';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.env.OUT || '/home/srikar/atlas-live-repo/docs/ATLAS-EARTH-Pitch-Deck.pptx';
const SHOTS = process.env.SHOTS || '/tmp/opencode/shots/small';

/** Read a JPEG's pixel size from its SOF marker. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 1, h: 1 };
}

const GROUND = '070B18';
const GROUND2 = '101A3A';
const BONE = 'EFE6DA';
const BONE2 = 'CFC3B5';
const MUTED = 'A89A8C';
const SIGNAL = 'FF5A1F';
const BLUE = '7FA8FF';
const GREEN = '8FBF7A';
const PANEL = '141E3C';

const MONO = 'Consolas';
const SANS = 'Segoe UI';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'Team Ace Azael';
pptx.company = 'NASA Space Apps 2026';
pptx.title = 'ATLAS EARTH — Be An Earth System Trend Detective';
pptx.subject = 'NASA Space Apps Challenge 2026 pitch deck';

let slideNo = 0;

function baseSlide({ title, kicker, sub }) {
  const s = pptx.addSlide();
  slideNo += 1;
  s.background = { color: GROUND };
  // A thin signal bar and the slide number, so the deck reads as one system.
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: SIGNAL } });
  if (kicker) s.addText(kicker.toUpperCase(), { x: 0.55, y: 0.28, w: 9.5, h: 0.3, fontFace: MONO, fontSize: 11, color: SIGNAL, charSpacing: 2 });
  if (title) s.addText(title, { x: 0.55, y: kicker ? 0.6 : 0.4, w: 12.2, h: 0.85, fontFace: SANS, fontSize: 34, bold: true, color: BONE });
  if (sub) s.addText(sub, { x: 0.55, y: kicker ? 1.42 : 1.25, w: 12.2, h: 0.5, fontFace: SANS, fontSize: 14, color: BONE2 });
  s.addText(String(slideNo).padStart(2, '0'), { x: 12.55, y: 6.95, w: 0.6, h: 0.3, fontFace: MONO, fontSize: 10, color: MUTED, align: 'right' });
  s.addText('ATLAS EARTH · NASA Space Apps 2026', { x: 0.55, y: 6.95, w: 6, h: 0.3, fontFace: MONO, fontSize: 9, color: MUTED });
  return s;
}

function bullets(slide, items, opts = {}) {
  const { x = 0.55, y = 2.0, w = 6.0, h = 4.4, size = 14, gap = 10 } = opts;
  const runs = [];
  items.forEach((it) => {
    const [head, body] = Array.isArray(it) ? it : [null, it];
    if (head) {
      runs.push({ text: head, options: { fontFace: SANS, fontSize: size, bold: true, color: BONE, bullet: { code: '25AA' }, breakLine: false } });
      runs.push({ text: ' — ', options: { fontFace: SANS, fontSize: size, bold: true, color: BONE, breakLine: false } });
    }
    runs.push({ text: body, options: { fontFace: SANS, fontSize: size, color: BONE2, breakLine: true } });
  });
  slide.addText(runs, { x, y, w, h, valign: 'top', lineSpacingMultiple: 1.12, paraSpaceAfter: gap });
}

/** Place an image in a box. `cover` fills the box and crops, `contain` fits it whole. */
function picture(slide, file, box, caption, fit = 'cover') {
  slide.addImage({
    path: file,
    x: box.x, y: box.y, w: box.w, h: box.h,
    sizing: { type: fit === 'contain' ? 'contain' : 'cover', w: box.w, h: box.h },
  });
  slide.addShape(pptx.ShapeType.rect, { x: box.x, y: box.y, w: box.w, h: box.h, fill: { type: 'none' }, line: { color: '2B3A66', width: 1 } });
  if (caption) slide.addText(caption, { x: box.x, y: box.y + box.h + 0.06, w: box.w, h: 0.32, fontFace: MONO, fontSize: 9, color: MUTED });
}

function stat(slide, { value, label, x, y, w = 2.1, color = SIGNAL }) {
  slide.addText(value, { x, y, w, h: 0.62, fontFace: SANS, fontSize: 30, bold: true, color });
  slide.addText(label, { x, y: y + 0.6, w, h: 0.5, fontFace: MONO, fontSize: 9.5, color: BONE2 });
}

/* ------------------------------------------------------------------ 1. TITLE */
{
  const s = pptx.addSlide();
  slideNo += 1;
  s.background = { color: GROUND };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 5.9, h: 7.5, fill: { color: GROUND2 } });
  s.addShape(pptx.ShapeType.rect, { x: 5.9, y: 0, w: 0.1, h: 7.5, fill: { color: SIGNAL } });
  picture(s, `${SHOTS}/hero-globe.jpg`, { x: 6.0, y: 0, w: 7.33, h: 7.5 });

  s.addText('NASA SPACE APPS CHALLENGE 2026  ·  TEAM ACE AZAEL', { x: 0.7, y: 0.85, w: 5.0, h: 0.3, fontFace: MONO, fontSize: 10.5, color: SIGNAL, charSpacing: 1.6 });
  s.addText('ATLAS', { x: 0.66, y: 1.5, w: 5.0, h: 1.3, fontFace: SANS, fontSize: 76, bold: true, color: BONE, charSpacing: 4 });
  s.addText('EARTH', { x: 0.7, y: 2.72, w: 5.0, h: 0.5, fontFace: MONO, fontSize: 20, color: SIGNAL, charSpacing: 8 });
  s.addText('Be An Earth System Trend Detective', { x: 0.7, y: 3.45, w: 4.9, h: 1.0, fontFace: SANS, fontSize: 22, color: BONE2 });
  s.addText([
    { text: '30 NASA variables', options: { bold: true, color: BONE } },
    { text: '  ·  ', options: { color: MUTED } },
    { text: 'tested trends', options: { bold: true, color: BONE } },
    { text: '  ·  ', options: { color: MUTED } },
    { text: 'two globes', options: { bold: true, color: BONE } },
    { text: '  ·  ', options: { color: MUTED } },
    { text: 'no invented numbers', options: { bold: true, color: BONE } },
  ], { x: 0.7, y: 4.55, w: 5.0, h: 0.8, fontFace: SANS, fontSize: 14 });
  s.addShape(pptx.ShapeType.line, { x: 0.7, y: 5.55, w: 4.6, h: 0, line: { color: '2B3A66', width: 1 } });
  s.addText([
    { text: 'LIVE  ', options: { color: MUTED, fontFace: MONO, fontSize: 10 } },
    { text: 'atlas-ace-azael.vercel.app', options: { color: BLUE, fontFace: MONO, fontSize: 12 } },
  ], { x: 0.7, y: 5.75, w: 5.0, h: 0.3 });
  s.addText([
    { text: 'CODE  ', options: { color: MUTED, fontFace: MONO, fontSize: 10 } },
    { text: 'github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael', options: { color: BONE2, fontFace: MONO, fontSize: 9.5 } },
  ], { x: 0.7, y: 6.15, w: 5.0, h: 0.4 });
  s.addText('NASA POWER · NASA GIBS · NASA EONET', { x: 0.7, y: 6.7, w: 5.0, h: 0.3, fontFace: MONO, fontSize: 9, color: MUTED });
}

/* ------------------------------------------------------------------ 2. THE BRIEF */
{
  const s = baseSlide({
    kicker: 'the brief',
    title: 'NASA asked for a detective, not a chart',
    sub: 'Find the variables, get the data for a region, plot a long series, and say whether the trend is significant.',
  });
  bullets(s, [
    ['Objective 1 — variables', '30 NASA POWER parameters plus USGS/ECCC streamflow, and a scan that tests every variable at a place and keeps the ones that hold up.'],
    ['Objective 2 — a region', 'Presets, geocoding, lat/lon, tapping the globe, and a per-cell map of the change around the place.'],
    ['Objective 3 — a long series', '1981–2025, any 10–45 year window, annual and monthly charts with the fitted trend.'],
    ['Objective 4 — the test', "Sen's slope for the rate, tie-corrected Mann–Kendall for significance, Sen and OLS intervals, plus autocorrelation and change-point checks."],
  ], { x: 0.55, y: 2.05, w: 6.1, h: 3.5, size: 13 });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 5.55, w: 6.1, h: 1.15, fill: { color: PANEL }, line: { color: SIGNAL, width: 1 } });
  s.addText([
    { text: 'What we solve: ', options: { bold: true, color: SIGNAL, fontFace: SANS, fontSize: 12.5 } },
    { text: 'a non-specialist cannot find what is changing at their own location, with a number they can trust and a source they can check.', options: { color: BONE, fontFace: SANS, fontSize: 12.5 } },
  ], { x: 0.75, y: 5.68, w: 5.7, h: 0.9, valign: 'top' });

  picture(s, `${SHOTS}/trends-result.jpg`, { x: 7.0, y: 2.0, w: 5.85, h: 3.66 }, 'The default record: Amazon Basin air temperature, 1996–2025 — +0.32 °C/decade, Mann–Kendall p = 0.007.');
  s.addText([
    { text: 'Every number carries its source, its complete-year count and its interval. The model never computes: it explains facts the server already proved.', options: { color: BONE2, fontFace: SANS, fontSize: 12, italic: true } },
  ], { x: 7.0, y: 6.0, w: 5.85, h: 0.7 });
}

/* ------------------------------------------------------------------ 3. FOUR WAYS */
{
  const s = baseSlide({
    kicker: 'the product',
    title: 'Four ways to find a trend, one screen',
    sub: 'Single place · Compare places · Map the change · Scan all variables — all on NASA POWER, all with the same test.',
  });
  const w = 3.02;
  const h = 1.89;
  picture(s, `${SHOTS}/sweep.jpg`, { x: 0.55, y: 1.95, w, h }, 'SCAN ALL VARIABLES — 24 tested at once; 7 survive FDR.');
  picture(s, `${SHOTS}/map.jpg`, { x: 3.75, y: 1.95, w, h }, 'MAP THE CHANGE — every grid cell, coloured by rate.');
  picture(s, `${SHOTS}/compare.jpg`, { x: 0.55, y: 4.42, w, h }, 'COMPARE PLACES — same test, p and FDR q.');
  picture(s, `${SHOTS}/places.jpg`, { x: 3.75, y: 4.42, w, h }, 'PLACES — a science card at any place.');
  bullets(s, [
    ['Single place', 'One variable, one place: the record, the rate, the test and the interval, with the source one click away.'],
    ['Compare places', 'The same variable, period and test across 2–6 places, with p and the false discovery rate — so one place cannot be cherry-picked.'],
    ['Map the change', 'Every NASA POWER grid cell in a box around the place, coloured by Sen’s slope and dotted where the trend survives correction.'],
    ['Scan all variables', 'Tests every variable at once and keeps the ones that hold up. Leads to investigate, not findings.'],
  ], { x: 7.15, y: 2.0, w: 5.7, h: 4.4, size: 12.5, gap: 8 });
}

/* ------------------------------------------------------------------ 4. THE SCIENCE */
{
  const s = baseSlide({
    kicker: 'the science',
    title: 'Statistics that a scientist would accept',
    sub: 'Deterministic on the server. The language model only explains what the statistics already proved.',
  });
  const rows = [
    ['Rate of change', "Sen's slope (median of pairwise slopes) — robust to outliers"],
    ['Significance', 'Mann–Kendall, tie-corrected, continuity-corrected z, two-sided p < 0.05'],
    ['Interval', 'Sen 95% interval (Gilbert 1987) and OLS 95% interval + R²'],
    ['Serial correlation', 'Hamed–Rao modified Mann–Kendall reported next to the plain p'],
    ['Structural break', 'Pettitt change point on the annual series'],
    ['Many tests at once', 'Benjamini–Hochberg false discovery rate (q) across places and cells'],
    ['Data discipline', 'Complete years only, missing months dropped, never interpolated'],
  ];
  const t = rows.map(([a, b], i) => [
    { text: a, options: { fontFace: MONO, fontSize: 10.5, color: SIGNAL, bold: true } },
    { text: b, options: { fontFace: SANS, fontSize: 11, color: BONE } },
  ]);
  s.addTable(t, {
    x: 0.55, y: 2.05, w: 6.3, colW: [1.75, 4.55], rowH: 0.42,
    border: { type: 'solid', color: '2B3A66', pt: 0.75 },
    fill: { color: PANEL }, valign: 'middle', margin: [4, 8, 4, 8],
  });
  s.addText([
    { text: 'Verified live: ', options: { bold: true, color: BONE } },
    { text: 'Amazon Basin +0.32 °C/decade (p 0.007, q 0.022) · Sahel −0.10 °C/decade (p 0.412) · Himalayas −0.06 °C/decade (p 0.669) · a null result shown as a null result.', options: { color: BONE2 } },
  ], { x: 0.55, y: 5.6, w: 6.3, h: 1.1, fontFace: SANS, fontSize: 11.5 });

  picture(s, `${SHOTS}/compare.jpg`, { x: 7.05, y: 2.05, w: 5.8, h: 3.63 }, 'p for one place, q for the group: the comparison corrects for looking at several places at once.');
  s.addText('Hydrology is the one labelled exception: NASA has no keyless discharge API, so streamflow comes from the official USGS and ECCC gauges — named, dated and measured.', { x: 7.05, y: 6.0, w: 5.8, h: 0.7, fontFace: SANS, fontSize: 11, color: MUTED, italic: true });
}

/* ------------------------------------------------------------------ 5. TWO GLOBES */
{
  const s = baseSlide({
    kicker: 'the globe',
    title: 'Two renderers, one switch, identical geography',
    sub: 'Google Photorealistic 3D Tiles and NASA Blue Marble — the same panel, the same controls, the same numbers.',
  });
  picture(s, `${SHOTS}/globe-photo-wide.jpg`, { x: 0.55, y: 2.0, w: 6.05, h: 3.05 }, 'PHOTOREAL 3D — Google tiles through Cesium ion asset 2275207. Buildings, terrain, a place you recognise.');
  picture(s, `${SHOTS}/globe-nasa-wide.jpg`, { x: 6.9, y: 2.0, w: 6.05, h: 3.05 }, 'NASA BLUE MARBLE — GIBS imagery, VIIRS city lights, the real day/night terminator. Works with no token at all.');
  bullets(s, [
    ['One switch everywhere', 'Trends, Places and the Globe tab each carry it, and keep their own choice.'],
    ['Feature parity', 'Search, Ask, fly-to, Details, Trends, Compare, Spin, City lights, Live clouds, live signals and the lens row work in both.'],
    ['Verified parity', 'Projecting real surface points through the tile transform: the two renderers agree to ≤3 px on a 1440 px screen, and both spin eastward with the ground following the cursor.'],
  ], { x: 0.55, y: 5.45, w: 12.3, h: 1.5, size: 12, gap: 4 });
}

/* ------------------------------------------------------------------ 6. EVIDENCE */
{
  const s = baseSlide({
    kicker: 'evidence',
    title: 'Measured, deployed, and honest about its limits',
    sub: 'Everything below was run against the live app, not asserted.',
  });
  stat(s, { value: '+0.32', label: '°C per decade, Amazon Basin\nMann–Kendall p = 0.007', x: 0.55, y: 2.1, w: 2.4 });
  stat(s, { value: '7 of 24', label: 'variables significant at the\nAmazon Basin after FDR', x: 3.05, y: 2.1, w: 2.4, color: BLUE });
  stat(s, { value: '≤3 px', label: 'difference between the two\nglobe renderers, same centre', x: 5.55, y: 2.1, w: 2.4, color: GREEN });
  stat(s, { value: '0', label: 'overlaps or clipped text at\n6 viewports × 3 tabs', x: 8.05, y: 2.1, w: 2.4, color: GREEN });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.55, y: 3.6, w: 6.15, h: 3.0, fill: { color: PANEL }, line: { color: '2B3A66', width: 1 } });
  s.addText('WE SAY SO IN THE APP', { x: 0.8, y: 3.75, w: 5.6, h: 0.3, fontFace: MONO, fontSize: 10, color: SIGNAL, charSpacing: 1.4 });
  bullets(s, [
    'POWER is a ~0.5° × 0.625° reanalysis grid, not a thermometer at the coordinate.',
    'A region preset is the mean of nine grid points, not an area-weighted average.',
    'Serial correlation is reported, not hidden; q-values correct for testing many places.',
    'A gauge is one gauge: dams, diversions and ice change it.',
    'A trend that is not significant is still shown — with a nudge to try a longer period.',
  ], { x: 0.8, y: 4.1, w: 5.7, h: 2.4, size: 11, gap: 4 });

  picture(s, `${SHOTS}/mobile.jpg`, { x: 7.35, y: 3.6, w: 1.95, h: 3.0 }, null, 'contain');
  s.addText('THE SAME APP ON A PHONE', { x: 9.5, y: 3.75, w: 3.3, h: 0.3, fontFace: MONO, fontSize: 10, color: SIGNAL, charSpacing: 1.4 });
  bullets(s, [
    'Runs on a phone, on a slow connection, with no paid key.',
    'NASA data first; every other source labelled in the interface.',
    'Loading, error and empty states for every panel.',
    'The agent keeps a session history with timestamps, and is forbidden from inventing a number, a cause or a citation.',
  ], { x: 9.5, y: 4.1, w: 3.35, h: 2.4, size: 11, gap: 4 });

  s.addText('LIVE: atlas-ace-azael.vercel.app   ·   CODE: github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael   ·   DOCS: SOLUTION.md · PRESENTATION.md · NASA_RESOURCES.md · BUILD_LOG.md', { x: 0.55, y: 6.75, w: 12.3, h: 0.4, fontFace: MONO, fontSize: 9.5, color: MUTED });
}

const buf = await pptx.write({ outputType: 'nodebuffer' });
writeFileSync(OUT, buf);
console.log('written', OUT, buf.length, 'bytes');
