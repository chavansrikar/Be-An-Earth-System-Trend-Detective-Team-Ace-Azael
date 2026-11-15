# ATLAS EARTH — complete presentation documentation

**NASA Space Apps Challenge 2026 · “Be An Earth System Trend Detective!”**  
**Team:** Ace Azael  
**Live app:** <https://atlas-ace-azael.vercel.app/>  
**Repository:** <https://github.com/chavansrikar/Be-An-Earth-System-Trend-Detective-Team-Ace-Azael>  
**Documented:** 14 November 2026

This file is the single presentation reference: what was built, which data was used, how the science works, how the app is put together, what to show in a demo, what was verified, and what the honest limits are. `README.md` is the setup guide, `NASA_RESOURCES.md` is the endpoint/field/licence reference, and `BUILD_LOG.md` is the chronological engineering log.

---

## 1. The one-sentence pitch

**ATLAS EARTH turns any place on Earth into a tested NASA climate record, compares several places with the same test, and lets you see the same planet as either a photoreal Google/Cesium globe or a NASA Blue Marble globe — without inventing a number or a citation.**

The front door is not a dashboard. It is a question: **“What is changing here?”** Pick a NASA variable, pick a place, and get the record, the rate, the significance test and the source.

---

## 2. The problem and the answer

The Space Apps challenge asks for an Earth-system trend detective: a way to find a change in NASA Earth data, test it, and communicate it honestly. Most demos stop at a line chart. ATLAS EARTH adds four things that make the result defensible:

1. **A real statistical test.** Sen’s slope, a tie-corrected Mann–Kendall test, and OLS as a cross-check — not a linear fit labelled “trend”.
2. **The same test across places.** Compare 2–6 locations with one shared variable and period, and see which changes are significant.
3. **Two globes, one app.** The photoreal Google Photorealistic 3D Tiles view and the NASA Blue Marble view share search, Ask, fly-to, Details, Trends and the layer controls, so the difference between “a 3D map” and “NASA Earth imagery” is visible rather than described.
4. **Radical labelling.** NASA data is named. Ground-gauge hydrology is named as USGS/ECCC. Google tiles are named as Google. Missing data is shown as missing. The language model is never allowed to compute.

---

## 3. What the app does — feature tour

### 3.1 Trends (default tab)

- **30 NASA POWER monthly variables**, grouped into Atmosphere, Water, Land and Energy.
- **Period:** any 10–45 year window from 1981 to 2025.
- **Place input:** curated regional presets, free-text geocoding, or `lat, lon`.
- **Result card:**
  - Sen’s slope per decade and total fitted change.
  - Mann–Kendall p-value and a significant / not-significant badge.
  - OLS slope, approximate 95% confidence interval and R².
  - Annual time-series chart with the fitted line and the raw monthly series.
  - Complete-year count, period mean and source note.
  - Download the annual + monthly series as CSV.
  - Open the exact NASA POWER API request and the NASA POWER Data Access Viewer.
- **NASA imagery:** year/month scrubber; Blue Marble or MODIS Terra base; monthly MERRA-2 temperature, precipitation, wind and GLDAS soil-moisture overlays where a faithful layer exists.
- **Ask ATLAS:** a plain-language explanation from a live model. The model receives only a pre-computed fact sheet.
- **Comparison mode:** described in section 7.

### 3.2 Places

- Search any place or tap the Earth.
- With a map token, fly the photoreal Cesium/Google globe to the place.
- Without a token, use the NASA Blue Marble globe — never a wireframe or a black canvas.
- **NASA science card** loads three 30-year records in parallel: air temperature, precipitation and the nearest streamflow gauge.
- Each row shows slope, mean, p-value, significance and gauge distance.
- **Open in Trend Detective** carries the place into the full analysis.
- **Compare with other places** opens the comparison view seeded with the current place.
- Preserved ATLAS Live layers remain: live signals, sun position, city builds, earthquake/fire/storm layers.

### 3.3 Globe (third tab, after Places)

- A full-screen planet with a deliberately small control panel.
- **Two renderers, one switch:**
  - **Photoreal 3D** — Google Photorealistic 3D Tiles through Cesium ion asset `2275207`, using the friend’s existing `src/earth.ts` renderer.
  - **NASA Blue Marble** — the keyless Three.js globe in `src/globe.ts`: progressive 2048 → 4096 px Blue Marble, VIIRS city lights, live subsolar-point terminator, atmosphere and stars.
- **Feature parity in both views:** search, Ask the globe (when a keyed model is live), Back to orbit, Details, Trends, Spin, Reset and the renderer switch.
- **City lights** and **Live clouds** switch to the NASA renderer automatically, because VIIRS night lights and NASA GIBS MODIS clouds are NASA layers, not Google tile layers.
- **Fly-to:** geocode a name or `lat, lon`, pull back to orbit, traverse the shortest great-circle arc, then dive to a depth based on the place type.
- **Spin:** the whole-Earth view turns **eastward**. Drag pauses the spin; Spin toggles it.
- **Tap the planet** (NASA view) to mark a coordinate and open it in Trends.

