import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFileLibrary } from '../electron/file-library.mjs';
import { createPermissions } from '../electron/permissions.mjs';
import { createAutomation, inputArguments } from '../electron/automation.mjs';
import { validateAction, toolRegistry } from '../electron/actions.mjs';

test('file search and metadata honor grants, traversal, junctions and revocation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'misaki-files-')); let roots=[];
 try {
  const allowed=path.join(root,'allowed'), outside=path.join(root,'outside');
  await mkdir(allowed); await mkdir(outside); await writeFile(path.join(allowed,'DAA notes.txt'),'fixture'); await writeFile(path.join(outside,'private notes.txt'),'private');
  roots=[allowed]; const files=createFileLibrary(()=>roots);
  await symlink(outside,path.join(allowed,'escape'),'junction');
  const matches=await files.search('notes'); assert.equal(matches.matches.length,1); assert.equal(matches.matches[0].name,'DAA notes.txt');
  assert.equal((await files.information(matches.matches[0].path)).bytes,7);
  await assert.rejects(files.resolve(path.join(allowed,'..','outside','private notes.txt')),/approved/);
  await assert.rejects(files.resolve(path.join(allowed,'escape','private notes.txt')),/approved/);
  roots=[]; await assert.rejects(files.information(matches.matches[0].path),/approved/);
  assert.equal((await files.search('notes')).matches.length,0);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('permission selection persists, revokes and never trusts a model path as an app grant',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'misaki-permissions-'));
 try {
  const file=path.join(root,'permissions.json'); let selected=root;
  const options={file,owner:()=>null,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selected]})}};
  const permissions=createPermissions(options); await permissions.ready;
  await assert.rejects(permissions.check('automation'),/Enable/);
  await permissions.choose('folder'); await permissions.change({permission:'automation',enabled:true});
  const restored=createPermissions(options); await restored.ready; assert.deepEqual(restored.folders(),[root]); await restored.check('automation');
  await restored.revoke({kind:'folder',id:root}); assert.equal(restored.folders().length,0);
  selected=path.join(root,'script.cmd'); await writeFile(selected,'fixture'); await assert.rejects(permissions.choose('application'),/executable/);
  const saved=JSON.parse(await readFile(file,'utf8')); assert.equal(saved.applications.length,0);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('automation uses validated grants, one-time approval, revocation recheck and fixed operations',async()=>{
 const token=randomUUID(); let enabled=true, approval=0, called=0;
 const automation=createAutomation({permissions:{snapshot:()=>({applications:[]}),check:async()=>{if(!enabled)throw Error('Revoked');}},screen:{resolveWindow:async id=>{assert.equal(id,token);return{handle:'42',title:'Fixture'};}},owner:()=>null,dialog:{showMessageBox:async()=>({response:approval})},runner:async()=>{called++;return{status:'completed',message:'ok'};}});
 const action={type:'type_text',target:JSON.stringify({window:token,text:'Hello'})};
 assert.equal((await automation.execute(action)).status,'cancelled'); assert.equal(called,0);
 approval=1; enabled=false; await assert.rejects(automation.execute(action),/Revoked/); assert.equal(called,0);
 enabled=true; assert.equal((await automation.execute(action)).status,'completed'); assert.equal(called,1);
 await assert.rejects(automation.execute({type:'open_application',target:'C:\\Windows\\cmd.exe'}),/Preferences/);
 for(const target of [JSON.stringify({window:token,key:'Win+R'}),JSON.stringify({window:token,key:'Enter',command:'cmd'})]) assert.throws(()=>inputArguments('press_key',target));
 assert.throws(()=>validateAction({type:'click_mouse',target:JSON.stringify({window:token,x:-1,y:0})}));
 assert.equal(new Set(toolRegistry.map(tool=>tool.name)).size,toolRegistry.length);
});
