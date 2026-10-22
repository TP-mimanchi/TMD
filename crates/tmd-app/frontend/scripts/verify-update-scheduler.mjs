import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/updateScheduler.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createCoalescedUpdate } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

function clock() {
  let nextId = 0;
  const pending = new Map();
  return {
    request: (callback) => { pending.set(++nextId, callback); return nextId; },
    cancel: (id) => pending.delete(id),
    flush: () => { const batch = [...pending.values()]; pending.clear(); batch.forEach((callback) => callback()); },
    count: () => pending.size,
  };
}

for (const restart of [false, true]) {
  const timer = clock();
  const calls = [];
  const update = createCoalescedUpdate((value) => calls.push(value), timer.request, timer.cancel, restart);
  update.schedule('a');
  update.schedule('b');
  update.schedule('last');
  assert.equal(timer.count(), 1, 'Only one pending callback per update');
  assert.deepEqual(calls, [], 'Work is deferred');
  timer.flush();
  assert.deepEqual(calls, ['last'], 'The latest state is delivered exactly once');
  update.schedule('cancelled');
  update.cancel();
  timer.flush();
  assert.deepEqual(calls, ['last'], 'Cancelled work must not run');
  update.schedule('after cancellation');
  timer.flush();
  assert.deepEqual(calls, ['last', 'after cancellation']);
}

const timer = clock();
const calls = [];
let update;
update = createCoalescedUpdate((value) => {
  calls.push(value);
  if (value === 1) update.schedule(2);
}, timer.request, timer.cancel);
update.schedule(1);
timer.flush();
assert.deepEqual(calls, [1]);
assert.equal(timer.count(), 1, 'A callback may schedule the next update');
timer.flush();
assert.deepEqual(calls, [1, 2]);
// Exercise the actual close snapshot routine without bootstrapping the desktop UI.
const mainSource = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const snapshotRoutine = mainSource.slice(
  mainSource.indexOf('function rememberClosedDocument('),
  mainSource.indexOf('async function reopenClosedDocument('),
);
const snapshotJs = ts.transpileModule(`
const closedDocuments = [];
${snapshotRoutine}
export function snapshot(doc) { rememberClosedDocument(doc); return closedDocuments[0]; }
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { snapshot } = await import(`data:text/javascript;base64,${Buffer.from(snapshotJs).toString('base64')}`);
const closed = snapshot({ text: 'old', fileSize: 3, model: { getValue: () => '中文😀' } });
assert.equal(closed.text, '中文😀');
assert.equal(closed.fileSize, new Blob([closed.text]).size, 'Closing before a deferred statistic runs must preserve the latest byte size');
console.log('Update scheduling and close-before-statistics regression checks passed.');
