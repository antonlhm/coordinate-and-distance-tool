// SPEC-CALC §3: pure calculators ported from TJCalc. No DOM, no clock, no globals (CALC-002).
// Angles are piiru (v, 6000) throughout; distances metres; positions UTM metres.
import {
  foldHalfTurn,
  foldSigned,
  normPiiru,
  piiruToDeg,
  piiruToGon,
  piiruToMil,
  piiruToMrad,
  piiruToRad,
  radToPiiru,
} from '../core/angle';
import { type UTM, bearing, centralMeridian, inverse, offset, projectInto } from '../core/geo';

export interface Warn {
  key: string;
  p?: Record<string, string | number>;
}
export type Out =
  | { key: string; kind: 'pos'; v: UTM }
  | { key: string; kind: 'poslist'; v: UTM[] }
  | { key: string; kind: 'dir'; v: number }
  | { key: string; kind: 'dist'; v: number }
  | { key: string; kind: 'num'; v: number; unit?: string; digits?: number }
  | { key: string; kind: 'text'; v: string }
  | { key: string; kind: 'table'; head: number[]; rows: { label: number; cells: number[] }[] };
export interface Res {
  outputs: Out[];
  steps: string[];
  warnings: Warn[];
}

const ur = (v: number): [number, number] => [Math.sin(piiruToRad(v)), Math.cos(piiruToRad(v))]; // (E, N)
const r1 = (x: number): string => String(Math.round(x * 10) / 10);
const empty = (): Res => ({ outputs: [], steps: [], warnings: [] });

// MARK: CALC-DIRDIST

export function dirDist(a: UTM, b0: UTM): Res {
  const res = empty();
  let b = b0;
  if (a.zone !== b.zone) {
    res.warnings.push({ key: 'calc.warning.zoneDiffers', p: { a: a.zone, b: b.zone } });
    b = projectInto(b, a.zone); // calculation zone = zone of the reference point
  }
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;
  const d = Math.hypot(dE, dN);
  if (d === 0) {
    res.warnings.push({ key: 'calc.warning.samePoint' });
    res.outputs.push({ key: 'distance', kind: 'dist', v: 0 });
    return res;
  }
  const pl = radToPiiru(Math.atan2(dE, dN));
  res.outputs.push(
    { key: 'pl', kind: 'dir', v: pl },
    { key: 'reverse', kind: 'dir', v: normPiiru(pl + 3000) },
    { key: 'distance', kind: 'dist', v: d },
    { key: 'deltaE', kind: 'num', v: dE, unit: 'm' },
    { key: 'deltaN', kind: 'num', v: dN, unit: 'm' },
  );
  res.steps.push(`ΔE = ${r1(dE)}, ΔN = ${r1(dN)}`, `d = √(ΔE² + ΔN²) = ${r1(d)} m`, `Pl = atan2(ΔE, ΔN) = ${r1(pl)} v`);
  return res;
}

// MARK: CALC-POLAR (Pl only, D88)

export function polar(origin: UTM, distance: number, pl: number): Res {
  const res = empty();
  res.outputs.push({ key: 'position', kind: 'pos', v: offset(origin, pl, distance) }, { key: 'polar.pl', kind: 'dir', v: pl });
  res.steps.push('E = E₀ + d·sin Pl; N = N₀ + d·cos Pl');
  return res;
}

// MARK: CALC-ANGLE

export function angle(piiru: number): Res {
  const res = empty();
  res.outputs.push(
    { key: 'piiru', kind: 'num', v: piiru, unit: 'v', digits: 2 },
    { key: 'mil', kind: 'num', v: piiruToMil(piiru), digits: 2 },
    { key: 'degrees', kind: 'num', v: piiruToDeg(piiru), unit: '°', digits: 4 },
    { key: 'gon', kind: 'num', v: piiruToGon(piiru), digits: 4 },
    { key: 'mrad', kind: 'num', v: piiruToMrad(piiru), digits: 2 },
  );
  return res;
}

// MARK: CALC-YK

