// SPEC-CORE angles: piiru 6000 is the working unit; mil 6400, degrees, gon, mrad are conversions (CORE-003/004).
export const TAU = 2 * Math.PI;

export function wrap(v: number, turn: number): number {
  let t = v % turn;
  if (t < 0) t += turn;
  return Number.isNaN(t) || t >= turn ? 0 : t;
}
export const normPiiru = (v: number): number => wrap(v, 6000);
export const piiruToRad = (v: number): number => (v * TAU) / 6000;
export const radToPiiru = (r: number): number => normPiiru((r / TAU) * 6000);
export const piiruToMil = (v: number): number => (v * 6400) / 6000;
export const piiruToDeg = (v: number): number => (v * 360) / 6000;
export const piiruToGon = (v: number): number => (v * 400) / 6000;
export const piiruToMrad = (v: number): number => piiruToRad(v) * 1000;

/** Signed difference folded to (−3000, 3000] v. */
export function foldSigned(v: number): number {
  let d = v % 6000;
  if (d > 3000) d -= 6000;
  else if (d <= -3000) d += 6000;
  return d;
}
/** Absolute difference folded to [0, 3000] v. */
export function foldHalfTurn(v: number): number {
  let x = Math.abs(v) % 6000;
  if (x > 3000) x = 6000 - x;
  return x;
}

/** `NN-NN`, rounded to the nearest whole piiru at the presentation boundary (CORE-008). */
export function fmtPiiru(v: number): string {
  let i = Math.round(v);
  i = ((i % 6000) + 6000) % 6000;
  return `${String(Math.floor(i / 100)).padStart(2, '0')}-${String(i % 100).padStart(2, '0')}`;
}

/** Plain decimal number; accepts a decimal comma and a Unicode minus. */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '').replace(',', '.').replace('−', '-');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type DirUnit = 'v' | 'mil' | 'deg';

/** Parses a direction in the given unit and returns piiru; `NN-NN` or a plain number for v. */
export function parseDirection(text: string, unit: DirUnit): number | null {
  const raw = text.trim().replace(/[–—−]/g, '-');
  if (unit === 'v') {
    const m = /^(\d{1,2})-(\d{2})$/.exec(raw);
    if (m) {
      const a = Number(m[1]);
      return a < 60 ? a * 100 + Number(m[2]) : null;
    }
    const n = parseNumber(raw);
    return n !== null && n >= 0 && n < 6000 ? n : null;
  }
  const n = parseNumber(raw);
  if (n === null || n < 0) return null;
  if (unit === 'mil') return n < 6400 ? (n * 6000) / 6400 : null;
  return n < 360 ? (n * 6000) / 360 : null;
}
