# ATLAS EARTH

**NASA Space Apps Challenge 2026 · “Be An Earth System Trend Detective!”**

Pick a NASA Earth variable and a place. ATLAS draws the 30-year record, measures the trend, tests whether it is statistically significant, and shows the same planet in NASA imagery. It is the friend's ATLAS Live interface, rebuilt around a working NASA data core that needs no paid token.

- **Live:** <https://atlas-ace-azael.vercel.app/>
- **Repository:** <https://github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael>
- **Team:** Ace Azael

## The short version

| Question | What ATLAS does |
|---|---|
| What is changing? | **30 NASA POWER parameters plus streamflow**, grouped into Atmosphere, Water, Land and Energy: temperature, daily highs and lows, dew point, wet-bulb, humidity, specific humidity, pressure, wind at 2 m and 10 m, rainfall, snowfall, evaporation, three soil-wetness layers, precipitable water, skin and soil temperature, frost days, snow depth and cover, heating degree days, sunlight, clear-sky sunlight, thermal infrared, PAR, albedo and cloud cover |
| Where? | Search any place, pick a regional preset, or tap the globe. The globe flies to the coordinate |
| How much? | Sen's slope per decade, fitted change over the period, OLS interval and R² |
| Is it real? | Tie-corrected Mann–Kendall test; p < 0.05 is called significant |
| Can I see it? | Blue Marble / MODIS satellite globe with NASA GIBS monthly overlays and a year/month scrubber |
| Can I take it with me? | Download the annual + monthly series as CSV, or open the exact NASA POWER API request and the POWER Data Access Viewer |
| Where is the water? | Annual streamflow from the nearest active **USGS** gauge in the US or **ECCC** gauge in Canada |
| Can it explain? | A short server-side explanation from a keyed model, or a keyless open-model fallback. The model receives pre-computed facts only |

The default view is **Amazon Basin · Air temperature · 1996–2025**: **+0.32 °C per decade**, Mann–Kendall **p ≈ 0.007**, significant at the 95% level.

## What is NASA data, and what is not

**NASA first:**

- **NASA POWER / MERRA-2** monthly point series for 30 gridded variables (`api/_trends.ts`).
- **NASA GIBS** for Blue Marble, VIIRS city lights, MODIS Terra true colour and monthly temperature / precipitation / soil-moisture / wind overlays.
- **NASA EONET** for the preserved open natural-events layer in Places.

**Deliberate supplementary data, always labelled:**

- **USGS Water Services** for US streamflow (`00060` daily mean discharge).
- **ECCC MSC GeoMet** for Canadian hydrometric stations and monthly mean discharge.
- **Geo.ca / Government of Canada open maps** linked as Canada's open geospatial entry point.
- **OpenStreetMap** for place search and preserved city builds.
- **USGS earthquakes** and **Open-Meteo** for the preserved Places live signals.

No keyless NASA point API for river discharge was found. Streamflow therefore comes from ground gauges, and the app says so on the card, in the result and in `NASA_RESOURCES.md`. It never presents gauge data as a NASA grid.

## Three ways to use it

### 1. Trend Detective (default)

- Choose a variable group, a NASA parameter, a place and a 10–45 year period.
- Run the NASA numbers.
- Read the rate, significance badge, annual or monthly chart, full statistics table and source note.
- Scrub NASA imagery by year and month; switch between Blue Marble and MODIS Terra satellite.
- Download the annual + monthly series as CSV, open the exact POWER API request, or open the POWER Data Access Viewer. The viewer itself blocks embedding (`X-Frame-Options: DENY`), so ATLAS links to it rather than pretending to host it.
- Use **Ask ATLAS** for a plain-language explanation. It is gated on a live model, keyed or keyless.

### 2. Places with NASA science

The original Places mode expected Cesium ion or Google photoreal tiles. Those tokens are not configured here, so Places falls back to the NASA globe rather than a wireframe:

- Search a place or tap the Earth.
- The globe flies close to it (2.35 Earth radii, closer than the regional trend view), drops a pulsing marker on the exact coordinate, and reports the latitude and longitude.
- A **NASA science card** loads three 30-year records in parallel: air temperature, precipitation and the nearest streamflow gauge.
- Each row shows slope, mean, p-value, significance and gauge distance.
- **Open in Trend Detective** carries the place straight into the full analysis.
- If a Cesium / Google key is later added, the original photoreal Places path still runs.

### 3. The preserved ATLAS Live modes

- **Library** — explode and inspect NASA and engineering holograms with hand tracking.
- **Scan** — identify an object with a vision model and lift a photo into a 3D point cloud.
- **Build** — construct a hologram from research and reference imagery.
- **Places** — live signals, sun position and city builds remain available where their inputs exist.

Hand tracking, the Three.js stage and the Vercel API layout are the friend's work; the NASA trend core, globe, hydrology and fallback are new.

## Statistics, without hand-waving

Implemented deterministically in `api/_trends.ts`:

- **Sen's slope** — median of all pairwise slopes, reported per year and per decade.
- **Mann–Kendall** — tie-corrected S, variance, continuity-corrected z, two-sided p-value; significance at p < 0.05.
- **OLS** — slope, approximate 95% confidence interval and R², used as a cross-check.
- **Annualization** — day-weighted monthly mean, or a monthly sum for precipitation, snowfall, evapotranspiration, frost days and heating degree days. A year needs all 12 months.
- **Missing data** — POWER `-999` values are dropped, never interpolated. The count of complete years is shown.
- **Regional mode** — the mean of nine POWER grid points, explicitly labelled as a sample mean, not an area-weighted basin average.

The language model never sees the raw series and is never asked to compute. It receives a small JSON fact sheet and must not invent a number, cause, source or forecast. If it is offline, the deterministic explanation remains.

