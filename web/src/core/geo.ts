// SPEC-CORE §4: GRS80/WGS84 transverse Mercator (Krüger series, Karney 2011, order n⁶).
import { normPiiru, piiruToRad, radToPiiru } from './angle';

export interface UTM {
  zone: number;
  band: string;
  easting: number;
  northing: number;
}
export interface Geo {
  lat: number;
  lon: number;
}

const a = 6378137.0;
const f = 1 / 298.257222101;
const K0 = 0.9996;
const FALSE_E = 500000;
const FALSE_N_SOUTH = 10000000;
const n = f / (2 - f);
const n1 = n, n2 = n * n, n3 = n2 * n, n4 = n2 * n2, n5 = n4 * n, n6 = n3 * n3;
const A = (a / (1 + n)) * (1 + n2 / 4 + (n2 * n2) / 64 + (n2 * n2 * n2) / 256);

const alpha = [
  n1 / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
];
const beta = [
  n1 / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
  (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
  (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
  (4583 * n5) / 161280 - (108847 * n6) / 3991680,
  (20648693 * n6) / 638668800,
];
const delta = [
  2 * n1 - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45 + (26 * n5) / 45 - (2854 * n6) / 675,
  (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45 + (2704 * n5) / 315 + (2323 * n6) / 945,
  (56 * n3) / 15 - (136 * n4) / 35 - (1262 * n5) / 105 + (73814 * n6) / 2835,
  (4279 * n4) / 630 - (332 * n5) / 35 - (399572 * n6) / 14175,
  (4174 * n5) / 315 - (144838 * n6) / 6237,
  (601676 * n6) / 22275,
];

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export const centralMeridian = (zone: number): number => zone * 6 - 183;
export const isNorthern = (p: UTM): boolean => p.band >= 'N';

export function zoneFor(c: Geo): number {
  let z = Math.floor((c.lon + 180) / 6) + 1;
  if (c.lat >= 56 && c.lat < 64 && c.lon >= 3 && c.lon < 12) z = 32;
  if (c.lat >= 72 && c.lat < 84) {
    if (c.lon >= 0 && c.lon < 9) z = 31;
    else if (c.lon >= 9 && c.lon < 21) z = 33;
    else if (c.lon >= 21 && c.lon < 33) z = 35;
    else if (c.lon >= 33 && c.lon < 42) z = 37;
  }
  return Math.max(1, Math.min(60, z));
}
export function bandFor(lat: number): string {
  const clamped = Math.max(-80, Math.min(84, lat));
  return BANDS[Math.min(19, Math.floor((clamped + 80) / 8))];
}
export function minLatitude(band: string): number | null {
  const i = BANDS.indexOf(band);
  return i < 0 ? null : -80 + 8 * i;
}

export function forward(c: Geo, forcedZone?: number): UTM {
  const zone = forcedZone ?? zoneFor(c);
  const phi = rad(c.lat);
  const lam = rad(c.lon - centralMeridian(zone));
  const sinPhi = Math.sin(phi);
  const q = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(sinPhi) - q * Math.atanh(q * sinPhi));
  const xiP = Math.atan2(t, Math.cos(lam));
  const etaP = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xiP;
  let eta = etaP;
  for (let j = 1; j <= 6; j++) {
    const jj = 2 * j;
    xi += alpha[j - 1] * Math.sin(jj * xiP) * Math.cosh(jj * etaP);
    eta += alpha[j - 1] * Math.cos(jj * xiP) * Math.sinh(jj * etaP);
  }
  let north = K0 * A * xi;
  if (c.lat < 0) north += FALSE_N_SOUTH;
  return { zone, band: bandFor(c.lat), easting: FALSE_E + K0 * A * eta, northing: north };
}

export function inverse(p: UTM): Geo {
  const north = isNorthern(p) ? p.northing : p.northing - FALSE_N_SOUTH;
  const xi = north / (K0 * A);
  const eta = (p.easting - FALSE_E) / (K0 * A);
  let xiP = xi;
  let etaP = eta;
  for (let j = 1; j <= 6; j++) {
    const jj = 2 * j;
    xiP -= beta[j - 1] * Math.sin(jj * xi) * Math.cosh(jj * eta);
    etaP -= beta[j - 1] * Math.cos(jj * xi) * Math.sinh(jj * eta);
  }
  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  let phi = chi;
  for (let j = 1; j <= 6; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  const lam = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
  return { lat: deg(phi), lon: centralMeridian(p.zone) + deg(lam) };
}

/** Northing of a latitude on the central meridian (already includes the southern false northing). */
export function centralMeridianNorthing(lat: number): number {
  return forward({ lat, lon: -177 }, 1).northing;
}

// Grid geometry in one zone (SPEC-CALC §3.1); callers project into a common zone first.
export function projectInto(p: UTM, zone: number): UTM {
  if (p.zone === zone) return p;
  const q = forward(inverse(p), zone);
  return { ...q, band: p.band };
}
export function offset(p: UTM, piiru: number, distance: number): UTM {
  const r = piiruToRad(normPiiru(piiru));
  return { ...p, easting: p.easting + distance * Math.sin(r), northing: p.northing + distance * Math.cos(r) };
}
export function bearing(from: UTM, to: UTM): number {
  return radToPiiru(Math.atan2(to.easting - from.easting, to.northing - from.northing));
}
export function distance(from: UTM, to: UTM): number {
  return Math.hypot(to.easting - from.easting, to.northing - from.northing);
}
