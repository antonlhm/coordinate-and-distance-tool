import { describe, expect, it } from 'vitest';
import { ksTolerance, skVerdict } from '../src/calc/engine';
import { fmtPiiru, parseDirection } from '../src/core/angle';
import { forward, inverse } from '../src/core/geo';
import { formatMGRS, parsePosition } from '../src/core/mgrs';

describe('transverse Mercator', () => {
  it('puts the central meridian at the false easting (60°N 27°E → ≈ 6 651 411 m)', () => {
    const u = forward({ lat: 60, lon: 27 });
    expect(u.zone).toBe(35);
    expect(u.easting).toBeCloseTo(500000, 3);
    expect(u.northing).toBeGreaterThan(6651410);
    expect(u.northing).toBeLessThan(6651413);
  });
  it('round-trips latitude/longitude within a micrometre-scale tolerance', () => {
    const g = { lat: 62.3, lon: 25.7 };
    const back = inverse(forward(g));
    expect(back.lat).toBeCloseTo(g.lat, 9);
    expect(back.lon).toBeCloseTo(g.lon, 9);
  });
});

describe('MGRS', () => {
  it('parses and formats 1 m references without rounding', () => {
    const p = parsePosition('34VFM 12859 56480');
    expect(p.ok).toBe(true);
    if (p.ok) expect(formatMGRS(p.utm, 5)).toBe('34VFM 12859 56480');
  });
  it('truncates when shortening the output (golden rule 3)', () => {
    const p = parsePosition('34VFM 12859 56489');
    if (p.ok) expect(formatMGRS(p.utm, 4)).toBe('34VFM 1285 5648');
  });
  it('accepts compact and spaced forms', () => {
    const a = parsePosition('34vfm1285956480');
    const b = parsePosition('34V FM 12859 56480');
    expect(a.ok && b.ok && a.utm.easting === b.utm.easting && a.utm.northing === b.utm.northing).toBe(true);
  });
  it('inherits the square for short entries', () => {
    const ref = parsePosition('34VFM 12859 56480');
    if (!ref.ok) throw new Error('ref');
    const s = parsePosition('1300 5700', ref.utm);
    expect(s.ok).toBe(true);
    if (s.ok) expect(formatMGRS(s.utm, 4)).toBe('34VFM 1300 5700');
  });
  it('rejects garbage', () => {
    expect(parsePosition('hello').ok).toBe(false);
    expect(parsePosition('34VFM 123 4567').ok).toBe(false);
  });
});

describe('angles', () => {
  it('formats and parses NN-NN', () => {
    expect(fmtPiiru(5000)).toBe('50-00');
    expect(fmtPiiru(-1)).toBe('59-99');
    expect(parseDirection('12-50', 'v')).toBe(1250);
    expect(parseDirection('1250', 'v')).toBe(1250);
    expect(parseDirection('60-00', 'v')).toBeNull();
    expect(parseDirection('3200', 'mil')).toBeCloseTo(3000, 9);
    expect(parseDirection('180', 'deg')).toBeCloseTo(3000, 9);
  });
});

describe('closure rules', () => {
  it('K3 KS tolerance for 1.6 km is ≈ 36 m', () => {
    expect(ksTolerance(1.6)).toBeCloseTo(36, 9);
  });
  it('K4 SK verdict', () => {
    expect(skVerdict(6, 60)).toBe('redo');
    expect(skVerdict(6, 30)).toBe('adjustable');
    expect(skVerdict(1, 10)).toBe('ok');
  });
});
