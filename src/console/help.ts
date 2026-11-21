// ATLAS console · help system.
// One registry feeds three surfaces: INFO popovers, hover tooltips and the Flight Manual
// (Help Center). Every entry describes what the control really does in this app.

export interface HelpEntry {
  code: string;
  title: string;
  what: string;
  why: string;
  params?: [string, string][];
  use: string;
  terms?: string[];
  chapter: 'stations' | 'panels' | 'instruments' | 'caution';
}

export const HELP: Record<string, HelpEntry> = {
  // ----- navigation / header
  station: {
    code: 'NAV', title: 'Station select', chapter: 'stations',
    what: 'Switches ATLAS between its six stations. The lit key and the station plate show where you are.',
    why: 'Each station is a different job: testing NASA records, exploring places, flying the globe, browsing 3D models, scanning objects and building models.',
    params: [['01 TRENDS', 'NASA POWER trend detective (this console)'], ['02 PLACES', 'Photoreal 3D places with live signals'], ['03 GLOBE', 'NASA GIBS imagery globe'], ['04 LIBRARY', 'ATLAS 3D model library'], ['05 SCAN', 'Turn a photographed object into a hologram'], ['06 BUILD', 'Agents build a 3D model of a named structure']],
    use: 'Click a station key. The station plate under the clock updates with its purpose, and the breadcrumb shows the path.',
  },
  met: {
    code: 'CLK', title: 'Mission clocks', chapter: 'instruments',
    what: 'MET counts time since you opened this session (hours:minutes:seconds). GMT is the current UTC time, which every log line uses.',
    why: 'Apollo controllers worked to Mission Elapsed Time. Here it simply tells you how long this session has run; it is not spacecraft data.',
    use: 'Read only. Reloading the page restarts MET.',
    terms: ['MET', 'GMT'],
  },
  links: {
    code: 'COMM', title: 'Data link lamps', chapter: 'instruments',
    what: 'Show the real state of the three services ATLAS talks to. POWER: the last NASA POWER request through /api/trends. GIBS: NASA imagery tiles reaching the globe. AI: whether the explainer model answered the status check.',
    why: 'If a number does not appear, these lamps tell you whether the data link or the analysis is at fault.',
    params: [['Green', 'Last contact succeeded'], ['Amber, flashing', 'Request in flight'], ['Red', 'Last contact failed'], ['Off', 'Not contacted yet']],
    use: 'Hover a lamp for the latest latency or tile count.',
    terms: ['NASA POWER', 'NASA GIBS'],
  },
  // ----- left panels
  profiles: {
    code: 'PNL 01', title: 'Mission profiles', chapter: 'panels',
    what: 'Three guided case files. Each loads a place, a variable, a period and an analysis mode, then runs it with live NASA data.',
    why: 'They show the three questions a trend detective asks: what is changing, where, and is it real.',
    params: [['Case 1 · What', 'Scans every variable over Hyderabad'], ['Case 2 · Where', 'Maps humidity change across Telangana'], ['Case 3 · Is it real?', 'Full statistical test for the Amazon Basin']],
    use: 'Click a case file. Its briefing note appears below and every instrument updates to the new configuration.',
  },
  mode: {
    code: 'PNL 02', title: 'Analysis mode selector', chapter: 'panels',
    what: 'A four-position rotary switch that picks how the record is analysed.',
    why: 'One place, several places, a grid of cells and a sweep of variables answer different questions with the same tests.',
    params: [['SGL', 'Single place: one record, full test'], ['CMP', 'Compare 2–6 places with a shared variable and period'], ['MAP', 'Test every NASA POWER grid cell in a box'], ['SCAN', 'Test every variable at one place']],
    use: 'Turn the knob (drag, scroll, arrow keys) or click a position label. The control panels below change to suit the mode.',
    terms: ['Benjamini–Hochberg FDR'],
  },
  target: {
    code: 'PNL 03', title: 'Target acquisition', chapter: 'panels',
    what: 'Sets the place being analysed: search by name or "lat, lon", pick a preset, or click the globe.',
    why: 'Every NASA POWER record is tied to a coordinate. Region presets average a 3 × 3 block of grid points; points use the single nearest cell.',
    params: [['LAT / LON', 'Target coordinates in decimal degrees'], ['PT / RGN', 'Point (one grid cell) or regional mean']],
    use: 'Type and press Find, or press a preset key. The target readout and the ground-track reticle follow.',
    terms: ['Grid cell'],
  },
  sensor: {
    code: 'PNL 04', title: 'Sensor select', chapter: 'panels',
    what: 'Chooses the NASA POWER variable. The group selector picks the family; the keys and the fine-select dial pick the variable.',
    why: 'ATLAS carries 30 variables in four families. Grouping them keeps the console readable.',
    params: [['GROUP', 'Atmosphere · Water · Land · Energy'], ['FINE', 'Steps through the variables in the group'], ['Readout', 'Current variable and its unit']],
    use: 'Turn GROUP, then a key or the FINE dial. If a result is already on screen, ATLAS re-runs it for the new variable.',
    terms: ['NASA POWER', 'MERRA-2'],
  },
  window: {
    code: 'PNL 05', title: 'Record window', chapter: 'panels',
    what: 'Two dials set the first and last year of the record (1981–2025). The timeline shows the window against the full archive.',
    why: 'Trend tests need enough years. ATLAS refuses windows under 10 years; 20 or more is better.',
    params: [['START', '1981 to 2015'], ['END', '1991 to 2025'], ['YRS', 'Length of the window']],
    use: 'Turn either dial. The CONFIG Δ lamp lights until you execute again, so you always know whether the result on screen matches the dials.',
    terms: ['Record window'],
  },
  alpha: {
    code: 'PNL 06', title: 'Significance level (α)', chapter: 'panels',
    what: 'Sets the threshold the console uses for its VERDICT lamp and the shaded zone on the p-value gauge.',
    why: 'α is how much risk of a false alarm you accept. 0.05 is the usual choice; 0.01 is stricter; 0.10 is looser.',
    params: [['0.10', 'Loose: more trends pass'], ['0.05', 'Standard'], ['0.01', 'Strict']],
    use: 'Turn the selector. It never changes the data or the p-value, only the verdict lamp and the gauge zone. The written summary always reports the 95% level.',
    terms: ['p-value', 'α (alpha)'],
  },
  display: {
    code: 'PNL 07', title: 'Display control', chapter: 'panels',
    what: 'Toggle switches for how results are drawn.',
    why: 'Annual totals show the trend; monthly values show the seasonal cycle underneath it.',
    params: [['SERIES', 'Annual or monthly values on the plot'], ['BASEMAP', 'Blue Marble or satellite imagery on the globe'], ['CRT FX', 'Scanlines and glow on the screens (off is easier to read)'], ['RETICLE', 'Ground-track crosshair on the globe']],
    use: 'Flip a switch. Changes apply immediately and are remembered for the session.',
  },
  execute: {
    code: 'PNL 08', title: 'Execute', chapter: 'panels',
    what: 'Runs the analysis for the current mode, target, sensor and window. The guard lifts when you point at it.',
    why: 'Each run calls NASA POWER through ATLAS, so it is a deliberate action rather than something every dial turn triggers.',
    params: [['READY', 'Configuration matches the result on screen'], ['ARMED', 'Something changed: execute to update'], ['BUSY', 'Request in flight']],
    use: 'Press EXECUTE, or press Enter while a console dial has focus.',
  },
  imagery: {
    code: 'PNL 09', title: 'Globe imagery', chapter: 'panels',
    what: 'Picks the NASA GIBS monthly picture painted on the globe for the selected variable.',
    why: 'Seeing the field around the target helps you judge whether one grid cell is typical of its region.',
    params: [['YEAR', '2000–2025'], ['MONTH', 'Jan–Dec']],
    use: 'Turn the dials. Not every variable has a matching GIBS layer; the note says when it does not.',
    terms: ['NASA GIBS'],
  },
  ask: {
    code: 'PNL 10', title: 'Ask ATLAS', chapter: 'panels',
    what: 'Ask a question about the record on screen. A language model answers using the numbers in the current result.',
    why: 'Plain-language follow-ups, such as "is this unusual for here?", without leaving the console.',
    use: 'Available only when the AI link lamp is green. The answer cites the record; check claims about causes against published research.',
  },
  archives: {
    code: 'PNL 11', title: 'Data archives', chapter: 'panels',
    what: 'Links to the public archives ATLAS reads: NASA POWER, NASA GIBS, NASA EONET, USGS Water and ECCC GeoMet.',
    why: 'Anyone can check a number at its source.',
    use: 'Opens the archive in a new tab.',
  },
  groundtrack: {
    code: 'DSP 01', title: 'Ground track display', chapter: 'instruments',
    what: 'The NASA globe with a targeting reticle, the target\'s coordinates and the current imagery layer.',
    why: 'Shows exactly which spot on Earth the numbers describe.',
    use: 'Drag to turn, scroll to zoom, click to set a new target.',
  },
  // ----- right telemetry
  telemetry: {
    code: 'TLM', title: 'Telemetry readout', chapter: 'instruments',
    what: 'Everything ATLAS measured for the current target: the trend rate, its tests, the record and a plain-language summary.',
    why: 'The instruments give the answer at a glance; the teleprinter and data log give the detail.',
    use: 'Close it with × and reopen it by executing again. Copy link shares this exact result.',
  },
  readout: {
    code: 'TLM 01', title: 'Rate readout', chapter: 'instruments',
    what: 'Sen\'s slope: the median rate of change, per decade, in the variable\'s annual unit.',
    why: 'The median of all pairwise slopes resists outliers better than a straight-line fit.',
    use: 'Read only. The stamp beside it is the 95% verdict from the Mann–Kendall test.',
    terms: ["Sen's slope", 'Mann–Kendall test'],
  },
  'g-rate': {
    code: 'GA 1', title: 'Trend rate gauge', chapter: 'instruments',
    what: 'Needle: Sen\'s slope per decade. Shaded arc: its 95% confidence interval. Centre is zero change.',
    why: 'If the shaded arc crosses zero, the direction of change is uncertain.',
    use: 'The scale resizes to each result; the digital readout under the dial gives the exact value.',
    terms: ["Sen's slope", 'Confidence interval'],
  },
  'g-p': {
    code: 'GA 2', title: 'Significance gauge', chapter: 'instruments',
    what: 'White needle: the Mann–Kendall p-value on a log scale. Amber needle: the Hamed–Rao p-value, corrected for year-to-year memory. Green zone: below your α.',
    why: 'Smaller p means a trend this consistent is less likely to be chance. Two needles that disagree warn that autocorrelation matters.',
    use: 'Turn the α selector to move the green zone.',
    terms: ['p-value', 'Mann–Kendall test', 'Hamed–Rao correction', 'α (alpha)'],
  },
  'g-tau': {
    code: 'GA 3', title: 'Kendall τ gauge', chapter: 'instruments',
    what: 'Kendall\'s τ: how consistently the record moves one way, from −1 (always falling) to +1 (always rising).',
    why: 'A small slope can still be very consistent, and a big slope can be noisy. τ shows consistency on its own.',
    use: 'Read only.',
    terms: ['Kendall τ'],
  },
  annunciator: {
    code: 'C&W', title: 'Caution and warning panel', chapter: 'caution',
    what: 'Eight lamps that light from the actual statistics of the result on screen.',
    why: 'Apollo controllers scanned a lamp matrix first. These lamps flag the things a careful analyst checks before believing a trend.',
    use: 'Any amber lamp lights MASTER CAUTION. Press MASTER CAUTION to acknowledge it; it stays lit until the condition clears.',
  },
  'l-sig': { code: 'C&W 1', title: 'VERDICT', chapter: 'caution', what: 'Green when the Mann–Kendall p-value is below your α; dark otherwise.', why: 'The headline answer to "is this trend real?" at the level you chose.', use: 'Change α on PNL 06 to see how strict the verdict is.', terms: ['p-value', 'α (alpha)'] },
  'l-agree': { code: 'C&W 2', title: 'TESTS AGREE', chapter: 'caution', what: 'Green when the plain and the autocorrelation-corrected Mann–Kendall tests reach the same verdict at 95%. Amber when they disagree.', why: 'Climate records often carry memory from one year to the next, which can make a trend look stronger than it is.', use: 'If amber, trust the corrected (Hamed–Rao) result.', terms: ['Hamed–Rao correction', 'Autocorrelation'] },
  'l-cp': { code: 'C&W 3', title: 'SHIFT', chapter: 'caution', what: 'Amber when Pettitt\'s test finds a significant change point: a year where the record stepped up or down.', why: 'A step can look like a smooth trend. The plot marks the year and the before/after means.', use: 'Look at the pink marker on the plot.', terms: ["Pettitt's test"] },
  'l-ac': { code: 'C&W 4', title: 'MEMORY', chapter: 'caution', what: 'Amber when the lag-1 autocorrelation of the record is above 0.3.', why: 'Strong year-to-year memory inflates ordinary trend tests.', use: 'Check TESTS AGREE and the amber needle on GA 2.', terms: ['Autocorrelation'] },
  'l-ci': { code: 'C&W 5', title: 'CI SPANS 0', chapter: 'caution', what: 'Amber when the 95% interval of Sen\'s slope includes zero.', why: 'Then even the direction of change is not settled.', use: 'Look at the shaded arc on GA 1.', terms: ['Confidence interval'] },
  'l-short': { code: 'C&W 6', title: 'SHORT REC', chapter: 'caution', what: 'Amber when the record has fewer than 20 complete years.', why: 'Short records give wide intervals and can be dominated by one unusual period.', use: 'Turn START earlier on PNL 05 and execute.', terms: ['Record window'] },
  'l-config': { code: 'C&W 7', title: 'CONFIG Δ', chapter: 'caution', what: 'White when the target, sensor or window on the panels no longer matches the result on screen.', why: 'Stops you reading old numbers as if they answered your new question.', use: 'Press EXECUTE.' },
  'l-link': { code: 'C&W 8', title: 'DATA LINK', chapter: 'caution', what: 'Green after a successful NASA POWER request, red after a failed one, flashing amber while waiting.', why: 'Separates "no data" from "no trend".', use: 'If red, read the status line under EXECUTE and see Troubleshooting.', terms: ['NASA POWER'] },
  master: { code: 'MC', title: 'Master caution', chapter: 'caution', what: 'Lights and flashes when any amber lamp is on.', why: 'One place to look; the Apollo console worked the same way.', use: 'Press to acknowledge: the flashing stops, the lamp stays lit until every caution clears.' },
  teleprinter: { code: 'TLM 02', title: 'Teleprinter', chapter: 'instruments', what: 'The plain-language summary of the result, printed from the numbers.', why: 'States the rate, the test and what the test does and does not prove.', use: 'Read it aloud in a demo: every figure in it comes from the run.' },
  plot: { code: 'TLM 03', title: 'Record plot', chapter: 'instruments', what: 'The record year by year (or month by month), with Sen\'s trend line, its 95% band and any change point.', why: 'The picture behind every number.', use: 'Hover a point for its value. Use the SERIES switch for monthly values.', terms: ["Sen's slope", "Pettitt's test", 'Confidence interval'] },
  deepread: { code: 'TLM 04', title: 'Deep read', chapter: 'instruments', what: 'Four more views of the same record: Stripes, Seasons, Then/now and Records.', why: 'Shows which months changed, how the average year shifted, and where the extremes sit.', use: 'Press a tab; hover for values. Seasons applies Benjamini–Hochberg across the 12 months.', terms: ['Benjamini–Hochberg FDR', 'Anomaly'] },
  log: { code: 'DSP 02', title: 'Event log', chapter: 'instruments', what: 'A timestamped log (GMT) of what the console did: targets set, requests sent, responses and test results.', why: 'A record of the session you can read back during a demo or when something goes wrong.', use: 'Read only; it keeps the last 80 lines.' },
  scope: { code: 'DSP 03', title: 'Signal scope', chapter: 'instruments', what: 'Replays the monthly series of the current result as an oscilloscope trace, centred on its mean.', why: 'Shows the seasonal rhythm and any drift underneath the annual trend.', use: 'The sweep repeats. With reduced motion on, the full trace is drawn still.', terms: ['Anomaly'] },
  screen: { code: 'PNL 07', title: 'Screen and intensity', chapter: 'panels', what: 'SCREEN switches the 3D stations between a CRT (phosphor on black) and a daylight print (ink on paper); the page reloads to apply it. INTENSITY sets the brightness of every CRT, LCD and segment display on the console.', why: 'A dark room wants the CRT; a projector in a bright hall reads better in daylight or with the intensity up.', params: [['CRT', 'Default. Phosphor green on black, glow on'], ['DAY', 'Ink on warm paper, glow off'], ['INTENSITY', '70% to 130%']], use: 'Turn the dials. Your target, sensor and window survive the reload through the address bar.' },
  bay: { code: 'BAY', title: 'Panels and the panel bay', chapter: 'panels', what: 'Every panel has two buttons on its nameplate: the bar folds it down to the nameplate, × stows it. PANELS in the top rail lists every panel with its state and restores it. The small tabs on the column edges slide a whole column (controls, telemetry, displays) away and back.', why: 'Lets you strip the console down to what a demo needs, or clear everything to look at the globe.', params: [['Bar button / double-click plate', 'Fold to nameplate'], ['×', 'Stow (hide)'], ['PANELS', 'Restore one, restore all, fold controls, clear to globe']], use: 'Your layout is remembered in this browser.' },
  gev: { code: 'GEV', title: "God's Eye View", chapter: 'instruments', what: 'Slides every panel off the screen and gives the whole display to the NASA globe, with an orbital HUD: the DSKY readout, layer keys, preset targets, an altitude tape, a command line and a PROBE readout.', why: 'For looking at the planet itself: finding a place, comparing day and night, reading where a trend sits, then probing it without leaving the view.', params: [['G', 'Enter or leave'], ['Esc', 'Leave'], ['Drag', 'Turn the globe'], ['Scroll / tape / ZOOM', 'Change altitude'], ['Click', 'Set a point target']], use: 'Press GOD\'S EYE in the top rail or G. Click a place or a target key, then PROBE.' },
  dsky: { code: 'GEV 1', title: 'DSKY readout', chapter: 'instruments', what: 'Modelled on the Apollo Guidance Computer display and keyboard (DSKY). Verb 06 Noun 43 was the real AGC request to display latitude, longitude and altitude, and that is what the three registers show: R1 latitude, R2 longitude (degrees, under the cursor when it is over the planet, otherwise the view centre) and R3 the camera altitude in km above the surface.', why: 'An honest, readable position fix in the visual language of the console.', params: [['COMP ACTY', 'A NASA POWER request is in flight'], ['TRACK', 'R1/R2 follow the cursor'], ['TGT LOCK', 'A target is set'], ['OPR ERR', 'The last command or request failed']], use: 'Read only. Altitude is computed from the globe camera, not from any spacecraft.' },
  gevlayers: { code: 'GEV 2', title: 'Layers', chapter: 'instruments', what: 'MARBLE and SAT pick the NASA base imagery. DATA shows the NASA GIBS picture for the current sensor. NIGHT fades in NASA VIIRS city lights. LIVE SUN puts the Sun at the real subsolar point for this moment. GRID draws a 15° latitude/longitude graticule. SPIN turns the planet eastward.', why: 'Context for a trend: what the surface looks like, where people are, where it is day.', use: 'Press a key; lit keys are on. The same commands work on the command line.', terms: ['NASA GIBS'] },
  gevtargets: { code: 'GEV 3', title: 'Targets and probe', chapter: 'instruments', what: 'The seven preset targets fly the globe there and set the target. PROBE TARGET runs the full trend test for the target with the current sensor and window.', why: 'So you can test a place without leaving the orbital view.', use: 'Press a target, then PROBE TARGET. Or click anywhere on the globe to set a point target.' },
  gevprobe: { code: 'GEV 4', title: 'Probe telemetry', chapter: 'instruments', what: 'A compact readout of the last result: Sen\'s slope per decade, the annual record as a trace, the Mann–Kendall p-value and the 95% verdict.', why: 'Enough to judge a place at a glance; the full instruments are one click away.', use: 'Press Open full telemetry to leave the view and see every instrument.', terms: ["Sen's slope", 'Mann–Kendall test', 'p-value'] },
  diag: { code: 'DSP 04', title: 'System diagnostics', chapter: 'instruments', what: 'Live figures from this browser: frame rate, last request latency, records loaded and GIBS tiles received.', why: 'Tells you whether a slow demo is the network or the device.', use: 'Read only.' },
};

