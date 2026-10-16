// Mathematical accuracy: invariants that must hold for any input, checked against independent geometry
// (not against stored answers). Deterministic pseudo-random inputs so failures reproduce.
import { describe, expect, it } from 'vitest';
import { dirDist, inverseRadial, intersectDirections, intersectDistances, polar } from '../src/calc/engine';
import { foldHalfTurn, foldSigned, normPiiru, piiruToDeg, piiruToMil } from '../src/core/angle';
import { type UTM, bearing, distance, forward, inverse } from '../src/core/geo';
import { mgrsToUTM, utmToMGRS } from '../src/core/mgrs';

let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
const at = (e: number, n: number): UTM => ({ zone: 34, band: 'V', easting: e, northing: n });
const near = (a: number, b: number, tol: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
// Direction agreement as the sideways miss in metres at range d (float noise in coordinates scales as 1/d in angle).
const lateralMiss = (got: number, want: number, d: number): void =>
  expect(d * Math.sin((foldHalfTurn(got - want) * 2 * Math.PI) / 6000)).toBeLessThanOrEqual(1e-6);

describe('map projection and MGRS', () => {
  it('UTM forward/inverse round-trips to 1e-9° over all latitudes and longitudes', () => {
    for (let i = 0; i < 400; i++) {
      const g = { lat: between(-80, 84), lon: between(-179.9, 179.9) };
      const u = forward(g);
      const back = inverse(u);
      near(back.lat, g.lat, 1e-9);
      near(back.lon, g.lon, 1e-9);
    }
  });
  it('MGRS ⇄ UTM is lossless in both hemispheres', () => {
    for (let i = 0; i < 600; i++) {
      const u = forward({ lat: between(-79.9, 83.9), lon: between(-179.9, 179.9) });
      const back = mgrsToUTM(utmToMGRS(u));
      expect(back, `${u.zone}${u.band}`).not.toBeNull();
      expect(back!.zone).toBe(u.zone);
      expect(back!.band).toBe(u.band);
      near(back!.easting, u.easting, 1e-6);
      near(back!.northing, u.northing, 1e-6);
    }
  });
});

describe('direction and distance', () => {
  it('polar then dirdist returns the same bearing and distance', () => {
    for (let i = 0; i < 300; i++) {
      const o = at(between(300000, 700000), between(6500000, 7600000));
      const pl = between(0, 6000);
      const d = between(1, 20000);
      const p = polar(o, d, pl).outputs.find((x) => x.key === 'position');
      if (p?.kind !== 'pos') throw new Error('no position');
      const r = dirDist(o, p.v).outputs;
      const got = (k: string): number => (r.find((x) => x.key === k) as { v: number }).v;
      near(got('distance'), d, 1e-6);
      lateralMiss(got('pl'), pl, d);
    }
  });
  it('angle units are mutually consistent (6000 v = 6400 mil = 360°)', () => {
    near(piiruToMil(6000), 6400, 1e-12);
    near(piiruToDeg(1500), 90, 1e-12);
    near(foldSigned(normPiiru(-1) + 1), 0, 1e-9);
  });
});

describe('intersections', () => {
  it('leikkaus recovers a known point from two directions', () => {
    for (let i = 0; i < 300; i++) {
      const p1 = at(500000 + between(-5000, 5000), 6800000 + between(-5000, 5000));
      const p2 = at(p1.easting + between(-900, 900), p1.northing + between(-900, 900));
      const target = at(p1.easting + between(-1500, 1500), p1.northing + between(-1500, 1500));
      if (distance(p1, p2) < 50 || distance(p1, target) < 50) continue;
      const t1 = bearing(p1, target);
      const t2 = bearing(p2, target);
      if (foldHalfTurn(t1 - t2) < 100) continue; // nearly parallel is ill-conditioned by nature
      const r = intersectDirections(p1, p2, t1, t2)!;
      near(r.point.easting, target.easting, 1e-5);
      near(r.point.northing, target.northing, 1e-5);
    }
  });
  it('kaarileikkaus returns two points at exactly r1 from P1 and r2 from P2', () => {
    for (let i = 0; i < 300; i++) {
      const p1 = at(500000, 6800000);
      const p2 = at(500000 + between(200, 1500), 6800000 + between(-800, 800));
      const d = distance(p1, p2);
      const r1 = between(d * 0.6, d * 1.5);
      const r2 = between(Math.abs(d - r1) + 5, d + r1 - 5);
      const r = intersectDistances(p1, p2, r1, r2)!;
      for (const q of [r.left, r.right]) {
        near(distance(p1, q), r1, 1e-6);
        near(distance(p2, q), r2, 1e-6);
      }
    }
  });
});

describe('inverse radial', () => {
  it('recovers the own position from the bearing and distance to a known point', () => {
    for (let i = 0; i < 300; i++) {
      const own = at(between(450000, 550000), between(6700000, 6900000));
      const k = at(own.easting + between(-900, 900), own.northing + between(-900, 900));
      const pl = bearing(own, k);
      const d = distance(own, k);
      const r = inverseRadial({ k, distance: d, pl }).outputs[0];
      if (r.kind !== 'pos') throw new Error('no position');
      near(r.v.easting, own.easting, 1e-6);
      near(r.v.northing, own.northing, 1e-6);
    }
  });
});
