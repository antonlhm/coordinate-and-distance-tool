// UI: grouped calculator list and one view per calculator (SPEC-WEB §4). No framework; plain DOM.
import { type DirUnit, fmtPiiru, parseDirection, piiruToMil } from '../core/angle';
import { formatMGRS } from '../core/mgrs';
import type { Out } from '../calc/engine';
import { CALCS, GROUPS, type CalcDef, type Field, type FormRun, parseField, runForm } from '../calc/forms';
import { LANGS, type Lang, getLang, has, setLang, t } from '../i18n';
import { type Settings, type Theme, saveSettings } from './settings';

type Child = Node | string | null | false | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Attrs = Record<string, any>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export interface App {
  settings: Settings;
  raw: Record<string, Record<string, string>>; // in memory only; cleared on reload (WEB-013)
}

// MARK: formatting

const nf = (v: number, digits: number): string =>
  new Intl.NumberFormat(getLang(), { maximumFractionDigits: digits, minimumFractionDigits: 0, useGrouping: false }).format(Math.abs(v) < 5e-13 ? 0 : v);
const fmtDir = (v: number): string => `${fmtPiiru(v)} v · ${nf(Math.round(piiruToMil(v)), 0)} mil`;
const fmtDist = (v: number): string => `${nf(v, Math.abs(v) < 100 ? 1 : 0)} m`;

function outLabel(calcId: string, key: string): string {
  for (const k of [`calc.out.${calcId}.${key}`, `calc.out.${key}`, `web.out.${key}`]) if (has(k)) return t(k);
  return key;
}
function textValue(v: string): string {
  for (const k of [`calc.value.${v}`, `web.value.${v}`]) if (has(k)) return t(k);
  return v;
}

function fmtOut(o: Out): string {
  switch (o.kind) {
    case 'pos':
      return formatMGRS(o.v, 5);
    case 'poslist':
      return o.v.map((p, i) => `${i}: ${formatMGRS(p, 5)}`).join('\n');
    case 'dir':
      return fmtDir(o.v);
    case 'dist':
      return fmtDist(o.v);
    case 'num':
      return `${nf(o.v, o.digits ?? 1)}${o.unit ? ' ' + o.unit : ''}`;
    case 'text':
      return textValue(o.v);
    case 'table':
      return '';
  }
}

function tableEl(o: Extract<Out, { kind: 'table' }>): HTMLElement {
  const head = h('tr', {}, h('th', { scope: 'col' }, 'km \\ m'), ...o.head.map((m) => h('th', { scope: 'col' }, String(m))));
  const rows = o.rows.map((r) => h('tr', {}, h('th', { scope: 'row' }, nf(r.label, 1)), ...r.cells.map((c) => h('td', {}, String(c)))));
  return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, head), h('tbody', {}, ...rows)));
}

// MARK: views