export const STATIONS: Record<string, { n: string; name: string; role: string; purpose: string }> = {
  trends: { n: '01', name: 'Trend detective', role: 'ANALYSIS', purpose: 'Test whether a NASA Earth record is really changing, and by how much.' },
  places: { n: '02', name: 'Places', role: 'RECON', purpose: 'Fly to any place in photoreal 3D and read its live signals.' },
  globe: { n: '03', name: 'Globe', role: 'OBSERVE', purpose: 'Turn the whole planet in photoreal 3D or NASA imagery and fly anywhere on it.' },
  library: { n: '04', name: 'Library', role: 'REFERENCE', purpose: 'Open 3D models of spacecraft and machines and pull them apart.' },
  scan: { n: '05', name: 'Scan', role: 'CAPTURE', purpose: 'Photograph an object; ATLAS names its parts and makes a hologram.' },
  build: { n: '06', name: 'Build', role: 'FABRICATE', purpose: 'Name a structure; agents research and model it zone by zone.' },
};

export const GLOSSARY: Record<string, string> = {
  'NASA POWER': 'Prediction Of Worldwide Energy Resources: NASA Langley\'s archive of daily and monthly surface weather and solar variables for any point on Earth, built mainly from the MERRA-2 reanalysis and CERES satellite data.',
  'MERRA-2': 'NASA\'s Modern-Era Retrospective analysis for Research and Applications, version 2: a model that blends decades of observations into a consistent global record.',
  'NASA GIBS': 'Global Imagery Browse Services: NASA\'s tiled imagery service. ATLAS paints its monthly composites on the globe.',
  'Grid cell': 'NASA POWER reports values on a grid of about 0.5° latitude × 0.625° longitude. A point target uses one cell; a region averages nine.',
  'Record window': 'The first and last complete years included in the analysis.',
  "Sen's slope": 'The median of the slopes between every pair of years. A robust trend rate that a single extreme year cannot drag around.',
  'Mann–Kendall test': 'A rank-based test that asks whether later values tend to be higher (or lower) than earlier ones more often than chance would allow.',
  'p-value': 'If nothing were really changing, the chance of seeing a trend at least this consistent. Small p means chance is an unlikely explanation; it does not say what caused the change.',
  'α (alpha)': 'The p-value threshold for calling a result significant. At α = 0.05 you accept a 1 in 20 risk of a false alarm on a trendless record.',
  'Kendall τ': 'Kendall\'s rank correlation between time and the variable, from −1 to +1. Measures consistency of direction rather than size.',
  'Hamed–Rao correction': 'A version of the Mann–Kendall test that widens its variance to allow for autocorrelation (Hamed & Rao, 1998).',
  Autocorrelation: 'Memory in a record: a warm year tends to follow a warm year. It makes ordinary tests over-confident.',
  "Pettitt's test": 'Looks for the single year where the record most likely shifted level, and tests whether that shift is significant.',
  'Confidence interval': 'The range that would contain the true rate in 95% of repeated samples. ATLAS uses Gilbert\'s (1987) interval for Sen\'s slope.',
  'Benjamini–Hochberg FDR': 'A correction for running many tests at once (cells, variables or months). It controls the expected share of false alarms among the results called significant.',
  Anomaly: 'A value minus the average of the record window. Positive means above average.',
  MET: 'Mission Elapsed Time. In ATLAS: time since this session began.',
  GMT: 'Greenwich Mean Time, equivalent here to UTC. All log timestamps use it.',
};

