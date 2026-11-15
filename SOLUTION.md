# ATLAS EARTH — what it solves, what NASA expected, and how our solution answers it

**NASA Space Apps Challenge 2026 · “Be An Earth System Trend Detective!”**
**Team:** Ace Azael
**Live app:** <https://atlas-ace-azael.vercel.app/> · **Repository:** <https://github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael>
**Documented:** 15 November 2026

---

## 1. The brief

NASA Space Apps asks teams to build an app that helps **people understand Earth as a
system**, using NASA data, in a single sitting, on a laptop or a phone, without a paid
service. This year's challenge is titled *“Be An Earth System Trend Detective!”*

The challenge is deliberately not “draw a chart”. The word **detective** is the
instruction: find a change, prove that the change is real, and explain it without
overclaiming.

### 1.1 What a NASA judge is really looking for

| What the challenge implies | What judges check |
|---|---|
| Use NASA data | Is the data actually NASA POWER / GIBS / EONET, and is the provenance visible in the product? |
| Find a trend | Is there a measured rate of change over time, not a single reading? |
| Prove it | Is there a real statistical test, with its assumptions and limits stated? |
| Explain it | Can a non-specialist understand what changed, where, how much and how confident we are? |
| Work for anyone | Does it load on a phone, on a slow connection, with no paid keys? |
| Be honest | Are missing values, failures, uncertainty and non-NASA data labelled instead of hidden? |

### 1.2 What a typical entry gets wrong

Most “earth trend” demos fail on the same four points, and ATLAS EARTH is built against
exactly those four:

1. **A slope drawn through a line is not a trend test.** No p-value, no confidence interval.
2. **A single point is not a place.** A coastal city and a mountain are not one number.
3. **A picture is not an explanation.** A map with a red dot says nothing about significance.
4. **Silent failure is the worst kind.** If a gauge is missing, the demo invents a value.

### 1.3 Requirement-by-requirement compliance

**Objectives (the four required elements):**

| Objective | How ATLAS EARTH meets it | Evidence | Status |
|---|---|---|---|
| **1. Identify Earth science variables of interest that can be investigated for potential trends** | 30 NASA POWER variables in four groups, plus USGS/ECCC streamflow. The **Scan all variables** view runs *every* variable at a place, ranks them by Sen's slope and marks which are significant after a Benjamini–Hochberg false-discovery-rate correction | 30 variables verified against live POWER requests; the sweep returns a ranked list with q-values | **Met** |
| **2. Acquire the data variables for a particular region** | Curated regional presets, free-text geocoding, `lat, lon`, tapping the globe, a nine-sample regional mode, and **Map the change**, which analyses every POWER grid cell in a box around the place | Region presets return a labelled “mean of 9 NASA POWER grid points”; the map returns per-cell slope, p and q | **Met** |
| **3. Generate and visualize a time series over a long enough period** | Monthly POWER series from 1981, any 10–45 year window, annual *and* monthly charts with the fitted Sen line, plus a NASA GIBS imagery scrubber (year/month) | Default record: 1996–2025, 30 complete years, 9 grid points | **Met** |
| **4. Statistical analysis: rate of change and significance** (t-test / Mann–Kendall / confidence intervals) | Sen's slope (rate), tie-corrected Mann–Kendall (p), Sen 95% interval (Gilbert 1987) and OLS 95% interval + R², **Hamed–Rao autocorrelation-corrected MK**, **Pettitt change point**, and **BH false discovery rate** across compared places | Result card: +0.32 °C/decade, MK p = 0.007, Sen 95% interval 0.15–0.59 °C/decade, autocorrelation-corrected p, change point | **Met** |

**Considerations (optional, but addressed):**

