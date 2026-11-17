import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createAutomation } from '../electron/automation.mjs';
const run=promisify(execFile), root=await mkdtemp(path.join(tmpdir(),'misaki-input-'));
let child;
try {
 const source=path.join(root,'Fixture.cs'), exe=path.join(root,'notepad.exe');
 await writeFile(source,`using System; using System.IO; using System.Windows.Forms;
 class Fixture { [STAThread] static void Main(string[] args) {
  var form=new Form {Text="Misaki automation fixture",Width=500,Height=350,TopMost=true};
  var text=new TextBox {Multiline=true,Dock=DockStyle.Fill}; form.Controls.Add(text);
  text.TextChanged+=(s,e)=>File.WriteAllText(Path.Combine(args[0],"text.txt"),text.Text);
  form.Shown+=(s,e)=>{text.Focus();File.WriteAllText(Path.Combine(args[0],"handle.txt"),form.Handle.ToInt64().ToString());};
  Application.Run(form);
 } }`);
 await run(path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:winexe',`/out:${exe}`,'/r:System.Windows.Forms.dll',source],{windowsHide:true});
 child=spawn(exe,[root],{windowsHide:false,stdio:'ignore'});
 let handle;
 for(let n=0;n<50;n++) { try{handle=await readFile(path.join(root,'handle.txt'),'utf8');break;}catch{await delay(100);} }
 assert.ok(handle,'Fixture window opened');
 const token=randomUUID(); let valid=true;
 const automation=createAutomation({owner:()=>null,dialog:{showMessageBox:async()=>({response:1})},permissions:{check:async()=>{},snapshot:()=>({applications:[]})},screen:{resolveWindow:async value=>{assert.equal(value,token);if(!valid)throw Error('expired');return{handle,title:'Misaki automation fixture'};}}});
 const action=(type,values)=>automation.execute({type,target:JSON.stringify({window:token,...values})});
 assert.equal((await action('click_mouse',{x:40,y:40})).status,'completed');
 assert.equal((await action('type_text',{text:'Hello'})).status,'completed');
 await delay(100);assert.equal(await readFile(path.join(root,'text.txt'),'utf8'),'Hello');
 await action('press_key',{key:'Backspace'}); await delay(100);assert.equal(await readFile(path.join(root,'text.txt'),'utf8'),'Hell');
 await action('scroll_window',{steps:-1});
 const active=await automation.execute({type:'get_active_window',target:''});assert.equal(active.title,'Misaki automation fixture');
 valid=false;await assert.rejects(action('type_text',{text:'blocked'}),/expired/);valid=true;
 assert.equal((await automation.execute({type:'close_application',target:token})).status,'completed');
 for(let n=0;n<30 && child.exitCode===null;n++)await delay(100);
 assert.equal(child.exitCode,0);
 console.log('Native Windows input passed: click, literal typing, key, scroll, active window, revoked grant and graceful close on an isolated fixture window.');
} finally { if(child?.exitCode===null){child.kill();await delay(300);} await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
