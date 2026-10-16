// Form definitions: what each calculator asks for, how raw text is parsed, and which engine function runs.
// Registry order follows D89 (grouping) and SPEC-WEB §1.1.
import { type DirUnit, parseDirection, parseNumber } from '../core/angle';
import type { UTM } from '../core/geo';
import { type InputCellInterpretation, parsePosition } from '../core/mgrs';
import * as E from './engine';
import type { Res } from './engine';

export type Kind = 'pos' | 'dir' | 'dist' | 'num' | 'choice' | 'text';
export interface Field {
  name: string;
  kind: Kind;
  optional?: boolean;
  choices?: string[];
  def?: string;
  unit?: string; // suffix shown after the input
  area?: boolean; // multi-line text
  validate?: (text: string) => string | null; // returns an i18n key on error
  labelKey?: string; // overrides calc.<id>.field.<name>
}
export interface Block {
  fields: Field[];
}
// Parsed values by field name; shapes follow Field.kind (UTM, piiru number, number, string).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Vals = Record<string, any>;
export interface CalcDef {
  id: string;
  blocks: Block[];
  compute: (v: Vals) => Res | null;
}
export interface FormSettings {
  interp: InputCellInterpretation;
}

const pos = (name: string, optional = false): Field => ({ name, kind: 'pos', optional });
const dir = (name: string, optional = false): Field => ({ name, kind: 'dir', optional });
const dist = (name: string, optional = false): Field => ({ name, kind: 'dist', optional, unit: 'm' });
const num = (name: string, optional = false, unit?: string): Field => ({ name, kind: 'num', optional, unit });

/** Traverse steps: one per line, `reading length [r|R]`, reading as NN-NN or plain v. */
export function parseSteps(text: string): E.TraverseStep[] | null {
  const steps: E.TraverseStep[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    const f = s.split(/\s+/);
    const reading = parseDirection(f[0], 'v');
    const length = f.length > 1 ? parseNumber(f[1]) : null;
    const flag = f[2] ?? 'b';
    if (reading === null || length === null || length < 0 || f.length > 3 || !['b', 'B', 'r', 'R'].includes(flag)) return null;
    steps.push({ radius: flag.toLowerCase() === 'r', reading, length, reversed: flag === 'R' });
  }
  return steps.length ? steps : null;
}

export const CALCS: Record<string, CalcDef> = {
  dirdist: {
    id: 'dirdist',
    blocks: [{ fields: [pos('a')] }, { fields: [pos('b')] }],
    compute: (v) => E.dirDist(v.a, v.b),
  },
  polar: {
    id: 'polar',
    blocks: [{ fields: [pos('origin')] }, { fields: [dist('distance')] }, { fields: [dir('pl')] }],
    compute: (v) => E.polar(v.origin, v.distance, v.pl),
  },
  angle: {
    id: 'angle',
    blocks: [{ fields: [dir('direction')] }],
    compute: (v) => E.angle(v.direction),
  },
  yk: {
    id: 'yk',
    blocks: [
      { fields: [pos('position', true)] },
      { fields: [num('nekBase', true, 'v'), num('nekAnnual', true, 'v'), num('baseYear', true), num('year', true)] },
      { fields: [dir('pl', true), dir('nel', true)] },
    ],
    compute: (v) => E.yk(v),
  },
  triangle: {
    id: 'triangle',
    blocks: [
      {
        fields: [
          { ...dist('width', true) },
          { ...dist('distance', true) },
          num('angle', true, 'v'),
          { ...num('gamma', true, 'v'), labelKey: 'web.calc.triangle.field.gamma' },
        ],
      },
    ],
    compute: (v) => E.triangle(v),
  },
  traverse: {
    id: 'traverse',
    blocks: [
      { fields: [pos('lp')] },
      { fields: [{ ...num('yk', true, 'v') }] },
      { fields: [{ name: 'steps', kind: 'text', area: true, validate: (s) => (parseSteps(s) ? null : 'web.err.steps') }] },
      {
        fields: [
          pos('sp', true),
          { name: 'preset', kind: 'choice', choices: ['ks', 'sk'], def: 'ks' },
          { ...num('dirError', true, 'v'), labelKey: 'web.calc.traverse.field.dirError' },
        ],
      },
    ],
    compute: (v) =>
      E.traverse(v.lp, v.yk ?? 0, parseSteps(v.steps) ?? [], v.preset === 'sk' ? 'sk' : 'ks', v.sp, v.dirError),
  },
  invrad: {
    id: 'invrad',
    blocks: [
      { fields: [pos('k')] },
      { fields: [dist('distance')] },
      { fields: [dir('pl', true), dir('nel', true), num('yk', true, 'v')] },
    ],
    compute: (v) => {
      const pl = v.pl ?? (v.nel !== undefined && v.yk !== undefined ? v.nel + v.yk : undefined);
      return pl === undefined ? null : E.inverseRadial({ k: v.k, distance: v.distance, pl });
    },
  },
  intersect: {
    id: 'intersect',
    blocks: [
      { fields: [pos('p1')] },
      { fields: [pos('p2')] },
      { fields: [dir('theta1', true), dir('theta2', true)] },
      { fields: [dist('r1', true), dist('r2', true)] },
    ],
    compute: (v) => {
      if (v.theta1 !== undefined && v.theta2 !== undefined) return E.intersect(v.p1, v.p2, { theta1: v.theta1, theta2: v.theta2 });
      if (v.r1 !== undefined && v.r2 !== undefined) return E.intersect(v.p1, v.p2, { r1: v.r1, r2: v.r2 });
      return null;
    },
  },
  base: {
    id: 'base',
    blocks: [{ fields: [pos('p1')] }, { fields: [dist('base')] }, { fields: [dir('dir12'), dir('dir13'), dir('dir23')] }],
    compute: (v) => E.baseMeasurement(v.p1, v.base, v.dir12, v.dir13, v.dir23),
  },
  shortbase: {
    id: 'shortbase',
    blocks: [
      { fields: [dir('tahs'), dist('tahet')] },
      { fields: [num('b', true, 'm'), num('a', true, 'm')] },
      { fields: [{ name: 'mode', kind: 'choice', choices: ['field', 'exact'], def: 'field' }] },
      { fields: [dir('mirrorPl', true)] },
    ],
    compute: (v) =>
      E.shortBase({ tahs: v.tahs, tahet: v.tahet, b: v.b ?? 0, a: v.a ?? 0, exact: v.mode === 'exact', mirrorPl: v.mirrorPl }),
  },
  smoke: {
    id: 'smoke',
    blocks: [
      { fields: [pos('a')] },
      { fields: [dir('from')] },
      { fields: [dist('d', true), num('w', true, 'm/s'), num('t', true, 's')] },
      { fields: [pos('tjp', true)] },
    ],
    compute: (v) => E.smokePoint({ area: v.a, from: v.from, d: v.d, w: v.w, t: v.t, tjp: v.tjp }),
  },
};

