import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = path => fs.readFileSync(new URL(`../vendor/marktext-muya/src/${path}`, import.meta.url), 'utf8');
function body(source) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getFullText(ast)).join('\n');
}
async function evaluate(source) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { default: width } = await evaluate(body(read('utils/stringWidth.ts')));
globalThis.measureTableCell = width;
const serializer = body(read('state/stateToMarkdown.ts')).replace('export default class', 'class').replaceAll('debug', 'serializerDebug');
const { default: JSONState, metrics } = await evaluate(`
import * as json1 from ${JSON.stringify(import.meta.resolve('ot-json1'))};
export const metrics = { widths: 0, clones: 0 };
const stringWidth = text => { metrics.widths++; return globalThis.measureTableCell(text); };
const deepClone = value => { metrics.clones++; return structuredClone(value); };
const logger = () => ({ log: () => {}, error: () => {} });
const isAnyListState = s => ['order-list', 'bullet-list', 'task-list'].includes(s.name);
const requestAnimationFrame = () => 1; const cancelAnimationFrame = () => {};
${serializer}
const StateToMarkdown = ExportMarkdown;
${body(read('state/index.ts'))}
`);
const json1 = await import('ot-json1');
const table = () => ({ name: 'table', children: [
  { name: 'table.row', children: [{ name: 'table.cell', text: '标题', meta: { align: 'center' } }] },
  { name: 'table.row', children: [{ name: 'table.cell', text: '中文 e\u0301 👩‍💻 | test', meta: { align: 'center' } }] },
] });
const options = { listIndentation: 1 };
const state = new JSONState({ options, eventCenter: { emit() {} } }, [table(), { name: 'paragraph', text: 'before' }]);
const initial = state.getMarkdown();
const widths = metrics.widths;
const clones = metrics.clones;
state.getMarkdown();
assert.equal(metrics.widths, widths, 'Repeated snapshot reads must reuse table formatting');
assert.equal(metrics.clones, clones, 'Serialization must not clone the entire document');
state.dispatch(json1.replaceOp([1, 'text'], 'before', 'after'));
const after = state.getMarkdown();
assert.equal(metrics.widths, widths, 'Typing a paragraph must not recalculate unchanged table widths');
assert.equal(after, state.getMarkdownFromState(state.getState()));
const oldCell = state.getState()[0].children[1].children[0].text;
const edit = json1.replaceOp([0, 'children', 1, 'children', 0, 'text'], oldCell, '新值');
const beforeCellEdit = metrics.widths;
state.dispatch(edit);
assert.match(state.getMarkdown(), /新值/);
assert.ok(metrics.widths > beforeCellEdit, 'Editing a table invalidates its cached formatting');
state.dispatch(json1.type.invert(edit));
assert.equal(state.getMarkdown(), after, 'Undo restores the exact table markdown');
const mutable = state.getState();
state.getMarkdownFromState(mutable);
mutable[0].children[1].children[0].text = 'external mutation';
assert.match(state.getMarkdownFromState(mutable), /external mutation/, 'Arbitrary mutable states are always serialized fresh');
state.setContent(mutable);
assert.match(state.getMarkdown(), /external mutation/);
mutable[0].children[1].children[0].text = 'reset';
state.setContent(mutable);
assert.match(state.getMarkdown(), /reset/, 'Resetting the same tree clears table caches');
assert.notEqual(initial, after);
const list = [{ name: 'order-list', meta: { start: 1, delimiter: '.', loose: false }, children: [
  { name: 'list-item', children: [{ name: 'paragraph', text: 'item' }, { name: 'bullet-list', meta: { marker: '-', loose: false }, children: [
    { name: 'list-item', children: [{ name: 'paragraph', text: 'nested' }] },
  ] }] },
] }];
function freezeTree(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); }
  return value;
}
state.setContent(freezeTree([...list, table()]));
assert.equal(state.getMarkdown(), state.getMarkdownFromState(state.getState()), 'Exporting frozen state never mutates lists or tables');
options.listIndentation = 4;
assert.equal(state.getMarkdown(), state.getMarkdownFromState(state.getState()), 'Changing list indentation invalidates the snapshot');

if (process.argv.includes('--benchmark')) {
  const blocks = Array.from({ length: 80 }, () => {
    const t = table();
    t.children.push(...Array.from({ length: 30 }, () => structuredClone(t.children[1])));
    for (const row of t.children) row.children.push(...Array.from({ length: 4 }, () => structuredClone(row.children[0])));
    return t;
  });
  blocks.push({ name: 'paragraph', text: 'edit' });
  const probe = new JSONState({ options, eventCenter: { emit() {} } }, blocks);
  probe.getMarkdown();
  const run = cached => {
    let value = probe.getState().at(-1).text;
    const start = performance.now();
    for (let i = 0; i < 30; i++) {
      probe.dispatch(json1.replaceOp([blocks.length - 1, 'text'], value, value + 'x'));
      value += 'x';
      if (cached) probe.getMarkdown();
      else probe.getMarkdownFromState(probe.getState()); // previous clone + full export path
    }
    return (performance.now() - start) / 30;
  };
  const before = run(false);
  const after = run(true);
  console.log(JSON.stringify({ fixture: '80 tables / 12800 cells, 30 paragraph edits; dispatch + markdown export', beforeMs: +before.toFixed(2), afterMs: +after.toFixed(2), improvement: +(before / after).toFixed(2) }));
}

