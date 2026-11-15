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

### 8. Photoreal Globe tab, search and LLM fly-to

- Wired the friend's existing `EarthView` Cesium/Google renderer into the third **Globe** tab. The app reads `CESIUM_ION_TOKEN` (Cesium ion asset `2275207`) or `GOOGLE_MAPS_KEY` from `/api/status`; the token itself never enters source control.
- Fixed two integration bugs. An empty `#globe` NASA canvas was sitting above the photoreal stage and showing only its CSS gradient; it is now hidden unless the NASA fallback is active. The whole-Earth camera also aimed at the reoriented surface origin instead of the planet centre; `Stage.holdWholeEarth()` targets `(0, -6,371,000, 0)` and the dive starts from `height - Earth radius`, so the globe stays framed and the fall shrinks continuously instead of jumping.
- Added a Globe panel search form. Nominatim now returns `type`, `class`, `addresstype` and `place_rank`; `viewForGeo()` maps those to a camera distance: country 3,000 km, state 1,600 km, county 250 km, city 6.5 km, town 3.8 km, village 2 km, park 60 km, river 30 km, landmark 420–450 m. Countries, states and counties land top-down; cities and landmarks keep the oblique 3D approach.
- A search from orbit traverses the shortest great-circle arc while holding the camera in orbit, then dives. A search from street level first pulls back to orbit, settles into the whole-Earth hold, traverses and dives. `Back to orbit` reverses the move; `Details` opens the same place in Places with the NASA science card; `Trends` opens its 30-year record.
- Added an optional **Ask the globe** box. It appears only when `/api/status` reports a keyed provider. `AgentContext` gained `onAnswer`/`onError`, the answer renders in the panel, and `fly_to` is routed to the Globe flight rather than forcing Places. The keyless path still explains trends but does not pretend to drive the agent.
- Verified locally: whole-Earth photoreal disc at 1440×900 and 390×844; Statue of Liberty search lands at 420 m; France at 3,000 km; Paris at 6.5 km; Eiffel Tower via a mocked agent `fly_to` with the answer visible; NASA fallback search and Back to orbit; Details opens the science card with all three records. No page errors or failed map requests.

### 9. Native Gemini transport for `AQ.` auth keys

- AI Studio now issues `AQ.` auth keys. Its OpenAI-compatible endpoint rejects them (or times out); native `generateContent` accepts the same key.
- Added a native Gemini transport inside `api/_nebius.ts`. It translates the app's OpenAI-shaped messages to `contents` / `systemInstruction`, converts canvas `image_url` data URLs to `inlineData`, maps function declarations to the OpenAPI subset Gemini accepts, converts function calls and function responses both ways, returns `thoughtSignature` with tool calls (Gemini 3 rejects the follow-up turn without it), supports JSON mode through `responseMimeType`, and maps native errors back to the existing `HttpError` path.
- Model ids are `gemini-3.5-flash` for the agent and vision roles and `gemini-3.5-flash-lite` for fast explanations. `gemini-2.5-*` is retired for new accounts and `gemini-3.8-flash` timed out during testing; fallbacks are discovered from the live model list. Gemini 3 thinks by default, so requests use `thinkingLevel: minimal`, with a `low` retry only for multimodal models that reject `minimal`. Thinking tokens count against `maxOutputTokens`, so the output budget is raised with a cap.
- `fly_to` now reuses curated landmark camera depth: an agent that supplies coordinates for the Eiffel Tower still lands at 720 m rather than the 1 km coordinate default.
- Verified locally against the free key: `/api/status` reports `provider: gemini`, `agent: gemini-3.5-flash`; `/api/ask` returns `fly_to` for the Eiffel Tower in about 28 s; the Globe panel renders the answer and lands at 720 m with no console errors; `/api/trend-explain` returns a complete two-sentence explanation in about 3 s; `/api/scan` identifies the Statue of Liberty and its parts from a live canvas frame; `/api/construct` plans Charminar in four zones.

## Local verification

- `npx tsc -p api/tsconfig.json` — passes.
- `npm run build` — passes.
- `vercel dev --listen 3001` — the local API and client are served together for browser tests.
- Browser tests cover the default Amazon trend (+0.32 °C/decade), Fraser Valley streamflow, the satellite basemap, Places fallback search and science card, the `?place=india-gate` deep link (camera distance 2.35, marker visible, all three science rows), the 30-variable group tabs, a PW trend, CSV download, the stale-preview failure path, and the mobile layout. Latest run: no console errors, no page errors and no failed requests.
- The mobile check used a 390×844 viewport; the desktop checks used 1440×900.

## Deployment

- Production URL: <https://atlas-ace-azael.vercel.app/>
- Deploy command: `NODE_OPTIONS="--dns-result-order=ipv4first" npx vercel deploy --prod --yes`.
- Commit `9ad45d2` deployed the Globe tab, photoreal search, depth-aware fly-to, LLM routing, NASA fallback, Places science hand-off and the reconciled documentation. `CESIUM_ION_TOKEN` is set for Production, Preview and Development.
- Live verification on 14 November 2026: `/api/status` reports `earth.kind = ion`; the whole photoreal Earth renders at 1440×900; **Statue of Liberty** geocodes, traverses from orbit and lands at a 420 m view; **Details** opens Places with the NASA science card: air temperature +0.41 °C/decade (p = 0.005), precipitation +113 mm/year/decade (p = 0.035), and USGS gauge 01393450 at 15.1 km (+0.052 m³/s/decade, p = 0.134, not significant). No console or page errors.
- Commit `767cb4f` deployed the native Gemini transport. Live `/api/status` reports `provider: gemini`, agent and vision `gemini-3.5-flash`, fast `gemini-3.5-flash-lite`, `earth.kind = ion`. Live **Ask ATLAS** returned `fly_to` for the Eiffel Tower (34.8 s); the Globe panel rendered the answer and landed at **720 m** with no console or page errors; **/api/trend-explain** returned a complete explanation (1.5 s); **/api/scan** identified the Statue of Liberty with five parts from a live canvas frame (69.7 s); the Amazon trend is unchanged at +0.323 °C/decade, p = 0.0074.
- `GEMINI_API_KEY` is set for Production, Preview and Development. It was pasted into chat during setup; rotate it in AI Studio and update Vercel when convenient.
- Local verification also covered a mocked agent `fly_to` to the Eiffel Tower, the NASA fallback search for Paris, the 390×844 mobile Globe, and Back to orbit from both renderers.