export interface YkInput {
  pl?: number;
  nel?: number;
  nekBase?: number;
  nekAnnual?: number;
  baseYear?: number;
  year?: number;
  position?: UTM;
}
export function yk(i: YkInput): Res | null {
  const res = empty();
  let kok: number | undefined;
  if (i.nekBase !== undefined && i.nekAnnual !== undefined && i.baseYear !== undefined && i.year !== undefined && i.position) {
    const nek = i.nekBase + i.nekAnnual * (i.year - i.baseYear);
    const geo = inverse(i.position);
    const cm = centralMeridian(i.position.zone);
    const nakGrid = (0.045 * (i.position.northing / 1e5) ** 2 - 5.135 * (i.position.northing / 1e5) + 168.334) * (5 - i.position.easting / 1e5);
    const nakGeo = (Math.sin((geo.lat * Math.PI) / 180) * (cm - geo.lon) * 60 * 6000) / 21600;
    const nakApprox = ((cm - geo.lon) * 60) / 4;
    kok = nek + nakGrid;
    res.outputs.push(
      { key: 'nek', kind: 'num', v: nek, unit: 'v' },
      { key: 'nakGrid', kind: 'num', v: nakGrid, unit: 'v' },
      { key: 'nakGeographic', kind: 'num', v: nakGeo, unit: 'v' },
      { key: 'nakApproximate', kind: 'num', v: nakApprox, unit: 'v' },
      { key: 'kok', kind: 'num', v: kok, unit: 'v' },
    );
    res.steps.push('Nek = base + change · (year − base year)', 'Kok = Nek + Nak');
  }
  if (i.pl !== undefined && i.nel !== undefined) {
    const y = foldSigned(i.pl - i.nel);
    res.outputs.push({ key: 'yk', kind: 'num', v: y, unit: 'v' });
    res.steps.push(`Yk = Pl − Nel = ${r1(i.pl)} − ${r1(i.nel)} = ${r1(y)} v`);
    if (kok !== undefined) res.outputs.push({ key: 'ok', kind: 'num', v: foldSigned(y - kok), unit: 'v' });
  }
  return res.outputs.length ? res : null;
}

// MARK: CALC-TRIANGLE — piirukolmio and maalikulma

export interface TriangleInput {
  width?: number;
  distance?: number;
  angle?: number;
  gamma?: number;
}
export function triangle(i: TriangleInput): Res | null {
  const res = empty();
  const perV = (2 * Math.PI) / 6000;
  const finish = (field: number, exact: number, key: string, unit: string): void => {
    const diff = exact === 0 ? 0 : (Math.abs(field - exact) / Math.abs(exact)) * 100;
    res.outputs.push(
      { key: key + 'Field', kind: 'num', v: field, unit },
      { key: key + 'Exact', kind: 'num', v: exact, unit },
      { key: 'differencePercent', kind: 'num', v: diff, unit: '%' },
    );
    if (diff > 5) res.warnings.push({ key: 'calc.warning.fieldRuleDiffers', p: { percent: diff.toFixed(1) } });
  };
  const { width: w, distance: d, angle: a, gamma } = i;
  if (d !== undefined && a !== undefined && w === undefined) {
    finish((a * d) / 1000, d * Math.tan(a * perV), 'width', 'm');
    res.steps.push('m = v · km');
  } else if (w !== undefined && d !== undefined && a === undefined && d !== 0) {
    finish(w / (d / 1000), Math.atan(w / d) / perV, 'angle', 'v');
    res.steps.push('v = m / km');
  } else if (w !== undefined && a !== undefined && d === undefined && a !== 0) {
    finish((w / a) * 1000, w / Math.tan(a * perV), 'distance', 'm');
    res.steps.push('km = m / v');
  }
  if (gamma !== undefined) {
    const s = Math.sin(gamma * perV);
    if (s > 0.01) {
      const factor = 1 / s;
      res.outputs.push({ key: 'factor', kind: 'num', v: factor, digits: 2 });
      if (a !== undefined) res.outputs.push({ key: 'metricAngle', kind: 'num', v: a * factor, unit: 'v' });
      res.steps.push(`metric = visible / sin γ; 1 / sin(${r1(gamma)} v) = ${factor.toFixed(2)}`);
    } else {
      res.warnings.push({ key: 'calc.warning.noSolution' });
    }
  }
  return res.outputs.length || res.warnings.length ? res : null;
}

// MARK: CALC-INTERSECT

export const MIN_INTERSECTION_ANGLE = 500;

