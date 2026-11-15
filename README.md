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

## Four ways to use it

### 1. Trend Detective (default)

- The globe behind the data can be switched between **NASA Blue Marble** and **Photoreal 3D** (the same switch the Places and Globe tabs use), so every globe in the app behaves the same way.
- Choose a variable group, a NASA parameter, a place and a 10–45 year period.
- Run the NASA numbers.
- Read the rate, significance badge, annual or monthly chart, full statistics table and source note.
- Scrub NASA imagery by year and month; switch between Blue Marble and MODIS Terra satellite.
- Download the annual + monthly series as CSV, open the exact POWER API request, or open the POWER Data Access Viewer. The viewer itself blocks embedding (`X-Frame-Options: DENY`), so ATLAS links to it rather than pretending to host it.
- Use **Ask ATLAS** for a plain-language explanation. It is gated on a live model, keyed or keyless. The answer is complete and specific: the rate, the significance, the source and the limits, and the model is told never to claim a change is unusual or caused by something the data does not support.
- The **Session history** panel under the ask box keeps this session's questions and answers with timestamps, in the Trends tab and in the Globe tab. **Clear session** empties both.
- Switch to **Compare places** to run the same NASA variable, period and trend test across 2–6 locations. The result shows a slope chart, a table, a deterministic brief summary, a limits summary and a comparison CSV. Presets, typed place names and `lat, lon` are accepted; **Compare with other places** in Places seeds it with the current place.

### 2. Globe

A full-screen planet with almost no interface: the third tab after Places. It is the place to look at the Earth rather than read a chart.

- **Two renderers, one switch.** **Photoreal 3D** streams the friend's existing Google Photorealistic 3D Tiles renderer through Cesium ion asset `2275207` (`CESIUM_ION_TOKEN`) or the Google Map Tiles API (`GOOGLE_MAPS_KEY`). **NASA Blue Marble** is the keyless Three.js globe. The switch makes the difference between a photoreal map and NASA's own imagery visible in one click.
- **Feature parity.** Search, Ask the globe (when a keyed model is live), Back to orbit, Details, Trends, Spin, Reset and the renderer switch work in both views. **City lights** and **Live clouds** are NASA layers: if you click them from photoreal, the app switches to the NASA renderer and applies the layer.
- **Photoreal:** drag to orbit, scroll to zoom; the whole-Earth opening shot waits for detailed tiles before settling. The whole planet spins **eastward**; Spin stops and restarts it.
- **Fly to any place**: type a name or `lat, lon` in the panel. ATLAS geocodes it (OpenStreetMap Nominatim), reads the place type, pulls back to orbit, traverses the shortest arc, and dives to a fitting depth: a country is framed at 3,000 km, a state at 1,600 km, a county at 250 km, a city at 6.5 km, a park at 60 km, and a landmark or building at about 420–450 m. Large areas stay north-up and top-down; cities and landmarks tilt to the 3D approach angle. **Back to orbit** returns to the planet.
- **Ask the globe** (when a keyed model is live): the same panel has an ask box. The agent answers in the panel and its `fly_to` tool is routed to the Globe flight, so “take me to the Eiffel Tower” lands at the tower rather than switching to Places. The box stays hidden until `/api/status` reports a keyed provider, so it never promises an agent that is not running.
- **Without a token** it uses the NASA globe, not a wireframe: Blue Marble shaded relief + bathymetry, a bundled 2048 px first paint that upgrades to a 4096 px NASA GIBS mosaic, VIIRS city lights, a live subsolar-point terminator, atmosphere and stars. Search still works and flies the NASA globe to the place.
- **Spin**, **City lights**, **Live clouds** and **Reset** are present in both views. *Live clouds* lifts the day's near-white MODIS Terra clouds onto the seamless Blue Marble base, so the daily scene adds weather without its black swath gaps.
- **Compare** in the place row opens the comparison view in Trends, seeded with the place on the globe.
- The whole-Earth view turns **eastward** and the map is **north up, east right** in both renderers. The tile frame the Cesium/Google renderer uses is not the world's frame (+z is north, -x is east, and +y is *not* up), so the camera is placed on the real local up axis instead of a guessed one.
- Tap the planet to mark a coordinate; **Open this point in Trends** carries it into the full 30-year analysis. After a photoreal landing, **Details** opens the same place in Places with the NASA science card, and **Trends** opens its 30-year record.
- The panel's **Enable photoreal 3D** disclosure explains the free token steps without sending anyone to a dead end.