### 3.4 Library, Scan, Build

The original ATLAS Live modes are preserved:

- **Library** — explode and inspect NASA and engineering holograms with hand tracking.
- **Scan** — identify an object with Gemini vision and lift a photo into a 3D point cloud.
- **Build** — plan and build a hologram from research and reference imagery.
- **Hand tracking** — MediaPipe hand control remains available on the hologram modes.

These are the friend’s original work, retained inside the new NASA-first front door.

---

## 4. NASA data used

All endpoints below were tested from this repository on **14 November 2026**. Every NASA endpoint used here is keyless.

### 4.1 NASA POWER — the trend core

- **Service:** NASA Prediction Of Worldwide Energy Resources (POWER), NASA Langley Research Center.
- **Endpoint:** `https://power.larc.nasa.gov/api/temporal/monthly/point`
- **Community:** `AG` (agroclimatology).
- **Grid:** MERRA-2 reanalysis, roughly **0.5° × 0.625°**.
- **Missing values:** POWER `-999` values are dropped, never interpolated.
- **Cache:** 12 hours server-side; CDN `s-maxage=43200, stale-while-revalidate=2592000`.
- **Source:** <https://power.larc.nasa.gov/>

**30 shipped parameters:**

| Group | ATLAS variable | POWER parameter | Unit | Annual reduction |
|---|---|---|---|---|
| Atmosphere | Air temperature | `T2M` | °C | day-weighted mean |
| Atmosphere | Daily maximum air temperature | `T2M_MAX` | °C | day-weighted mean |
| Atmosphere | Daily minimum air temperature | `T2M_MIN` | °C | day-weighted mean |
| Atmosphere | Dew point at 2 m | `T2MDEW` | °C | day-weighted mean |
| Atmosphere | Wet-bulb temperature at 2 m | `T2MWET` | °C | day-weighted mean |
| Atmosphere | Relative humidity at 2 m | `RH2M` | % | day-weighted mean |
| Atmosphere | Specific humidity at 2 m | `QV2M` | g/kg | day-weighted mean |
| Atmosphere | Surface pressure | `PS` | kPa | day-weighted mean |
| Atmosphere | Wind speed at 2 m | `WS2M` | m/s | day-weighted mean |
| Atmosphere | Wind speed at 10 m | `WS10M` | m/s | day-weighted mean |
| Water | Precipitation | `PRECTOTCORR` | mm/day | yearly total (mm/year) |
| Water | Snowfall | `PRECSNOLAND` | mm/day | yearly total (mm/year) |
| Water | Land evapotranspiration | `EVLAND` | mm/day | yearly total (mm/year) |
| Water | Root-zone soil wetness | `GWETROOT` | fraction | day-weighted mean |
| Water | Surface soil wetness | `GWETTOP` | fraction | day-weighted mean |
| Water | Profile soil wetness | `GWETPROF` | fraction | day-weighted mean |
| Water | Precipitable water | `PW` | cm | day-weighted mean |
| Water | Streamflow (ground gauge) | *none — USGS / ECCC* | m³/s | annual mean |
| Land | Earth skin temperature | `TS` | °C | day-weighted mean |
| Land | Soil temperature, layer 1 | `TSOIL1` | °C | day-weighted mean |
| Land | Frost days | `FROST_DAYS` | days/month | yearly total |
| Land | Snow depth | `SNODP` | cm | day-weighted mean |
| Land | Snow cover fraction | `FRSNO` | fraction | day-weighted mean |
| Land | Heating degree days below 18.3 °C | `HDD18_3` | degree-days/month | yearly total |
| Energy | Surface solar energy | `ALLSKY_SFC_SW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Clear-sky solar energy | `CLRSKY_SFC_SW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Downward thermal infrared | `ALLSKY_SFC_LW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Photosynthetically active radiation | `ALLSKY_SFC_PAR_TOT` | MJ/m²/day | day-weighted mean |
| Energy | Surface albedo | `ALLSKY_SRF_ALB` | fraction | day-weighted mean |
| Energy | Cloud amount | `CLOUD_AMT` | % | day-weighted mean |

The five POWER growing-degree-day parameters (`GDD4_4`, `GDD7_2`, `GDD10`, `GDD13_3`, `GDD15_6`) returned HTTP 500 during testing and are deliberately excluded. No substitute values were invented.

### 4.2 NASA GIBS — imagery

- **Service:** NASA Global Imagery Browse Services (GIBS), NASA EOSDIS.
- **Endpoint:** `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`
- **Protocol:** WMS 1.3.0, `EPSG:4326`, JPEG, 4096×2048 desktop / 2048×1024 mobile.

| Purpose | GIBS layer | Notes |
|---|---|---|
| Day-side base | `BlueMarble_ShadedRelief_Bathymetry` | static NASA Blue Marble mosaic |
| Night lights | `VIIRS_CityLights_2012` | static 2012 VIIRS composite |
| Satellite base | `MODIS_Terra_CorrectedReflectance_TrueColor` | daily true colour, not one instant |
| Temperature overlay | `MERRA2_2m_Air_Temperature_Monthly` | monthly MERRA-2 |
| Precipitation overlay | `MERRA2_Precipitation_Bias_Corrected_Monthly` | monthly MERRA-2 |
| Soil moisture overlay | `GLDAS_Underground_Soil_Moisture_Monthly` | last month available is 2024; labelled |
| Wind overlay | `MERRA2_Surface_Wind_Speed_Monthly` | monthly MERRA-2 |

No GIBS overlay is shown for the other 26 POWER parameters or for streamflow, because no faithful matching layer was verified. The app says so instead of substituting a misleading image.

### 4.3 NASA EONET — open natural events

- **Service:** NASA Earth Observatory Natural Event Tracker.
- **Endpoint:** `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=60`
- **Use:** preserved **Places → Live signals → Events** layer.
- **Licence:** U.S. public domain (NASA).

### 4.4 What is deliberately not NASA

| Data | Service | Use | Licence |
|---|---|---|---|
| Streamflow (US) | USGS Water Services, parameter `00060` daily mean discharge | nearest active gauge, annual mean | U.S. public domain |
| Streamflow (Canada) | ECCC MSC GeoMet hydrometric stations and monthly mean discharge | nearest active gauge, annual mean | Open Government Licence – Canada |
| Place search | OpenStreetMap Nominatim via `/api/geocode` | name → coordinates and place type | ODbL |
| Photoreal 3D tiles | Google Photorealistic 3D Tiles via Cesium ion / Google Map Tiles API | Globe and Places visuals | Google tile policies |
| Earthquakes | USGS Earthquake Hazards Program, M2.5+ past 7 days | preserved live-signal layer | U.S. public domain |
| Current weather | Open-Meteo | preserved point conditions | CC BY 4.0 |
| Sun position | `suncalc` in the browser | preserved Places sun dial | BSD-2-Clause |
| Building footprints | OpenStreetMap Overpass | preserved city builds | ODbL |

**Why streamflow is not NASA:** no keyless NASA point API for river discharge was found. The app uses the official federal gauge networks and names the gauge, its distance and its source. It never presents gauge data as a NASA grid.

**Why Google tiles are not NASA:** the friend’s photoreal renderer is preserved because it makes the Globe feel like a place, not a diagram. The app labels it as Google/Cesium everywhere and keeps it separate from every NASA statistic. NASA Blue Marble is always available without a token.

---

## 5. Architecture

```text
Browser (Vite + TypeScript)
├── index.html                  Trends / Places / Globe / Library / Scan / Build UI
├── src/main.ts                 mode wiring, Globe tab, Places, camera flights
├── src/trends-ui.ts            chart, statistics card, comparison, CSV, AI gate
├── src/trends.ts               variable catalogue, presets, GIBS URLs, client types
├── src/globe.ts                NASA Three.js globe (Blue Marble, VIIRS, live sun)
├── src/earth.ts                friend's Cesium / Google Photorealistic 3D Tiles renderer
├── src/stage.ts                Three.js hologram stage and camera rig
├── src/gestures.ts             MediaPipe hand tracking
└── src/scan.ts / construct.ts  Gemini vision and construction flows

