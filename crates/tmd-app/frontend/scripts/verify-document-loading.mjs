import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/documentLoading.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createDocumentLoadQueue } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const queue = createDocumentLoadQueue();
let reads = 0;
let finish;
const read = () => { reads += 1; return new Promise((resolve) => { finish = resolve; }); };
assert.equal(reads, 0, 'Creating the queue must not read files');
const first = queue.load(1, read);
const duplicate = queue.load(1, read);
assert.equal(first, duplicate, 'Activating one pending tab twice shares a request');
await Promise.resolve();
assert.equal(reads, 1);
finish(true);
assert.equal(await first, true);
assert.equal(await queue.load(1, async () => false), false, 'Completed entries do not retain documents');
await assert.rejects(queue.load(2, async () => { throw Error('missing'); }), /missing/);
assert.equal(await queue.load(2, async () => true), true, 'Failed reads can be retried');

// Exercise the real hydration routine with a model and application state stub.
const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const routine = main.slice(main.indexOf('async function ensureDocumentLoaded('), main.indexOf('function activateDocument('));
const hydration = ts.transpileModule(`
export function harness(queue, read, docs, activeId) {
 const state = { documents: docs, activeId };
 const documentLoads = queue;
 const invoke = read;
 const log = () => {};
 const attachEditorModel = () => {};
 const renderAll = () => {};
 const monaco = { editor: { setModelLanguage: () => {} } };
 ${routine}
 return ensureDocumentLoaded;
}
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { harness } = await import(`data:text/javascript;base64,${Buffer.from(hydration).toString('base64')}`);
const doc = { id: 9, path: 'test.md', deferred: true, model: { isDisposed: () => false, setValue: (value) => { doc.value = value; } } };
const docs = [doc];
let resolveRead;
const hydrate = harness(queue, () => new Promise((resolve) => { resolveRead = resolve; }), docs, 9);
const pending = hydrate(doc);
await Promise.resolve();
docs.pop();
resolveRead({ text: 'must not restore a closed tab' });
assert.equal(await pending, false);
assert.equal(doc.value, undefined, 'Closed tabs cannot be hydrated by late responses');

docs.push(doc);
const retry = hydrate(doc);
await Promise.resolve();
resolveRead({ text: '中文😀', readOnly: false });
assert.equal(await retry, true);
assert.equal(doc.value, '中文😀');
assert.equal(doc.savedText, '中文😀');
assert.equal(doc.deferred, false);
assert.equal(doc.dirty, false);
doc.deferred = true;
doc.path = 'old.md';
const renameLoad = hydrate(doc);
await Promise.resolve();
doc.path = 'renamed.md';
resolveRead({ text: 'stale old path' });
await Promise.resolve();
await Promise.resolve();
resolveRead({ text: 'renamed content', readOnly: false });
assert.equal(await renameLoad, true, 'A rename during loading retries the new path');
assert.equal(doc.value, 'renamed content');

doc.deferred = true;
const explicitReload = hydrate(doc);
await Promise.resolve();
doc.deferred = false;
doc.value = 'explicit encoding reload';
resolveRead({ text: 'automatic decoding must not win' });
assert.equal(await explicitReload, true);
assert.equal(doc.value, 'explicit encoding reload');

for (const [name, argument, nextName] of [
  ['convertEncoding', 'UTF-16 Little Endian', 'findCurrent'],
  ['setLineEnding', 'CRLF', 'toggleWordWrap'],
]) {
  const declaration = main.indexOf(`async function ${name}(`);
  const end = main.indexOf(`function ${nextName}(`, declaration);
  const editingRoutine = main.slice(declaration, end);
  const editingJs = ts.transpileModule(`
  export function run() {
    const doc = { encoding: 'UTF-8', text: 'a\\nb', savedText: 'a\\nb', dirty: false,
      model: { getValue: () => doc.text, setValue: (text) => { doc.text = text; } } };
    let complete;
    const ensureDocumentLoaded = () => new Promise((resolve) => { complete = resolve; });
    const activeDocument = () => doc;
    const closeMenus = () => {};
    const renderAll = () => {};
    const scheduleSessionSave = () => {};
    const log = () => {};
    const normalizeLineEndings = (text) => text.replace(/\\r\\n|\\n|\\r/g, '\\r\\n');
    ${editingRoutine}
    const pending = ${name}(${JSON.stringify(argument)});
    return { doc, pending, complete: () => complete(true) };
  }`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { run } = await import(`data:text/javascript;base64,${Buffer.from(editingJs).toString('base64')}`);
  const editing = run();
  assert.equal(editing.doc.dirty, false, `${name} cannot edit a placeholder before hydration`);
  editing.complete();
  await editing.pending;
  assert.equal(editing.doc.dirty, true);
  if (name === 'convertEncoding') assert.equal(editing.doc.encoding, argument);
  else assert.equal(editing.doc.text, 'a\r\nb');
}
console.log('Document loading: on demand, single request, retry, close race and hydration passed.');
