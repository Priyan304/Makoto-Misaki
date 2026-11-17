import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

app.setName('Misaki');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const children = [];
let stopping = false;
async function freePort() {
  const server = createServer();
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
function helper(executable,args,env) {
  const child = spawn(executable,args,{cwd:root,env,windowsHide:true,stdio:['pipe','ignore','pipe']});
  children.push(child); child.stdin.on('error',()=>{});
  child.stderr.on('data',()=>{}); // Provider credentials and local paths never enter a release log.
  child.once('error',()=>{ child.failed=true; });
  child.once('exit',()=>{ child.failed=true; if (!stopping && app.isReady()) { dialog.showErrorBox('Misaki stopped','A local helper stopped. Close Misaki and reopen it.'); app.quit(); } });
  return child;
}
async function ready(url,child) {
  for(let attempt=0;attempt<150;attempt++) {
    if(child.failed) throw new Error('A bundled helper could not start.');
    try { const response=await fetch(url,{headers:{Authorization:`Bearer ${process.env.MISAKI_SESSION_TOKEN}`},signal:AbortSignal.timeout(1000)}); if(response.ok) return; } catch { /* still starting */ }
    await delay(200);
  }
  throw new Error('The local services did not become ready.');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('before-quit',()=>{ stopping=true; for(const child of children) { child.stdin.end(); const timer=setTimeout(()=>child.kill(),5000); timer.unref(); child.once('exit',()=>clearTimeout(timer)); } });
  try {
    process.env.MISAKI_UI_PORT=String(await freePort());
    do { process.env.MISAKI_BRIDGE_PORT=String(await freePort()); } while(process.env.MISAKI_UI_PORT===process.env.MISAKI_BRIDGE_PORT);
    process.env.MISAKI_SESSION_TOKEN=randomBytes(32).toString('hex');
    process.env.MISAKI_ENV_FILE=path.join(app.getPath('userData'),'.env');
    process.env.MISAKI_MPV_PATH=path.join(process.resourcesPath,'mpv','mpv.exe');
    const bridge=helper(path.join(process.resourcesPath,'bridge','misaki-bridge.exe'),[],{...process.env,MISAKI_MANAGED_STDIN:'1'});
    const ui=helper(process.execPath,[path.join(root,'scripts','desktop-ui.mjs')],{...process.env,ELECTRON_RUN_AS_NODE:'1'});
    await Promise.all([ready(`http://127.0.0.1:${process.env.MISAKI_BRIDGE_PORT}/v1/providers`,bridge),ready(`http://127.0.0.1:${process.env.MISAKI_UI_PORT}/`,ui)]);
    await import('./main.mjs');
  } catch(error) { stopping=true; for(const child of children) child.stdin.end(); await app.whenReady(); dialog.showErrorBox('Misaki could not start',error.message); app.quit(); }
}
