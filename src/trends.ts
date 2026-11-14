/**
 * ATLAS EARTH trend data: the client-side catalogue mirrors the server's NASA POWER variables,
 * so labels, units and colours stay in one place in the UI. All numbers come from /api/trends.
 */

export type VariableId =
  | 't2m' | 't2m_max' | 't2m_min' | 't2mdew' | 't2mwet'
  | 'humidity' | 'qv2m' | 'ps' | 'wind' | 'ws10m'
  | 'precip' | 'precip_snow' | 'evap' | 'soil' | 'soil_top' | 'soil_prof' | 'pw' | 'streamflow'
  | 'ts' | 'soil_t1' | 'frost' | 'snow_depth' | 'snow_cover' | 'hdd18'
  | 'radiation' | 'clear_sky' | 'longwave' | 'par' | 'albedo' | 'cloud';

export type VariableGroup = 'Atmosphere' | 'Water' | 'Land' | 'Energy';

export interface VariableInfo {
  id: VariableId;
  label: string;
  short: string;
  unit: string;
  annualUnit: string;
  color: string;
  group: VariableGroup;
  description: string;
  /** NASA GIBS monthly layer for the "where" view, when one is a faithful match. */
  gibs?: string;
  /** Last complete year the GIBS layer has (used to clamp the year slider). */
  gibsLastYear?: number;
  /** Power variables come from NASA POWER; water variables from a ground gauge. */
  source?: 'power' | 'water';
}

export interface GaugeInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  source: 'USGS' | 'ECCC';
  url: string;
}

