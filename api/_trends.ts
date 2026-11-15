import { HttpError } from './_nebius.js';
import { mannKendall, senSlope, hamedRao, pettitt, type ModifiedMannKendall, type ChangePoint } from './_stats.js';

/**
 * Earth-system trend detective: monthly time series from NASA POWER (MERRA-2), reduced to
 * annual values and tested for a monotonic trend.
 *
 * Why POWER: it is a NASA Earth science service (NASA LaRC), needs no key or account, and
 * returns a complete monthly record for any land point back to 1981. That makes the same
 * request work from a Vercel function, a laptop and a phone without a login wall.
 *
 * Nothing here is modelled or filled in: missing POWER values (-999) are dropped, and a year
 * is only used when enough months are present. The statistics are the textbook ones the
 * challenge asks for: Sen's slope (median of pairwise slopes), a Mann-Kendall trend test with
 * tie correction, and an ordinary-least-squares fit with an approximate 95% confidence interval.
 */

export type VariableId =
  | 't2m' | 't2m_max' | 't2m_min' | 't2mdew' | 't2mwet'
  | 'humidity' | 'qv2m' | 'ps' | 'wind' | 'ws10m'
  | 'precip' | 'precip_snow' | 'evap' | 'soil' | 'soil_top' | 'soil_prof' | 'pw' | 'streamflow'
  | 'ts' | 'soil_t1' | 'frost' | 'snow_depth' | 'snow_cover' | 'hdd18'
  | 'radiation' | 'clear_sky' | 'longwave' | 'par' | 'albedo' | 'cloud';

export type VariableGroup = 'Atmosphere' | 'Water' | 'Land' | 'Energy';

