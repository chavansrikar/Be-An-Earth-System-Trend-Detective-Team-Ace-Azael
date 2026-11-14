# Build log

A record of what was actually built, tested and deployed for the NASA Space Apps 2026 challenge **“Be An Earth System Trend Detective!”**. Times are local to the development machine (14 November 2026).

## Starting point

- The team repository is `chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael`.
- The first commit kept the friend's ATLAS Live application as the baseline: Three.js hologram stage, hand tracking, Library / Scan / Places / Build, AI agent endpoints and the Vercel API layout.
- The only clean baseline commit is `b871a8f` (`ATLAS EARTH: initial baseline built from the ATLAS Live codebase`). The friend's upstream remote is retained as `upstream`; pushes to it are disabled.
- The live Vercel project is `atlas-ace-azael` (<https://atlas-ace-azael.vercel.app/>), linked through `.vercel/project.json`.

## What changed

### 1. NASA trend engine

New server modules:

- `api/_trends.ts` — NASA POWER fetch, annual reduction, Sen's slope, Mann–Kendall, OLS, cache.
- `api/trends.ts` — validated GET endpoint with a 10–45 year window and CDN caching.
- `api/trend-explain.ts` — optional plain-language explanation that receives only pre-computed statistics.

Design decisions:

- NASA POWER monthly point data is the primary series because it is keyless, complete from 1981 and works from a serverless function.
- A region is nine POWER samples within about 2.5°, averaged; this is labelled as a sample mean, not an area-weighted basin average.
- Missing values (`-999`) are dropped. A year is used only when all 12 months are present.
- Annual means are weighted by month length; precipitation and evapotranspiration are summed.
- Statistics are deterministic. The language model never calculates or changes a number.

Verified live before the hydrology work:

| Place | Variable | Result |
|---|---|---|
| Amazon Basin, 1996–2025 | Air temperature | +0.323 °C/decade, Mann–Kendall p = 0.00745, significant |
| Amazon Basin, 1996–2025 | Precipitation | −196 mm/decade, p = 0.0031 |
| Sahel, 1996–2025 | Precipitation | +62 mm/decade |

### 2. Client and globe

- `src/trends.ts` — variable catalogue, place presets, GIBS URL builders, result types.
- `src/globe.ts` — a keyless NASA globe using Three.js: custom day/night shader, Blue Marble, VIIRS city lights, sun glint, atmospheric limb, star field, marker and camera flights.
- Satellite mode uses MODIS Terra corrected reflectance true colour from NASA GIBS.
- Monthly GIBS overlays for temperature, precipitation, soil moisture and wind.
- `src/trends-ui.ts` — the trend panel, chart, basemap toggle, archive links, explanation, year/month playback and Places integration.
- `src/main.ts` — Trends is the default mode; the hologram stage pauses while the globe runs. Existing Library / Scan / Places / Build modes remain reachable.
- The globe opens wide, then flies to the selected region after 700 ms.

### 3. Streamflow and Canada

NASA's keyless point services do not publish river discharge. Rather than invent a NASA layer, streamflow uses:

- **USGS Water Services** in the United States: active site search, daily mean discharge `00060`, converted from ft³/s to m³/s.
- **ECCC MSC GeoMet** in Canada: active hydrometric stations and monthly mean discharge.

Both are exposed under the same `/api/trends` interface and labelled with the gauge name, ID, distance and source.

Bugs found and fixed during testing:

1. `trend()` did not dispatch to `waterTrend()` at all, so streamflow requests fell through to the POWER path and returned `502 NASA POWER answered 422`. Added the dispatch before the POWER series call.
2. ECCC station search was not filtering on `STATUS_EN=Active`, so the first 100 results were mostly discontinued stations. Added the server filter.
3. `Number(null)` is `0` in JavaScript, so an ECCC gauge with no discharge values was silently treated as a zero-flow record. Added explicit null/undefined/empty guards for ECCC and USGS values.
4. Place names were encoded with `+` by `URLSearchParams`, and Vercel's query parser preserved the plus (`Amazon+Basin`). Spaces are now sent as `%20` in both trend clients.
5. A fast preset → variable switch could leave the previous request running and drop the new one. `run()` now uses a request sequence token; stale responses are ignored and the latest request wins.

Streamflow tests after the fixes:

| Place | Gauge selected | Distance | Complete years | Sen's slope | p |
|---|---|---|---|---|---|
| California, 37°N 119.5°W | USGS `11242000`, San Joaquin R above Willow C | 16.6 km | 29 | +1.645 m³/s/decade | 0.339 |
| Fraser Valley, BC | ECCC `08MH002`, Coquitlam River at Port Coquitlam | 9.4 km | 30 | +1.523 m³/s/decade | < 0.0001 |
| Coquitlam, BC | ECCC `08MH002` | 2.2 km | 30 | +1.523 m³/s/decade | < 0.0001 |
| Amazon Basin | none within about 1.5° | — | — | honest `404`: no active USGS/ECCC gauge; streamflow is a ground-gauge variable | — |

The Amazon failure is intentional and is shown as a message, not a fabricated series.

### 4. Keyless open-model explanation

The friend's agent uses NVIDIA Nemotron on a keyed provider. No keyed provider is configured in this deployment.

- `api/_nebius.ts` keeps the existing keyed providers (Nebius, NVIDIA, Gemini, Groq) and adds a keyless OpenAI-compatible fallback at `https://text.pollinations.ai/openai`.
- The fallback model was tested at HTTP 200 with `gpt-oss-20b`.
- `/api/trend-explain` prefers a keyed `MODELS.fast`; if none exists or the keyed call fails, it uses the keyless model.
- The prompt contains only the computed statistics and strictly forbids inventing a number, cause, source or forecast.
- The browser's deterministic explanation remains available even if the model is offline.
- `ATLAS_KEYLESS_MODEL=off` disables the keyless fallback. `ATLAS_KEYLESS_MODEL=<id>` pins another model.

**Limitation:** the keyless endpoint is third-party and rate-limited. It is a demo fallback, not a service-level guarantee. A free `NVIDIA_API_KEY`, `NEBIUS_API_KEY`, `GEMINI_API_KEY` or `GROQ_API_KEY` enables the full keyed path.

### 5. Places: NASA science instead of an empty token gate

The screenshot that prompted this work showed the Places tab with a wireframe globe because `CESIUM_ION_TOKEN` and `GOOGLE_MAPS_KEY` are absent (`/api/status` reports `earth: null`).

Implemented fallback:

- When no map token exists, Places reuses the NASA globe (`body.earth-fallback`) instead of the wireframe.
- Searching a place geocodes it, flies the globe to it, places a pulsing marker and opens `#place-science`.
- Tapping the globe picks a coordinate and runs the same science card.
- The card fetches three 30-year records in parallel: air temperature, precipitation and nearest streamflow gauge.
- It shows the slope, mean, p-value, significance badge, gauge metadata and source links, plus “Open in Trend Detective”.
- The “Whole Earth” button clears the marker and flies back out.
- The fallback is explicit: it is the NASA Blue Marble globe, not photoreal 3D tiles. Blue Marble is used at close range because it is seamless; a daily MODIS scene can show black swath gaps.
- The left panel and top chrome get a ground-colour scrim over bright imagery so the place search and landmark list stay readable.
- Places flies to 2.35 Earth radii, marks the exact coordinate and reports it in the status line.
- On phones the globe docks above the science card and the browse list collapses while the card is open, so the selected place stays visible instead of being covered.

### 6. NASA POWER DAV surface, 30 variables and export

The POWER Data Access Viewer cannot be iframed: it sends `X-Frame-Options: DENY`. The integration therefore brings its data surface into ATLAS instead of embedding the page:

- **30 verified monthly POWER parameters**, grouped as Atmosphere (10), Water (8, including the USGS/ECCC gauge), Land (6) and Energy (6). The catalogue was checked against POWER's public parameter manager and each parameter was exercised against live point requests.
- **Group tabs** keep the panel usable on a phone; each tab shows its variable count.
- **Download CSV** writes the monthly and annual series, with a header naming the variable, POWER parameter, place, coordinates, period, source and access date.
- **Exact NASA POWER API request** opens the same URL the server called. **NASA POWER Data Access Viewer** opens the official DAV.
- Five POWER growing-degree-day parameters (`GDD4_4`, `GDD7_2`, `GDD10`, `GDD13_3`, `GDD15_6`) returned HTTP 500 from POWER during testing, so they were not shipped. No substitute values were invented.

New-variable checks:

| Place | Variable | Complete years | Sen's slope per decade | Mann–Kendall p |
|---|---|---|---|---|
| Amazon Basin | `T2M_MAX` daily maximum | 30 | +0.477 °C | 0.0153 |
| Amazon Basin | `CLOUD_AMT` cloud amount | 30 | −0.572 % | 0.6685 |
| Amazon Basin | `PW` precipitable water | 25 | +0.23 cm | < 0.001 |
| India Gate | `PW` precipitable water | 25 | +0.177 cm | 0.00138 |

### 7. Places fly-to and failure handling

- Places now passes an explicit camera distance of **2.35** Earth radii to the NASA globe, closer than the regional trend view, and marks the exact coordinate.
- Reaching Places from a `?place=` link reports the selected coordinate and science-card state after the flight.
- Clicking a variable while the first trend request is still in flight previously did nothing, because the click only re-ran when a result already existed. Variable clicks now supersede the in-flight request through the existing sequence token.
- Opening the app through `vite preview` makes `/api/trends` return `index.html`. The client now validates the response shape and shows “The NASA API returned an unexpected response…” instead of reading `.place.gauge` on an empty payload. Browser tests confirm no page errors in that case.

## Local verification

- `npx tsc -p api/tsconfig.json` — passes.
- `npm run build` — passes.
- `vercel dev --listen 3001` — the local API and client are served together for browser tests.
- Browser tests cover the default Amazon trend (+0.32 °C/decade), Fraser Valley streamflow, the satellite basemap, Places fallback search and science card, the `?place=india-gate` deep link (camera distance 2.35, marker visible, all three science rows), the 30-variable group tabs, a PW trend, CSV download, the stale-preview failure path, and the mobile layout. Latest run: no console errors, no page errors and no failed requests.
- The mobile check used a 390×844 viewport; the desktop checks used 1440×900.

## Deployment

- Production URL: <https://atlas-ace-azael.vercel.app/>
- Deploy command: `NODE_OPTIONS="--dns-result-order=ipv4first" npx vercel deploy --prod --yes`.
- The production deployment of the hydrology, keyless-explanation, globe and Places-fallback changes is recorded below after it is verified.

## Known limitations

- No paid services or API keys are used. The keyless model and all federal endpoints are free but can be rate-limited or briefly unavailable.
- NASA POWER is reanalysis on a coarse grid, not a local weather station.
- Streamflow is a single ground gauge, not a basin average, and can be affected by dams, diversions, ice and channel change.
- The Mann–Kendall p-value assumes independent annual values; serial correlation is not corrected.
- GIBS overlays are monthly composites; the satellite base is a daily true-colour mosaic, not a live photograph.
- Only temperature, precipitation, root-zone soil moisture and wind have a verified matching GIBS monthly layer. The other 26 POWER parameters and streamflow show no globe overlay rather than a misleading one.
- The NASA POWER Data Access Viewer blocks embedding (`X-Frame-Options: DENY`), so ATLAS links to it and reproduces its parameter/export workflow instead of iframing it.
- Five POWER degree-day parameters returned HTTP 500 during testing and are not offered.
- Photoreal 3D tiles require a Cesium ion or Google Maps key and are not available in this deployment; Places uses the NASA globe.
- EONET and USGS earthquake layers inherit the friend's original implementation and are preserved, not rewritten.
- The app never fills missing observations or invents citations. Failures are shown honestly.

## Reproduction

```bash
git clone https://github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael.git
cd Be-An-Earth-System-Trend-Detective-Team-Ace-Azael
npm install
npx vercel dev --listen 3001
```

Optional environment variables:

```bash
# A keyed model enables the full agent and preferred explanations.
NEBIUS_API_KEY=
NVIDIA_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
# Disable or pin the keyless explanation fallback.
ATLAS_KEYLESS_MODEL=off        # or an OpenAI-compatible model id
# Optional photoreal Places tiles.
CESIUM_ION_TOKEN=
GOOGLE_MAPS_KEY=
```

No key is required to run the NASA trend detective, the NASA globe, the USGS/ECCC streamflow record, or the Places NASA science card.