Vercel serverless functions (Node, TypeScript)
├── api/trends.ts               validated GET: NASA POWER + USGS/ECCC
├── api/_trends.ts              fetch, annualisation, Sen, Mann–Kendall, OLS, cache
├── api/trend-explain.ts        explanation from computed facts only
├── api/ask.ts                  ATLAS agent + scene tools
├── api/scan.ts                 vision: identify an object
├── api/construct.ts            plan / build / critique a hologram
├── api/status.ts               which model and map token are live
├── api/geocode.ts              Nominatim place search
├── api/signals.ts              NASA EONET / USGS events
├── api/elevation.ts            ground height for landings
└── api/_nebius.ts              keyed providers + native Gemini + keyless fallback
```

- **Hosting:** Vercel. `vercel.json` sets `maxDuration: 300` for API functions.
- **Frontend build:** `tsc && vite build` → `dist/`.
- **Caching:** NASA POWER responses are cached server-side for 12 hours and at the CDN with `s-maxage=43200`.
- **Secrets:** model keys live only in Vercel environment variables or local `.env.local`. They are never committed and never sent to the browser. The Cesium/Google map token is intentionally browser-visible because tiles stream from Google; it must be restricted to the deployed site.

---

## 6. The trend engine, exactly

Implemented deterministically in `api/_trends.ts`.

### 6.1 Period and completeness

- Monthly POWER series from 1981 onward.
- The UI allows any 10–45 year window up to 2025.
- A year is used only if **all 12 months** are present.
- Missing months are dropped, never interpolated.
- The result shows the number of complete years.

### 6.2 Annual reduction

- Temperature, humidity, pressure, wind, soil wetness, snow, radiation, albedo, cloud and similar **intensive** variables: day-weighted monthly mean.
- Precipitation, snowfall, evapotranspiration, frost days and heating degree days **extensive** variables: yearly total.
- Streamflow: annual mean of monthly mean discharge; a month needs enough valid daily values.

### 6.3 Statistics

- **Sen’s slope:** median of all pairwise slopes, reported per year and per decade. Robust to outliers.
- **Mann–Kendall:** tie-corrected S, variance, continuity-corrected z, two-sided p-value. Significance at **p < 0.05**.
- **OLS:** slope, approximate 95% confidence interval and R², used as a cross-check and interval.
- **Regional presets:** the mean of nine POWER grid points within about 2.5°, explicitly labelled a sample mean, not an area-weighted basin average.

### 6.4 What the model is not allowed to do

The language model never sees the raw series and is never asked to compute. It receives a small JSON fact sheet (variable, period, slope, p-value, complete years, source) and is instructed not to invent a number, cause, source or forecast. If the model is offline, the deterministic explanation remains.

### 6.5 Verified examples

| Place | Variable | Period | Result |
|---|---|---|---|
| Amazon Basin | Air temperature (`T2M`) | 1996–2025 | **+0.323 °C/decade**, Mann–Kendall **p = 0.00745**, significant |
| Amazon Basin | Daily maximum (`T2M_MAX`) | 1996–2025 | +0.477 °C/decade, p = 0.0153 |
| Amazon Basin | Precipitation (`PRECTOTCORR`) | 1996–2025 | −196 mm/decade, p = 0.0031 |
| Sahel | Precipitation | 1996–2025 | +62 mm/decade |
| Amazon Basin | Cloud amount (`CLOUD_AMT`) | 1996–2025 | −0.572 %/decade, p = 0.6685, not significant |
| Fraser Valley, BC | Streamflow | 1996–2025 | ECCC `08MH002`, 9.4 km, 30 years, +1.523 m³/s/decade, p < 0.0001 |
| California, 37°N 119.5°W | Streamflow | 1996–2025 | USGS `11242000`, 16.6 km, 29 years, +1.645 m³/s/decade, p = 0.339 |
| Amazon Basin | Streamflow | — | honest `404`: no active USGS/ECCC gauge nearby |

The Amazon streamflow failure is intentional and visible. It is not replaced with a fabricated series.

---

## 7. Comparison analysis

Comparison mode lives inside **Trends** as a second view, so it reuses the same NASA variable and period filters. It is not a separate toy.

### 7.1 How it works

1. Open **Trends → Compare places**.
2. Choose **2–6 places** (the selector supports direct entry, 3 is the default).
3. Enter a curated preset, a free-text place name (OpenStreetMap Nominatim), or `lat, lon`.
4. Run the comparison.
5. Every place is resolved, then every NASA record is fetched with:
   - the same variable,
   - the same start and end year,
   - the same annualisation,
   - the same Sen’s slope and tie-corrected Mann–Kendall test.
6. Results are shown as:
   - a horizontal slope chart (solid = significant at 95%, faded = not significant),
   - a sortable-by-slope table with coordinates, sample count/gauge, slope, p-value, significance and complete years,
   - a **brief deterministic summary** written from the computed values,
   - a **dynamic limits summary** that changes with the actual comparison,
   - a comparison CSV download.
7. The Places panel has **Compare with other places**, which opens comparison seeded with the current place.

### 7.2 What the summary says

The summary is generated from the returned numbers, not by a model. It names the highest and lowest Sen slope, the p-values, how many places are significant at 95%, any weak evidence (p < 0.1), and reminds the viewer that these are rates of change, not absolute levels.

### 7.3 Limits it always surfaces

- NASA POWER is a coarse reanalysis grid, not a local weather station.
- Complete years can differ across places; missing months are dropped.
- Mann–Kendall assumes independent annual values; serial correlation is not corrected.
- No multiple-comparison correction is applied.
- A Sen slope is a fitted rate, not a forecast or a current value.
- Place names come from OpenStreetMap Nominatim; a geocoding error moves the sample point.
- Streamflow comparisons use different gauges with different record lengths, regulation and siting.
- Summed variables lose a whole year if one month is missing.
- Region presets are fixed sample boxes, not political or hydrological boundaries.

### 7.4 Verified comparison

Local test at 1440×900 and 390×844, no console or page errors:

| Place | Sen slope | p | Significant | Complete years |
|---|---|---|---|---|
| Amazon Basin | +0.32 °C/decade | 0.007 | Yes | 30 |
| Sahel | −0.10 °C/decade | 0.412 | No | 30 |

Summary: “Amazon Basin has the highest Sen slope (+0.32 °C/decade, p = 0.007) and Sahel the lowest (−0.10 °C/decade, p = 0.412). 1 of 2 places shows a statistically significant trend at the 95% level; 1 does not.” Seven limits rendered.

A second test used Fraser Valley, BC (+0.30 °C/decade, p = 0.038) and Hyderabad (−0.02 °C/decade, p = 0.943).

---

## 8. The globe

### 8.1 Two renderers, one interface

The Globe tab is the third tab, after Places. It has one panel and a **Photoreal 3D / NASA Blue Marble** switch.

| Feature | Photoreal 3D | NASA Blue Marble |
|---|---|---|
| Renderer | friend’s `src/earth.ts` + `3d-tiles-renderer` | `src/globe.ts` + Three.js |
| Imagery | Google Photorealistic 3D Tiles via Cesium ion asset `2275207` | NASA GIBS Blue Marble + VIIRS city lights |
| Token | `CESIUM_ION_TOKEN` or `GOOGLE_MAPS_KEY` | none |
| Search / fly-to | yes | yes |
| Ask the globe | yes, if a keyed model is live | yes, if a keyed model is live |
| Back to orbit / Details / Trends | yes | yes |
| Spin | yes, eastward | yes (OrbitControls) |
| City lights | switches to NASA view | yes |
| Live clouds | switches to NASA view | yes |
| Reset | yes | yes |
| Marker / tap-to-pick | after landing | yes, opens in Trends |
| Attribution | Google / Cesium ion | NASA GIBS / NASA POWER |

The switch exists so the audience can see the difference directly: photoreal tiles show buildings and terrain; Blue Marble shows NASA’s own imagery, the day/night terminator and VIIRS city lights.

### 8.2 Fly-to depth

The app geocodes the place, reads its type, then chooses a camera distance:

| Place type | Camera distance |
|---|---|
| Country | 3,000 km |
| State / province | 1,600 km |
| County | 250 km |
| Park | 60 km |
| River / lake | 30 km |
| City | 6.5 km |
| Town | 3.8 km |
| Village | 2 km |
| Suburb | 2.4 km |
| Neighbourhood | 1.4 km |
| Peak | 2.6 km |
| Landmark / building | 420–450 m |

Curated landmarks override agent coordinates where needed: Eiffel Tower 720 m, Statue of Liberty 330 m. Large areas stay north-up and top-down; cities and landmarks tilt into the 3D approach. **Back to orbit** returns to the whole planet.

### 8.3 Spin direction

The shared frame loop in `src/main.ts` turns the photoreal globe eastward:

```ts
globe.lon = ((globe.lon - dt * 2.2 + 540) % 360) - 180;
```

The earlier build added to longitude and appeared to rotate backwards. The sign is now negative, so the ground moves left as the planet turns under the camera. Verified by sampling the exposed `atlas.globe.lon`: it decreases over time while spin is on. Dragging pauses the spin; Spin toggles it; Reset restores it.

### 8.4 Tokens and fallback

- `CESIUM_ION_TOKEN` is configured in Vercel Production, Preview and Development for this deployment.
- `GOOGLE_MAPS_KEY` is the alternative.
- The token is intentionally visible to the browser because tiles stream from Google. Restrict it to the deployed URL in Cesium ion or Google Cloud.
- If the token is absent or rejected, the app stays on the NASA Blue Marble globe and says so. It never shows a black canvas or labels NASA imagery as photoreal.
- To use your own token: create a free Cesium ion account, add asset `2275207` to **My Assets**, create a token with `assets:read` restricted to that asset and this URL, then add `CESIUM_ION_TOKEN` in Vercel and redeploy.

---

## 9. AI architecture and safety

### 9.1 Providers

- The app supports Nebius, NVIDIA, Gemini and Groq keys. The first configured key wins.
- This deployment uses **Gemini** through the native `generateContent` transport, because AI Studio `AQ.` auth keys fail on the OpenAI-compatible endpoint.
- Working models: `gemini-3.5-flash` for the agent and vision, `gemini-3.5-flash-lite` for fast explanations. Fallbacks include the 3.8/3.7/3.6 Flash family; `gemini-2.5-*` is retired for new accounts.
- A keyless Pollinations fallback remains for trend explanations when no key is configured. It is rate-limited and labelled as a demo fallback.

### 9.2 What the AI is allowed to do

- **Ask ATLAS / Ask the globe:** answer the question and call scene tools such as `fly_to`, `focus_part`, layer changes and feeds. Tool calls are routed to the same camera flights as typed search.
- **Trend explanation:** two sentences from the computed fact sheet.
- **Scan:** identify an object and its parts from one canvas frame.
- **Build:** plan, build and critique a hologram from research and reference imagery.
- **Vision:** native image parts in the Gemini request; no image is stored.

### 9.3 What the AI is not allowed to do

- It never computes a trend, p-value, gauge distance or citation.
- It never sees the raw NASA series.
- It cannot invent a source or a forecast.
- Its outputs are labelled, and the deterministic result remains if the model is offline.
- The Globe ask box stays hidden unless `/api/status` reports a keyed provider, so it never promises an agent that is not running.

### 9.4 Key handling

- Keys live in Vercel environment variables (Production, Preview, Development) or local `.env.local`.
- `.env.local` is git-ignored and was never committed.
- The Gemini key used during development was pasted into chat; rotate it in AI Studio and update Vercel when convenient.
- A map token is separate from a model key. One does not enable the other.

---

## 10. API reference

| Route | Method | Purpose |
|---|---|---|
| `/api/trends?variable=t2m&lat=-3.5&lon=-62.5&start=1996&end=2025&mode=region&name=Amazon%20Basin` | GET | NASA POWER series + Sen / Mann–Kendall / OLS |
| `/api/trends?variable=streamflow&lat=49.2&lon=-122.7...` | GET | nearest active USGS or ECCC gauge and annual record |
| `/api/trend-explain` | POST | explanation from pre-computed statistics |
| `/api/ask` | POST | agent answer plus scene tools |
| `/api/scan` | POST | vision: identify an object and its parts |
| `/api/construct` | POST | plan / build / critique a 3D hologram |
| `/api/status` | GET | which model, keyless fallback and map token are live |
| `/api/signals?layer=events` | GET | NASA EONET / USGS events |
| `/api/geocode` | POST | OpenStreetMap Nominatim place search |
| `/api/elevation?lat=&lon=` | GET | ground height for landings |

Failures are explicit: `404` for a place with no gauge, `502` for a federal service that did not answer. Nothing is fabricated.

---

## 11. Presentation deck outline

A 6-slide deck is enough. The demo can carry the detail.

### Slide 1 — Title

- ATLAS EARTH
- “Be An Earth System Trend Detective”
- Team Ace Azael
- Live URL and QR code.

### Slide 2 — The question

- “What is changing here?”
- One place, one NASA variable, one tested answer.
- Show the default Amazon result: **+0.32 °C/decade, p = 0.007**.

### Slide 3 — The science

- NASA POWER / MERRA-2, 30 variables, 1981–2025.
- Sen’s slope + tie-corrected Mann–Kendall + OLS cross-check.
- Complete years only; missing data dropped, never interpolated.
- Streamflow from USGS/ECCC, explicitly labelled.
- The model never computes.

### Slide 4 — The comparison

- Same variable, same period, same test across 2–6 places.
- Slope chart, table, brief summary, dynamic limits, CSV.
- Verified: Amazon +0.32 (p = 0.007) vs Sahel −0.10 (p = 0.412).

### Slide 5 — The two globes

- Photoreal Google/Cesium tiles vs NASA Blue Marble.
- Same search, Ask, fly-to, Details, Trends and layers.
- Toggle so the difference is visible.
- Eastward spin; token-free NASA fallback.

### Slide 6 — Honesty and next steps

- What is NASA, what is supplementary, what is missing.
- No fabricated observations or citations.
- Next: more variables, uncertainty correction, more gauge coverage, story mode.

---

## 12. Live demo script (about 6 minutes)

### 0:00 — Open the app

`https://atlas-ace-azael.vercel.app/`