export const GROUPS: { id: 'direction' | 'position' | 'fire'; ids: string[] }[] = [
  { id: 'direction', ids: ['dirdist', 'polar', 'angle', 'yk', 'triangle'] },
  { id: 'position', ids: ['traverse', 'invrad', 'intersect', 'base'] },
  { id: 'fire', ids: ['shortbase', 'smoke'] },
];

export type ParsedField = { value: unknown } | { error: string };

export function parseField(f: Field, text: string, unit: DirUnit, ref: UTM | undefined, s: FormSettings): ParsedField {
  switch (f.kind) {
    case 'pos': {
      const r = parsePosition(text, ref, s.interp);
      if (r.ok) return { value: r.utm };
      return { error: r.reason === 'ambiguous' ? 'web.err.ambiguous' : 'input.invalidMGRS' };
    }
    case 'dir': {
      const v = parseDirection(text, unit);
      return v === null ? { error: 'input.invalidDirection' } : { value: v };
    }
    case 'dist': {
      const v = parseNumber(text);
      return v === null || v < 0 ? { error: 'web.err.number' } : { value: v };
    }
    case 'num': {
      const v = parseNumber(text);
      return v === null ? { error: 'web.err.number' } : { value: v };
    }
    case 'choice':
      return f.choices?.includes(text) ? { value: text } : { error: 'web.err.number' };
    case 'text': {
      const e = f.validate?.(text) ?? null;
      return e ? { error: e } : { value: text };
    }
  }
}

export interface FormRun {
  status: 'incomplete' | 'invalid' | 'ok';
  errors: Record<string, string>;
  res?: Res;
}

/** Runs a calculator from raw form text. The first valid position becomes the reference for short entries. */
export function runForm(def: CalcDef, raw: Record<string, string>, s: FormSettings): FormRun {
  const values: Vals = {};
  const errors: Record<string, string> = {};
  let missing = false;
  let ref: UTM | undefined;
  for (const block of def.blocks) {
    for (const f of block.fields) {
      const text = (raw[f.name] ?? f.def ?? '').trim();
      if (!text) {
        if (!f.optional) missing = true;
        continue;
      }
      const unit = (raw[f.name + '.unit'] as DirUnit | undefined) ?? 'v';
      const p = parseField(f, text, unit, ref, s);
      if ('error' in p) errors[f.name] = p.error;
      else {
        values[f.name] = p.value;
        if (f.kind === 'pos' && !ref) ref = p.value as UTM;
      }
    }
  }
  if (Object.keys(errors).length) return { status: 'invalid', errors };
  if (missing) return { status: 'incomplete', errors };
  const res = def.compute(values);
  return res ? { status: 'ok', errors, res } : { status: 'incomplete', errors };
}
