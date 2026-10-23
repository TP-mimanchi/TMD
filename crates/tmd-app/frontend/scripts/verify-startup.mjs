import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
async function evaluate(source) {
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const inlineSource=read('../vendor/marktext-muya/src/inlineRenderer/index.ts');
const parsed=ts.createSourceFile('inline.ts',inlineSource,ts.ScriptTarget.Latest,true);
const withoutImports=parsed.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getFullText(parsed)).join('\n');
const {default:InlineRenderer}=await evaluate(`
const logger=()=>({error:()=>{}});
const tokenizer=()=>[];
const beginRules={reference_definition:/never-match/};
class Renderer { output(){return '';} }
${withoutImports}`);
let stateReads=0;
let state=[{name:'paragraph',text:'a'}];
const jsonState={revision:1,getState(){stateReads++;return state;}};
const inline=new InlineRenderer({editor:{jsonState}});
inline.getLabelInfo=block=>({label:block.text,info:{href:block.text}});
const block={text:'example',blockName:'paragraph.content',isParent:()=>false,domNode:{innerHTML:''}};
for(let n=0;n<1000;n++) inline.patch(block);
assert.equal(stateReads,1,'Initial rendering must scan the document once, not once per table cell');
assert.equal(inline.labels.get('a').href,'a');
state=[{name:'paragraph',text:'b'}];jsonState.revision++;
inline.patch(block);
assert.equal(stateReads,2,'A document edit invalidates reference definitions');
assert.equal(inline.labels.has('a'),false);
assert.equal(inline.labels.get('b').href,'b');

const main=read('../src/main.ts');
const activate=main.slice(main.indexOf('function activateDocument('),main.indexOf('function activateAdjacentDocument('));
const {activateFirst}=await evaluate(`
export function activateFirst(){
const doc={id:2,language:'markdown',deferred:false,model:{}};
const previous={id:1,model:{}};
const state={documents:[previous,doc],activeId:1,markdownEditMode:'wysiwyg'};
let attached=false;
const editor={getModel:()=>previous.model,saveViewState:()=>({})};
const activeDocument=()=>previous;
const syncActiveBookmarkLines=()=>{};const syncMarkdownModelFromEditor=()=>{};
const isMarkdownLikeDocument=()=>true;
const attachEditorModel=()=>{attached=true;};
const renderAll=()=>{};const scheduleSessionSave=()=>{};const ensureDocumentLoaded=()=>{};
${activate}
activateDocument(2);return attached;
}`);
assert.equal(activateFirst(),true,'The first Markdown open must attach its source model while rich editing loads');
const tail=main.slice(main.indexOf('  // First paint can run'),main.indexOf('  log("TMD Monaco UI ready")'));
const {start}=await evaluate(`
export function start(restore,integrate,listener,args={files:[],directories:[]}){
let openRequestsReady=false,appStarting=true,appStartupTask=Promise.resolve(),openRequestTask=Promise.resolve();
const app={inert:false};const $=()=>app;
const setStartupInteractionBlocked=blocked=>{app.inert=blocked;};
const calls=[];
const requestEditorLayout=()=>{};
const markAppReady=()=>{calls.push('paint');return Promise.resolve();};
const restoreSession=restore;
const invoke=async()=>args;
const syncSystemIntegrationPreferences=integrate;
const applyOpenRequest=async()=>{calls.push('open');};
const drainOpenRequests=async()=>{calls.push('drain');};
const openRequestListenerReady=listener;
const log=()=>{};
${tail}
return {calls,ready:()=>openRequestsReady,done:()=>appStartupTask,app};
}`);
let finishRestore,finishListener;
const startup=start(()=>new Promise(r=>finishRestore=r),()=>new Promise(()=>{}),new Promise(r=>finishListener=r));
for(let n=0;n<10;n++) await Promise.resolve();
assert.deepEqual(startup.calls,['paint'],'Shell must paint before waiting for session files');
assert.equal(startup.app.inert,true,'Do not let typing or toolbar actions race with session restoration');
finishRestore();
for(let n=0;n<10;n++) await Promise.resolve();
assert.equal(startup.calls.includes('open'),false,'Register the system-open listener before draining queued files');
finishListener();
for(let n=0;n<20;n++) await Promise.resolve();
assert.equal(startup.calls.includes('open'),true,'System integration must not delay opening files');
assert.equal(startup.ready(),true);
await startup.done();
assert.equal(startup.app.inert,false);
const failed=start(()=>Promise.reject(Error('restore failed')),()=>Promise.resolve(),Promise.resolve());
await failed.done();
assert.equal(failed.ready(),true,'A failed session cannot disable subsequent system-open requests');
let skipActive;
const folderStartup=start(skip=>{skipActive=skip;},()=>Promise.resolve(),Promise.resolve(),{files:[],directories:['folder']});
await folderStartup.done();
assert.equal(skipActive,false,'Opening a directory must still restore the active file');
const fileStartup=start(skip=>{skipActive=skip;},()=>Promise.resolve(),Promise.resolve(),{files:['first.md'],directories:[]});
await fileStartup.done();
assert.equal(skipActive,true,'An explicit startup file takes priority over reading the old active file');