Say: “ATLAS EARTH asks one question: what is changing here? It uses NASA POWER as the data core and never invents a result.”

### 0:30 — Default trend

The default is **Amazon Basin · Air temperature · 1996–2025**.

Point out:
- **+0.32 °C/decade**
- **p = 0.007**, significant at 95%
- The annual chart and the complete-year count.
- The source line: NASA POWER / MERRA-2.

### 1:15 — Change the variable

Pick **Precipitation**. Show **−196 mm/decade, p = 0.0031**. Explain that the app uses the same test for every variable, and that the variable is a rate, not a total.

### 1:45 — Compare places

Click **Compare places**. Choose 2 places. Enter **Amazon Basin** and **Sahel**. Run.

Point out:
- Amazon **+0.32 °C/decade, p = 0.007** (significant).
- Sahel **−0.10 °C/decade, p = 0.412** (not significant).
- The brief summary names the highest and lowest and the significance count.
- The **limits** section: coarse grid, no multiple-comparison correction, rates not levels.
- Download the comparison CSV.

### 2:45 — Places

Open **Places**. Search **Fraser Valley, BC** (or use a preset).

Point out:
- The photoreal Cesium/Google globe.
- The NASA science card: temperature, precipitation and the nearest ECCC gauge `08MH002`.
- **Open in Trend Detective** and **Compare with other places**.

