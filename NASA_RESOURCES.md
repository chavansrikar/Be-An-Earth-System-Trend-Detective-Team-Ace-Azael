# NASA and federal data resources

ATLAS EARTH is a NASA Space Apps 2026 entry for **“Be An Earth System Trend Detective!”**. It puts NASA Earth data first, then adds the official ground-gauge and open-geospatial records needed to answer questions NASA's keyless point services do not cover.

All services below were tested from this repository on **14 November 2026**. None of the NASA, USGS or ECCC endpoints used by the app requires an API key, an account or a paid plan.

## 1. NASA data used directly

### NASA POWER — monthly point time series

- **Service:** NASA Prediction Of Worldwide Energy Resources (POWER), NASA Langley Research Center.
- **Endpoint:** `https://power.larc.nasa.gov/api/temporal/monthly/point`
- **Why it is the core:** one keyless request returns a complete monthly record for any land coordinate from 1981 onward, so the same URL works on a laptop, a phone and a Vercel function.
- **Community:** `AG` (agroclimatology).
- **Response fields:** `properties.parameter.<PARAMETER>` keyed by `YYYYMM`; missing values are `-999` and are dropped, never replaced.
- **Cache:** server-side 12 hours; CDN `s-maxage=43200, stale-while-revalidate=2592000`.

ATLAS exposes **30 POWER monthly parameters**, grouped in the interface as Atmosphere, Water, Land and Energy. The parameter set was checked against the live endpoint, and each parameter below returned real values at the tested coordinates. The five POWER growing-degree-day parameters (`GDD4_4`, `GDD7_2`, `GDD10`, `GDD13_3`, `GDD15_6`) answered HTTP 500 during testing and are deliberately excluded.

| Group | ATLAS variable | POWER parameter | Unit returned | Annual reduction |
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
| Water | Streamflow (gauge) | *none — USGS / ECCC* | m³/s | annual mean |
| Land | Earth skin temperature | `TS` | °C | day-weighted mean |
| Land | Soil temperature, layer 1 | `TSOIL1` | °C | day-weighted mean |
| Land | Frost days | `FROST_DAYS` | days/month | yearly total (days/year) |
| Land | Snow depth | `SNODP` | cm | day-weighted mean |
| Land | Snow cover fraction | `FRSNO` | fraction | day-weighted mean |
| Land | Heating degree days below 18.3 °C | `HDD18_3` | degree-days/month | yearly total (degree-days/year) |
| Energy | Surface solar energy | `ALLSKY_SFC_SW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Clear-sky solar energy | `CLRSKY_SFC_SW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Downward thermal infrared | `ALLSKY_SFC_LW_DWN` | MJ/m²/day | day-weighted mean |
| Energy | Photosynthetically active radiation | `ALLSKY_SFC_PAR_TOT` | MJ/m²/day | day-weighted mean |
| Energy | Surface albedo | `ALLSKY_SRF_ALB` | fraction | day-weighted mean |
| Energy | Cloud amount | `CLOUD_AMT` | % | day-weighted mean |

**Parameter dictionary used to build the catalogue:** `https://power.larc.nasa.gov/api/system/manager/parameters?temporal=Monthly&community=AG` (public JSON, 1,388 monthly parameters in the tested response). A single point request accepts at most **25 parameters**; ATLAS requests one parameter per trend, so it is well inside that limit.

### NASA POWER Data Access Viewer (DAV)

The DAV at <https://power.larc.nasa.gov/data-access-viewer/> sends `X-Frame-Options: DENY`, so it cannot be embedded. Instead of faking an iframe, ATLAS integrates the DAV's data surface:

- The 30-parameter, four-group catalogue above.
- **Download CSV** exports the monthly and annual series with variable, place, coordinates, period, source and access date in the header.
- **Exact NASA POWER API request** opens the same query ATLAS ran, so the result can be checked or re-run directly.
- **NASA POWER Data Access Viewer** opens the official viewer for interactive exploration.