const CHAPTERS: { id: string; title: string }[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'navigation', title: 'Navigation' },
  { id: 'stations', title: 'Stations' },
  { id: 'workflow', title: 'Pre-flight checklist' },
  { id: 'panels', title: 'Control panels' },
  { id: 'instruments', title: 'Instruments' },
  { id: 'caution', title: 'Caution & warning' },
  { id: 'glossary', title: 'Glossary' },
  { id: 'trouble', title: 'Troubleshooting' },
  { id: 'honesty', title: 'Data & honesty' },
];

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
let tipEl: HTMLElement;
let tipTimer = 0;
function initTooltip() {
  tipEl = document.createElement('div');
  tipEl.className = 'c-tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.hidden = true;
  document.body.append(tipEl);
  const show = (t: HTMLElement) => {
    const text = t.dataset.tip;
    if (!text) return;
    tipEl.textContent = text;
    tipEl.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - hh - 8;
    if (y < 6) y = r.bottom + 8;
    x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  };
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    clearTimeout(tipTimer);
    if (!t) { tipEl.hidden = true; return; }
    tipTimer = window.setTimeout(() => show(t), 380);
  });
  document.addEventListener('focusin', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (t && t.matches(':focus-visible')) show(t);
  });
  document.addEventListener('focusout', () => { tipEl.hidden = true; });
  document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); tipEl.hidden = true; });
}