export interface VariableDef {
  id: VariableId;
  label: string;
  short: string;
  power: string;
  unit: string;
  annualUnit: string;
  aggregate: 'mean' | 'sum';
  group: VariableGroup;
  /** Direction words for the interpretation sentence. */
  up: string;
  down: string;
  description: string;
  /** NASA GIBS monthly layer that shows the same quantity, when one exists. */
  gibs?: string;
  /** True when the GIBS layer is not exactly the POWER variable (do not use silently). */
  gibsCaveat?: string;
  /** Non-POWER variables come from a ground gauge network. */
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

export const VARIABLES: Record<VariableId, VariableDef> = {
  t2m: {
    id: 't2m', label: 'Air temperature', short: 'Temperature', power: 'T2M',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Atmosphere',
    up: 'warmer', down: 'cooler',
    description: 'Temperature at 2 metres above the surface.',
    gibs: 'MERRA2_2m_Air_Temperature_Monthly',
  },
  t2m_max: {
    id: 't2m_max', label: 'Daily maximum air temperature', short: 'Daily max', power: 'T2M_MAX',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Atmosphere',
    up: 'hotter highs', down: 'cooler highs',
    description: 'Monthly average of the daily maximum temperature at 2 m.',
  },
  t2m_min: {
    id: 't2m_min', label: 'Daily minimum air temperature', short: 'Daily min', power: 'T2M_MIN',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Atmosphere',
    up: 'warmer nights', down: 'cooler nights',
    description: 'Monthly average of the daily minimum temperature at 2 m.',
  },
  t2mdew: {
    id: 't2mdew', label: 'Dew point at 2 m', short: 'Dew point', power: 'T2MDEW',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Atmosphere',
    up: 'more moisture', down: 'less moisture',
    description: 'Dew/frost point temperature at 2 m.',
  },
  t2mwet: {
    id: 't2mwet', label: 'Wet-bulb temperature at 2 m', short: 'Wet-bulb', power: 'T2MWET',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Atmosphere',
    up: 'warmer wet-bulb', down: 'cooler wet-bulb',
    description: 'Wet-bulb temperature at 2 m, the coolest temperature reachable by evaporation.',
  },
  humidity: {
    id: 'humidity', label: 'Relative humidity at 2 m', short: 'Humidity', power: 'RH2M',
    unit: '%', annualUnit: '%', aggregate: 'mean', group: 'Atmosphere',
    up: 'more humid', down: 'less humid',
    description: 'Relative humidity at 2 metres above the surface.',
  },
  qv2m: {
    id: 'qv2m', label: 'Specific humidity at 2 m', short: 'Specific humidity', power: 'QV2M',
    unit: 'g/kg', annualUnit: 'g/kg', aggregate: 'mean', group: 'Atmosphere',
    up: 'more water vapour', down: 'less water vapour',
    description: 'Mass of water vapour per kilogram of moist air at 2 m.',
  },
  ps: {
    id: 'ps', label: 'Surface pressure', short: 'Pressure', power: 'PS',
    unit: 'kPa', annualUnit: 'kPa', aggregate: 'mean', group: 'Atmosphere',
    up: 'higher pressure', down: 'lower pressure',
    description: 'Atmospheric pressure at the surface.',
  },
  wind: {
    id: 'wind', label: 'Wind speed at 2 m', short: 'Wind 2 m', power: 'WS2M',
    unit: 'm/s', annualUnit: 'm/s', aggregate: 'mean', group: 'Atmosphere',
    up: 'windier', down: 'calmer',
    description: 'Average wind speed at 2 metres above the surface.',
    gibs: 'MERRA2_Surface_Wind_Speed_Monthly',
  },
  ws10m: {
    id: 'ws10m', label: 'Wind speed at 10 m', short: 'Wind 10 m', power: 'WS10M',
    unit: 'm/s', annualUnit: 'm/s', aggregate: 'mean', group: 'Atmosphere',
    up: 'windier', down: 'calmer',
    description: 'Average wind speed at 10 metres above the surface.',
  },
  precip: {
    id: 'precip', label: 'Precipitation', short: 'Rainfall', power: 'PRECTOTCORR',
    unit: 'mm/day', annualUnit: 'mm/year', aggregate: 'sum', group: 'Water',
    up: 'wetter', down: 'drier',
    description: 'Corrected total precipitation, summed into a yearly total.',
    gibs: 'MERRA2_Precipitation_Bias_Corrected_Monthly',
  },
  precip_snow: {
    id: 'precip_snow', label: 'Snowfall', short: 'Snowfall', power: 'PRECSNOLAND',
    unit: 'mm/day', annualUnit: 'mm/year', aggregate: 'sum', group: 'Water',
    up: 'snowier', down: 'less snow',
    description: 'Snow precipitation over land, water equivalent, summed into a yearly total.',
  },
  evap: {
    id: 'evap', label: 'Land evapotranspiration', short: 'Evaporation', power: 'EVLAND',
    unit: 'mm/day', annualUnit: 'mm/year', aggregate: 'sum', group: 'Water',
    up: 'more evaporation', down: 'less evaporation',
    description: 'Water leaving the land through evaporation and plant transpiration.',
  },
  soil: {
    id: 'soil', label: 'Root-zone soil wetness', short: 'Soil root', power: 'GWETROOT',
    unit: 'fraction', annualUnit: 'fraction', aggregate: 'mean', group: 'Water',
    up: 'wetter', down: 'drier',
    description: 'Water content of the root zone, from 0 (dry) to 1 (saturated).',
    gibs: 'GLDAS_Underground_Soil_Moisture_Monthly',
    gibsCaveat: 'GLDAS underground soil moisture, a related but not identical layer.',
  },
  soil_top: {
    id: 'soil_top', label: 'Surface soil wetness', short: 'Soil surface', power: 'GWETTOP',
    unit: 'fraction', annualUnit: 'fraction', aggregate: 'mean', group: 'Water',
    up: 'wetter', down: 'drier',
    description: 'Water content of the surface soil layer, from 0 (dry) to 1 (saturated).',
  },
  soil_prof: {
    id: 'soil_prof', label: 'Profile soil wetness', short: 'Soil profile', power: 'GWETPROF',
    unit: 'fraction', annualUnit: 'fraction', aggregate: 'mean', group: 'Water',
    up: 'wetter', down: 'drier',
    description: 'Water content of the full soil profile, from 0 (dry) to 1 (saturated).',
  },
  pw: {
    id: 'pw', label: 'Precipitable water', short: 'Precip. water', power: 'PW',
    unit: 'cm', annualUnit: 'cm', aggregate: 'mean', group: 'Water',
    up: 'more water vapour', down: 'less water vapour',
    description: 'Total water vapour in a vertical column, expressed as liquid depth.',
  },
  streamflow: {
    id: 'streamflow', label: 'Streamflow (gauge)', short: 'Streamflow', power: '',
    unit: 'm³/s', annualUnit: 'm³/s', aggregate: 'mean', group: 'Water',
    up: 'higher flow', down: 'lower flow',
    description: 'Annual mean river discharge at the nearest active USGS (US) or ECCC (Canada) gauge.',
    source: 'water',
  },
  ts: {
    id: 'ts', label: 'Earth skin temperature', short: 'Skin temp', power: 'TS',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Land',
    up: 'warmer surface', down: 'cooler surface',
    description: 'Temperature of the land or snow surface.',
  },
  soil_t1: {
    id: 'soil_t1', label: 'Soil temperature, layer 1', short: 'Soil temp 1', power: 'TSOIL1',
    unit: '°C', annualUnit: '°C', aggregate: 'mean', group: 'Land',
    up: 'warmer soil', down: 'cooler soil',
    description: 'Temperature of the top soil layer.',
  },
  frost: {
    id: 'frost', label: 'Frost days', short: 'Frost days', power: 'FROST_DAYS',
    unit: 'days/month', annualUnit: 'days/year', aggregate: 'sum', group: 'Land',
    up: 'more frost days', down: 'fewer frost days',
    description: 'Frost days counted in each month, summed into a yearly total.',
  },
  snow_depth: {
    id: 'snow_depth', label: 'Snow depth', short: 'Snow depth', power: 'SNODP',
    unit: 'cm', annualUnit: 'cm', aggregate: 'mean', group: 'Land',
    up: 'deeper snow', down: 'shallower snow',
    description: 'Average depth of snow on the ground.',
  },
  snow_cover: {
    id: 'snow_cover', label: 'Snow cover fraction', short: 'Snow cover', power: 'FRSNO',
    unit: 'fraction', annualUnit: 'fraction', aggregate: 'mean', group: 'Land',
    up: 'more snow cover', down: 'less snow cover',
    description: 'Fraction of the grid cell covered by snow.',
  },
  hdd18: {
    id: 'hdd18', label: 'Heating degree days below 18.3 °C', short: 'Heating degree', power: 'HDD18_3',
    unit: 'degree-days/month', annualUnit: 'degree-days/year', aggregate: 'sum', group: 'Land',
    up: 'more heating demand', down: 'less heating demand',
    description: 'Heating degree days below 18.3 °C, summed into a yearly total.',
  },
  radiation: {
    id: 'radiation', label: 'Surface solar energy', short: 'Sunlight', power: 'ALLSKY_SFC_SW_DWN',
    unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', aggregate: 'mean', group: 'Energy',
    up: 'brighter', down: 'dimmer',
    description: 'All-sky downward shortwave radiation reaching the surface.',
  },
  clear_sky: {
    id: 'clear_sky', label: 'Clear-sky solar energy', short: 'Clear-sky sun', power: 'CLRSKY_SFC_SW_DWN',
    unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', aggregate: 'mean', group: 'Energy',
    up: 'brighter clear sky', down: 'dimmer clear sky',
    description: 'Shortwave energy reaching the surface under a cloud-free sky.',
  },
  longwave: {
    id: 'longwave', label: 'Downward thermal infrared', short: 'Thermal IR', power: 'ALLSKY_SFC_LW_DWN',
    unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', aggregate: 'mean', group: 'Energy',
    up: 'more thermal infrared', down: 'less thermal infrared',
    description: 'All-sky longwave (thermal infrared) radiation reaching the surface.',
  },
  par: {
    id: 'par', label: 'Photosynthetically active radiation', short: 'PAR', power: 'ALLSKY_SFC_PAR_TOT',
    unit: 'MJ/m²/day', annualUnit: 'MJ/m²/day', aggregate: 'mean', group: 'Energy',
    up: 'more plant light', down: 'less plant light',
    description: 'Total photosynthetically active radiation reaching the surface.',
  },
  albedo: {
    id: 'albedo', label: 'Surface albedo', short: 'Albedo', power: 'ALLSKY_SRF_ALB',
    unit: 'fraction', annualUnit: 'fraction', aggregate: 'mean', group: 'Energy',
    up: 'more reflective', down: 'less reflective',
    description: 'Fraction of incoming sunlight reflected by the surface.',
  },
  cloud: {
    id: 'cloud', label: 'Cloud amount', short: 'Cloud cover', power: 'CLOUD_AMT',
    unit: '%', annualUnit: '%', aggregate: 'mean', group: 'Energy',
    up: 'cloudier', down: 'less cloudy',
    description: 'Average cloud amount over the grid cell.',
  },
};

export const VARIABLE_IDS = Object.keys(VARIABLES) as VariableId[];

export interface AnnualPoint { year: number; v: number; months: number }
export interface MonthlyPoint { t: string; v: number }

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
  /** Sen's slope 95% interval per year (Gilbert 1987), non-parametric. */
  senCi95: [number, number];
  /** Hamed & Rao (1998) Mann–Kendall corrected for serial correlation. */
  mkModified: ModifiedMannKendall;
  /** Significant under both the plain and the autocorrelation-corrected test. */
  robust: boolean;
  /** Pettitt (1979) most likely change point. */
  changePoint: ChangePoint | null;
  changeAbs: number;
  changePct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface TrendResult {
  variable: VariableDef;
  place: { name: string; lat: number; lon: number; mode: 'point' | 'region'; samples: number; gauge?: GaugeInfo };
  period: { start: number; end: number; years: number };
  series: { monthly: MonthlyPoint[]; annual: AnnualPoint[] };
  stats: TrendStats | null;
  source: {
    name: string;
    dataset: string;
    url: string;
    licence: string;
    accessed: string;
    note: string;
  };
  notes: string[];
}

const FILL = -999;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const RAD = Math.PI / 180;

function daysInMonth(year: number, month: number) {
  if (month === 2 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return 29;
  return MONTH_DAYS[month - 1];
}

interface PowerReply {
  header?: { fill_value?: number; start?: string; end?: string };
  parameters?: Record<string, { units?: string; longname?: string }>;
  properties?: { parameter?: Record<string, Record<string, number>> };
  messages?: string[];
}

async function fetchPoint(variable: VariableDef, lat: number, lon: number, start: number, end: number) {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point');
  url.searchParams.set('parameters', variable.power);
  url.searchParams.set('community', 'AG');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('format', 'JSON');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new HttpError(res.status === 429 ? 429 : 502, `NASA POWER answered ${res.status}`);
  const json = (await res.json()) as PowerReply;
  const raw = json.properties?.parameter?.[variable.power];
  if (!raw) {
    const why = json.messages?.length ? `: ${json.messages.slice(0, 2).join('; ')}` : '';
    throw new HttpError(502, `NASA POWER returned no ${variable.power} series${why}`);
  }
  const fill = json.header?.fill_value ?? FILL;
  const months = new Map<string, number>();
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{6}$/.test(key) || key.endsWith('13')) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value === fill) continue;
    months.set(`${key.slice(0, 4)}-${key.slice(4, 6)}`, value);
  }
  if (!months.size) throw new HttpError(502, `NASA POWER has no usable ${variable.short.toLowerCase()} values here`);
  return months;
}