### 3:30 — Globe: photoreal

Open **Globe**. Wait for the whole-Earth shot.

Point out:
- **Photoreal · Cesium ion**.
- Drag to orbit, scroll to zoom.
- **Spin** turns the planet eastward; click it off and on.
- Search **Eiffel Tower**. The camera traverses and lands at about **720 m**.
- **Details** opens the place in Places; **Trends** opens its 30-year record.
- **Back to orbit**.

### 4:30 — Globe: NASA

Click **NASA Blue Marble**.

Point out:
- Blue Marble, VIIRS city lights, live day/night terminator.
- **City lights** and **Live clouds** are NASA layers; if clicked from photoreal, the app switches renderer automatically.
- Search a place; the NASA globe flies there and marks it.
- Tap the planet to mark a coordinate and open it in Trends.

### 5:15 — Ask and explain

If the keyed model is live:
- Ask the globe: “Take me to the Amazon.”
- The agent answers and its `fly_to` tool moves the globe.
- In Trends, use **Explain this trend**. The explanation is generated from the computed facts only.

### 5:45 — Close

“NASA data first. Tested trends. Two globes. Every number has a source, and every limitation is on screen.”

---

## 13. Verification record

### 13.1 Build and type checks

```bash
npm run build
npx tsc --noEmit
npx tsc -p api/tsconfig.json --noEmit
```