// ---------------------------------------------------------------------------
// INFO popover
// ---------------------------------------------------------------------------
let pop: HTMLElement;
let popFor: HTMLElement | null = null;
function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
function entryHtml(e: HelpEntry, key: string, full = false) {
  const params = e.params?.length ? `<h4>Parameters</h4><dl>${e.params.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
  const terms = e.terms?.length ? `<h4>Terms</h4><p class="hp-terms">${e.terms.map((t) => `<button type="button" class="hp-term" data-term="${esc(t)}">${esc(t)}</button>`).join('')}</p>` : '';
  return `<header class="hp-head"><span class="hp-code">${esc(e.code)}</span><h3 id="hp-${key}">${esc(e.title)}</h3></header>
    <h4>What it does</h4><p>${esc(e.what)}</p>
    <h4>Why it is here</h4><p>${esc(e.why)}</p>
    ${params}
    <h4>When you use it</h4><p>${esc(e.use)}</p>
    ${terms}
    ${full ? '' : `<footer class="hp-foot"><button type="button" class="hp-manual" data-chapter="${e.chapter}" data-key="${key}">Open in Flight Manual →</button></footer>`}`;
}
function initPopover() {
  pop = document.createElement('div');
  pop.className = 'c-pop';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  document.body.append(pop);
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-info]');
    if (btn) { e.preventDefault(); e.stopPropagation(); togglePop(btn); return; }
    const term = t.closest<HTMLElement>('.hp-term');
    if (term) { openManual('glossary', `g-${term.dataset.term}`); closePop(); return; }
    const man = t.closest<HTMLElement>('.hp-manual');
    if (man) { openManual(man.dataset.chapter!, man.dataset.key); closePop(); return; }
    if (!pop.hidden && !pop.contains(t)) closePop();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { closePop(); popFor?.focus(); } });
  window.addEventListener('resize', closePop);
}
function togglePop(btn: HTMLElement) {
  if (popFor === btn && !pop.hidden) { closePop(); return; }
  const key = btn.dataset.info!;
  const e = HELP[key];
  if (!e) return;
  pop.innerHTML = entryHtml(e, key);
  pop.setAttribute('aria-labelledby', `hp-${key}`);
  pop.hidden = false;
  popFor = btn;
  btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth, hh = pop.offsetHeight;
  let x = r.right + 10, y = r.top - 12;
  if (x + w > window.innerWidth - 8) x = r.left - w - 10;
  if (x < 8) x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left - w / 2));
  y = Math.max(8, Math.min(window.innerHeight - hh - 8, y));
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  document.querySelectorAll('[data-help-region].hl').forEach((x) => x.classList.remove('hl'));
  document.querySelectorAll(`[data-help-region="${key}"]`).forEach((x) => x.classList.add('hl'));
}
function closePop() {
  if (pop.hidden) return;
  pop.hidden = true;
  popFor?.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('[data-help-region].hl').forEach((x) => x.classList.remove('hl'));
}

// ---------------------------------------------------------------------------
// Flight Manual (Help Center)
// ---------------------------------------------------------------------------
let manual: HTMLDialogElement;
function chapterHtml(id: string): string {
  const list = (ch: HelpEntry['chapter']) => Object.entries(HELP).filter(([, e]) => e.chapter === ch).map(([k, e]) => `<article class="mn-entry" id="m-${k}">${entryHtml(e, `m-${k}`, true)}</article>`).join('');
  switch (id) {
    case 'overview': return `<h2>ATLAS Earth Trend Console</h2>
      <p class="mn-lede">ATLAS answers one question with NASA data: <b>is this place really changing?</b> You pick a place, a NASA POWER variable and a span of years. ATLAS pulls the record, measures the rate of change and tests whether it could be chance.</p>
      <p>The console is laid out like an Apollo-era operations panel. Controls sit on the left, the ground track in the centre, and telemetry (the results) on the right. Every knob, switch and lamp is connected to the analysis: nothing on this console is decoration.</p>
      <figure class="mn-map"><div><b>LEFT</b><span>Control panels<br>PNL 01–11</span></div><div><b>CENTRE</b><span>Ground track · event log<br>signal scope · diagnostics</span></div><div><b>RIGHT</b><span>Telemetry · gauges<br>caution &amp; warning</span></div></figure>
      <p>Look for the small round <span class="mn-i">i</span> buttons. Each one explains its panel. Hover any control for a one-line hint. Press <kbd>?</kbd> at any time to open this manual, or <b>BRIEFING</b> for a guided tour.</p>`;
    case 'navigation': return `<h2>Navigation</h2>
      <p>The <b>station select</b> keys along the top switch between ATLAS's six stations. The lit key, the station plate and the breadcrumb always tell you where you are.</p>
      <ol class="mn-steps"><li><b>Station plate</b> (top centre): station number, name, role and purpose.</li><li><b>Breadcrumb</b>: station › analysis mode › target.</li><li><b>Panel codes</b> (PNL 01, GA 2, C&amp;W 3…) match the entries in this manual.</li><li><b>Panels</b>: every nameplate has a fold button and a stow button (×). <b>PANELS</b> in the top rail restores them; the tabs on the column edges slide whole columns away.</li><li><b>God's Eye View</b>: <b>GOD'S EYE</b> in the top rail, or <kbd>G</kbd>, clears the console for the globe; <kbd>Esc</kbd> brings it back.</li><li><b>Keyboard</b>: <kbd>Tab</kbd> moves between controls; on a dial use <kbd>←</kbd><kbd>→</kbd>, <kbd>PgUp</kbd><kbd>PgDn</kbd>, <kbd>Home</kbd><kbd>End</kbd>; <kbd>Enter</kbd> on a dial executes; <kbd>?</kbd> opens this manual; <kbd>Esc</kbd> closes it.</li><li><b>Moving the camera</b> (Places, Globe, Library, Scan, Build): <kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd> forward and back, <kbd>A</kbd><kbd>D</kbd> slide, <kbd>Q</kbd>/<kbd>←</kbd> and <kbd>→</kbd> turn, <kbd>+</kbd><kbd>−</kbd> zoom, hold <kbd>Shift</kbd> for 3× speed. On the Earth, right-drag slides along the ground and the wheel zooms toward the cursor. The <b>NAV</b> pad in Places and Globe does the same with the mouse.</li></ol>
      ${`<article class="mn-entry">${entryHtml(HELP.station, 'm-station', true)}</article>`}`;
    case 'stations': return `<h2>Stations</h2><div class="mn-stations">${Object.entries(STATIONS).map(([k, s]) => `<article><span class="hp-code">STN ${s.n} · ${s.role}</span><h3>${esc(s.name)}</h3><p>${esc(s.purpose)}</p>${k === 'trends' ? '<p class="mn-note">This console. Everything in chapters 4–7 describes it.</p>' : ''}</article>`).join('')}</div>`;
    case 'workflow': return `<h2>Pre-flight checklist</h2><p class="mn-lede">A complete analysis in six steps.</p>
      <ol class="mn-check">
        <li><b>MODE</b> · Set PNL 02 to SGL for one place.</li>
        <li><b>TARGET</b> · Search a place on PNL 03, press a preset, or click the globe. Confirm LAT/LON.</li>
        <li><b>SENSOR</b> · Turn GROUP on PNL 04 and pick a variable. Check the unit on the readout.</li>
        <li><b>WINDOW</b> · Set START and END on PNL 05. Aim for 20+ years.</li>
        <li><b>EXECUTE</b> · Press EXECUTE on PNL 08. Watch DATA LINK go amber, then green.</li>
        <li><b>READ</b> · Rate on the readout and GA 1, significance on GA 2, then scan the C&amp;W panel. Any amber lamp needs a look before you quote the result.</li>
      </ol>
      <p>Then go further: open <b>Deep read › Seasons</b> to see which months drive the trend, switch PNL 02 to MAP to see where it happens, or SCAN to see what else changed.</p>`;
    case 'panels': return `<h2>Control panels</h2>${list('panels')}`;
    case 'instruments': return `<h2>Instruments</h2>${list('instruments')}`;
    case 'caution': return `<h2>Caution &amp; warning</h2>${list('caution')}`;
    case 'glossary': return `<h2>Glossary</h2><dl class="mn-gloss">${Object.entries(GLOSSARY).map(([k, v]) => `<dt id="m-g-${esc(k)}">${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    case 'trouble': return `<h2>Troubleshooting</h2><dl class="mn-gloss">
      <dt>DATA LINK is red</dt><dd>NASA POWER or the ATLAS server did not answer. Read the status line under EXECUTE, wait a minute and execute again. NASA POWER occasionally rate-limits.</dd>
      <dt>"Choose at least 10 years"</dt><dd>END must be at least 9 years after START. Turn either dial on PNL 05.</dd>
      <dt>CONFIG Δ stays lit</dt><dd>The panels differ from the result on screen. Press EXECUTE.</dd>
      <dt>No picture on the globe</dt><dd>Not every variable has a NASA GIBS layer, and GIBS only covers 2000 onwards. The note on PNL 09 says so. The trend numbers are unaffected.</dd>
      <dt>AI lamp is off</dt><dd>The server has no model key, so Ask ATLAS is hidden. Everything else works.</dd>
      <dt>Everything feels slow</dt><dd>Check System diagnostics: a low frame rate means the device is struggling; turn CRT FX off. High latency means the network.</dd>
      <dt>A panel disappeared</dt><dd>It was stowed. Press PANELS in the top rail and switch it back on, or press Restore all.</dd>
      <dt>The console is gone and only the globe shows</dt><dd>God's Eye View is on. Press G, Esc or EXIT VIEW.</dd>
      <dt>Animations are distracting</dt><dd>ATLAS follows your system's reduced-motion setting: needles jump instead of swinging, the scope draws still.</dd></dl>`;
    case 'honesty': return `<h2>Data &amp; honesty</h2>
      <p>Every number on the telemetry side comes from a live NASA POWER request made when you press EXECUTE, analysed by ATLAS's own statistics code (Sen's slope, Mann–Kendall, Hamed–Rao, Pettitt, Benjamini–Hochberg), which is checked against SciPy and pymannkendall.</p>
      <p>The console styling is inspired by Apollo-era mission control. <b>None of it is spacecraft telemetry.</b> MET is your session time; the link lamps, log and diagnostics describe this browser's real requests.</p>
      <p>A significant trend shows that something changed. It does not show why. Check published research before naming a cause.</p>`;
    default: return '';
  }
}
function initManual() {
  manual = document.createElement('dialog');
  manual.className = 'c-manual';
  manual.setAttribute('aria-labelledby', 'mn-title');
  manual.innerHTML = `<div class="mn-frame">
    <header class="mn-top"><div><span class="hp-code">AFM-01 · REV B</span><h1 id="mn-title">ATLAS Flight Manual</h1></div>
      <label class="mn-search"><span class="visually-hidden">Search the manual</span><input type="search" placeholder="Search controls, instruments, terms" /></label>
      <button type="button" class="mn-close" aria-label="Close manual">×</button></header>
    <div class="mn-body"><nav class="mn-toc" aria-label="Manual chapters">${CHAPTERS.map((c, i) => `<button type="button" data-ch="${c.id}"><span>${String(i + 1).padStart(2, '0')}</span>${c.title}</button>`).join('')}</nav>
    <div class="mn-page" tabindex="-1"></div></div></div>`;
  document.body.append(manual);
  const page = manual.querySelector<HTMLElement>('.mn-page')!;
  manual.querySelector('.mn-close')!.addEventListener('click', () => manual.close());
  manual.addEventListener('click', (e) => { if (e.target === manual) manual.close(); });
  // Escape always closes, even from the search field (which would otherwise just clear itself).
  manual.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); manual.close(); } });
  manual.querySelector('.mn-toc')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ch]');
    if (b) showChapter(b.dataset.ch!);
  });
  const input = manual.querySelector<HTMLInputElement>('.mn-search input')!;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { showChapter('overview'); return; }
    const hits = Object.entries(HELP).filter(([, e]) => `${e.title} ${e.what} ${e.code} ${e.why}`.toLowerCase().includes(q));
    const gl = Object.entries(GLOSSARY).filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(q));
    page.innerHTML = `<h2>Search: “${esc(input.value)}”</h2>${hits.map(([k, e]) => `<article class="mn-entry">${entryHtml(e, `s-${k}`, true)}</article>`).join('')}${gl.length ? `<dl class="mn-gloss">${gl.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}${!hits.length && !gl.length ? '<p>No matches. Try “p-value”, “window” or “lamp”.</p>' : ''}`;
    manual.querySelectorAll('.mn-toc button').forEach((b) => b.classList.remove('is-on'));
  });
  page.addEventListener('click', (e) => {
    const term = (e.target as HTMLElement).closest<HTMLElement>('.hp-term');
    if (term) { e.stopPropagation(); showChapter('glossary', `g-${term.dataset.term}`); }
  });
}
function showChapter(id: string, anchor?: string) {
  const page = manual.querySelector<HTMLElement>('.mn-page')!;
  page.innerHTML = chapterHtml(id);
  manual.querySelectorAll<HTMLElement>('.mn-toc button').forEach((b) => { const on = b.dataset.ch === id; b.classList.toggle('is-on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  page.scrollTop = 0;
  if (anchor) {
    const el = page.querySelector<HTMLElement>(`#${CSS.escape(`m-${anchor}`)}`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash-in'); }
  } else page.focus({ preventScroll: true });
}
export function openManual(chapter = 'overview', key?: string) {
  if (!manual.open) manual.showModal();
  const ch = key && HELP[key] ? HELP[key].chapter : chapter;
  showChapter(ch, key);
}