export interface DirIntersection {
  point: UTM;
  t1: number;
  t2: number;
  angle: number;
  warnings: Warn[];
}
export function intersectDirections(p1: UTM, p2in: UTM, theta1: number, theta2: number): DirIntersection | null {
  const p2 = projectInto(p2in, p1.zone);
  const [u1e, u1n] = ur(theta1);
  const [u2e, u2n] = ur(theta2);
  const dE = p2.easting - p1.easting;
  const dN = p2.northing - p1.northing;
  const c = u1e * u2n - u1n * u2e;
  if (Math.abs(c) <= 1e-9) return null; // parallel (K7)
  const t1 = (dE * u2n - dN * u2e) / c;
  const t2 = (dE * u1n - dN * u1e) / c;
  const warnings: Warn[] = [];
  if (t1 <= 0 || t2 <= 0) warnings.push({ key: 'calc.warning.behindPoint' });
  const g = foldHalfTurn(theta1 - theta2);
  if (g < MIN_INTERSECTION_ANGLE) warnings.push({ key: 'calc.warning.badIntersectionAngle', p: { angle: Math.round(g) } });
  return { point: offset(p1, theta1, t1), t1, t2, angle: g, warnings };
}

export function intersectDistances(p1: UTM, p2in: UTM, r1v: number, r2v: number) {
  const p2 = projectInto(p2in, p1.zone);
  const dE = p2.easting - p1.easting;
  const dN = p2.northing - p1.northing;
  const d = Math.hypot(dE, dN);
  if (d === 0) return null;
  const a = (r1v * r1v - r2v * r2v + d * d) / (2 * d);
  const h2 = r1v * r1v - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const along = radToPiiru(Math.atan2(dE, dN));
  const base = offset(p1, along, a);
  return {
    left: offset(base, along - 1500, h), // left of P1→P2 is −1500 v from the line direction
    right: offset(base, along + 1500, h),
    tangent: h < 1e-6 * Math.max(d, 1) || h / d < 0.02,
  };
}

export function intersect(p1: UTM, p2: UTM, mode: { theta1: number; theta2: number } | { r1: number; r2: number }): Res {
  const res = empty();
  if ('theta1' in mode) {
    const r = intersectDirections(p1, p2, mode.theta1, mode.theta2);
    if (!r) return { ...res, warnings: [{ key: 'calc.warning.parallel' }] };
    res.outputs.push(
      { key: 'position', kind: 'pos', v: r.point },
      { key: 'angle', kind: 'dir', v: r.angle },
      { key: 't1', kind: 'dist', v: r.t1 },
      { key: 't2', kind: 'dist', v: r.t2 },
    );
    res.steps.push('t₁ = cross(d, u₂) / cross(u₁, u₂)', `P₃ = P₁ + t₁·u₁; γ = ${r1(r.angle)} v`);
    res.warnings.push(...r.warnings);
  } else {
    const r = intersectDistances(p1, p2, mode.r1, mode.r2);
    if (!r) return { ...res, warnings: [{ key: 'calc.warning.noSolution' }] };
    res.outputs.push({ key: 'left', kind: 'pos', v: r.left }, { key: 'right', kind: 'pos', v: r.right });
    res.steps.push('a = (r₁² − r₂² + d²) / 2d; h² = r₁² − a²');
    if (r.tangent) res.warnings.push({ key: 'calc.warning.tangent' });
  }
  return res;
}

// MARK: CALC-BASE — kantamittaus

export const BASE_MAX_METRES = 750;
export function baseMeasurement(p1: UTM, base: number, dir12: number, dir13: number, dir23: number): Res {
  const res = empty();
  const p2 = offset(p1, dir12, base);
  const r = intersectDirections(p1, p2, dir13, dir23);
  if (!r) return { ...res, warnings: [{ key: 'calc.warning.parallel' }] };
  const w = r.warnings.filter((x) => x.key !== 'calc.warning.badIntersectionAngle');
  const far = Math.max(r.t1, r.t2);
  if (far > BASE_MAX_METRES) w.push({ key: 'calc.warning.baseTooFar', p: { m: Math.round(far) } });
  if (far > r.angle / 2) w.push({ key: 'calc.warning.baseRatio' });
  if (r.angle < MIN_INTERSECTION_ANGLE) w.push({ key: 'calc.warning.badIntersectionAngle', p: { angle: Math.round(r.angle) } });
  res.outputs.push(
    { key: 'position', kind: 'pos', v: r.point },
    { key: 'p2', kind: 'pos', v: p2 },
    { key: 'angle', kind: 'dir', v: r.angle },
  );
  res.steps.push('P₂ = P₁ + b·u(P₁→P₂)', `γ = ${r1(r.angle)} v; far distance ${r1(far)} m`);
  res.warnings.push(...w);
  return res;
}

// MARK: CALC-SHORTBASE — lyhytkanta (numbers only; no command string, SPEC-WEB §1.1)

