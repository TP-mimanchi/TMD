import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const routine = source.slice(source.indexOf('async function renderMarkdownPreview()'), source.indexOf('function markdownPreviewShell('));
const freshness = source.slice(source.indexOf('function isCurrentMarkdownPreview('), source.indexOf('function handleMarkdownPreviewClick('));
const js = ts.transpileModule(`
export function harness() {
 let version = 1;
 let reads = 0;
 let parses = 0;
 let writes = 0;
 let enabled = true;
 let releaseModule;
 let delayModule = false;
 const noop = () => {};
 const classList = { toggle: noop, remove: noop };
 const preview = { parentElement: { classList }, classList, dataset: {}, querySelector: () => ({}) };
 Object.defineProperty(preview, 'innerHTML', { set: () => { writes++; }, get: () => '' });
 const document = { body: { classList } };
 const window = { requestAnimationFrame: noop };
 const $ = (id) => id === 'markdownPreview' ? preview : { classList };
 let markdownPreviewRenderVersion = 0;
 let markdownPreviewSnapshot = null;
 let markdownPreviewRequestedSnapshot = null;
 let markdownPreviewResizeState = null;
 const model = { getVersionId: () => version, getValue: () => { reads++; return 'text'; } };
 const doc = { id: 1, model, path: '/test.md', title: 'test.md' };
 const state = { darkMode: false };
 const activeDocument = () => doc;
 const isMarkdownPreviewEnabled = () => enabled;
 const applyMarkdownPreviewWidth = noop;
 const requestEditorLayout = noop;
 const refreshMarkdownResources = noop;
 const syncMarkdownPreviewScroll = noop;
 const markdownPreviewShell = (_doc, _source, body) => body;
 const log = noop;
 const loadMarkdownModule = async () => {
   if (delayModule) await new Promise((resolve) => { releaseModule = resolve; });
   return ({
   renderMarkdownPreviewHtml: () => { parses++; return '<p>text</p>'; },
   renderMarkdownPreviewDiagrams: async () => {},
 }); };
 ${routine}
 ${freshness}
 return {
   render: renderMarkdownPreview,
   stats: () => ({ reads, parses, writes }),
   edit: () => { version++; },
   theme: () => { state.darkMode = !state.darkMode; },
   rename: () => { doc.path = '/other/test.md'; },
   hide: () => { enabled = false; },
   show: () => { enabled = true; },
   delay: () => { delayModule = true; },
   release: () => { delayModule = false; releaseModule(); },
 };
}
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { harness } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const preview = harness();
await preview.render();
const first = preview.stats();
await preview.render();
assert.deepEqual(preview.stats(), first, 'Unchanged previews reuse the DOM without reading or parsing the document');
preview.edit();
await preview.render();
assert.equal(preview.stats().parses, first.parses + 1);
preview.theme();
await preview.render();
assert.equal(preview.stats().parses, first.parses + 2);
preview.rename();
await preview.render();
assert.equal(preview.stats().parses, first.parses + 3, 'Relative resource base changes invalidate cached DOM');
preview.hide();
await preview.render();
preview.show();
await preview.render();
assert.equal(preview.stats().parses, first.parses + 4, 'Showing after clearing the preview must rebuild it');
const beforeRace = preview.stats();
preview.delay();
preview.theme();
const obsolete = preview.render();
preview.theme();
await preview.render();
preview.release();
await obsolete;
assert.equal(preview.stats().writes, beforeRace.writes, 'A delayed theme render cannot replace the reused original theme DOM');
assert.equal(preview.stats().parses, beforeRace.parses, 'Obsolete renders are discarded before parsing');
console.log('Preview cache: unchanged DOM reused; edits, theme, path and visibility invalidate it.');
