import { describe, expect, it } from 'vitest';
import vectors from '../vectors/calc-vectors.json';
import type { Out } from '../src/calc/engine';
import { CALCS, runForm } from '../src/calc/forms';
import { foldHalfTurn } from '../src/core/angle';
import { parsePosition } from '../src/core/mgrs';
import { CATALOGS, LANGS } from '../src/i18n';

interface Vector {
  id: string;
  calc: string;
  interp?: 'corner' | 'centre';
  raw: Record<string, string>;
  expect?: Record<string, { pos?: string; v?: number; num?: number; text?: string; tol?: number; km?: number; base?: number; value?: number }>;
  warnings?: string[];
  noWarnings?: boolean;
}

const find = (outs: Out[], key: string): Out => {
  const o = outs.find((x) => x.key === key);
  if (!o) throw new Error(`output ${key} missing`);
  return o;
};

describe('SPEC-CALC acceptance vectors (shared with the Swift suite)', () => {
  for (const v of vectors.vectors as unknown as Vector[]) {
    it(`${v.id} ${v.calc}`, () => {
      const run = runForm(CALCS[v.calc], v.raw, { interp: v.interp ?? 'corner' });
      expect(run.errors).toEqual({});
      expect(run.status).toBe('ok');
      const res = run.res!;
      for (const [key, exp] of Object.entries(v.expect ?? {})) {
        const o = find(res.outputs, key);
        if (exp.pos) {
          const want = parsePosition(exp.pos, undefined, 'corner');
          if (!want.ok || o.kind !== 'pos') throw new Error(`bad position check ${key}`);
          expect(Math.hypot(o.v.easting - want.utm.easting, o.v.northing - want.utm.northing)).toBeLessThanOrEqual(exp.tol ?? 1);
        } else if (exp.v !== undefined) {
          if (o.kind !== 'dir') throw new Error(`${key} is not a direction`);
          expect(foldHalfTurn(o.v - exp.v)).toBeLessThanOrEqual(exp.tol ?? 0.1);
        } else if (exp.num !== undefined) {
          if (o.kind !== 'num' && o.kind !== 'dist' && o.kind !== 'dir') throw new Error(`${key} is not numeric`);
          expect(Math.abs(o.v - exp.num)).toBeLessThanOrEqual(exp.tol ?? 0.1);
        } else if (exp.text !== undefined) {
          expect(o.kind === 'text' && o.v).toBe(exp.text);
        } else if (exp.km !== undefined) {
          if (o.kind !== 'table') throw new Error('not a table');
          const row = o.rows.find((r) => r.label === exp.km)!;
          expect(row.cells[o.head.indexOf(exp.base!)]).toBe(exp.value);
        }
      }
      const keys = res.warnings.map((w) => w.key);
      for (const w of v.warnings ?? []) expect(keys).toContain(w);
      if (v.noWarnings) expect(keys).toEqual([]);
    });
  }
});

describe('strings (WEB-009)', () => {
  it('has identical key sets and placeholders in fi, sv and en', () => {
    const ph = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const l of LANGS) expect(Object.keys(CATALOGS[l]).sort()).toEqual(Object.keys(CATALOGS.en).sort());
    for (const k of Object.keys(CATALOGS.en)) for (const l of LANGS) expect(ph(CATALOGS[l][k])).toBe(ph(CATALOGS.en[k]));
  });

  it('defines every title, summary, hint, block title, field label and group used by the forms', () => {
    const groups = ['direction', 'position'];
    const need = new Set<string>(groups.map((g) => `calc.group.${g}`));
    for (const [id, def] of Object.entries(CALCS)) {
      for (const k of ['title', 'summary', 'now']) need.add(`calc.${id}.${k}`);
      def.blocks.forEach((b, i) => {
        need.add(`calc.${id}.block.${i + 1}`);
        for (const f of b.fields) need.add(f.labelKey ?? `calc.${id}.field.${f.name}`);
      });
    }
    for (const k of need) for (const l of LANGS) expect(CATALOGS[l][k], `${l} ${k}`).toBeTruthy();
  });
});
