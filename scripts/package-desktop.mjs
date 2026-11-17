import { cp, mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const run = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(process.platform!=='win32') throw new Error('This release target is Windows x64.');
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(root,'release',`Misaki-${version}-${stamp}`);
const build=path.join(root,'.cache','package',stamp);
await mkdir(build,{recursive:true});
console.log('Building the standalone local bridge…');
await run(path.join(root,'.venv','Scripts','python.exe'),['-m','PyInstaller','--noconfirm','--onedir','--name','misaki-bridge','--distpath',path.join(build,'dist'),'--workpath',path.join(build,'work'),'--specpath',build,'--paths',root,'--collect-all','uvicorn','--hidden-import','backend.__main__','--hidden-import','backend.app','--add-data',`${path.join(root,'config')};config`,path.join(root,'scripts','backend-entry.py')],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});
console.log('Assembling Electron, UI, media player and runtime dependencies…');
await cp(path.join(root,'node_modules','electron','dist'),output,{recursive:true});
await rename(path.join(output,'electron.exe'),path.join(output,'Misaki.exe'));
const app=path.join(output,'resources','app'); await mkdir(app,{recursive:true});
for(const folder of ['electron','scripts','config','dist']) await cp(path.join(root,folder),path.join(app,folder),{recursive:true});
await writeFile(path.join(app,'package.json'),JSON.stringify({name:'misaki',productName:'Misaki',version,main:'electron/release.mjs',type:'module'}));
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
const packages=Object.entries(lock.packages).filter(([name,value])=>name.startsWith('node_modules/')&&!value.dev).map(([name])=>name).sort();
for(const name of packages) {
  if(packages.some(parent=>parent!==name && name.startsWith(`${parent}/`))) continue;
  try { await stat(path.join(root,name)); await cp(path.join(root,name),path.join(app,name),{recursive:true}); } catch(error) { if(error.code!=='ENOENT') throw error; }
}
await cp(path.join(build,'dist','misaki-bridge'),path.join(output,'resources','bridge'),{recursive:true});
await cp(path.join(root,'.cache','mpv'),path.join(output,'resources','mpv'),{recursive:true});
await cp(path.join(root,'docs','desktop-release.md'),path.join(output,'README.md'));
await cp(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
await writeFile(path.join(output,'build-info.json'),JSON.stringify({version,builtAt:new Date().toISOString(),platform:process.platform,arch:process.arch,signed:false},null,2));
console.log(`Portable build ready: ${output}\nOpen Misaki.exe. No .env, saved keys, chats or personal library grants were copied.`);
