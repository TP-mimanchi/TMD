// Local browser fixture. Generated HTML may contain private file contents;
// remove it after testing and never check it into version control.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const filePath = process.argv[2];
const largeText = filePath ? fs.readFileSync(filePath, 'utf8') : '# Startup test\n\nDocument content';
const mock = function (largeText) {
  let nextId = 1;
  const callbacks = new Map();
  const listeners = new Map();
  const pending = [];
  let releaseSession = () => {};
  const report = document.createElement('aside');
  report.style.cssText = 'position:fixed;bottom:0;right:0;z-index:20000;background:white;color:black;border:1px solid #777;max-width:650px;max-height:200px;overflow:auto;font:12px monospace';
  document.body.append(report);
  const output = document.createElement('pre');
  const trace = text => { output.textContent += `${Math.round(performance.now())}ms ${text}\n`; };
  const emit = (name, payload) => { for (const id of listeners.get(name) ?? []) callbacks.get(id)?.({event:name,id,payload}); };
  const smallPath = 'C:/smoke/first-small.md';
  const largePath = 'C:/smoke/design.md';
  const dto = path => {
    const text=path===largePath?(query.has('large')?largeText.repeat(20):largeText):'# First open works\n\nSmall document';
    return {path,title:path.split('/').pop(),text,language:'markdown',encoding:'UTF-8',lineEnding:'LF',fileSize:new Blob([text]).size,readOnly:false,largeFile:false};
  };
  for (const [label, action] of [
    ['模拟首次拖入小文件', () => { const r=document.getElementById('editorArea').getBoundingClientRect(); emit('tauri://drag-drop',{paths:[smallPath],position:{x:(r.left+r.width/2)*devicePixelRatio,y:(r.top+r.height/2)*devicePixelRatio}}); }],
    ['模拟双击说明书', () => {pending.push({files:[largePath],directories:[]});emit('open-request',null);}],
    ['完成会话恢复', () => releaseSession()],
    ['检查显示内容', () => { const e=document.getElementById('editor');const m=document.getElementById('markdownWysiwyg');trace(JSON.stringify({booting:document.body.classList.contains('booting'),source:e.textContent.slice(0,150),rich:m.textContent.slice(0,150),richSize:m.textContent.length}));}],
  ]) {const button=document.createElement('button');button.textContent=label;button.onclick=action;report.append(button);}
  report.append(output);
  const query = new URLSearchParams(location.search);
  window.__TAURI_INTERNALS__ = {
    metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},
    transformCallback:fn=>{const id=nextId++;callbacks.set(id,fn);return id;},convertFileSrc:p=>p,
    invoke: async (cmd,args={}) => {
      trace(cmd);
      if(cmd==='plugin:event|listen'){const ids=listeners.get(args.event)??[];ids.push(args.handler);listeners.set(args.event,ids);return nextId++;}
      if(cmd==='load_session') {
        if(query.has('holdSession')) await new Promise(r=>releaseSession=r);
        return query.has('restore')?JSON.stringify({version:7,openFiles:[largePath],activePath:largePath,markdownEditMode:'wysiwyg'}):null;
      }
      if(cmd==='plugin:app|version')return '0.1.0';
      if(cmd==='startup_args')return {files:query.has('startup')?[largePath]:[],directories:[]};
      if(cmd==='take_open_requests')return pending.splice(0);
      if(cmd==='open_path')return dto(args.path);
      if(cmd==='set_shell_integration' || cmd==='set_default_app_candidate') {
        if(query.has('holdIntegration')) await new Promise(()=>{});
        return {supported:false,enabled:false,label:'Preview',detail:'Local test'};
      }
      return null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  window.addEventListener('error',e=>trace(`ERROR ${e.message}`));
  window.addEventListener('unhandledrejection',e=>trace(`REJECT ${e.reason?.stack??e.reason}`));
  new MutationObserver(()=>{if(!document.body.classList.contains('booting'))trace('SHELL VISIBLE');}).observe(document.body,{attributes:true,attributeFilter:['class']});
};
const injection = `<script>(${mock.toString()})(${JSON.stringify(largeText).replaceAll('<','\\u003c')})</script>`;
fs.writeFileSync(new URL('startup-repro.html',root),fs.readFileSync(new URL('index.html',root),'utf8').replace('<script type="module"',injection+'<script type="module"'));
console.log('Generated startup-repro.html for local startup/restore/drop checks.');