All pass with no TypeScript errors.

### 13.2 Browser tests

Run with Playwright against the local Vercel dev server on port 3001:

- Trend default and variable switching at desktop and mobile widths.
- Comparison with 2 places at 1440×900 and 390×844: chart, table, summary, 7 limits, CSV; no console or page errors.
- Places photoreal flight and NASA science card.
- Globe photoreal entry, Spin off/on, City lights, Live clouds, renderer switch back to photoreal; no console or page errors.
- Eiffel Tower fly-to lands at 720 m.
- Mobile 474×1008: header, sticky trend heading, panel and globe panel do not overlap; the heading is not clipped when the trend panel is scrolled.
- `/api/status` reports `provider: gemini`, `earth: ion`.

### 13.3 Live checks

- Production deployment Ready on Vercel project `atlas-ace-azael`.
- `/api/status` returns the live Gemini provider and Cesium ion Earth token.
- Ask ATLAS `fly_to` Eiffel works.
- `/api/trend-explain` returns a sourced explanation.
- `/api/scan` identifies the Statue of Liberty.
- `/api/construct` plans Charminar.
- Comparison and globe changes are re-verified after the final deployment.

After the comparison and globe work (commit `6e37252`, deployed 15 November 2026) the live app was re-checked end to end:

| Check | Live result |
|---|---|
| Default trend | Amazon Basin · Air temperature · 1996–2025 · **+0.32 °C/decade** · highly significant · 30 complete years |
| Comparison | Amazon Basin **+0.32, p = 0.007** vs Sahel **−0.10, p = 0.412** · summary, 7 limits, CSV |
| Globe | **Photoreal · Cesium ion**, layer controls visible, `atlas.globe` ready in ~5 s |
| Spin | longitude fell 4.18° in 2.5 s → eastward |
| NASA switch | panel reads **NASA Blue Marble**, city lights and Live clouds apply, switch back works |
| Typed landmark | **Eiffel Tower → 720 m** |
| Places → Compare | switches to Trends with comparison seeded |
| Mobile 474×1008 | sticky heading visible under the bar, never clipped |

