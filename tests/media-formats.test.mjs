import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createMedia } from '../electron/media.mjs';
const run=promisify(execFile);
test('real mpv plays WAV, FLAC and MP3; current-track tags and embedded art reach status',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'misaki-formats-')), media=createMedia();
 try {
  const wav=Buffer.alloc(44+44100*2*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  const source=path.join(root,'fixture.wav');await writeFile(source,wav);
  await run(path.resolve('.cache/mpv/mpv.exe'),[source,'--no-config','--no-video','--oac=flac',`--o=${path.join(root,'fixture.flac')}`],{windowsHide:true,timeout:20000});
  // Self-authored silent MPEG-1 Layer III frames: 128 kbps, 44.1 kHz, mono,
  // zero side information and samples. No external music or encoder required.
  const silentMp3=Buffer.alloc(417*160);
  for(let offset=0;offset<silentMp3.length;offset+=417) silentMp3.writeUInt32BE(0xfffb90c4,offset);
  await writeFile(path.join(root,'fixture.mp3'),silentMp3);
  const frame=(name,data)=>{const header=Buffer.alloc(10);header.write(name);header.writeUInt32BE(data.length,4);return Buffer.concat([header,data]);};
  const picture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHioAAAAASUVORK5CYII=','base64');
  const tags=Buffer.concat([frame('TIT2',Buffer.from('\0Fixture Song')),frame('TPE1',Buffer.from('\0Fixture Artist')),frame('APIC',Buffer.concat([Buffer.from('\0image/png\0\x03\0'),picture]))]);
  const header=Buffer.from([73,68,51,3,0,0,(tags.length>>21)&127,(tags.length>>14)&127,(tags.length>>7)&127,tags.length&127]);
  const mp3=path.join(root,'fixture.mp3');await writeFile(mp3,Buffer.concat([header,tags,await readFile(mp3)]));
  for(const ext of ['wav','flac','mp3']) {
   await media.execute({type:'play_media',target:path.join(root,`fixture.${ext}`)});
   const status=await media.status();assert.equal(status.state,'playing');assert.ok(status.duration>0);
   if(ext==='mp3'){assert.equal(status.artist,'Fixture Artist');assert.equal(status.title,'Fixture Song');assert.ok(status.artwork.startsWith('data:image/png;base64,'));}
   await media.execute({type:'stop_media',target:''});
  }
 } finally {media.close();await delay(300);await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