/** Nine sample points in a roughly 2.5° box; regional values are their month-by-month mean. */
function sampleOffsets(mode: 'point' | 'region', lat: number) {
  if (mode === 'point') return [[0, 0]] as [number, number][];
  const dLat = 1.25;
  const dLon = Math.min(1.25, 1.25 / Math.max(0.35, Math.cos(lat * RAD)));
  const out: [number, number][] = [];
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) out.push([a * dLat, b * dLon]);
  return out;
}

function wrapLon(lon: number) {
  return ((lon + 540) % 360) - 180;
}

async function series(variable: VariableDef, lat: number, lon: number, start: number, end: number, mode: 'point' | 'region') {
  const offsets = sampleOffsets(mode, lat);
  const settled = await Promise.allSettled(offsets.map(([dLat, dLon]) => {
    const pLat = Math.max(-89.5, Math.min(89.5, lat + dLat));
    return fetchPoint(variable, pLat, wrapLon(lon + dLon), start, end);
  }));
  const good = settled.filter((s): s is PromiseFulfilledResult<Map<string, number>> => s.status === 'fulfilled');
  if (!good.length) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    throw new HttpError(502, first?.reason instanceof Error ? first.reason.message : 'NASA POWER is not responding');
  }
  if (mode === 'region' && good.length < 5) throw new HttpError(502, 'NASA POWER returned too few usable grid points for this region');

  // Average the sample points month by month. For a point this is just that point's series.
  const keys = new Set<string>();
  for (const g of good) for (const k of g.value.keys()) keys.add(k);
  const monthly = [...keys].sort().map((t) => {
    let sum = 0, n = 0;
    for (const g of good) {
      const v = g.value.get(t);
      if (v !== undefined) { sum += v; n += 1; }
    }
    return { t, v: sum / n };
  }).filter((p) => Number.isFinite(p.v));
  return { monthly, samples: good.length };
}

