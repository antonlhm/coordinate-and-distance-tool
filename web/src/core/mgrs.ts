// SPEC-CORE §4: MGRS output always truncates to the cell's south-west corner (golden rule 3).
import { type UTM, centralMeridianNorthing, minLatitude } from './geo';

const COLSETS = ['STUVWXYZ', 'ABCDEFGH', 'JKLMNPQR']; // zone % 3 = 0, 1, 2
const ROWS = 'ABCDEFGHJKLMNPQRSTUV';
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const COLS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// Guards float noise only (1 µm): a value like 11999.9999999999 that is really 12000 must not drop a cell.
const EPS = 1e-6;

export interface MGRS {
  zone: number;
  band: string;
  col: string;
  row: string;
  e: number;
  n: number;
}

export function utmToMGRS(u: UTM): MGRS {
  const colIndex = Math.floor(u.easting / 100000) - 1;
  const col = COLSETS[u.zone % 3][Math.max(0, Math.min(7, colIndex))];
  const rowOffset = u.zone % 2 === 0 ? 5 : 0;
  const rowIndex = (Math.floor(u.northing / 100000) + rowOffset) % 20;
  return { zone: u.zone, band: u.band, col, row: ROWS[rowIndex], e: u.easting % 100000, n: u.northing % 100000 };
}

export function mgrsToUTM(m: MGRS): UTM | null {
  const colIndex = COLSETS[m.zone % 3].indexOf(m.col);
  const rowIndex = ROWS.indexOf(m.row);
  const minLat = minLatitude(m.band);
  if (colIndex < 0 || rowIndex < 0 || minLat === null) return null;
  const rowOffset = m.zone % 2 === 0 ? 5 : 0;
  let base = ((((rowIndex - rowOffset) % 20) + 20) % 20) * 100000;
  const minNorthing = centralMeridianNorthing(minLat) - 1000;
  while (base + m.n < minNorthing) base += 2_000_000; // smallest 2 000 km cycle value not below the band
  return { zone: m.zone, band: m.band, easting: (colIndex + 1) * 100000 + m.e, northing: base + m.n };
}

/** `34VFM 12859 56480` for 5 digits per axis (1 m); 4 → 10 m, 3 → 100 m. */
export function formatMGRS(u: UTM, digits = 5): string {
  const m = utmToMGRS(u);
  const d = Math.max(0, Math.min(5, digits));
  const scale = 10 ** (5 - d);
  const pad = (v: number): string => (d === 0 ? '' : String(Math.floor((v + EPS) / scale)).padStart(d, '0'));
  return `${String(m.zone).padStart(2, '0')}${m.band}${m.col}${m.row} ${pad(m.e)} ${pad(m.n)}`.trim();
}

export type InputCellInterpretation = 'corner' | 'centre';
export type ParseResult =
  | { ok: true; utm: UTM; height?: number; cell: number }
  | { ok: false; reason: string; options?: UTM[] };

function splitHead(t: string): { zone: number; band: string; col: string; row: string; digits: string } | null {
  let i = 0;
  let z = '';
  while (i < t.length && /\d/.test(t[i]) && z.length < 2) z += t[i++];
  const zone = parseInt(z, 10);
  const rest = t.slice(i);
  if (!z || zone < 1 || zone > 60 || rest.length < 3) return null;
  const [band, col, row] = [rest[0], rest[1], rest[2]];
  if (!BANDS.includes(band) || !COLS.includes(col) || !ROWS.includes(row)) return null;
  return { zone, band, col, row, digits: rest.slice(3) };
}

/**
 * Parses `34VEP 7381 5967`, `34vep73815967`, `34VEP 7381 5967 115` and short entries `7381 5967`
 * (zone/band/square inherited from `reference`). SPEC-CORE §4.1.
 */
export function parsePosition(
  text: string,
  reference?: UTM,
  interpretation: InputCellInterpretation = 'corner',
): ParseResult {
  const tokens = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, reason: 'empty' };
  let head: ReturnType<typeof splitHead> = null;
  let rest = tokens;
  const first = tokens[0];
  const m = splitHead(first);
  if (m) {
    head = m;
    rest = m.digits ? [m.digits, ...tokens.slice(1)] : tokens.slice(1);
  } else if (tokens.length >= 2 && /^\d{1,2}[A-Z]$/.test(first) && tokens[1].length === 2) {
    const m2 = splitHead(first + tokens[1]);
    if (m2) {
      head = m2;
      rest = tokens.slice(2);
    }
  }
  if (!rest.every((s) => /^\d+$/.test(s))) return { ok: false, reason: 'digits' };
  let e = '';
  let n = '';
  let height: number | undefined;
  if (rest.length === 1) {
    const d = rest[0];
    if (d.length % 2 !== 0 || d.length < 2 || d.length > 10) return { ok: false, reason: 'length' };
    e = d.slice(0, d.length / 2);
    n = d.slice(d.length / 2);
  } else if (rest.length === 2) {
    [e, n] = rest;
  } else if (rest.length === 3) {
    [e, n] = rest;
    height = Number(rest[2]);
  } else {
    return { ok: false, reason: 'groups' };
  }
  if (e.length !== n.length || e.length < 1 || e.length > 5) return { ok: false, reason: 'length' };
  const scale = 10 ** (5 - e.length);
  const half = interpretation === 'centre' ? scale / 2 : 0;
  const eM = Number(e) * scale + half;
  const nM = Number(n) * scale + half;
  if (head) {
    const u = mgrsToUTM({ zone: head.zone, band: head.band, col: head.col, row: head.row, e: eM, n: nM });
    return u ? { ok: true, utm: u, height, cell: scale } : { ok: false, reason: 'square' };
  }
  if (!reference) return { ok: false, reason: 'no reference' };
  // Short entry: nearest cell among the reference square and its 8 neighbours (SPEC-CORE §4.1).
  const cands: { utm: UTM; dist: number }[] = [];
  for (let de = -1; de <= 1; de++) {
    for (let dn = -1; dn <= 1; dn++) {
      const u: UTM = {
        zone: reference.zone,
        band: reference.band,
        easting: (Math.floor(reference.easting / 100000) + de) * 100000 + eM,
        northing: (Math.floor(reference.northing / 100000) + dn) * 100000 + nM,
      };
      cands.push({ utm: u, dist: Math.hypot(u.easting - reference.easting, u.northing - reference.northing) });
    }
  }
  cands.sort((x, y) => x.dist - y.dist);
  if (cands[1].dist - cands[0].dist < 5000) return { ok: false, reason: 'ambiguous', options: [cands[0].utm, cands[1].utm] };
  return { ok: true, utm: cands[0].utm, height, cell: scale };
}
