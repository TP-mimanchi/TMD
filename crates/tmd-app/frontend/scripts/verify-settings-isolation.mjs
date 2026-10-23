import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const routines = main.slice(main.indexOf('function openSettingsPage()'), main.indexOf('function selectSettingsSection('));
const js = ts.transpileModule(`
export function harness() {
  const nodes = new Map();
  const makeNode = () => {
    const classes = new Set();
    return { inert: false, classList: {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    } };
  };
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
  const document = { body: makeNode() };
  const appStarting = false;
  const closeMenus = () => {};
  const renderSettingsMenu = () => {};
  const refreshSystemIntegrationStatus = async () => {};
  let hiddenTools = 0;
  const markdownEditor = { hideFloatTools: () => { hiddenTools++; } };
  ${routines}
  return { open: openSettingsPage, close: closeSettingsPage, nodes, $, body: document.body, hiddenTools: () => hiddenTools };
}
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { harness } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const settings = harness();
settings.open();
assert.equal(settings.hiddenTools(), 1, 'Opening settings hides editor-owned floating tools');
assert.equal(settings.body.classList.contains('settings-open'), true, 'Body-level editor portals must be isolated too');
assert.equal(settings.$('workspace').inert, true, 'Hidden editor cannot retain keyboard or pointer interaction');
settings.close();
assert.equal(settings.body.classList.contains('settings-open'), false);
assert.equal(settings.$('workspace').inert, false);
assert.equal(settings.$('settingsPage').classList.contains('hidden'), true);
console.log('Settings isolation: editor tools dismissed, body portals isolated and editor interaction restored.');