export function mount(root: HTMLElement, app: App): void {
  let route = location.pathname;

  const draw = (): void => {
    route = location.pathname;
    setLang(app.settings.lang);
    document.documentElement.lang = app.settings.lang;
    if (app.settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', app.settings.theme);
    const id = route.replace(/^\/+|\/+$/g, '');
    const def = CALCS[id];
    document.title = def ? `${t(`calc.${id}.title`)} · ${t('web.title')}` : t('web.title');
    const main = def ? calcView(def) : id === 'about' ? aboutView() : listView();
    root.replaceChildren(header(), main, footer());
  };

  const go = (path: string): void => {
    history.pushState(null, '', path);
    draw();
    window.scrollTo(0, 0);
  };

  const link = (path: string, cls: string, ...kids: Child[]): HTMLAnchorElement =>
    h('a', { href: path, class: cls, onclick: (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(path);
    } }, ...kids);

  const header = (): HTMLElement => {
    const sel = (value: string, options: [string, string][], onchange: (v: string) => void): HTMLSelectElement => {
      const s = h('select', { onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value) },
        ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
      return s;
    };
    const update = (): void => {
      saveSettings(app.settings);
      draw();
    };
    const settings = h('details', { class: 'settings' },
      h('summary', {}, t('web.settings')),
      h('div', { class: 'settings-body' },
        h('label', {}, t('web.lang'), sel(app.settings.lang, LANGS.map((l) => [l, { fi: 'Suomi', sv: 'Svenska', en: 'English' }[l]] as [string, string]), (v) => { app.settings.lang = v as Lang; update(); })),
        h('label', {}, t('web.theme'), sel(app.settings.theme, [['auto', t('web.theme.auto')], ['day', t('web.theme.day')], ['night', t('web.theme.night')]], (v) => { app.settings.theme = v as Theme; update(); })),
        h('label', {}, t('web.cell'), sel(app.settings.interp, [['corner', t('web.cell.corner')], ['centre', t('web.cell.centre')]], (v) => { app.settings.interp = v as 'corner' | 'centre'; update(); }))));
    return h('header', { class: 'top' }, link('/', 'brand', t('web.title')), settings);
  };

  const footer = (): HTMLElement =>
    h('footer', {}, h('p', {}, t('disclaimer.body'), ' ', t('web.disclaimer.extra')), h('p', {}, link('/about', 'plain', t('web.about.link'))));

  const listView = (): HTMLElement =>
    h('main', {},
      h('p', { class: 'lead' }, t('web.subtitle')),
      ...GROUPS.map((g) =>
        h('section', { class: 'group' },
          h('h2', {}, t(`calc.group.${g.id}`)),
          h('ul', { class: 'cards' },
            ...g.ids.map((id) =>
              h('li', {}, link(`/${id}`, 'card', h('span', { class: 'card-title' }, t(`calc.${id}.title`)), h('span', { class: 'card-sub' }, t(`calc.${id}.summary`)))))))));

  const aboutView = (): HTMLElement =>
    h('main', {},
      link('/', 'back', t('web.back')),
      h('h1', {}, t('web.about.title')),
      ...[1, 2, 3, 4].map((n) => h('p', {}, t(`web.about.body${n}`))));

  const fieldLabel = (def: CalcDef, f: Field): string => {
    const k = f.labelKey ?? `calc.${def.id}.field.${f.name}`;
    return has(k) ? t(k) : f.name;
  };

  const calcView = (def: CalcDef): HTMLElement => {
    const raw = (app.raw[def.id] ??= {});
    const result = h('section', { class: 'result', 'aria-live': 'polite' });
    const errEls = new Map<string, HTMLElement>();

    const refresh = (): void => {
      const run = runForm(def, raw, app.settings);
      for (const [name, el] of errEls) el.textContent = run.errors[name] ? t(run.errors[name]) : '';
      result.replaceChildren(...resultNodes(def, run, raw));
    };

    const blocks = def.blocks.map((b, i) =>
      h('section', { class: 'block' },
        h('h2', {}, `${i + 1}. ${t(`calc.${def.id}.block.${i + 1}`)}`),
        ...b.fields.map((f) => fieldEl(def, f, raw, errEls, refresh, fieldLabel(def, f)))));

    refresh();
    return h('main', {},
      link('/', 'back', t('web.back')),
      h('h1', {}, t(`calc.${def.id}.title`)),
      h('p', { class: 'lead' }, t(`calc.${def.id}.now`)),
      ...blocks,
      result);
  };

  const resultNodes = (def: CalcDef, run: FormRun, raw: Record<string, string>): Node[] => {
    if (run.status !== 'ok' || !run.res) return [h('p', { class: 'wait' }, t('web.result.waiting'))];
    const res = run.res;
    const rows: [string, string][] = [];
    const dl = h('dl', {});
    for (const o of res.outputs) {
      if (o.kind === 'table') {
        dl.append(h('dt', {}, t('calc.shortbase.table')), h('dd', {}, tableEl(o), h('small', {}, t('calc.shortbase.table.hint'))));
        continue;
      }
      const value = fmtOut(o);
      rows.push([outLabel(def.id, o.key), value]);
      dl.append(h('dt', {}, outLabel(def.id, o.key)), h('dd', { class: o.kind === 'poslist' ? 'multi' : '' }, value));
    }
    const warns = res.warnings.map((w) => h('li', {}, t(w.key, w.p)));
    const copyText = [t(`calc.${def.id}.title`), ...rows.map(([k, v]) => `${k}: ${v.replace(/\n/g, '; ')}`), ...res.warnings.map((w) => `! ${t(w.key, w.p)}`)].join('\n');
    const copy = h('button', { type: 'button', class: 'btn', onclick: async () => {
      try {
        await navigator.clipboard.writeText(copyText);
        copy.textContent = t('web.copy.done');
        setTimeout(() => { copy.textContent = t('action.copy'); }, 1500);
      } catch {
        /* clipboard unavailable */
      }
    } }, t('action.copy'));
    void raw;
    const nodes: (Node | null)[] = [
      h('div', { class: 'arrow', 'aria-hidden': 'true' }, '↓'),
      h('h2', {}, t('result.label')),
      dl,
      warns.length ? h('ul', { class: 'warnings', role: 'status' }, ...warns) : null,
      res.steps.length ? h('details', {}, h('summary', {}, t('calc.steps')), h('ol', {}, ...res.steps.map((s) => h('li', {}, s)))) : null,
      copy,
    ];
    return nodes.filter((n): n is Node => !!n);
  };

  const fieldEl = (def: CalcDef, f: Field, raw: Record<string, string>, errEls: Map<string, HTMLElement>, refresh: () => void, label: string): HTMLElement => {
    const id = `f-${def.id}-${f.name}`;
    const echo = h('small', { class: 'echo', id: `${id}-echo` });
    const err = h('small', { class: 'err', id: `${id}-err`, role: 'alert' });
    errEls.set(f.name, err);
    const describedby = `${id}-echo ${id}-err`;
    const unitSel = f.kind === 'dir'
      ? h('select', { 'aria-label': t('web.unit.label'), onchange: (e: Event) => { raw[f.name + '.unit'] = (e.target as HTMLSelectElement).value; refresh(); updateEcho(); } },
          ...(['v', 'mil', 'deg'] as DirUnit[]).map((u) => h('option', { value: u, selected: (raw[f.name + '.unit'] ?? 'v') === u }, t(`web.unit.${u}`))))
      : null;

    let input: HTMLElement;
    if (f.kind === 'choice') {
      input = h('select', { id, 'aria-describedby': describedby, onchange: (e: Event) => { raw[f.name] = (e.target as HTMLSelectElement).value; refresh(); } },
        ...(f.choices ?? []).map((c) => h('option', { value: c, selected: (raw[f.name] ?? f.def) === c }, has(`calc.choice.${c}`) ? t(`calc.choice.${c}`) : c)));
    } else {
      const common = { id, 'aria-describedby': describedby, autocomplete: 'off', spellcheck: 'false', autocapitalize: f.kind === 'pos' ? 'characters' : 'off' };
      const onInput = (e: Event): void => {
        raw[f.name] = (e.target as HTMLInputElement).value;
        refresh();
        updateEcho();
      };
      input = f.area
        ? h('textarea', { ...common, rows: 6, oninput: onInput }, raw[f.name] ?? '')
        : h('input', { ...common, type: 'text', inputmode: f.kind === 'pos' ? 'text' : 'decimal', value: raw[f.name] ?? '', placeholder: placeholder(f), oninput: onInput });
    }

    function updateEcho(): void {
      const text = (raw[f.name] ?? '').trim();
      echo.textContent = '';
      if (!text || f.kind === 'choice') return;
      if (f.kind === 'pos') {
        const p = parseField(f, text, 'v', undefined, app.settings);
        if ('value' in p) echo.textContent = formatMGRS(p.value as never, 5);
      } else if (f.kind === 'dir') {
        const v = parseDirection(text, (raw[f.name + '.unit'] as DirUnit | undefined) ?? 'v');
        if (v !== null) echo.textContent = fmtDir(v);
      }
    }
    updateEcho();

    return h('div', { class: 'field' },
      h('label', { for: id }, label, f.unit ? h('span', { class: 'unit' }, ` (${f.unit})`) : null, f.optional ? h('span', { class: 'opt' }, ` · ${t('field.optional')}`) : null),
      f.kind === 'dir' ? h('div', { class: 'row' }, input, unitSel) : input,
      f.name === 'steps' ? h('small', { class: 'hint' }, t('calc.traverse.stepsHint')) : null,
      echo, err);
  };

  window.addEventListener('popstate', draw);
  draw();
}

function placeholder(f: Field): string {
  if (f.kind === 'pos') return '34VFM 12859 56480';
  if (f.kind === 'dir') return '12-50';
  return '';
}

export function showBanner(text: string, action: string, onAction: () => void): void {
  document.getElementById('banner')?.remove();
  const b = h('div', { id: 'banner', class: 'banner', role: 'status' }, text, ' ', h('button', { type: 'button', class: 'btn', onclick: onAction }, action));
  document.body.append(b);
}

export { LANGS };