const requestRoutine=main.slice(main.indexOf('async function applyOpenRequest('),main.indexOf('function applySearchSnapshot('));
const {requestHarness}=await evaluate(`
export async function requestHarness(paths){
let active={deferred:true};let hydrated=0;const opened=[];
const closeMenus=()=>{};const closeSettingsPage=()=>{};const renderAll=()=>{};const scheduleSessionSave=()=>{};
const log=()=>{};const fileNameFromPath=p=>p;const activeDocument=()=>active;
const openWorkspacePath=async()=>{};
const ensureDocumentLoaded=async()=>{hydrated++;active.deferred=false;};
const openPath=async path=>{if(path==='missing.md')throw Error('missing');opened.push(path);active={deferred:false};};
${requestRoutine}
await applyOpenRequest({files:paths,directories:[]});return {opened,hydrated};
}`);
assert.deepEqual(await requestHarness(['missing.md']),{opened:[],hydrated:1},'A failed startup file must hydrate the restored fallback');
assert.deepEqual(await requestHarness(['missing.md','valid.md']),{opened:['valid.md'],hydrated:0},'A failed file cannot discard later files from the same request');

const dropRoutine=main.slice(main.indexOf('function bindFileDrop()'),main.indexOf('function setFileDropActive('));
const {dropHarness}=await evaluate(`
export function dropHarness(appStartupTask){
let handler;let fileDropTask=Promise.resolve();const opened=[];
const appWindow={onDragDropEvent:fn=>{handler=fn;return Promise.resolve();}};
const setFileDropActive=()=>{};const log=()=>{};
const openDroppedFiles=async paths=>{opened.push(...paths);};
${dropRoutine}
bindFileDrop();
return {drop:()=>handler({payload:{type:'drop',paths:['first.md'],position:{x:1,y:1}}}),opened,done:()=>fileDropTask};
}`);
let finishStartup;
const drops=dropHarness(new Promise(r=>finishStartup=r));
drops.drop();await Promise.resolve();
assert.deepEqual(drops.opened,[],'A first drop waits for session restoration instead of being overwritten');
finishStartup();await drops.done();
assert.deepEqual(drops.opened,['first.md'],'A first native drop anywhere in the window opens exactly once');

const modeRoutine=main.slice(main.indexOf('function markdownEditModeFor('),main.indexOf('function isMarkdownPreviewEnabled('));
assert.ok(modeRoutine,'Large Markdown documents need a source-first policy');
const {chooseMode}=await evaluate(`
export function chooseMode(doc,preference){
const state={markdownEditMode:preference};const activeDocument=()=>doc;
${modeRoutine}
return markdownEditModeFor(doc);
}`);
const small={fileSize:100,model:{getLineCount:()=>10}};
assert.equal(chooseMode(small,'wysiwyg'),'wysiwyg');
assert.equal(chooseMode({...small,markdownSourceForPerformance:undefined,fileSize:3*1024*1024},'wysiwyg'),'source');
assert.equal(chooseMode({...small,markdownSourceForPerformance:undefined,model:{getLineCount:()=>20001}},'split'),'source');
assert.equal(chooseMode({...small,fileSize:3*1024*1024,markdownRichOptIn:true},'wysiwyg'),'wysiwyg');
small.fileSize=3*1024*1024;
assert.equal(chooseMode(small,'wysiwyg'),'wysiwyg','Typing past a threshold cannot change the active editing surface');
const shrinking={fileSize:3*1024*1024,model:{getLineCount:()=>20001}};
assert.equal(chooseMode(shrinking,'wysiwyg'),'source');
shrinking.fileSize=100;shrinking.model.getLineCount=()=>10;
assert.equal(chooseMode(shrinking,'wysiwyg'),'source','Deleting text cannot flip commands to an invisible rich editor');

// Exercise the real JSON state mutations that invalidate the reference cache.
const stateSource=read('../vendor/marktext-muya/src/state/index.ts');
const stateAst=ts.createSourceFile('state.ts',stateSource,ts.ScriptTarget.Latest,true);
const stateBody=stateAst.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getFullText(stateAst)).join('\n');
const {default:JSONState}=await evaluate(`
import * as json1 from ${JSON.stringify(import.meta.resolve('ot-json1'))};
const deepClone=structuredClone;
const logger=()=>({log:()=>{}});
const requestAnimationFrame=()=>1;const cancelAnimationFrame=()=>{};
${stateBody}`);
const json1=await import('ot-json1');
const actualState=new JSONState({eventCenter:{emit:()=>{}}},[{name:'paragraph',text:'a'}]);
const initialRevision=actualState.revision;
actualState.dispatch(null);
assert.equal(actualState.revision,initialRevision,'No-op edits do not invalidate references');
actualState.dispatch(json1.replaceOp([0,'text'],'a','b'));
assert.equal(actualState.revision,initialRevision+1);
actualState.editOperation([0,'text'],[1,'c']);actualState.flush();
assert.equal(actualState.revision,initialRevision+2,'Batched typing invalidates references when applied');
actualState.setContent([{name:'paragraph',text:'new file'}]);
assert.equal(actualState.revision,initialRevision+3,'Switching content invalidates references');
console.log('Startup: reference caching, first-open fallback, early paint and listener readiness passed.');