export function annualize(monthly: MonthlyPoint[], variable: VariableDef): AnnualPoint[] {
  const byYear = new Map<number, { sum: number; weight: number; months: number }>();
  for (const p of monthly) {
    const year = Number(p.t.slice(0, 4));
    const month = Number(p.t.slice(5, 7));
    if (!Number.isFinite(year) || month < 1 || month > 12) continue;
    const days = daysInMonth(year, month);
    const e = byYear.get(year) ?? { sum: 0, weight: 0, months: 0 };
    // Monthly means are weighted by the length of the month.
    e.sum += variable.aggregate === 'sum' ? p.v * days : p.v * days;
    e.weight += days;
    e.months += 1;
    byYear.set(year, e);
  }
  const out: AnnualPoint[] = [];
  for (const [year, e] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (variable.aggregate === 'sum' && e.months < 12) continue;
    if (variable.aggregate === 'mean' && e.months < 10) continue;
    // For a mean, divide the day-weighted sum by the days present; for a sum, the sum is the total.
    out.push({ year, v: variable.aggregate === 'mean' ? e.sum / e.weight : e.sum, months: e.months });
  }
  return out;
}

/** Standard normal CDF, via the Abramowitz-Stegun 7.1.26 error-function approximation. */
function normalCdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function analyse(annual: AnnualPoint[]): TrendStats | null {
  const pts = annual.filter((p) => Number.isFinite(p.v));
  const n = pts.length;
  if (n < 10) return null;

  const x = pts.map((p) => p.year);
  const y = pts.map((p) => p.v);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  // Sen's slope (median pairwise slope) with its non-parametric 95% interval.
  const sen = senSlope(x, y);
  const senPerYear = sen.slope;

  // Mann-Kendall with tie correction, then the Hamed & Rao serial-correlation correction.
  const mkPlain = mannKendall(y);
  const { s, z, p, tau } = mkPlain;
  const mkModified = hamedRao(x, y, mkPlain, sen);
  const changePoint = pettitt(x, y);

  // Ordinary least squares, for a slope confidence interval and R².
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - meanX) ** 2;
    sxy += (x[i] - meanX) * (y[i] - meanY);
  }
  const olsPerYear = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - olsPerYear * meanX;
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    sse += (y[i] - (intercept + olsPerYear * x[i])) ** 2;
    sst += (y[i] - meanY) ** 2;
  }
  // 1.96 is the large-sample 95% normal quantile; with 10+ years the t value is close enough
  // for an exploratory tool, and the UI labels it "approx. 95%".
  const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  const ci: [number, number] = [olsPerYear - 1.96 * se, olsPerYear + 1.96 * se];
  const r2 = sst > 0 ? 1 - sse / sst : 0;

  const changeAbs = senPerYear * (pts[n - 1].year - pts[0].year);
  const direction = Math.abs(senPerYear) < 1e-12 ? 'flat' : senPerYear > 0 ? 'up' : 'down';
  return {
    n,
    firstYear: pts[0].year,
    lastYear: pts[n - 1].year,
    mean: meanY,
    first: y[0],
    last: y[n - 1],
    senPerYear,
    senPerDecade: senPerYear * 10,
    olsPerYear,
    olsCi95: ci,
    olsR2: r2,
    mk: { s, z, p, tau, significant: p < 0.05 },
    senCi95: sen.ci95,
    mkModified,
    robust: p < 0.05 && mkModified.p < 0.05,
    changePoint,
    changeAbs,
    changePct: meanY !== 0 ? (changeAbs / Math.abs(meanY)) * 100 : null,
    direction,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Streamflow: the one variable that is not a NASA grid.
 *
 * NASA's keyless point services do not publish river discharge, so for this variable ATLAS uses
 * the official ground-gauge networks: USGS Water Services in the United States and Environment
 * and Climate Change Canada's MSC GeoMet service in Canada. Both are open, keyless and federal.
 * The app always names the gauge it used and how far it is from the selected centre.
 * ---------------------------------------------------------------------------------------------- */

const R_EARTH_KM = 6371.0088;
const FT3S_TO_M3S = 0.028316846592;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function gaugeBox(lat: number, lon: number, span = 1.5): [number, number, number, number] {
  return [Math.max(-180, lon - span), Math.max(-89, lat - span), Math.min(180, lon + span), Math.min(89, lat + span)];
}

function parseRdb(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.length && !l.startsWith('#'));
  if (lines.length < 3) return { head: [] as string[], rows: [] as string[][] };
  const head = lines[0].split('\t');
  // RDB line 2 describes column formats; data starts on line 3.
  return { head, rows: lines.slice(2).map((l) => l.split('\t')) };
}