export const VARIABLES: VariableInfo[] = [
  { id: 't2m', label: 'Air temperature', short: 'Temperature', unit: '°C', annualUnit: '°C', color: '#FF8A3D', group: 'Atmosphere', description: 'Temperature at 2 m. The classic warming signal.', gibs: 'MERRA2_2m_Air_Temperature_Monthly', gibsLastYear: 2025 },
  { id: 't2m_max', label: 'Daily maximum air temperature', short: 'Daily max', unit: '°C', annualUnit: '°C', color: '#FF6B57', group: 'Atmosphere', description: 'Monthly average of the daily maximum at 2 m.' },
  { id: 't2m_min', label: 'Daily minimum air temperature', short: 'Daily min', unit: '°C', annualUnit: '°C', color: '#FFB36B', group: 'Atmosphere', description: 'Monthly average of the daily minimum at 2 m.' },
  { id: 't2mdew', label: 'Dew point at 2 m', short: 'Dew point', unit: '°C', annualUnit: '°C', color: '#79C7FF', group: 'Atmosphere', description: 'Dew/frost point temperature at 2 m.' },
  { id: 't2mwet', label: 'Wet-bulb temperature at 2 m', short: 'Wet-bulb', unit: '°C', annualUnit: '°C', color: '#56A8E8', group: 'Atmosphere', description: 'Wet-bulb temperature at 2 m.' },
  { id: 'humidity', label: 'Relative humidity at 2 m', short: 'Humidity', unit: '%', annualUnit: '%', color: '#8FD3FF', group: 'Atmosphere', description: 'Moisture in the air at 2 m.' },
  { id: 'qv2m', label: 'Specific humidity at 2 m', short: 'Specific humidity', unit: 'g/kg', annualUnit: 'g/kg', color: '#5FB8C9', group: 'Atmosphere', description: 'Mass of water vapour per kilogram of moist air.' },
  { id: 'ps', label: 'Surface pressure', short: 'Pressure', unit: 'kPa', annualUnit: 'kPa', color: '#B9B4FF', group: 'Atmosphere', description: 'Atmospheric pressure at the surface.' },
  { id: 'wind', label: 'Wind speed at 2 m', short: 'Wind 2 m', unit: 'm/s', annualUnit: 'm/s', color: '#F4EFE4', group: 'Atmosphere', description: 'Average surface wind speed at 2 m.', gibs: 'MERRA2_Surface_Wind_Speed_Monthly', gibsLastYear: 2025 },
  { id: 'ws10m', label: 'Wind speed at 10 m', short: 'Wind 10 m', unit: 'm/s', annualUnit: 'm/s', color: '#D8D3C4', group: 'Atmosphere', description: 'Average surface wind speed at 10 m.' },

  { id: 'precip', label: 'Precipitation', short: 'Rainfall', unit: 'mm/day', annualUnit: 'mm/year', color: '#6FB7FF', group: 'Water', description: 'Corrected rain and snow, summed into a yearly total.', gibs: 'MERRA2_Precipitation_Bias_Corrected_Monthly', gibsLastYear: 2025 },
  { id: 'precip_snow', label: 'Snowfall', short: 'Snowfall', unit: 'mm/day', annualUnit: 'mm/year', color: '#C7E8FF', group: 'Water', description: 'Snow precipitation over land, water equivalent.' },
  { id: 'evap', label: 'Land evapotranspiration', short: 'Evaporation', unit: 'mm/day', annualUnit: 'mm/year', color: '#61D6C4', group: 'Water', description: 'Water leaving the land through soil and plants.' },
  { id: 'soil', label: 'Root-zone soil wetness', short: 'Soil root', unit: '0–1', annualUnit: '0–1', color: '#C9A6FF', group: 'Water', description: 'Water in the root zone: 0 dry, 1 saturated.', gibs: 'GLDAS_Underground_Soil_Moisture_Monthly', gibsLastYear: 2024 },
  { id: 'soil_top', label: 'Surface soil wetness', short: 'Soil surface', unit: '0–1', annualUnit: '0–1', color: '#A98BEE', group: 'Water', description: 'Water in the surface soil layer: 0 dry, 1 saturated.' },
  { id: 'soil_prof', label: 'Profile soil wetness', short: 'Soil profile', unit: '0–1', annualUnit: '0–1', color: '#8D74D6', group: 'Water', description: 'Water in the full soil profile: 0 dry, 1 saturated.' },
  { id: 'pw', label: 'Precipitable water', short: 'Precip. water', unit: 'cm', annualUnit: 'cm', color: '#7BE0FF', group: 'Water', description: 'Total water vapour in a vertical column.' },
  { id: 'streamflow', label: 'Streamflow (gauge)', short: 'Streamflow', unit: 'm³/s', annualUnit: 'm³/s', color: '#4FC3F7', group: 'Water', description: 'Annual mean river discharge at the nearest active USGS or ECCC gauge.', source: 'water' },

  { id: 'ts', label: 'Earth skin temperature', short: 'Skin temp', unit: '°C', annualUnit: '°C', color: '#FF9E6D', group: 'Land', description: 'Temperature of the land or snow surface.' },
  { id: 'soil_t1', label: 'Soil temperature, layer 1', short: 'Soil temp 1', unit: '°C', annualUnit: '°C', color: '#E2A86D', group: 'Land', description: 'Temperature of the top soil layer.' },
  { id: 'frost', label: 'Frost days', short: 'Frost days', unit: 'days/month', annualUnit: 'days/year', color: '#A9D6E5', group: 'Land', description: 'Frost days counted in each month.' },
  { id: 'snow_depth', label: 'Snow depth', short: 'Snow depth', unit: 'cm', annualUnit: 'cm', color: '#E8F4FF', group: 'Land', description: 'Average depth of snow on the ground.' },
  { id: 'snow_cover', label: 'Snow cover fraction', short: 'Snow cover', unit: '0–1', annualUnit: '0–1', color: '#D0E8FA', group: 'Land', description: 'Fraction of the grid cell covered by snow.' },
  { id: 'hdd18', label: 'Heating degree days below 18.3 °C', short: 'Heating degree', unit: 'degree-days/month', annualUnit: 'degree-days/year', color: '#C4B5FD', group: 'Land', description: 'Heating degree days below 18.3 °C.' },

  { id: 'radiation', label: 'Surface solar energy', short: 'Sunlight', unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', color: '#FFD166', group: 'Energy', description: 'All-sky shortwave energy reaching the surface.' },
  { id: 'clear_sky', label: 'Clear-sky solar energy', short: 'Clear-sky sun', unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', color: '#FFE39B', group: 'Energy', description: 'Shortwave energy under a cloud-free sky.' },
  { id: 'longwave', label: 'Downward thermal infrared', short: 'Thermal IR', unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', color: '#F4A261', group: 'Energy', description: 'Thermal infrared radiation reaching the surface.' },
  { id: 'par', label: 'Photosynthetically active radiation', short: 'PAR', unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', color: '#FFC857', group: 'Energy', description: 'Plant-usable light reaching the surface.' },
  { id: 'albedo', label: 'Surface albedo', short: 'Albedo', unit: '0–1', annualUnit: '0–1', color: '#E9EDC9', group: 'Energy', description: 'Fraction of incoming sunlight reflected by the surface.' },
  { id: 'cloud', label: 'Cloud amount', short: 'Cloud cover', unit: '%', annualUnit: '%', color: '#C9D6E3', group: 'Energy', description: 'Average cloud amount over the grid cell.' },
];

export const GROUPS: VariableGroup[] = ['Atmosphere', 'Water', 'Land', 'Energy'];

export const variableById = (id: VariableId) => VARIABLES.find((v) => v.id === id) ?? VARIABLES[0];
export const GIBS_VARIABLES = VARIABLES.filter((v) => v.gibs);

export interface Place {
  name: string;
  lat: number;
  lon: number;
  mode: 'point' | 'region';
}

export const PRESETS: (Place & { blurb: string })[] = [
  { name: 'Amazon Basin', lat: -3.5, lon: -62.5, mode: 'region', blurb: 'Rain forest' },
  { name: 'Sahel', lat: 14.5, lon: 5, mode: 'region', blurb: 'Dryland margin' },
  { name: 'Himalayas', lat: 30, lon: 85, mode: 'region', blurb: 'High mountains' },
  { name: 'Greenland', lat: 72, lon: -40, mode: 'region', blurb: 'Ice sheet' },
  { name: 'California', lat: 37, lon: -119.5, mode: 'region', blurb: 'Mediterranean · USGS' },
  { name: 'Fraser Valley, BC', lat: 49.2, lon: -122.7, mode: 'region', blurb: 'Canada · ECCC' },
  { name: 'Hyderabad', lat: 17.385, lon: 78.487, mode: 'point', blurb: 'City' },
];

export interface MonthlyPoint { t: string; v: number }
export interface AnnualPoint { year: number; v: number; months: number }

export interface TrendStats {
  n: number;
  firstYear: number;
  lastYear: number;
  mean: number;
  first: number;
  last: number;
  senPerYear: number;
  senPerDecade: number;
  olsPerYear: number;
  /** OLS 95% interval, in annual units per year (multiply by 10 for per decade). */
  olsCi95: [number, number];
  olsR2: number;
  mk: { s: number; z: number; p: number; tau: number; significant: boolean };
  changeAbs: number;
  changePct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface TrendResult {
  variable: VariableInfo & { power: string; aggregate: 'mean' | 'sum'; up: string; down: string };
  place: Place & { samples: number; gauge?: GaugeInfo };
  period: { start: number; end: number; years: number };
  series: { monthly: MonthlyPoint[]; annual: AnnualPoint[] };
  stats: TrendStats | null;
  source: { name: string; dataset: string; url: string; licence: string; accessed: string; note: string };
  notes: string[];
}

export async function fetchTrend(place: Place, variable: VariableId, start: number, end: number): Promise<TrendResult> {
  const q = new URLSearchParams({
    variable, lat: place.lat.toFixed(4), lon: place.lon.toFixed(4),
    start: String(start), end: String(end), mode: place.mode, name: place.name,
  });
  // Vercel's query parser leaves "+" literal; encode spaces explicitly so "Fraser Valley" survives.
  const res = await fetch(`/api/trends?${q.toString().replace(/\+/g, '%20')}`, { signal: AbortSignal.timeout(120_000) });
  const body = (await res.json().catch(() => null)) as (TrendResult & { error?: string }) | null;
  if (!res.ok || !body || body.error) throw new Error(body?.error || `NASA trend request failed (HTTP ${res.status})`);
  if (!body.variable || !body.place || !Array.isArray(body.series?.annual) || !body.source) {
    throw new Error('The trend API returned an unexpected response. Open the app through `vercel dev` or the deployed site, not `vite preview` alone.');
  }
  return body;
}

/** Significant digits that suit each variable, without pretending to more precision than NASA gives. */
export function decimalsFor(id: VariableId) {
  if (id === 'soil' || id === 'soil_top' || id === 'soil_prof' || id === 'snow_cover' || id === 'albedo') return 3;
  if (id === 'precip' || id === 'precip_snow' || id === 'evap' || id === 'frost' || id === 'hdd18') return 0;
  if (id === 'snow_depth' || id === 'streamflow' || id === 'radiation' || id === 'clear_sky' || id === 'longwave' || id === 'par' || id === 'cloud') return 1;
  if (id === 'humidity') return 1;
  return 2;
}

export function fmt(v: number, digits: number) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && abs < 10 ** -digits) return v.toExponential(1);
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function rateText(r: TrendResult): string {
  if (!r.stats) return '—';
  const d = decimalsFor(r.variable.id);
  const sign = r.stats.senPerDecade > 0 ? '+' : '';
  return `${sign}${fmt(r.stats.senPerDecade, d)} ${r.variable.annualUnit} / decade`;
}

export function trendStrength(r: TrendResult) {
  if (!r.stats) return { label: 'Not enough years', tone: 'none' as const };
  const p = r.stats.mk.p;
  if (p < 0.01) return { label: 'Highly significant', tone: 'strong' as const };
  if (p < 0.05) return { label: 'Statistically significant', tone: 'sig' as const };
  if (p < 0.1) return { label: 'Weak evidence', tone: 'weak' as const };
  return { label: 'Not significant', tone: 'none' as const };
}

/**
 * A cautious plain-language reading of the computed statistics. This is deliberately deterministic:
 * the app explains NASA's numbers with NASA's numbers, with no model or invented claim in between.
 */
export function explain(r: TrendResult): string {
  const v = r.variable;
  if (!r.stats) {
    return `Only ${r.series.annual.length} complete years are available for ${r.place.name}, which is too few for a trend test. Try a longer period or another place.`;
  }
  const s = r.stats;
  const pct = s.mk.p < 0.001 ? '< 0.001' : s.mk.p.toFixed(3);
  const d = decimalsFor(v.id);
  const dir = s.direction === 'up' ? v.up : v.down;
  const sig = s.mk.significant;
  const change = `${fmt(Math.abs(s.changeAbs), d)} ${v.annualUnit}`;
  const rate = `${fmt(Math.abs(s.senPerDecade), d)} ${v.annualUnit} per decade`;
  const startYear = s.firstYear;
  const endYear = s.lastYear;
  const period = `${startYear}–${endYear}`;
  const subject = r.place.gauge ? `the ${r.place.gauge.name} gauge near ${r.place.name}` : r.place.name;

  if (!sig) {
    return `Between ${period}, ${subject} shows a ${s.direction === 'flat' ? 'flat' : dir} tendency of about ${rate}, but the Mann–Kendall test gives p = ${pct}. That is not statistically significant at the 95% level: the year-to-year scatter is large enough that this pattern could arise without a real trend. A significant result is not required for the trend to be interesting — a longer record may resolve it.`;
  }

  const odds = s.mk.p < 0.001 ? 'less than 1 in 1,000' : `about 1 in ${Math.round(1 / s.mk.p).toLocaleString()}`;
  return `Between ${period}, ${subject} became ${dir}: the median (Sen's) slope is ${rate}. Over the full period that is a fitted change of ${change}, about ${s.changePct === null ? '—' : `${fmt(Math.abs(s.changePct), 1)}%`} of the ${period} average. The Mann–Kendall test gives p = ${pct}, so a trend this consistent would occur by chance ${odds} times if nothing were changing. The data support a real trend; they do not by themselves prove what caused it.`;
}

/** NASA GIBS WMS image for a monthly layer, in equirectangular projection (lon −180..180, lat −90..90). */
export function gibsUrl(layer: string, year: number, month: number, width = 2048) {
  return gibsDailyUrl(layer, year, month, 1, width);
}

/** NASA GIBS WMS image for a daily layer (e.g. MODIS true colour). */
export function gibsDailyUrl(layer: string, year: number, month: number, day: number, width = 2048) {
  const m = String(Math.min(12, Math.max(1, month))).padStart(2, '0');
  const d = String(Math.min(28, Math.max(1, day))).padStart(2, '0');
  const time = `${year}-${m}-${d}`;
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer,
    CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', WIDTH: String(width), HEIGHT: String(Math.round(width / 2)),
    TIME: time, FORMAT: 'image/jpeg',
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${q}`;
}

export function baseGlobeUrl(width = 4096) {
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'BlueMarble_ShadedRelief_Bathymetry',
    CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', WIDTH: String(width), HEIGHT: String(Math.round(width / 2)), FORMAT: 'image/jpeg',
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${q}`;
}

/** NASA VIIRS 2012 city lights: actual nighttime lights, used on the globe's night side. */
export function cityLightsUrl(width = 2048) {
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'VIIRS_CityLights_2012',
    CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', WIDTH: String(width), HEIGHT: String(Math.round(width / 2)), FORMAT: 'image/png',
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${q}`;
}

/** Original NASA satellite imagery: MODIS Terra corrected reflectance, daily true colour. */
export function satelliteLayer() {
  return 'MODIS_Terra_CorrectedReflectance_TrueColor';
}