| Consideration | How ATLAS EARTH addresses it |
|---|---|
| **Audience: students and the public; “simple definitions of the variables would help”** | Every variable has a plain-language definition shown under the picker and in the result card (“Air temperature — Temperature at 2 m. The classic warming signal.”), with its unit and its real source. The deterministic summary is written in plain English and never over-claims. |
| **“Users could respond to a short series of questions… allow searching of related data variables”** | **Ask ATLAS** takes a question in plain language, sees the screen (place, variable, live layers, trend facts) and can act on it. The **Scan all variables** view answers “what is changing here?” without the user having to know which variable to ask for. |
| **“Provide a couple of demonstration examples that the user could watch”** | Three **case files** run as guided demonstrations: *Case 1 — what* (Hyderabad is getting dimmer), *Case 2 — where* (one region, two directions), *Case 3 — is it real?* (the Amazon heats and dries). The app also opens on a finished Amazon Basin result. |
| **SI: “identify data with the potential to show trends in particular areas… characteristics of a region such as a desert, rain forest, tidal estuary, or the atmosphere above a large city”** | The variable scan ranks every NASA variable at the chosen place and keeps only the significant ones; the trend map does the same across a region, so a desert, a rainforest, an estuary or a city all get their own answer without prior knowledge. |
| **“Finding a trend is interesting even if it doesn't reach significance… a longer period may be all it needs”** | Any 10–45 year window can be chosen, and the result card says so explicitly when a trend is not significant: *“This trend is not significant at 95% for this window — but it is not ‘no trend’ either. Try a longer period, or read it as ‘no change detected’.”* |
| **Temporal resolutions (hourly, 3-hourly, daily, monthly)** | Monthly POWER for the gridded variables (the brief's easiest tier) and **daily** USGS discharge reduced to annual means, so both resolutions in the brief are genuinely used. |
| **Hydrological data tools (CUAHSI)** | Streamflow comes from the official USGS and ECCC gauge networks that CUAHSI points to, with the gauge ID, name, distance, licence and data age on screen. |
| **“Trends can be non-linear… detecting and analyzing linear trends would be a great start”** | Linear trends are what we detect and we say so; the monthly series shows the seasonal cycle; the **Pettitt change point** flags a structural break that a single straight line would hide. |
| **“Changes can trend one way in one region and the opposite way in another, even when the same process drives both”** | This is the heart of the comparison view and of the trend map: the same variable, the same test, several places, and the places can disagree — which is exactly what the brief says to expect. Case file 2 demonstrates it. |

**Summary: every required objective is met, and each optional consideration in the brief is
addressed in the product.**

---

## 2. The problem we solve

**A non-specialist cannot find out what is changing at their own location on Earth, with a
number they can trust and a source they can check.**

The specific, concrete version of that problem:

- NASA publishes the data (POWER monthly point series, GIBS imagery, EONET events) but the
  raw feeds are reanalysis grids, JSON, and WMS layers. Reading them takes a terminal, a
  script and a statistics course.
- Someone who wants to know “is my region warming, and should I believe that?” gets either
  a clickbait map or a paywalled product. Neither tells them the confidence interval, the
  number of complete years, or that the grid cell is 50 km across.
- Comparing two places is harder still: you have to make sure both places use the same
  variable, the same period, the same reduction and the same test, or the comparison is
  meaningless. Almost nobody does this by hand.
- And the geography itself is hard to trust: a photoreal 3D globe is beautiful but it is
  not NASA data, and a NASA globe is honest but not legible for a layperson. Most apps
  pick one and hide the other.

### 2.1 The user's job in ATLAS EARTH

> Pick a NASA variable and a place → get the record, the rate, the significance test, the
> source — and then ask the same question of several places at once, and see the planet
> either as Google/Cesium photoreal tiles or as NASA's own Blue Marble, in the same app.

---

## 3. Our solution

**ATLAS EARTH is one app with six tabs where the NASA data core, the tested statistics, the
two globes and the agent all work together.**

| Tab | What it does for the detective |
|---|---|
| **Trends** | The workbench: 30 NASA POWER variables, any place, 10–45 years, a chart, Sen’s slope, a Mann–Kendall p-value, an OLS interval, CSV, and a **comparison mode** that runs the identical test across 2–6 places. The globe behind the data can be NASA Blue Marble or photoreal. |
| **Places** | “What is changing *here*?” — search any place, land on it in 3D or on the NASA globe, and read a science card with three 30-year records (temperature, precipitation, streamflow) and the nearest gauge. |
| **Globe** | The third tab: a full-screen planet with search, Ask, fly-to, Details, Trends, Compare, live signals and layers — in **both** renderers, switchable in one click. |
| **Library / Scan / Build** | The preserved ATLAS Live hologram modes (explode, identify, build), so the NASA work sits on top of a real 3D application rather than replacing it. |

### 3.1 The science (deterministic, server-side, in `api/_trends.ts`)

| Step | Rule |
|---|---|
| Fetch | NASA POWER monthly point series, 1981 onward, one grid cell (or nine for a region preset) |
| Clean | POWER `-999` values are **dropped**, never interpolated; a year counts only if all 12 months are present |
| Reduce | Day-weighted monthly mean for intensive variables; yearly sum for precipitation, snowfall, evapotranspiration, frost days, heating degree days |
| Rate | **Sen’s slope** — median of all pairwise slopes (robust to outliers) |
| Test | **Tie-corrected Mann–Kendall** — S, variance, continuity-corrected z, two-sided p; significant at **p < 0.05** |
| Cross-check | **OLS** slope, approximate 95% interval and R² |
| Report | The rate, the p-value, the interval, the number of complete years, the sample size and the exact API URL |

The language model never computes, never sees the raw series and is never asked for a
number. It receives a small fact sheet and is explicitly forbidden from inventing a value,
a cause, a source or a forecast. If the model is offline, the deterministic explanation
remains.

### 3.2 The comparison analysis (the part that makes it a *detective* tool)

Single-place trends are easy to cherry-pick. The comparison view makes the honest question
answerable: **is this place changing faster than that one?**

- The same variable, the same period and the same test are applied to every place.
- 2–6 places, chosen from presets, typed names (Nominatim) or `lat, lon`.
- Output: a slope chart (solid = significant, faded = not), a table with coordinates,
  sample count, slope, p-value, significance and complete years, a **deterministic brief
  summary** written from the returned numbers, a **dynamic limits summary**, and a CSV.
- The limits are not boilerplate: the summary states the coarse grid, the differing number
  of complete years, the Mann–Kendall independence assumption, **the absence of a
  multiple-comparison correction**, the fact that a slope is a rate and not a level, and
  that place names come from a geocoder, not from NASA.

Verified locally and live:

| Place | Sen slope | p | Significant | Complete years |
|---|---|---|---|---|
| Amazon Basin | +0.32 °C/decade | 0.007 | **Yes** | 30 |
| Fraser Valley, BC | +0.32 °C/decade | 0.035 | **Yes** | 30 |
| Himalayas | −0.04 °C/decade | 0.669 | No | 30 |
| Sahel | −0.10 °C/decade | 0.412 | No | 30 |

### 3.3 The two globes, and why showing both is the point

| | Photoreal 3D | NASA Blue Marble |
|---|---|---|
| Renderer | Google Photorealistic 3D Tiles through Cesium ion asset 2275207 (the friend’s existing `src/earth.ts`) | NASA GIBS Blue Marble, VIIRS city lights, live subsolar terminator, atmosphere and stars (`src/globe.ts`) |
| Token | `CESIUM_ION_TOKEN` or `GOOGLE_MAPS_KEY` | none |
| Same controls | search, fly-to, Ask, Details, Trends, Compare, Spin, City lights, Live clouds, Reset, live signals, lens row | the same |
| Attribution | “Imagery and 3D tiles © Google · streamed through Cesium ion” | “NASA GIBS Blue Marble + VIIRS city lights · NASA POWER for trends” |

The point of the switch is honesty and legibility together: a judge can see in one click
that the photoreal tiles are a *map*, while the statistics come from NASA POWER. City lights
and live clouds are NASA layers, so pressing them in photoreal mode switches the renderer
and applies the layer rather than faking it.

### 3.4 The agent (configured for ATLAS exploration)

- **Ask ATLAS** on the Globe tab, in the Trends panel and in the console.
- The server prompt asks for the **complete picture**: what is happening, where and when,
  the key numbers with the source behind each one, and what the data cannot tell us. It is
  also told never to call a change unusual, extreme or caused without support.
- The agent sees the screen as context: the current place, the live signal layers, the
  selected variable, the trend fact sheet (slope, p-value, years, source) or the comparison
  table.
- It can act: `fly_to`, `globe_view`, `show_layer`, `find_signals`, `get_weather`,
  `set_lens`, `orbit`, `isolate`, `build_model`.
- **Session history** with timestamps is kept in the Trends tab and the Globe tab, shared
  between them, with a *Clear session* button, and the same history is sent back as model
  context so a follow-up question understands the previous answer.
- Keys live only in server environment variables. The browser never receives them. When a
  model’s free quota runs out, the app falls back to another model and finally to a keyless
  open model, so it answers instead of showing a quota error.

### 3.5 Hydrology, the one deliberate non-NASA exception

NASA has no keyless point API for river discharge. Rather than invent one, ATLAS uses the
official federal gauge networks and **says so on the card**:

- **USGS Water Services** in the United States (`00060` daily mean discharge, ft³/s → m³/s).
- **ECCC MSC GeoMet** in Canada (active hydrometric stations, monthly mean discharge, m³/s).

Verified: California → USGS `11242000` (16.6 km away, 29 complete years); Fraser Valley →
ECCC `08MH002` (9.4 km, 30 years). The Amazon Basin has no active gauge nearby and the app
returns an honest **404** rather than a fabricated series.

---

## 4. Data, with provenance

### 4.1 NASA data used directly

| Service | Endpoint | Use | Key needed? |
|---|---|---|---|
| NASA POWER / MERRA-2 | `power.larc.nasa.gov/api/temporal/monthly/point` | 30 monthly variables, the trend core | no |
| NASA GIBS | `gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` | Blue Marble, VIIRS city lights, MODIS Terra, MERRA-2 monthly overlays | no |
| NASA EONET | `eonet.gsfc.nasa.gov/api/v3/events` | live natural events (wildfires, storms, sea ice) | no |
| NASA Data Access Viewer | `power.larc.nasa.gov/data-access-viewer/` | linked, plus its parameter/export workflow reproduced | no |

The POWER parameter set was checked against POWER’s public parameter manager (1,388 monthly
parameters) and each shipped parameter was exercised against live point requests. Five
growing-degree-day parameters returned HTTP 500 during testing and were **not shipped**; no
substitute values were invented.

### 4.2 Supplementary data, always labelled

| Data | Service | Licence |
|---|---|---|
| Streamflow (US) | USGS Water Services | U.S. public domain |
| Streamflow (Canada) | ECCC MSC GeoMet, Geo.ca | Open Government Licence – Canada |
| Place search and place type | OpenStreetMap Nominatim / Overpass | ODbL |
| Photoreal 3D tiles | Google via Cesium ion asset 2275207 | Google tile policies |
| Earthquakes | USGS Earthquake Hazards Program | U.S. public domain |
| Current weather | Open-Meteo | CC BY 4.0 |
| Sun position | SunCalc | BSD-2-Clause |

---

## 5. Architecture

```text
Browser (Vite + TypeScript)
  index.html          six tabs, panels, switches
  src/main.ts         mode wiring, the globe tab, Places, flights, the agent context
  src/trends-ui.ts    trend panel, chart, statistics, comparison, CSV, AI gate
  src/trends.ts       variable catalogue, presets, GIBS URLs, types
  src/globe.ts        NASA Three.js globe (Blue Marble, VIIRS, live sun, clouds, view centre)
  src/earth.ts        Cesium / Google Photorealistic 3D Tiles renderer + live tile frame
  src/stage.ts        hologram stage, camera rig, Earth camera placement
  src/agent.ts        agent client, session history
  src/gestures.ts     MediaPipe hand tracking

Vercel serverless functions (Node + TypeScript)
  api/_trends.ts      POWER, USGS/ECCC, annualisation, Sen, Mann-Kendall, OLS, cache
  api/trends.ts       validated GET, 10–45 year window, CDN cache headers
  api/trend-explain.ts explanation from computed facts only
  api/ask.ts          agent + scene tools + the complete-answer rules
  api/_nebius.ts      keyed providers (native Gemini transport), model fallback chain, keyless fallback
  api/status.ts       which model and which map token are live
  api/geocode.ts      Nominatim place search
  api/_explore.ts     variable scan and trend map (merged detective-upgrade branch)
```

- **Hosting:** Vercel, `maxDuration: 300` for API functions.
- **Caching:** NASA responses cached 12 hours server-side and at the CDN (`s-maxage=43200`).
- **Secrets:** model keys only in server environment variables; the map token is intentionally
  browser-visible because Google streams the tiles, and must be restricted to the site.
- **Graceful degradation:** no token → NASA globe; no model key → deterministic explanation
  and a keyless fallback; a failed gauge → an honest 404; a missing month → dropped, not filled.

---

## 6. Evidence that it works

Everything below was measured, not asserted.

### 6.1 The numbers

| Check | Result |
|---|---|
| Amazon Basin, air temperature, 1996–2025 | **+0.32 °C/decade**, Mann–Kendall **p = 0.007**, significant, 30 complete years, 9 grid points |
| Amazon Basin, precipitation | −196 mm/decade, p = 0.0031 |
| Amazon Basin, daily maximum | +0.48 °C/decade, p = 0.0153 |
| Cloud amount (a null result, shown as such) | −0.57 %/decade, p = 0.669, **not significant** |
| California streamflow | USGS `11242000`, 16.6 km, 29 years, +1.65 m³/s/decade, p = 0.339 |
| Fraser Valley streamflow | ECCC `08MH002`, 9.4 km, 30 years, +1.52 m³/s/decade, p < 0.0001 |
| Amazon Basin streamflow | honest **404**: no active gauge nearby |
| Comparison (4 places) | 2 of 4 significant, correct ranking, 7 limits, CSV exported |

### 6.2 The globes agree with each other

Projecting real surface points through the tile transform and the camera, photoreal versus
NASA Blue Marble at the same centre: **≤3 px difference on a 1440 px screen** for Australia
(centre, west, east), north, south and east reference points.

Live interaction: **spin −6.61° in 3 s** (eastward, ground moves right) and **drag right
300 px → centre longitude −99.96°** (the ground follows the cursor). The same behaviour in
both renderers.

### 6.3 The interface holds up

A six-viewport audit (360×740, 390×844, 474×1008, 768×1024, 1024×768, 1440×900) across the
Trends, Places and Globe tabs: **no overlapping panels, no clipped text, no horizontal
overflow, no console or page errors** after the fixes listed in `BUILD_LOG.md`.

### 6.4 The agent answers

Ask ATLAS on the Trends tab answered in ~10 s with a complete explanation that included the
rate, the significance, the period and an explicit statement of what the data cannot show.
Session history listed the question and the answer with timestamps in both panels, and
cleared on request.

---

## 7. Limits we state out loud

- NASA POWER is a ~0.5° × 0.625° **reanalysis grid**, not a thermometer at the coordinate.
- A region preset is the mean of nine grid points, **not** an area-weighted basin average.
- Mann–Kendall assumes independent annual values; the **Hamed–Rao autocorrelation-corrected
  p-value is reported next to it** so serial correlation is visible rather than hidden.
- The comparison reports a **Benjamini–Hochberg q-value** across the compared places, so a
  group of tests is corrected; the ranking still describes rates, not levels.
- Streamflow is one gauge, affected by dams, diversions, ice and channel change.
- GIBS overlays are monthly composites; the satellite base is a daily mosaic, not a photograph.
- 26 of the 30 POWER variables have no verified matching GIBS layer, so no overlay is shown
  for them.
- The keyless explanation model is third-party and rate-limited.
- Photoreal tiles are coarse in some regions and are never smoothed to hide it.
- The app never fills a missing observation and never invents a citation.

---

## 8. Why this is a defensible answer to the brief

1. **It is NASA data at the core, not NASA data in the footer.** Every trend number comes
   from NASA POWER, verified against the live endpoint, with the exact request one click
   away.
2. **The statistics are deterministic and stated.** Sen’s slope, a tie-corrected
   Mann–Kendall test, an OLS interval, complete-year counts and no interpolation.
3. **The comparison is the detective tool.** Same variable, same period, same test, with the
   limits of that test printed next to the result.
4. **The geography is honest.** Two renderers, one switch, every source named in the UI, and
   a fallback that is a NASA globe rather than a wireframe.
5. **The agent is fenced in.** It can act, it sees the screen, it is told to give the
   complete picture, and it is forbidden from inventing a number, a cause or a source.
6. **It works for a stranger on a phone, for free**, with loading, error and empty states,
   and a documented path to run it in one command.

---

## 9. Running it

```bash
git clone https://github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael.git
cd Be-An-Earth-System-Trend-Detective-Team-Ace-Azael
npm install
npx vercel dev --listen 3001
```

Optional environment variables (all optional for the NASA core):

```bash
GEMINI_API_KEY=        # or NEBIUS_API_KEY / NVIDIA_API_KEY / GROQ_API_KEY
CESIUM_ION_TOKEN=      # or GOOGLE_MAPS_KEY, for the photoreal globe
ATLAS_KEYLESS_MODEL=off
```

Production build: `npm run build` and `npx tsc -p api/tsconfig.json --noEmit`.

---

## 10. Where the rest of the documentation lives

| File | Contents |
|---|---|
| `PRESENTATION.md` | Deck outline, demo script, feature tour, API reference, judge Q&A |
| `README.md` | Setup, deployment, environment variables, file map |
| `NASA_RESOURCES.md` | Every endpoint, field, unit, licence and limitation |
| `BUILD_LOG.md` | Chronological engineering log with the measured evidence |
| `SOLUTION.md` | This document |

---

## 11. Credits

NASA POWER, NASA GIBS and NASA EONET (U.S. Government work; NASA acknowledgement
requested) · USGS Water Services and the USGS Earthquake Hazards Program (public domain) ·
Environment and Climate Change Canada, MSC GeoMet and Geo.ca (Open Government Licence –
Canada) · OpenStreetMap (© OpenStreetMap contributors, ODbL) · Open-Meteo (CC BY 4.0) ·
Google Photorealistic 3D Tiles and Cesium ion (Google tile policies) · Three.js,
3d-tiles-renderer, MediaPipe, transformers.js, SunCalc · the original ATLAS Live
application by the upstream team · Science Gothic, Mona Sans and Monaspace Krypton (SIL OFL
1.1) · **Team Ace Azael**, MIT licensed.