interface UsgsReply {
  value?: {
    timeSeries?: Array<{
      variable?: { unit?: { unitCode?: string }; variableCode?: Array<{ value?: string }> };
      values?: Array<{ value?: Array<{ value?: string; dateTime?: string }> }>;
    }>;
  };
}

interface EcccFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

interface EcccReply { features?: EcccFeature[] }

async function usgsGauges(lat: number, lon: number): Promise<GaugeInfo[]> {
  const [w, s, e, n] = gaugeBox(lat, lon);
  const url = new URL('https://waterservices.usgs.gov/nwis/site/');
  url.searchParams.set('format', 'rdb');
  url.searchParams.set('bBox', `${w},${s},${e},${n}`);
  url.searchParams.set('parameterCd', '00060');
  url.searchParams.set('siteStatus', 'active');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return [];
  const { head, rows } = parseRdb(await res.text());
  const col = (name: string) => head.indexOf(name);
  const iNo = col('site_no');
  const iName = col('station_nm');
  const iLat = col('dec_lat_va');
  const iLon = col('dec_long_va');
  if (iNo < 0 || iLat < 0 || iLon < 0) return [];
  const out: GaugeInfo[] = [];
  for (const r of rows) {
    const id = r[iNo];
    const gLat = Number(r[iLat]);
    const gLon = Number(r[iLon]);
    if (!id || !Number.isFinite(gLat) || !Number.isFinite(gLon)) continue;
    if (Math.abs(gLat - lat) > 1.6 || Math.abs(gLon - lon) > 2.2) continue;
    out.push({
      id,
      name: (r[iName] || `USGS ${id}`).replace(/\s+/g, ' ').trim(),
      lat: gLat,
      lon: gLon,
      distanceKm: Math.round(distanceKm(lat, lon, gLat, gLon) * 10) / 10,
      source: 'USGS',
      url: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(id)}/`,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 10);
}

async function ecccGauges(lat: number, lon: number): Promise<GaugeInfo[]> {
  const [w, s, e, n] = gaugeBox(lat, lon);
  const url = new URL('https://api.weather.gc.ca/collections/hydrometric-stations/items');
  url.searchParams.set('f', 'json');
  url.searchParams.set('limit', '100');
  url.searchParams.set('bbox', `${w},${s},${e},${n}`);
  url.searchParams.set('STATUS_EN', 'Active');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as EcccReply;
  const out: GaugeInfo[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    const status = String(p.STATUS_EN ?? '');
    if (status && status.toLowerCase() !== 'active') continue;
    const id = String(p.STATION_NUMBER ?? p.IDENTIFIER ?? '');
    const coords = f.geometry?.coordinates;
    if (!id || !coords || coords.length < 2) continue;
    const gLon = Number(coords[0]);
    const gLat = Number(coords[1]);
    if (!Number.isFinite(gLat) || !Number.isFinite(gLon)) continue;
    out.push({
      id,
      name: String(p.STATION_NAME ?? `ECCC ${id}`).replace(/\s+/g, ' ').trim(),
      lat: gLat,
      lon: gLon,
      distanceKm: Math.round(distanceKm(lat, lon, gLat, gLon) * 10) / 10,
      source: 'ECCC',
      url: `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${encodeURIComponent(id)}`,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 10);
}

/** Daily USGS values → monthly means (m³/s). Months with fewer than 20 days are left out. */
async function usgsMonthly(gauge: GaugeInfo, start: number, end: number): Promise<MonthlyPoint[]> {
  const url = new URL('https://waterservices.usgs.gov/nwis/dv/');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', gauge.id);
  url.searchParams.set('parameterCd', '00060');
  url.searchParams.set('startDT', `${start}-01-01`);
  url.searchParams.set('endDT', `${end}-12-31`);
  url.searchParams.set('statCd', '00003');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)' },
    signal: AbortSignal.timeout(35_000),
  });
  if (!res.ok) throw new HttpError(502, `USGS answered ${res.status} for gauge ${gauge.id}`);
  const json = (await res.json()) as UsgsReply;
  const series = json.value?.timeSeries ?? [];
  const picked = series.find((s) => s.values?.[0]?.value?.length) ?? series[0];
  const daily = picked?.values?.[0]?.value ?? [];
  const unit = picked?.variable?.unit?.unitCode ?? 'ft3/s';
  const factor = /ft3|ft\^3|cfs/i.test(unit) ? FT3S_TO_M3S : 1;
  const sums = new Map<string, { sum: number; n: number }>();
  for (const d of daily) {
    const t = typeof d.dateTime === 'string' ? d.dateTime.slice(0, 7) : '';
    if (d.value === null || d.value === undefined || d.value === '') continue;
    const v = Number(d.value);
    if (!/^\d{4}-\d{2}$/.test(t) || !Number.isFinite(v)) continue;
    const e = sums.get(t) ?? { sum: 0, n: 0 };
    e.sum += v * factor;
    e.n += 1;
    sums.set(t, e);
  }
  return [...sums.entries()]
    .filter(([, e]) => e.n >= 20)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, e]) => ({ t, v: e.sum / e.n }));
}

/** ECCC monthly mean discharge is already in m³/s. */
async function ecccMonthly(gauge: GaugeInfo, start: number, end: number): Promise<MonthlyPoint[]> {
  const url = new URL('https://api.weather.gc.ca/collections/hydrometric-monthly-mean/items');
  url.searchParams.set('f', 'json');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('STATION_NUMBER', gauge.id);
  url.searchParams.set('datetime', `${start}-01-01/${end}-12-31`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)' },
    signal: AbortSignal.timeout(35_000),
  });
  if (!res.ok) throw new HttpError(502, `ECCC answered ${res.status} for gauge ${gauge.id}`);
  const json = (await res.json()) as EcccReply;
  const out: MonthlyPoint[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    const date = String(p.DATE ?? '');
    const raw = p.MONTHLY_MEAN_DISCHARGE;
    if (raw === null || raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (!/^\d{4}-\d{2}$/.test(date) || !Number.isFinite(v)) continue;
    out.push({ t: date, v });
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

async function waterTrend(
  variable: VariableDef,
  lat: number,
  lon: number,
  start: number,
  end: number,
  mode: 'point' | 'region',
  name: string | undefined,
): Promise<TrendResult> {
  const settled = await Promise.allSettled([usgsGauges(lat, lon), ecccGauges(lat, lon)]);
  const gauges = settled
    .flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 8);
  if (!gauges.length) {
    throw new HttpError(404, 'No active USGS (United States) or ECCC (Canada) streamflow gauge is within about 1.5° of this place. Streamflow is a ground-gauge variable, so try a place in the US or Canada, or pick a NASA gridded variable.');
  }

  let used: GaugeInfo | null = null;
  let monthly: MonthlyPoint[] = [];
  let annual: AnnualPoint[] = [];
  const tried: string[] = [];
  for (const gauge of gauges) {
    try {
      const m = gauge.source === 'USGS'
        ? await usgsMonthly(gauge, start, end)
        : await ecccMonthly(gauge, start, end);
      const a = annualize(m, variable);
      if (a.length >= 10) { used = gauge; monthly = m; annual = a; break; }
      tried.push(`${gauge.id} (${a.length} complete years)`);
    } catch {
      tried.push(`${gauge.id} (no usable record)`);
    }
  }
  if (!used) {
    throw new HttpError(404, `The nearest ${gauges.length} active gauges do not have 10 complete years of discharge for ${start}–${end}. ${tried.slice(0, 3).join('; ')}. Try a longer period or another place.`);
  }

  const stats = analyse(annual);
  const placeName = (name || '').replace(/[<>]/g, '').trim().slice(0, 80) ||
    `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  const sourceName = used.source === 'USGS' ? 'USGS Water Services' : 'ECCC MSC GeoMet';
  const dataset = used.source === 'USGS'
    ? 'NWIS daily mean discharge, parameter 00060 (ft³/s converted to m³/s)'
    : 'Hydrometric monthly mean discharge (m³/s)';
  const licence = used.source === 'USGS'
    ? 'U.S. Government work (USGS), public domain'
    : 'Open Government Licence – Canada';

  return {
    variable,
    place: { name: placeName, lat, lon, mode, samples: 1, gauge: used },
    period: { start, end, years: annual.length },
    series: { monthly, annual },
    stats,
    source: {
      name: sourceName,
      dataset,
      url: used.url,
      licence,
      accessed: new Date().toISOString(),
      note: `Nearest active gauge with a usable record: ${used.name} (${used.id}), ${used.distanceKm} km from the selected centre.`,
    },
    notes: [
      'Streamflow is measured by a ground gauge, not by a NASA satellite or reanalysis grid; it is a local river record, not a basin average.',
      mode === 'region'
        ? 'Region mode still uses one gauge: a discharge record cannot be averaged like a grid of climate cells.'
        : 'Point series: the gauge can sit upstream or downstream of the exact coordinate, so its flow may differ from the wider river.',
      'Annual mean discharge is the day-weighted mean of available daily values (USGS) or the mean of monthly means (ECCC); months need at least 20 days.',
      'Gauge records can be affected by dams, diversions, ice and channel change. A trend does not by itself prove a climate cause.',
      'Mann-Kendall p-value assumes independent annual values; serial correlation is not corrected.',
      "Sen's slope is the median of pairwise slopes; the 95% interval is from an ordinary least-squares fit (approx.).",
    ],
  };
}

const cache = new Map<string, { at: number; data: TrendResult }>();
const TTL = 12 * 3600e3;

export async function trend(opts: {
  variable: VariableId; lat: number; lon: number; start: number; end: number;
  mode: 'point' | 'region'; name?: string;
}): Promise<TrendResult> {
  const variable = VARIABLES[opts.variable];
  if (!variable) throw new HttpError(400, 'unknown variable');
  const lat = Math.round(opts.lat * 1000) / 1000;
  const lon = Math.round(opts.lon * 1000) / 1000;
  const key = `${opts.variable}:${opts.mode}:${lat}:${lon}:${opts.start}:${opts.end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  if (variable.source === 'water') {
    const data = await waterTrend(variable, lat, lon, opts.start, opts.end, opts.mode, opts.name);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return data;
  }

  const { monthly, samples } = await series(variable, lat, lon, opts.start, opts.end, opts.mode);
  const annual = annualize(monthly, variable);
  const stats = analyse(annual);
  const name = (opts.name || '').replace(/[<>]/g, '').trim().slice(0, 80);
  const placeName = name || `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

  const data: TrendResult = {
    variable,
    place: { name: placeName, lat, lon, mode: opts.mode, samples },
    period: { start: opts.start, end: opts.end, years: annual.length },
    series: { monthly, annual },
    stats,
    source: {
      name: 'NASA POWER',
      dataset: 'MERRA-2 monthly, NASA LaRC',
      url: 'https://power.larc.nasa.gov/',
      licence: 'U.S. Government work (NASA); acknowledgement requested',
      accessed: new Date().toISOString(),
      note: opts.mode === 'region'
        ? `Mean of ${samples} NASA POWER grid points within about 2.5° of the centre.`
        : 'Single NASA POWER grid point at the centre.',
    },
    notes: [
      'Annual values are computed from the monthly series; monthly means are weighted by month length.',
      opts.mode === 'region' ? `Regional series averages ${samples} sample points; it is not an area-weighted basin average.` : 'Point series: trends in one grid cell can differ from the surrounding region.',
      'Mann-Kendall p-value is shown twice: the classic test, and the Hamed & Rao (1998) version that corrects for year-to-year autocorrelation.',
      "Sen's slope is the median of pairwise slopes; its 95% interval is the non-parametric Gilbert (1987) interval. OLS is shown as a cross-check.",
      'The Pettitt test looks for the single most likely year the series shifted level; it is exploratory, not a cause.',
      'A trend can be real without being statistically significant; a short record has less power to detect one.',
    ],
  };
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return data;
}
