# ATLAS v2: what changed

Branch: `atlas-v2`. Built after the NASA Space Apps 2026 Warangal local event.
`main` is the judged submission and stays frozen until global results are out; merge this branch only after that.

## 0. Apollo Mission Control console (the v2 default look)
The Trends station now runs as an Apollo-era operations console. It mixes Mission Control CRTs with skeuomorphic instrument panels. **Every control is wired to the real analysis state; none of them is decoration.**

| Area | What it is | What it controls or reads |
|---|---|---|
| Header rail | Station select keys 01–06, MET and GMT clocks, POWER/GIBS/AI link lamps, HELP, BRIEFING | Real mode switching; link lamps show the real outcome of `/api/trends`, NASA GIBS tile loads and `/api/status` |
| Station plate | Station number, role, purpose, breadcrumb | Follows the station, mode, target and sensor |
| PNL 01 Mission profiles | The three case files, as flight-plan cards | Same case files as v1 |
| PNL 02 Analysis mode | 4-position rotary selector (SGL/CMP/MAP/SCAN) | Single, compare, map and sweep views |
| PNL 03 Target acquisition | LAT/LON segment readouts, PT/RGN lamps, LCD search, preset keys | The target place |
| PNL 04 Sensor select | GROUP rotary switch, FINE dial, LCD readout, backlit variable keys | Variable group and variable |
| PNL 05 Record window | START/END dials with segment readouts, timeline | Start and end years (the window can never drop below 10 years) |
| PNL 06 Test α | 3-position selector (0.10 / 0.05 / 0.01) | The VERDICT lamp and the green zone on the p-value gauge only; the data and the written summary are unchanged |
| PNL 07 Display | Toggle switches: SERIES, BASEMAP, GLOBE, CRT FX, RETICLE | Annual/monthly plot, basemap, globe renderer, screen effects, reticle |
| PNL 08 Execute | Guarded EXECUTE button with READY/ARMED/BUSY lamps | Runs the analysis; ARMED lights when the panels differ from the result on screen |
| PNL 09 Globe imagery | YEAR dial, MONTH selector, date readout | NASA GIBS overlay date |
| Instrument cluster | Analog gauges: RATE (Sen's slope with its 95% interval arc), P-VALUE (log scale, Mann–Kendall needle plus Hamed–Rao needle), KENDALL τ | Read from the result |
| Caution & warning | 8 lamps (VERDICT, TESTS AGREE, SHIFT, MEMORY, CI SPANS 0, SHORT REC, CONFIG Δ, DATA LINK) plus MASTER CAUTION | Each lamp lights from the real statistics; MASTER CAUTION can be acknowledged |
| Teleprinter, CRT plot, CRT deep read, data log | The same result content, restyled | Unchanged numbers |
| DSP 01 Ground track | Reticle over the globe, target label and coordinates; a radar sweep runs only while a request is in flight | |
| DSP 02 Event log | GMT-stamped log of real actions, requests, responses and test results | |
| DSP 03 Signal scope | The current monthly series replayed as an oscilloscope trace | |
| DSP 04 Diagnostics | FPS, link latency, records loaded, GIBS tiles received | Real browser measurements |

**Help system** (`src/console/help.ts`): a single registry feeds three things.
- **INFO buttons** (the round i) on every panel. Each opens: what it does, why it is there, its parameters, how to use it, and terms that link to the glossary.
- **Hover tooltips.**
- **ATLAS Flight Manual.** It opens with HELP or the `?` key and has 10 chapters: overview, navigation, stations, pre-flight checklist, control panels, instruments, caution & warning, glossary, troubleshooting, data & honesty. It is searchable.

**BRIEFING** is an 18-step guided tour.

None of the Apollo styling is presented as spacecraft data. MET is session time, and the lamps, log and diagnostics report this browser's real requests. The manual's "Data & honesty" chapter says this explicitly.

### v2.1 additions
- **Panels you can close.**
  - Every panel's nameplate has a fold button (folds it to the nameplate; double-clicking the plate does the same) and a × button (stows it).
  - The telemetry side is now six modules: TLM 01 Instrument cluster, C&W, TLM 02 Teleprinter, TLM 03 Record plot, TLM 04 Deep read, TLM 05 Data log.
  - Small tabs on the column edges slide the whole CONTROLS, TELEMETRY or DISPLAYS column away. A labelled tab brings it back.
  - **PANELS** in the top rail opens the panel bay. It lists every panel with its state and has *Restore all*, *Fold controls* and *Clear to globe*.
  - The layout is remembered per browser (localStorage).
- **God's Eye View** (`src/console/gev.ts`).
  - Press **GOD'S EYE** or the **G** key. All panels slide off and the globe fills the screen with an orbital HUD:
    - a DSKY readout (Apollo AGC Verb 06 Noun 43: latitude, longitude, altitude) of the cursor position and camera altitude;
    - layer keys (MARBLE, SAT, DATA, NIGHT, LIVE SUN, GRID, SPIN);
    - the 7 preset targets;
    - a clickable altitude tape;
    - a command line (`GOTO`, `LAYER`, `GRID/NIGHT/SUN/DATA/SPIN ON|OFF`, `ZOOM`, `PROBE`, `EXIT`, `HELP`);
    - a PROBE readout that runs the real trend test without leaving the view.
  - Press Esc or G to leave.
  - New globe methods: `view`, `pickAt()`, `setDistance()`, `setGrid()`.
- **The 3D stations are restyled.**
  - New `console` theme (phosphor on black, the default for the Apollo look) and `daylight` theme (ink on paper). They are chosen with the SCREEN selector on PNL 07, or `?theme=`.
  - The Library, Scan, Build, Places and Globe panels, the log, the ask bar and the shelf now use console modules with nameplates.
- **INTENSITY dial** on PNL 07 sets the brightness of every CRT, LCD and segment display.
- **Texture pass.** Paint grain, brushed nameplates, engraved lettering, corner screws, part numbers, a calibration rule down the control column, an execute decal and two-step CRT bezels.
- **Fixes.**
  - Dragging a knob no longer selects text on the page.
  - The segment-display decimal point is larger.
  - The top rail compacts at laptop widths.
  - Nameplates shrink with their panel (container queries).
- The offline preview shows a clear "live build only" placard on the stations that need the network.

Other looks from the style study are still available with `?look=field|modern|survey|skeuo|editorial|mission|riso`.

Small change in shared code: `fmt()` now prints small values as plain decimals (0.064 instead of 6.4e-2). Exponent notation is only used below 0.0001.

The statistics engine (`api/_stats.ts`) is **unchanged**. v2 only reads the same NASA POWER series that `/api/trends` already returns. There are no new serverless functions (still 11 of Vercel Hobby's 12) and no new API keys.

## 0b. 3D stations: navigation and orientation fixes (QA pass, 21 Nov)
Tested station by station in Playwright at 1470×860 and 1190×650 against the live APIs, reading the camera state on every step.

- **Level horizon everywhere.**
  - The camera's up axis was left pointing at north after the top-down and whole-Earth views. That rolled the view when orbiting a landmark in Places and tilted the rover in Library, Scan and Build.
  - The dive now blends the up axis back to the local vertical as it tilts in. Leaving the Earth resets it.
  - Measured roll after landing and after every input is now 0°.
  - Country-scale views stay north-up: north measures at 90° on screen.
- **Mouse control always comes back.** A flight cut short by switching stations used to leave the mouse controls switched off (Library could not be turned). Leaving the Earth now hands them back.
- **No more mid-drag cut-outs on the Earth.** As sharper tiles stream in, the ground height is corrected. Each correction used to run as a 1.2 s scripted move that switched the controls off. It now eases in without taking the camera away.
- **Navigation** (`src/nav.ts`, new):
  - **Keys:** W/S or ↑/↓ move forward and back, A/D slide sideways, Q/← and → turn, + and − zoom, Shift goes 3× faster.
  - **NAV pad:** a hold-to-move pad on Places and Globe.
  - **Speed:** on the real Earth the move scales with height, so a city block and a country both take a second or two.
  - **On the whole planet:** the keys turn the globe.
  - **Hologram stations:** forward closes in and sideways walks round the model. These stations have no pad.
  - **Typing is safe:** keys typed into inputs, the manual or the briefing never move the camera.
- **Mouse on the Earth:**
  - Right-drag slides along the ground.
  - The wheel zooms toward the cursor.
  - The slow showcase orbit stops as soon as you grab the view.
- **Scan and Build start on an empty stage.** The Library rover and its part labels no longer sit behind them.
- **Layout:**
  - **Station-key tooltips:** removed. They covered the station plate that says the same thing; the purpose is kept for screen readers.
  - **Station plate:** at laptop widths it starts right of the left panel instead of running over it.
  - **Part dossier:** opens below the plate.
  - **Build panel:** hugs its content and stops above the ask dock.
  - **Short screens:** the dossier and log tighten so nothing overlaps at 650 px tall.
  - **Long machine names:** they fit the dossier (PERSEVERANCE ROVER).
  - **Dossier label:** it names its station (Library, Scan or Build).
- **Dossier hints:** they describe the mouse and keys. The hand-gesture hints show only when hands are on.
- **Globe search:**
  - Typing a country ("India") flies to the country instead of the India Gate landmark.
  - The search box lets go of the keyboard after a fly, so W A S D work on landing.
- **Station text:** the Globe station description no longer says GIBS only. It is photoreal 3D or NASA imagery.

## 0c. Frame rate and smoothness (21 Nov)
Measured v1 (`main`) and v2 side by side on the same headless renderer, per station.

| Station | v1 fps | v2 before | v2 now |
|---|---|---|---|
| Places | 8.8 | 2.9 | 11.1 |
| Globe | 8.3 | 2.6 | 10.5 |
| Library | 4.4 | 2.1 | 3.1 (bloom kept on for the test; adaptive drops it) |

All figures are fps at a fixed 1× resolution with software WebGL. Real GPUs are far faster; the ratios are what matter.

- **Cause:** the console theme turned on bloom. v1's riso theme had none. Every frame, the photoreal Earth went through a full-screen bloom chain.
- **Bloom:** now holograms only, at half resolution. It is the first thing to drop if frames run slow.
- **No post-processing when no effect is on.** The real Earth with the plain lens renders straight to the screen. That is cheaper, and the canvas's own antialiasing comes back.
- **Adaptive resolution.** It starts at up to 1.5× (retina is 2×) and steps by 0.25:
  - down when frames run under about 42 fps;
  - up after 5 s above about 54 fps.
  - A step that proves too slow becomes the ceiling, so it never see-saws.
  - Tile detail follows the resolution.
  - `?dpr=1.5` pins it.
- **Real-time motion.** Flights and moves keep real time down to 10 fps; they used to slow down below 20. A Colosseum landing in the test went from 102 s to 16 s.
- **No preserved drawing buffer.** That saved a full-screen copy every frame, and nothing read the canvas back.
- **No per-frame layout.**
  - Part labels and the place pin move with transforms and write only what changed. They used to force a layout per label per frame.
  - The stage size is cached.
  - Measured layouts per second on the 3D stations went to 0.
- **Trends scope:** its sweep animation stops while off screen. It used to draw every frame on every station.
- **TUCK (key T, or TUCK in the top rail):**
  - Every panel slides to its nearest edge and the view re-centres, eased.
  - The bar, NAV pad and map credit stay.
  - Only translate and opacity animate. Tucked panels leave rendering and the tab order.
  - The PANELS tab on the left edge, TUCK, or T brings them back.
  - It works on every station, Trends included.
- **Station switches:** panels rise in once (0.34 s) when you arrive at a station. Reduced motion turns all of this off.
- **Top rail fits from 1024 px up.** It used to clip BRIEFING (and at 1024 HELP too). The mission clock leaves the 3D stations below 1600 px, and narrow laptops fold the link lamps.

## 0d. Library catalog: 30 models in 13 categories (22 Nov)
The Library went from 5 models in one row to a catalog.

- **Categories:**
  - Mars & planets, Human spaceflight, Observatories & probes, Robots, Aircraft, Cars.
  - Engines & mechanisms, Phones, Cameras & film, Computers & consoles, Audio & radio, Scientific instruments, Workshop machines.
  - Categories with no model yet stay hidden, so nothing shows empty.
- **Shelf:** CATALOG (with the count), a ‹ category › stepper, and that category's models.
- **Catalog sheet (CATALOG button):**
  - Every model as a thumbnail tile, grouped by category, with a jump bar.
  - Esc or a backdrop click closes it.
  - The thumbnails are real hologram renders (`public/models/thumbs/*.webp`, about 8 KB each).
- **25 new models.** All are free to ship (public domain, CC0 or CC BY) and credited in `public/models/NOTICE.md` and in the on-screen credit line.
  - NASA (public domain): Viking lander, Apollo Lunar Module, Space Shuttle, Crawler-transporter, Chandra, Voyager, Landsat 8, Robonaut 2, X-57 Maxwell.
  - Poly Haven (CC0):
    - payphone; rangefinder camera; turret film camera; 8 mm projector; classic laptop;
    - boombox; cassette player; military radio; two microscopes; binoculars;
    - analog multimeter; spacecraft globe panel; drill press; air compressor; portable generator.
- **Every part is named, and checked.**
  - Each model was split into parts (`tools/parts.mjs`), and each part was rendered on its own and named only when it could be identified.
  - Left and right were checked against the geometry.
  - Pieces that could not be told apart share one name, and parts with the same name come apart together.
  - Models too coarse or too ambiguous to label honestly were left out: Opportunity, Hubble, ISS, GPM, Terra, the EMU suit, Global Hawk, a games console shell, a digital watch.
- **Framing:** the camera pulls back and lifts as a model explodes, using each model's measured exploded size, so tall or wide models (Robonaut, the shuttle stack) stay in view.
- **`tools/parts.mjs`:**
  - Strips textures, bakes transforms, and splits a model into parts: by its own mesh nodes, or by connected shells.
  - Then it simplifies and compresses each model, to about 0.1 to 0.4 MB.
  - `--solo` gives frames and chassis a part of their own, so an engine does not stay fused to the frame round it.

## 1. New design: "Field Instrument"
A neo-brutalist frame with skeuomorphic details, still in the ATLAS Riso palette (blue `#2B44B8`, cream `#F4EFE4`, pink `#FF4FA3`):
- Hard ink borders and offset shadows on every control. Keys press down when clicked.
- Case files are drawn as manila folders with tabs.
- The significance verdict lands as a rubber stamp (green = significant, amber = weak, maroon = not significant).
- LED dots show live state: the active mode, the data source, and the status line (green = ok, pink = error).
- The run button shows a moving hazard stripe while NASA data loads.
- Faint paper grain over the whole page; a halftone dot grid on the left panel.
- Every style is scoped to `html.v2`, so it works with all `?theme=` options.

## 2. Motion
- On first load, the panel powers on with a staggered rise.
- On each result:
  - the card slides in;
  - the headline number counts up;
  - the chart draws left to right;
  - the stats print one row at a time;
  - the verdict stamp thuds down.
- `prefers-reduced-motion` turns all of it off.

## 3. Better trend chart
- **95% band:** the shaded fan around the trend line comes from the Sen slope's Gilbert (1987) 95% interval.
- **Corrected trend line:** it now uses the median intercept, as in `scipy.stats.theilslopes`. v1 drew it through the mean.
- **Change point:** when Pettitt's test finds a significant change point, a pink "shift YEAR" marker appears, with the before and after means drawn as two flat lines.

## 4. Deep Read (new science, `src/deepread.ts`)
A new panel under the chart with four views of the same record:

| View | What it shows | Method |
|---|---|---|
| Stripes | One stripe per year, coloured by its anomaly from the period mean | Annual mean minus period mean, diverging blue to pink |
| Seasons | Which calendar months changed most | Sen's slope and Mann–Kendall for each month, with Benjamini–Hochberg FDR across the 12 months. Solid bar = significant, outline = not |
| Then / now | The average year in the first decade against the last decade | Monthly averages; the shaded gap shows the difference. This is not a significance test, and the caption says so |
| Records | The 5 highest and 5 lowest years, and how many fall in the latest decade | Ranking, compared with the number you would expect if there were no trend |

Every view has hover tooltips, arrow-key tab navigation and a plain-language caption built from the numbers.

## 5. Shareable links
- The address bar updates to the current result, for example `?trend=17.385,78.487&name=Hyderabad&kind=point&var=t2m&from=1996&to=2025`.
- Opening that link re-runs the same analysis, which is useful for judges, demos and posts.
- A new **Copy link** button in the result card copies it.

## 6. Mobile
- The result is a bottom sheet with a grip. Tap or swipe it up to expand to 88% of the screen, and down to collapse.
- Keys and tabs are sized for touch.

## Files touched
| File | Change |
|---|---|
| `src/v2.ts` (new) | Motion, share link, deep-link reader, mobile sheet |
| `src/v2.css` (new) | The Field Instrument design layer |
| `src/deepread.ts` (new) | The Deep Read views |
| `src/trends-ui.ts` | Calls `onTrendRendered()` after each result; the chart gains the band, median-intercept Sen line and change-point marker; `openTrendAt()` takes optional years |
| `src/main.ts` | Calls `initV2()`; opens `?trend=` links |
| `index.html` | Chart legend text |
| `src/console/console.ts` (new) | Builds the console and binds every instrument to the trends state |
| `src/console/instruments.ts` (new) | Reusable Knob, Toggle, Lamp, SegDisplay, Gauge, Scope and CrtLog components |
| `src/console/help.ts` (new) | Help registry, INFO popovers, tooltips, Flight Manual, Briefing |
| `src/console/apollo.css` (new) | The Apollo skin |
| `src/console/bay.ts` (new) | Fold, stow, column slide-away, panel bay |
| `src/console/gev.ts` (new) | God's Eye View HUD and command line |
| `src/globe.ts` | Adds `view`, `pickAt()`, `setDistance()`, `setGrid()` for God's Eye View |
| `src/theme.ts` | Adds the `console` and `daylight` themes; the Apollo look defaults to `console` |
| `src/looks.css` (new) | The style-study looks |
| `offline/` (shim + stub), `vite.offline.config.ts` (new) | Offline preview build only (recorded NASA POWER data); not used by the live site |
| `src/trends-ui.ts` | Broadcasts `atlas:state` events and exports `trendSnapshot()`; the chart reads its ink colour from the canvas |
| `src/nav.ts` (new) | Keyboard and NAV pad camera navigation |
| `src/console/tuck.ts` (new) | TUCK: panels to the edges (key T) |
| `src/stage.ts` (perf) | Adaptive resolution, bloom only on holograms at half resolution, direct render without effects, real-time dt, eased view shift, cached size |
| `src/stage.ts` | Up-axis blending in dive and rise, control hand-back, eased ground correction, `nav` input, map-style pan and zoom-to-cursor on the Earth |
| `src/main.ts`, `index.html` | Empty stage for Scan and Build, nav wiring, globe-orbit keys, country-over-landmark search, mouse hints |
| `src/library.ts` | The catalog: 13 categories, 30 models, credits, licences and part names |
| `src/catalog.ts` (new) | Library shelf (category stepper) and the catalog sheet |
| `src/model.ts`, `src/stage.ts` (library) | Parts with the same name come apart together; measured exploded size drives the camera |
| `tools/parts.mjs` (new) | Splits, names-by-index, simplifies and compresses models into hologram parts |
| `public/models/*.glb`, `public/models/thumbs/` | 25 new models and 30 thumbnails; `NOTICE.md` lists every credit |
| `V2_CHANGES.md` (new) | This file |