### 3. Places with NASA science

Places carries the same **Photoreal 3D / NASA Blue Marble** switch as the other tabs, plus the same search, compare, live-signal and lens controls in either renderer.

With a map token configured, Places uses the original photoreal path: search a place, fly to its 3D mesh, then read the science. Without one it uses the NASA globe rather than a wireframe:

- Search a place or tap the Earth.
- With photoreal tiles the camera dives to the geocoded depth; without them the NASA globe flies close to the point (2.35 Earth radii, closer than the regional trend view), drops a pulsing marker, and reports the latitude and longitude.
- A **NASA science card** loads three 30-year records in parallel: air temperature, precipitation and the nearest streamflow gauge. Searches and **Details** from the Globe tab open this card automatically.
- Each row shows slope, mean, p-value, significance and gauge distance.
- **Open in Trend Detective** carries the place straight into the full analysis.
- Photoreal tiles stream only while Places or the Globe tab is visible; the app falls back honestly if the token is absent or rejected.

### 4. The preserved ATLAS Live modes

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

# Optional: pin a model id per role (otherwise the provider's live list picks one).
ATLAS_AGENT_MODEL=
ATLAS_VISION_MODEL=
ATLAS_FAST_MODEL=

# Optional keyless explanation model. Defaults to the anonymous Pollinations endpoint.
ATLAS_KEYLESS_MODEL=off          # disable
ATLAS_KEYLESS_MODEL=gpt-oss-20b  # or pin another OpenAI-compatible id

# Optional photoreal Globe + Places tiles.
CESIUM_ION_TOKEN=
GOOGLE_MAPS_KEY=
```

Keys are read only in server functions. They are never sent to the browser. `CESIUM_ION_TOKEN`
and `GOOGLE_MAPS_KEY` are read by `/api/status` and are intentionally browser-visible tokens;
restrict them to this site in the provider console.

The current Vercel project has `CESIUM_ION_TOKEN` set for Production, Preview and Development,
so the deployed Globe and Places stream photoreal tiles. Replace it with a token from your own
Cesium ion account before reusing this project outside the hackathon. If the token is absent or
rejected, both views fall back to the NASA globe without a black screen.

#### Get the free Cesium ion token (recommended)

The friend's photoreal globe is already implemented in `src/earth.ts`; it only needs a token
that is allowed to read Cesium ion asset **2275207**.

1. Create a free Cesium ion account at <https://ion.cesium.com/signup>. The Community plan is enough.
2. Open <https://ion.cesium.com/assetdepot/2275207> and choose **Add to My Assets**. A token
   cannot read the asset until it is in your account.
3. Open <https://ion.cesium.com/tokens> → **Create token**. Give it `assets:read`, restrict it
   to asset `2275207`, and add your deployed URL (for example
   `https://atlas-ace-azael.vercel.app`) as an allowed referrer.
4. In Vercel open **Project → Settings → Environment Variables**, add `CESIUM_ION_TOKEN` with
   that token for **Production**, then redeploy. Reload `/?mode=globe`; the panel should say
   **Photoreal · Cesium ion** instead of **NASA Blue Marble**.

If the token is missing, rejected, or not allowed to read the asset, the app deliberately stays
on the NASA globe and reports the fallback rather than showing a black canvas.

The alternative is `GOOGLE_MAPS_KEY`: enable the **Map Tiles API** in Google Cloud, create a
browser key restricted to this site, and add it to Vercel. Google requires a billing account;
Cesium ion does not.

#### A free keyed model is separate from the map token