// Range measurements must all precede style writes, including the empty final line.
const { repositionLineNumberSpans } = await evaluate(body(read('utils/codeBlockLineNumbers.ts')));
const events = [];
const spans = Array.from({ length: 3 }, () => ({ style: {
  _top: '', get top() { return this._top; }, set top(value) { events.push('write'); this._top = value; },
} }));
const textNode = { textContent: 'a\nb\n' };
let offset = 0;
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.document = {
  createTreeWalker: () => { let done = false; return { nextNode: () => done ? null : (done = true, textNode) }; },
  createRange: () => ({ setStart: (_, n) => { offset = n; }, collapse() {}, getBoundingClientRect: () => { events.push('read'); return { top: 100 + offset / 2 * 24 }; } }),
};
globalThis.getComputedStyle = () => { events.push('read'); return { lineHeight: '24px' }; };
repositionLineNumberSpans({ children: spans }, textNode);
assert.deepEqual(spans.map(s => s.style.top), ['0px', '24px', '48px']);
assert.ok(!events.slice(events.indexOf('write')).includes('read'), 'Line numbers must batch layout reads before style writes');
events.length = 0;
repositionLineNumberSpans({ children: spans }, textNode);
assert.ok(!events.includes('write'), 'Unchanged gutter positions need no style writes');
// Exercise the production code-block update method with instrumented DOM and
// Prism boundaries. Gutter/preview initialization must still run on cache hits.
const codeSource = read('block/content/codeBlockContent/index.ts');
const codeAst = ts.createSourceFile('code.ts', codeSource, ts.ScriptTarget.Latest, true);
const codeClass = codeAst.statements.find(s => ts.isClassDeclaration(s));
const update = codeClass.members.find(m => m.name?.getText(codeAst) === 'update').getFullText(codeAst).replace('override ', '');
const inputHandler = codeClass.members.find(m => m.name?.getText(codeAst) === 'inputHandler').getFullText(codeAst).replace('override ', '');
const { Probe, stats, grammar, loaded } = await evaluate(`
export const stats = { highlights: 0, writes: 0, gutters: 0, previews: 0 };
export const grammar = { javascript: {} };
export const loaded = new Set(['javascript']);
const loadedLanguages = loaded;
const transformAliasToOrigin = langs => langs.map(l => l === 'js' ? 'javascript' : l);
const escapeHTML = text => text;
const getHighlightHtml = text => text;
const MARKER_HASH = { '<': '__lt__', '>': '__gt__', '"': '__quot__', "'": '__apos__' };
const prism = { languages: grammar, highlightElement(wrapper, async, callback) { stats.highlights++; callback.call(wrapper); } };
const document = { createElement: () => ({ classList: { add() {} }, innerHTML: '' }) };
export class Probe {
  text = 'const x = 1;'; _lang = 'js';
  domNode = { textContent: '', set innerHTML(value) { stats.writes++; this.textContent = value; } };
  _updateLineNumbers() { stats.gutters++; }
  _updatePreviewIfHave() { stats.previews++; }
  getCursor() { return { start: { offset: 2 }, end: { offset: 2 } }; }
  autoPair() { return { text: '()', needRender: true }; }
  setCursor() { this.update(); }
  ${update}
  ${inputHandler}
}
`);
const code = new Probe();
code.update();
code.update();
assert.equal(stats.highlights, 1, 'Unchanged code must not be highlighted again by initialization callbacks');
assert.equal(stats.writes, 1);
assert.equal(stats.gutters, 2, 'Late gutter initialization still runs on cache hits');
assert.equal(stats.previews, 2);
code.text += '\n// edit';
code.update();
assert.equal(stats.highlights, 2, 'Typing invalidates the rendered code');
grammar.javascript = {};
code.update();
assert.equal(stats.highlights, 3, 'A newly loaded/replaced grammar invalidates highlighting');
code.update(undefined, [{ start: 0, end: 5 }]);
assert.equal(stats.highlights, 4, 'Search highlights invalidate code rendering');
loaded.delete('javascript');
code.update();
const plainWrites = stats.writes;
loaded.add('javascript');
code.update();
assert.equal(stats.writes, plainWrites + 1, 'Language loading upgrades plain code to syntax-highlighted code');
code.text = '()';
code.update();
code.domNode.textContent = '())'; // native input adds closer, autoPair consumes it
code.inputHandler({});
assert.equal(code.domNode.textContent, '()', 'Auto-pair normalization must repair native DOM even when model text is unchanged');
delete globalThis.measureTableCell;
delete globalThis.document;
delete globalThis.NodeFilter;
delete globalThis.getComputedStyle;
console.log('Render performance: snapshot/table reuse, immutable Unicode/list output, edit/undo/reset/options invalidation, batched gutter layout and syntax highlighting reuse passed.');