No console or page errors in any live run.

### 13.4 Known service behaviour

- NASA POWER GDD parameters return HTTP 500 and are excluded.
- The POWER Data Access Viewer sends `X-Frame-Options: DENY`; the app links to it instead of embedding it.
- `gemini-3.8-flash` timed out during testing; the app uses 3.5 Flash with fallbacks.
- `gemini-2.5-*` is retired for new accounts.
- The keyless Pollinations endpoint is third-party and rate-limited.
- Photoreal tiles are coarse in some regions (much of India, for example); the app does not pretend otherwise.

---

## 14. Honest limitations

- **NASA POWER is reanalysis, not a thermometer at the coordinate.** It is a roughly 0.5° × 0.625° modelled grid.
- **Regional mode is a nine-point sample mean**, not an area-weighted basin average.
- **Streamflow is one gauge**, not a basin average. Dams, diversions, ice and channel change affect it.
- **Mann–Kendall assumes independent annual values.** Serial correlation can make p-values look smaller than they should; this build does not correct for it.
- **No multiple-comparison correction** is applied in comparison mode. Testing several places raises the chance of a false positive; the ranking is exploratory.
- **GIBS overlays are composites**, not live photographs. Daily MODIS Terra has black swath gaps; the Globe’s Live clouds mode lifts only near-white cloud/snow pixels onto the seamless Blue Marble base.
- **No faithful GIBS layer** was verified for 26 of the 30 POWER parameters or for streamflow, so no overlay is shown for them.
- **The keyless explanation model is third-party and rate-limited.** It is a demo fallback, not a service-level guarantee.
- **Photoreal tiles are token-gated** and stream at Google’s best available level of detail. Coarse areas look coarse.
- **The Globe’s LLM ask box needs a keyed provider.** Without one, typed place search still works and the box stays hidden.
- **The app never fills missing observations or invents a citation.**

---

## 15. Run it locally

```bash
npm install
npx vercel dev --listen 3001
```