**What POWER is, honestly:** monthly MERRA-2 reanalysis, a model assimilating observations, on a roughly 0.5° × 0.625° grid. It is not a ground thermometer at the exact coordinate. The app labels it “NASA POWER / MERRA-2” and says when a series is a regional mean of nine grid points.

**Source page:** <https://power.larc.nasa.gov/>

### NASA GIBS — imagery on the globe

- **Service:** NASA Global Imagery Browse Services (GIBS), NASA EOSDIS.
- **Endpoint:** `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`
- **Protocol:** WMS 1.3.0, `GetMap`, `CRS=EPSG:4326`, JPEG, 4096×2048 desktop / 2048×1024 mobile.
- **Time:** a daily or monthly `TIME` value chosen by the year/month controls.

| Purpose | GIBS layer | Notes |
|---|---|---|
| Day-side base map | `BlueMarble_ShadedRelief_Bathymetry` | static NASA Blue Marble mosaic |
| City lights on the night side | `VIIRS_CityLights_2012` | static 2012 VIIRS composite |
| Satellite base map | `MODIS_Terra_CorrectedReflectance_TrueColor` | daily true colour, not a photograph at one instant |
| Temperature overlay | `MERRA2_2m_Air_Temperature_Monthly` | monthly MERRA-2 |
| Precipitation overlay | `MERRA2_Precipitation_Bias_Corrected_Monthly` | monthly MERRA-2 |
| Soil-moisture overlay | `GLDAS_Underground_Soil_Moisture_Monthly` | related GLDAS layer; last month available is 2024, and the app says so |
| Wind overlay | `MERRA2_Surface_Wind_Speed_Monthly` | monthly MERRA-2 |

**No GIBS overlay is shown for the other 26 POWER parameters or for streamflow**, because no faithful matching GIBS layer was verified for them. The app says this in the panel rather than substituting a misleading image.

**Source page:** <https://gibs.earthdata.nasa.gov/>

### NASA EONET — open natural events

- **Service:** NASA Earth Observatory Natural Event Tracker (EONET).
- **Endpoint:** `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=60`
- **Use:** the preserved **Places → Live signals → Events** layer (wildfires, severe storms, sea/lake ice, volcanoes, floods and other open events).
- **Licence:** U.S. public domain (NASA).

### NASA Blue Marble basemap in Places

When `CESIUM_ION_TOKEN` or `GOOGLE_MAPS_KEY` is not configured, Places does not pretend to have photoreal 3D tiles. It reuses the NASA globe with **Blue Marble shaded relief + bathymetry** — seamless at close range, unlike a daily MODIS scene with swath gaps — flies to the searched place at 2.35 Earth radii, and opens a NASA science card. The card is driven by the same NASA POWER and gauge APIs as the Trend Detective.

## 2. Hydrology — the deliberate non-NASA exception

No keyless NASA point API for river discharge was found. Streamflow is therefore measured by the official federal ground-gauge networks. The app always names the gauge, its distance from the selected centre and its source. It never presents gauge data as a NASA grid.

### USGS Water Services (United States)

- **Site search:** `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=W,S,E,N&parameterCd=00060&siteStatus=active`
- **Daily values:** `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=<SITE>&parameterCd=00060&startDT=YYYY-01-01&endDT=YYYY-12-31&statCd=00003`
- **Parameter:** `00060` discharge; daily mean statistic `00003`.
- **Unit handling:** USGS returns ft³/s in the tested responses; the app converts to m³/s (`× 0.028316846592`).
- **Monthly reduction:** a month needs at least 20 daily values.
- **Licence:** U.S. Government work, public domain.
- **Verified example:** gauge `09380000` (Colorado River at Lees Ferry) returned 10,958 daily values for the test period. The California test at 37°N, 119.5°W selected gauge `11242000` (San Joaquin River above Willow Creek), 16.6 km away, with 29 complete years.

**Source page:** <https://waterservices.usgs.gov/>