export const SHORT_BASE_MAX = 200;
export const LARGE_PARALLAX = 300;
export interface ShortBaseInput {
  tahs: number;
  tahet: number;
  b: number;
  a: number;
  exact: boolean;
  mirrorPl?: number;
}
const TABLE_BASES = [25, 50, 75, 100, 150, 200, 250, 300];
const TABLE_KM = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5];
export function shortBase(i: ShortBaseInput): Res {
  const res = empty();
  const { tahs, tahet, b, a } = i;
  const base = Math.hypot(a, b);
  const baseWarn = (): void => {
    if (base > SHORT_BASE_MAX) res.warnings.push({ key: 'calc.warning.baseTooLong', p: { m: Math.round(base) } });
  };
  if (i.mirrorPl !== undefined) {
    // Method 2: Pl to the mirrored point is the firing direction.
    const delta = foldSigned(i.mirrorPl - tahs);
    res.outputs.push(
      { key: 'ams', kind: 'dir', v: i.mirrorPl },
      { key: 'amet', kind: 'dist', v: tahet + a },
      { key: 'delta', kind: 'num', v: delta, unit: 'v' },
      { key: 'hint', kind: 'text', v: delta >= 0 ? 'OILI' : 'VAPO' },
    );
    res.steps.push('AMS = Pl to the mirrored point; AMET = TÄHET + a');
    baseWarn();
  } else {
    let delta: number;
    let amet: number;
    if (i.exact) {
      amet = Math.hypot(tahet + a, b);
      delta = foldSigned(radToPiiru(Math.atan2(b, tahet + a)));
      res.steps.push(`AMET = √((D + a)² + b²) = ${r1(amet)} m`, `δ = atan2(b, D + a) = ${r1(delta)} v`);
    } else {
      delta = tahet > 0 ? b / (tahet / 1000) : 0;
      amet = tahet + a;
      res.steps.push(`δ = b / TÄHET[km] = ${r1(delta)} v`, `AMET = TÄHET + a = ${r1(amet)} m`);
    }
    baseWarn();
    if (Math.abs(delta) > LARGE_PARALLAX) res.warnings.push({ key: 'calc.warning.largeParallax' });
    res.outputs.push(
      { key: 'ams', kind: 'dir', v: normPiiru(tahs + delta) },
      { key: 'amet', kind: 'dist', v: amet },
      { key: 'delta', kind: 'num', v: delta, unit: 'v' },
      { key: 'hint', kind: 'text', v: b >= 0 ? 'OILI' : 'VAPO' },
    );
  }
  // Reference table, computed by v = m / km (a formula, not a stored doctrine table).
  res.outputs.push({
    key: 'table',
    kind: 'table',
    head: TABLE_BASES,
    rows: TABLE_KM.map((km) => ({ label: km, cells: TABLE_BASES.map((m) => Math.round(m / km)) })),
  });
  return res;
}

// MARK: CALC-SMOKEPOINT (D53)

export const SMOKE_SECTOR = 750;
export interface SmokeInput {
  area: UTM;
  from: number;
  d?: number;
  w?: number;
  t?: number;
  tjp?: UTM;
}
export function smokePoint(i: SmokeInput): Res | null {
  const res = empty();
  const drift = i.d ?? (i.w !== undefined && i.t !== undefined ? i.w * i.t : undefined);
  if (drift === undefined) {
    return i.d === undefined && (i.w !== undefined || i.t !== undefined) ? { ...res, warnings: [{ key: 'calc.warning.needDistanceOrTime' }] } : null;
  }
  res.outputs.push({ key: 'position', kind: 'pos', v: offset(i.area, i.from, drift) }, { key: 'd', kind: 'dist', v: drift });
  if (i.tjp) {
    const beta = bearing(i.tjp, projectInto(i.area, i.tjp.zone));
    let rel: string;
    if (foldHalfTurn(i.from - beta) <= SMOKE_SECTOR) rel = 'head';
    else if (foldHalfTurn(i.from - beta - 3000) <= SMOKE_SECTOR) rel = 'tail';
    else rel = 'cross';
    res.outputs.push({ key: 'relation', kind: 'text', v: rel });
  }
  res.steps.push('P = A + d·u(θ_from)');
  if (drift === 0) res.warnings.push({ key: 'calc.warning.zeroDrift' });
  return res;
}

// MARK: CALC-INVRAD

