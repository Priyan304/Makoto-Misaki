import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const folders=await readdir('release');
const release=path.resolve('release',process.argv[2] || folders.filter(name=>name.startsWith('Misaki-')).sort().at(-1));
const profile=await mkdtemp(path.join(tmpdir(),'misaki-release-'));
const env={...process.env}; for(const key of ['ELECTRON_RUN_AS_NODE','GEMINI_API_KEY','GROK_API_KEY','MISAKI_ENV_FILE','MISAKI_SESSION_TOKEN','MISAKI_PARENT_PID']) delete env[key];
let desktop;
try {
 for(const pass of ['cold','warm']) {
  desktop=await electron.launch({executablePath:path.join(release,'Misaki.exe'),args:[`--user-data-dir=${profile}`],env,timeout:60000});
  const page=await desktop.firstWindow();
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status','ready',{timeout:45000});
  const providers=await page.evaluate(()=>window.misakiDesktop.backend('/v1/providers','GET'));
  assert.equal(providers.status,200); assert.ok(providers.body.providers.every(provider=>!provider.configured));
  const permissions=await page.evaluate(()=>window.misakiDesktop.permissions()); assert.equal(permissions.enabled.automation,false);
  const ports=await desktop.evaluate(()=>[process.env.MISAKI_UI_PORT,process.env.MISAKI_BRIDGE_PORT]);
  await assert.rejects(page.evaluate(()=>window.misakiDesktop.action({type:'get_system_info',target:''})),/Enable/);
  await page.evaluate(()=>window.misakiDesktop.setPermission({permission:'system',enabled:true}));
  const system=await page.evaluate(()=>window.misakiDesktop.action({type:'get_system_info',target:''})); assert.equal(system.status,'completed');
  await page.evaluate(()=>window.misakiDesktop.setPermission({permission:'system',enabled:false}));
  await page.screenshot({path:`test-results/release-${pass}.png`});
  if(pass==='cold') {
    await page.getByRole('button',{name:'Preferences',exact:true}).click();
    await page.getByRole('heading',{name:'Desktop permissions'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/release-permissions.png'});
  }
  await desktop.close(); desktop=null;
  for(const port of ports) {
    let closed=false;
    for(let attempt=0;attempt<50;attempt++) { try { await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(300)}); await new Promise(resolve=>setTimeout(resolve,100)); } catch { closed=true;break; } }
    assert.ok(closed,'Bundled service stops when the app closes');
  }
  console.log(`Packaged ${pass} startup: actual avatar, bundled bridge, permissions and helper shutdown passed.`);
 }
 await assert.rejects(stat(path.join(release,'resources','app','.env')),error=>error.code==='ENOENT');
 console.log('Portable release smoke passed with an isolated profile; no live cloud calls.');
} finally { if(desktop) await desktop.close(); await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