Open <http://localhost:3001>. Use `vercel dev`, not plain `vite`, because the `/api` functions are serverless.

Production build:

```bash
npm run build
npx tsc -p api/tsconfig.json --noEmit
```

### Environment variables

All are optional for the NASA trend core, the NASA globe, USGS/ECCC streamflow and the Places science card.

```bash
# Keyed model (one is enough) for the full agent and preferred explanations.
NEBIUS_API_KEY=
NVIDIA_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=

# Optional: pin a model id per role.
ATLAS_AGENT_MODEL=
ATLAS_VISION_MODEL=
ATLAS_FAST_MODEL=

# Optional keyless explanation model. Default is the anonymous Pollinations endpoint.
ATLAS_KEYLESS_MODEL=off
ATLAS_KEYLESS_MODEL=gpt-oss-20b

# Optional photoreal Globe + Places tiles.
CESIUM_ION_TOKEN=
GOOGLE_MAPS_KEY=
```

Never commit `.env.local` or any key. Keys are read only in server functions.

### Deploy

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" npx vercel deploy --prod --yes
```

---

## 16. File map

```text
api/_trends.ts        NASA POWER, USGS/ECCC, annualisation, Sen, Mann–Kendall, OLS
api/trends.ts         validated GET endpoint + cache headers
api/trend-explain.ts  model explanation from computed facts
api/_nebius.ts        keyed providers, native Gemini transport, keyless fallback
api/status.ts         live provider and map-token report
api/geocode.ts        Nominatim place search
api/signals.ts        NASA EONET / USGS events
api/elevation.ts      ground height for landings

src/earth.ts          friend's Cesium ion / Google Photorealistic 3D Tiles renderer
src/globe.ts          NASA Three.js globe: progressive Blue Marble, city lights, live sun
src/trends.ts         variable catalogue, presets, GIBS URLs, client types
src/trends-ui.ts      trend panel, chart, comparison, CSV, AI gate, globe integration
src/main.ts           mode wiring, Globe tab, Places fallback, camera flights
src/stage.ts          Three.js hologram stage and camera rig
src/gestures.ts       MediaPipe hand tracking
src/scan.ts           Gemini vision
src/construct.ts      hologram construction
src/library.ts        hologram library
index.html            all panels and controls
src/style.css         responsive layout, comparison, globe, sticky mobile header
public/earth/         local 2048 px Blue Marble + VIIRS city lights
NASA_RESOURCES.md     every endpoint, field, licence and limitation
BUILD_LOG.md          chronological build and verification log
PRESENTATION.md       this document
```

---

## 17. Judge Q&A — short answers

**“Is this really NASA data?”**  
Yes for the trends and imagery: NASA POWER / MERRA-2 monthly series, NASA GIBS Blue Marble/MODIS/VIIRS, NASA EONET. Streamflow is USGS/ECCC because NASA has no keyless point discharge API; the app names the gauge and never calls it NASA.

**“Did an AI make up the trend?”**  
No. The trend, p-value, confidence interval and gauge distance are computed deterministically on the server. The model receives a fact sheet and cannot change a number. If the model is offline, the deterministic explanation remains.

**“Why compare places?”**  
Because a single trend can look dramatic without context. Comparison runs the identical variable, period and test across 2–6 places and shows which differences are significant — and which are not.

**“Why two globes?”**  
The photoreal view shows what a place looks like; the NASA view shows NASA’s own imagery, the terminator and city lights. The toggle makes the difference visible, and the NASA view works without a token.

**“What is the biggest limitation?”**  
NASA POWER is a coarse reanalysis grid, Mann–Kendall assumes independent annual values, and comparison has no multiple-comparison correction. These are stated in the app, not hidden.

**“What would you build next?”**  
Uncertainty-aware trend tests (block bootstrap or Hamed–Rao), more gauge coverage, a story mode that exports a shareable brief, and more verified GIBS layers.

---

## 18. Credits

- **NASA POWER, NASA GIBS, NASA EONET** — U.S. Government work; NASA acknowledgement requested.
- **USGS Water Services, USGS Earthquake Hazards Program** — U.S. public domain.
- **Environment and Climate Change Canada, MSC GeoMet, Geo.ca** — Open Government Licence – Canada.
- **OpenStreetMap** — © OpenStreetMap contributors, ODbL.
- **Open-Meteo** — CC BY 4.0.
- **Google Photorealistic 3D Tiles / Cesium ion** — Google tile policies; Cesium ion terms.
- **Three.js, 3d-tiles-renderer, MediaPipe, transformers.js, SunCalc** — see `package.json` and upstream licences.
- **Original ATLAS Live application** — friend’s upstream project <https://github.com/victorisaacchinta-eng/atlas-live>.
- **Fonts:** Science Gothic, Mona Sans, Monaspace Krypton — SIL OFL 1.1.
- **Team:** Ace Azael. The project is MIT licensed; see `LICENSE`.