## Run it

```bash
npm install
npx vercel dev --listen 3001
```

Open <http://localhost:3001>. `vite` alone does not serve the `/api` functions; use `vercel dev` for the full app. `vite preview` serves `index.html` for `/api/*`, so the app now rejects that payload with a clear message instead of rendering an empty result.

Production build:

```bash
npm run build
npx tsc -p api/tsconfig.json
```

### Environment variables

All are optional. No key is needed for the NASA trend core, the NASA globe, USGS/ECCC streamflow or the Places NASA science card.

```bash
# Keyed model (one is enough) for the full agent and preferred explanations.
NEBIUS_API_KEY=
NVIDIA_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=

# Optional keyless explanation model. Defaults to the anonymous Pollinations endpoint.
ATLAS_KEYLESS_MODEL=off          # disable
ATLAS_KEYLESS_MODEL=gpt-oss-20b  # or pin another OpenAI-compatible id

# Optional photoreal Places tiles.
CESIUM_ION_TOKEN=
GOOGLE_MAPS_KEY=
```

Keys are read only in server functions. They are never sent to the browser.

## API

| Route | Purpose |
|---|---|
| `GET /api/trends?variable=t2m&lat=-3.5&lon=-62.5&start=1996&end=2025&mode=region&name=Amazon%20Basin` | NASA POWER series + Sen / Mann–Kendall / OLS |
| `GET /api/trends?variable=streamflow&lat=49.2&lon=-122.7...` | Nearest active USGS or ECCC gauge and its annual record |
| `POST /api/trend-explain` | Two-sentence explanation from pre-computed statistics |
| `GET /api/status` | Which model, keyless fallback and map token are actually live |
| `GET /api/signals?layer=events` | Preserved NASA EONET open events |
| `POST /api/geocode` | Place search |

Trend responses are cached for 12 hours server-side and at the CDN. Failures are explicit: a `404` for a place with no gauge, a `502` for a federal service that did not answer. Nothing is fabricated.

## Files that matter

```text
api/_trends.ts        NASA POWER, USGS/ECCC, annualization, Sen, Mann–Kendall, OLS
api/trends.ts         validated GET endpoint + cache headers
api/trend-explain.ts  model explanation from computed facts
api/_nebius.ts        keyed providers + keyless open-model fallback
src/globe.ts          NASA Three.js day/night globe, satellite mode, flights, marker
src/trends.ts         variable catalogue, presets, GIBS URLs, client types
src/trends-ui.ts      trend panel, chart, AI gate, Places globe integration
src/main.ts           mode wiring, Places fallback, NASA science card
index.html            trend panel, result card, archives, science card
src/style.css         responsive layout, fallback and card styles
NASA_RESOURCES.md     every endpoint, field, licence and limitation
BUILD_LOG.md          what was actually built, tested and deployed
```

## Verified examples

| Place | Variable | Result |
|---|---|---|
| Amazon Basin, 1996–2025 | Air temperature | +0.323 °C/decade, p = 0.00745, significant |
| Amazon Basin, 1996–2025 | Precipitation | −196 mm/decade, p = 0.0031 |
| Sahel, 1996–2025 | Precipitation | +62 mm/decade |
| Amazon Basin | Daily maximum temperature (`T2M_MAX`) | +0.477 °C/decade, p = 0.0153 |
| Amazon Basin | Cloud amount (`CLOUD_AMT`) | −0.572 %/decade, p = 0.6685, not significant |
| Amazon Basin | Precipitable water (`PW`) | 25 years, +0.23 cm/decade, p < 0.001 |
| India Gate | Precipitable water (`PW`) | 25 years, +0.177 cm/decade, p = 0.00138 |
| California, 37°N 119.5°W | Streamflow | USGS `11242000`, 16.6 km, 29 years, +1.645 m³/s/decade, p = 0.339 |
| Fraser Valley, BC | Streamflow | ECCC `08MH002`, 9.4 km, 30 years, +1.523 m³/s/decade, p < 0.0001 |
| Amazon Basin | Streamflow | honest `404`: no active USGS/ECCC gauge nearby |

## Limitations

- NASA POWER is coarse-grid reanalysis, not a local weather station.
- Streamflow is one ground gauge, not a basin average; dams, diversions, ice and channel change can affect it.
- Mann–Kendall assumes independent annual values; serial correlation is not corrected.
- GIBS overlays are monthly composites; the satellite base is a daily true-colour mosaic, not a live photograph.
- No faithful GIBS layer was verified for 26 of the 30 POWER parameters or for streamflow, so no overlay is shown for them.
- The NASA POWER Data Access Viewer blocks embedding, so ATLAS reproduces its parameter/export workflow and links to it. Five POWER degree-day parameters returned HTTP 500 during testing and are not offered.
- The keyless explanation model is third-party and rate-limited. It is a free demo fallback, not a guarantee.
- Photoreal city tiles are token-gated and absent; Places honestly uses the NASA globe instead.
- The app never fills missing observations or invents a citation.

## Credits and licences

- NASA POWER, NASA GIBS and NASA EONET — U.S. Government work; NASA acknowledgement requested.
- USGS Water Services and USGS Earthquake Hazards Program — U.S. public domain.
- Environment and Climate Change Canada, MSC GeoMet, Geo.ca — Open Government Licence – Canada.
- OpenStreetMap — © OpenStreetMap contributors, ODbL.
- Open-Meteo — CC BY 4.0.
- Three.js, MediaPipe, transformers.js and the original ATLAS Live application — see `package.json` and the upstream project.
- Fonts: Science Gothic, Mona Sans, Monaspace Krypton — SIL OFL 1.1.

The project is MIT licensed; see `LICENSE`.
