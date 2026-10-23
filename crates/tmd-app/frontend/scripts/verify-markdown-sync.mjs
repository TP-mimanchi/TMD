import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const routines = source.slice(source.indexOf('function handleMarkdownEditorChange('), source.indexOf('function syncMarkdownModelFromEditor('));
const js = ts.transpileModule(`
export function exercise() {
 let reads = 0;
 let edits = 0;
 let synced;
 const bridge = { markSynchronized: (text) => { synced = text; } };
 const markdownEditor = bridge;
 let markdownSyncingFromEditor = false;
 const scheduleMarkdownImageRefresh = () => {};
 const monaco = { Range: class { constructor(...args) { this.args = args; } } };
 const model = {
   getValue: () => { reads++; return 'before'; },
   getEOL: () => '\\n',
   getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 }),
   pushEditOperations: () => { edits++; },
 };
 const doc = { id: 1, model, readOnly: false };
 const state = { documents: [doc], activeId: 1, markdownEditMode: 'wysiwyg' };
 ${routines}
 handleMarkdownEditorChange(1, bridge, 'before!');
 return { reads, edits, synced, markdownSyncingFromEditor };
}
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { exercise } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const result = exercise();
assert.equal(result.reads, 1, 'A synchronization transaction reads the current model text once');
assert.equal(result.edits, 1);
assert.equal(result.synced, 'before!');
assert.equal(result.markdownSyncingFromEditor, false);
const bridgeSource = fs.readFileSync(new URL('../src/markdownEditor.ts', import.meta.url), 'utf8');
const getter = bridgeSource.slice(bridgeSource.indexOf('  getMarkdown() {'), bridgeSource.indexOf('  hasUnsynchronizedChanges() {'));
const bridgeJs = ts.transpileModule(`
const normalizeMarkdownForEngine = (text) => text.replace(/\\r\\n?/g, '\\n');
export class ReadBridge { ${getter} }
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ReadBridge } = await import(`data:text/javascript;base64,${Buffer.from(bridgeJs).toString('base64')}`);
const bridge = new ReadBridge();
let serialized = 0;
let flushed = 0;
bridge.markdown = 'before';
bridge.muya = {
  flush: () => { flushed++; bridge.markdown = 'pending edit flushed'; },
  getMarkdown: () => { serialized++; return 'pending edit flushed'; },
};
assert.equal(bridge.getMarkdown(), 'pending edit flushed', 'Pending operations are flushed before reading the snapshot');
assert.equal(flushed, 1);
assert.equal(serialized, 0, 'The flush change listener already serialized the state');
console.log('Markdown synchronization: one snapshot, one edit, synchronization guard restored.');