export interface InvRadInput {
  k: UTM;
  distance: number;
  pl: number;
  kSigma?: number;
  dirErrV?: number;
  distSigma?: number;
}
export function inverseRadial(i: InvRadInput): Res {
  const res = empty();
  const own = offset(i.k, i.pl + 3000, i.distance);
  const kS = i.kSigma ?? 0;
  const dv = i.dirErrV ?? 0;
  const ds = i.distSigma ?? Math.max(5, i.distance * 0.01);
  const lateral = ((i.distance * dv) / 1000) * 1.047;
  const sigma = Math.sqrt(kS * kS + lateral * lateral + ds * ds);
  res.outputs.push({ key: 'position', kind: 'pos', v: own }, { key: 'sigma', kind: 'num', v: sigma, unit: 'm' });
  res.steps.push('O = K + d·u(Pl ± 3000 v)', 'σ ≈ √(σ_K² + (d·δ_v/1000·1.047)² + σ_d²)');
  return res;
}

// MARK: CALC-TRAVERSE — KS / SK

export interface TraverseStep {
  radius: boolean;
  reading: number;
  length: number;
  reversed: boolean;
}
export type Preset = 'ks' | 'sk';
export const SK_COORD_TARGET = 17;
export const SK_COORD_ADJUST_MAX = 52;
export const SK_DIR_TARGET = 2;
export const SK_DIR_ADJUST_MAX = 10;

/** KS closure tolerance: 30/40/60 m for 1/2/3 km, linear in between (app interpolation). */
export function ksTolerance(km: number): number {
  if (km <= 1) return 30;
  if (km <= 2) return 30 + (km - 1) * 10;
  return 40 + (Math.min(km, 3) - 2) * 20;
}
export function skVerdict(dirErrorV: number, coordErrorM: number): 'ok' | 'adjustable' | 'redo' {
  const d = Math.abs(dirErrorV);
  const c = Math.abs(coordErrorM);
  if (d > SK_DIR_ADJUST_MAX || c > SK_COORD_ADJUST_MAX) return 'redo';
  if (d > SK_DIR_TARGET || c > SK_COORD_TARGET) return 'adjustable';
  return 'ok';
}

export function traverse(lp: UTM, yk: number, steps: TraverseStep[], preset: Preset, sp?: UTM, dirErrorV?: number): Res {
  const res = empty();
  const pts: UTM[] = [lp];
  const radii: UTM[] = [];
  const lengths: number[] = [];
  let cur = lp;
  let total = 0;
  for (const s of steps) {
    const pl = s.reading + (s.reversed ? 3000 : 0) + yk;
    const next = offset(cur, pl, s.length);
    if (s.radius) radii.push(next);
    else {
      pts.push(next);
      cur = next;
      total += s.length;
      lengths.push(s.length);
    }
  }
  res.outputs.push({ key: 'end', kind: 'pos', v: cur }, { key: 'length', kind: 'dist', v: total });
  radii.forEach((r, i) => res.outputs.push({ key: `radius${i + 1}`, kind: 'pos', v: r }));
  res.outputs.push({ key: 'points', kind: 'poslist', v: pts });
  res.steps.push('Pl = reading (± 3000 v) + Yk; ΔE = L·sin Pl, ΔN = L·cos Pl');
  if (sp) {
    const spp = projectInto(sp, lp.zone);
    const dE = spp.easting - cur.easting;
    const dN = spp.northing - cur.northing;
    const err = Math.hypot(dE, dN);
    const tol = preset === 'ks' ? ksTolerance(total / 1000) : SK_COORD_TARGET;
    if (preset === 'ks' && total > 3000) res.warnings.push({ key: 'calc.warning.longTraverse' });
    if (preset === 'sk' && err > SK_COORD_ADJUST_MAX) res.warnings.push({ key: 'calc.warning.redoTraverse' });
    res.outputs.push(
      { key: 'closureError', kind: 'num', v: err, unit: 'm' },
      { key: 'tolerance', kind: 'num', v: tol, unit: 'm' },
      { key: 'closureStatus', kind: 'text', v: err <= tol ? 'withinTolerance' : 'overTolerance' },
    );
    if (preset === 'sk') res.outputs.push({ key: 'verdict', kind: 'text', v: skVerdict(dirErrorV ?? 0, err) });
    // Adjustment: spread the closing vector over the bend points by cumulative length.
    let cum = 0;
    const adj: UTM[] = [lp];
    for (let i = 1; i < pts.length; i++) {
      cum += lengths[i - 1];
      const f = total > 0 ? cum / total : 0;
      adj.push({ ...pts[i], easting: pts[i].easting + dE * f, northing: pts[i].northing + dN * f });
    }
    res.outputs.push({ key: 'adjusted', kind: 'poslist', v: adj });
    res.steps.push(`Closure error ${r1(err)} m vs tolerance ${r1(tol)} m; adjustment by cumulative length`);
  }
  return res;
}
