import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/windowPlatform.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { usesNativeMacWindowControls } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(usesNativeMacWindowControls('darwin', 'Win32'), true, 'The build target takes priority over the preview browser');
assert.equal(usesNativeMacWindowControls('windows', 'MacIntel'), false);
assert.equal(usesNativeMacWindowControls('linux', 'MacIntel'), false);
assert.equal(usesNativeMacWindowControls(undefined, 'MacIntel'), true);
assert.equal(usesNativeMacWindowControls(undefined, 'Win32'), false);

const config = JSON.parse(fs.readFileSync(new URL('../../tauri.macos.conf.json', import.meta.url), 'utf8'));
const native = config.app.windows[0];
assert.equal(native.label, 'main');
assert.equal(native.decorations, true, 'Native buttons require real window decorations');
assert.equal(native.titleBarStyle, 'Overlay');
assert.equal(native.hiddenTitle, true);
assert.equal(native.visible, true, 'macOS must not wait for page load to reveal the main window');

const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const bind = main.slice(main.indexOf('function bindWindowControls()'), main.indexOf('function toggleTitlebarMaximize()'));
const bindJs = ts.transpileModule(`
export function exercise(nativeMacWindow) {
 const lookups = [];
 const titlebar = { addEventListener: () => {} };
 const $ = (id) => { lookups.push(id); return titlebar; };
 const isInteractiveTarget = () => false;
 const toggleTitlebarMaximize = () => {};
 const appWindow = {};
 const requestWindowClose = () => {};
 ${bind}
 bindWindowControls();
 return lookups;
}
`, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { exercise } = await import(`data:text/javascript;base64,${Buffer.from(bindJs).toString('base64')}`);
assert.deepEqual(exercise(true), ['windowTitlebar'], 'macOS does not bind the hidden Windows buttons');
assert.deepEqual(exercise(false), ['windowTitlebar', 'windowMinimize', 'windowMaximize', 'windowClose']);
console.log('Platform window: macOS native configuration, target selection and Windows control bindings passed.');