// ---------------------------------------------------------------------------
// Briefing (guided tour)
// ---------------------------------------------------------------------------
export interface TourStep { sel: string; title: string; text: string }
let tour: { steps: TourStep[]; i: number } | null = null;
let tourEl: HTMLElement;
let ring: HTMLElement;
function initTour() {
  ring = document.createElement('div');
  ring.className = 'c-ring';
  ring.hidden = true;
  tourEl = document.createElement('div');
  tourEl.className = 'c-tour';
  tourEl.setAttribute('role', 'dialog');
  tourEl.setAttribute('aria-live', 'polite');
  tourEl.hidden = true;
  document.body.append(ring, tourEl);
  tourEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-t]');
    if (!b || !tour) return;
    if (b.dataset.t === 'next') stepTour(tour.i + 1);
    else if (b.dataset.t === 'back') stepTour(tour.i - 1);
    else endTour();
  });
  document.addEventListener('keydown', (e) => {
    if (!tour) return;
    if (e.key === 'Escape') endTour();
    if (e.key === 'ArrowRight') stepTour(tour.i + 1);
    if (e.key === 'ArrowLeft') stepTour(tour.i - 1);
  });
  window.addEventListener('resize', () => { if (tour) stepTour(tour.i); });
}
export function startTour(steps: TourStep[]) {
  tour = { steps, i: 0 };
  stepTour(0);
}
function stepTour(i: number) {
  if (!tour) return;
  if (i >= tour.steps.length) { endTour(); return; }
  tour.i = Math.max(0, i);
  const s = tour.steps[tour.i];
  const target = document.querySelector<HTMLElement>(s.sel);
  if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = target?.getBoundingClientRect();
  ring.hidden = !r;
  if (r) Object.assign(ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  tourEl.hidden = false;
  tourEl.innerHTML = `<span class="hp-code">BRIEFING · ${tour.i + 1} / ${tour.steps.length}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
    <div class="ct-actions"><button type="button" data-t="end">End</button><span></span>${tour.i ? '<button type="button" data-t="back">Back</button>' : ''}<button type="button" data-t="next" class="ct-next">${tour.i === tour.steps.length - 1 ? 'Finish' : 'Next'}</button></div>`;
  const w = tourEl.offsetWidth, hh = tourEl.offsetHeight;
  let x = r ? r.right + 18 : window.innerWidth / 2 - w / 2;
  let y = r ? r.top : window.innerHeight / 2 - hh / 2;
  if (r && x + w > window.innerWidth - 10) x = r.left - w - 18;
  if (r && x < 10) { x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left)); y = r.bottom + 14; if (y + hh > window.innerHeight - 10) y = r.top - hh - 14; }
  tourEl.style.left = `${Math.max(10, x)}px`;
  tourEl.style.top = `${Math.max(10, Math.min(window.innerHeight - hh - 10, y))}px`;
  tourEl.querySelector<HTMLButtonElement>('.ct-next')?.focus();
}
function endTour() {
  tour = null;
  tourEl.hidden = true;
  ring.hidden = true;
  try { localStorage.setItem('atlas-briefed', '1'); } catch { /* storage unavailable */ }
}
export function briefed() { try { return localStorage.getItem('atlas-briefed') === '1'; } catch { return true; } }

export function initHelp() {
  initTooltip();
  initPopover();
  initManual();
  initTour();
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === '?' && !t.closest('input, textarea, [contenteditable]')) { e.preventDefault(); openManual(); }
  });
}