## Comparison, globe parity and presentation docs

Added after commit `9336359` and verified locally before the next production deploy:

- **Comparison analysis in Trends.** A **Single place / Compare places** switch reuses the same variable and period filters for **2–6 locations**. Places can be curated presets, typed names (Nominatim) or `lat, lon`. Every place gets the same annualisation, Sen’s slope and tie-corrected Mann–Kendall test. The result is a horizontal slope chart, table, deterministic brief summary, dynamic limits and a comparison CSV. Places has **Compare with other places** to seed the view with the current place.
- **Verified comparison:** Amazon Basin **+0.32 °C/decade, p = 0.007**; Sahel **−0.10 °C/decade, p = 0.412**; 1 of 2 significant; seven limits; no console or page errors. A second run used Fraser Valley, BC (+0.30, p = 0.038) and Hyderabad (−0.02, p = 0.943). Tested at 1440×900 and 390×844; table rows no longer clipped.
- **Data-source labels on every tab:** Trends · NASA POWER; Places · Google 3D Tiles · Cesium; Globe · NASA GIBS · Cesium; Library · ATLAS 3D; Scan · Gemini vision; Build · Gemini · OSM.
- **Globe renderer switch.** **Photoreal 3D / NASA Blue Marble** buttons now switch the Globe tab between the friend’s Cesium/Google renderer and the NASA Three.js globe. Search, Ask, Back to orbit, Details, Trends, Spin, City lights, Live clouds and Reset are present in both views. City lights and Live clouds switch to NASA automatically because they are NASA layers.
- **Spin direction fixed.** The shared frame loop now subtracts longitude (`globe.lon - dt * 2.2`) so the photoreal planet rotates eastward. Verified by sampling `atlas.globe.lon`: it decreases while spin is on. Drag pauses; Spin toggles; Reset restores.
- **Typed landmarks keep their curated depth.** Searching **Eiffel Tower** in the Globe panel now lands at **720 m** in both renderers (NASA view reports “Eiffel Tower · 720 m view”); **Paris** still geocodes and lands at a 7 km city view.
- **Mobile heading fixed.** The trend heading is wrapped in a sticky `.trend-head` on phones, so scrolling the panel no longer clips “CHANGING HERE?” under the ATLAS wordmark. Verified at 474×1008 with `scrollTop = 55`: the eyebrow and h1 stay fully visible below the bar.
- **`PRESENTATION.md`** added: complete feature tour, NASA and supplementary data tables, architecture, statistics, comparison, globe depth table, AI safety, API reference, slide outline, six-minute demo script, verification record, limitations, run/deploy commands and judge Q&A.
- **Checks:** `npx tsc --noEmit`, `npx tsc -p api/tsconfig.json --noEmit`, `npm run build` pass. Browser checks at 1440×900, 390×844 and 474×1008 show no console or page errors.

## Known limitations

- The NASA, USGS, ECCC and geocoding endpoints are free and keyless but can be rate-limited or briefly unavailable. Photoreal tiles use a Cesium ion token on its free Community plan; the Globe's LLM box needs a free keyed model provider.
- NASA POWER is reanalysis on a coarse grid, not a local weather station.
- Streamflow is a single ground gauge, not a basin average, and can be affected by dams, diversions, ice and channel change.
- The Mann–Kendall p-value assumes independent annual values; serial correlation is not corrected.
- Comparison mode applies no multiple-comparison correction. Testing 2–6 places at p < 0.05 raises the chance that one crosses the line by chance; the ranking is exploratory and the limits panel says so.
- GIBS overlays are monthly composites; the satellite base is a daily true-colour mosaic, not a live photograph.
- Only temperature, precipitation, root-zone soil moisture and wind have a verified matching GIBS monthly layer. The other 26 POWER parameters and streamflow show no globe overlay rather than a misleading one.
- The NASA POWER Data Access Viewer blocks embedding (`X-Frame-Options: DENY`), so ATLAS links to it and reproduces its parameter/export workflow instead of iframing it.
- Five POWER degree-day parameters returned HTTP 500 during testing and are not offered.
- Photoreal 3D tiles stream at Google's best available level of detail. Some regions, including much of India, are coarse; ATLAS does not smooth or fake them. If the token is absent or rejected, the Globe tab and Places fall back to the NASA globe.
- The Globe's **Ask the globe** box stays hidden until a keyed model provider is configured. Typed place search works without any model key.
- OpenStreetMap Nominatim supplies the place type and coordinates, not NASA. It is used only to choose the camera and the search target.
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
# Photoreal Globe and Places tiles (free Cesium ion Community token).
CESIUM_ION_TOKEN=
# Alternative: Google Map Tiles API key.
GOOGLE_MAPS_KEY=
```

No key is required to run the NASA trend detective, the NASA globe, the USGS/ECCC streamflow record, or the Places NASA science card.