A map token does not enable the language model, and a model key does not enable photoreal tiles.
The app already has a keyless open-model explanation path. To use the full keyed path, add
**one** of these as a Vercel Production environment variable and redeploy:

- `NVIDIA_API_KEY` — build.nvidia.com, free developer credits.
- `NEBIUS_API_KEY` — Nebius Token Factory.
- `GEMINI_API_KEY` — Google AI Studio free tier. AI Studio now issues `AQ.` auth keys, which
  its OpenAI-compatible endpoint rejects, so ATLAS calls native `generateContent` when this
  key is present. Text, tool calls, canvas images and JSON mode all run through that
  transport. Working ids are `gemini-3.5-flash` (agent and vision) and
  `gemini-3.5-flash-lite` (explanations); retired ids are replaced from the live model list,
  and `ATLAS_AGENT_MODEL`, `ATLAS_VISION_MODEL` and `ATLAS_FAST_MODEL` pin a specific one.
- `GROQ_API_KEY` — Groq free tier.

The first key found wins. Never put a key in `src/`, `api/`, or a committed `.env` file; the
server functions read it from the environment and the browser never receives it.

The Globe tab checks `/api/status` on entry and shows its **Ask the globe** box only when a
keyed provider is live. Without a key, place-name search and the NASA trend explanations still
work; the ASK box stays hidden rather than failing at submit time.

## API

| Route | Purpose |
|---|---|
| `GET /api/trends?variable=t2m&lat=-3.5&lon=-62.5&start=1996&end=2025&mode=region&name=Amazon%20Basin` | NASA POWER series + Sen / Mann–Kendall / OLS |
| `GET /api/trends?variable=streamflow&lat=49.2&lon=-122.7...` | Nearest active USGS or ECCC gauge and its annual record |
| `POST /api/trend-explain` | Two-sentence explanation from pre-computed statistics |
| `POST /api/ask` | ATLAS agent: answer plus scene tools (`fly_to`, `focus_part`, layers, feeds) |
| `POST /api/scan` | Vision model: identify an object and its parts from one canvas frame |
| `POST /api/construct` | Plan / build / critique steps for a 3D hologram of a real structure |
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
src/earth.ts          friend's Cesium ion / Google Photorealistic 3D Tiles renderer
src/globe.ts          NASA Three.js globe: progressive Blue Marble, city lights, live sun, clouds
src/trends.ts         variable catalogue, presets, GIBS URLs, client types
src/trends-ui.ts      trend panel, chart, AI gate, Places and Globe globe integration
src/main.ts           mode wiring, Globe tab, Places fallback, NASA science card
index.html            trend panel, result card, archives, science card, Globe panel
src/style.css         responsive layout, fallback, Globe and card styles
public/earth/         local 2048 px Blue Marble + VIIRS city lights (instant first paint)
NASA_RESOURCES.md     every endpoint, field, licence and limitation
BUILD_LOG.md          what was actually built, tested and deployed
PRESENTATION.md       complete presentation guide: features, data, demo script, Q&A
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
- Daily MODIS Terra has black swath gaps. Trends keeps the full daily scene and labels it; the Globe tab's *Live clouds* mode lifts only near-white cloud/snow pixels onto the seamless Blue Marble base, so it is a cloud composite, not the full daily surface.
- No faithful GIBS layer was verified for 26 of the 30 POWER parameters or for streamflow, so no overlay is shown for them.
- The NASA POWER Data Access Viewer blocks embedding, so ATLAS reproduces its parameter/export workflow and links to it. Five POWER degree-day parameters returned HTTP 500 during testing and are not offered.
- The keyless explanation model is third-party and rate-limited. It is a free demo fallback, not a guarantee.
- Photoreal 3D tiles are token-gated and stream at Google's best available level of detail. Coarse areas (much of India, for example) look coarse; the app does not pretend otherwise. Without `CESIUM_ION_TOKEN` or `GOOGLE_MAPS_KEY`, the Globe tab and Places fall back to the NASA globe, and the UI says which renderer is live.
- The Globe's LLM ask box needs a keyed provider. Without one, typed place search still works and the box stays hidden.
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