### Environment and Climate Change Canada — MSC GeoMet (Canada)

- **Station search:** `https://api.weather.gc.ca/collections/hydrometric-stations/items?f=json&limit=100&bbox=W,S,E,N&STATUS_EN=Active`
- **Monthly means:** `https://api.weather.gc.ca/collections/hydrometric-monthly-mean/items?f=json&limit=1000&STATION_NUMBER=<ID>&datetime=START/END`
- **Fields used:** `STATION_NUMBER`, `STATION_NAME`, `STATUS_EN`, `DATE` (`YYYY-MM`), `MONTHLY_MEAN_DISCHARGE` (m³/s).
- **Important:** `STATUS_EN=Active` is sent to the server, and a second client-side check rejects any non-active station. Null discharge values are ignored, not converted to zero.
- **Licence:** Open Government Licence – Canada.
- **Verified example:** station `08MH002` (Coquitlam River at Port Coquitlam) returned 360 monthly records for 1996–2025. The Fraser Valley preset selected it at 9.4 km and produced a 30-year record.

**Source page:** <https://api.weather.gc.ca/>

### Geo.ca / Government of Canada open maps

- **Use:** linked from the data-archive strip as the entry point to Canada's open geospatial information.
- **URL:** <https://open.canada.ca/en/open-maps>
- **Licence:** Open Government Licence – Canada, unless a dataset says otherwise.

## 3. Non-NASA supporting data

These are labelled in the app; they are not used to claim NASA observations.

| Data | Service | Use | Licence |
|---|---|---|---|
| Place search | OpenStreetMap Nominatim via `api/geocode` | find a place name and coordinates | ODbL |
| Building footprints / city builds | OpenStreetMap Overpass | preserved Places 3D builds when map tokens are absent | ODbL |
| Earthquakes | USGS Earthquake Hazards Program, M2.5+ past 7 days | preserved live-signal layer | U.S. public domain |
| Current weather | Open-Meteo | preserved point conditions | CC BY 4.0 |
| Sun position | `suncalc` in the browser | preserved Places sun dial | BSD-2-Clause |

## 4. Trend statistics

Implemented in `api/_trends.ts`, deterministic and independent of the language model:

- **Sen's slope:** median of all pairwise slopes; reported per year and per decade.
- **Mann–Kendall test:** tie-corrected S, variance, continuity-corrected z and two-sided p-value; significance at **p < 0.05**.
- **OLS:** slope, approximate 95% confidence interval and R², used only as a cross-check and interval.
- **Annual reduction:** day-weighted monthly mean, or monthly sum for precipitation and evapotranspiration. A complete year needs all 12 months.
- **No interpolation:** missing months are dropped; the number of complete years is shown.
- **Caveat shown in the UI:** Mann–Kendall assumes independent annual values and does not correct for serial correlation.

## 5. What was not used, and why

- **NASA POWER climatology / daily APIs:** monthly is enough for a 30-year trend and keeps responses small.
- **NASA AppEEARS / earthdata login services:** require an Earthdata Login and often a task queue; not suitable for a keyless, server-live demo.
- **NASA FIRMS:** useful for active fire but not an Earth-system trend variable in this build; EONET already covers open fire events.
- **GIBS layers for evaporation, humidity, radiation and discharge:** not verified as faithful matches, so none are shown.
- **Cesium ion / Google photoreal tiles:** optional, token-gated, and absent from this deployment. The NASA globe is the fallback, not a replacement for photoreal tiles.

## 6. Attribution and access dates

All endpoints above were accessed on **14 November 2026**. NASA data are U.S. Government work; NASA requests acknowledgement. USGS data are public domain. ECCC data are under the Open Government Licence – Canada. OpenStreetMap data are © OpenStreetMap contributors, ODbL. Open-Meteo data are CC BY 4.0.

If a service is down, the app shows an error or the age of the last cached copy. It does not invent a value, a gauge or a citation.
