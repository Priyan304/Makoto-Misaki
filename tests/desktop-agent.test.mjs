import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createMedia } from '../electron/media.mjs';
import { createScreen } from '../electron/screen.mjs';
import { createDesktopAgent } from '../electron/desktop-agent.mjs';

function silence(seconds = 30) {
  const bytes = Buffer.alloc(44 + 8000 * 2 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
test('actual mpv named pipe supports playback, pause/resume, queue, volume, stop and missing files', { skip: process.platform !== 'win32' || !existsSync('.cache/mpv/mpv.exe') }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'misaki-mpv-'));
  const media = createMedia();
  try {
    await writeFile(path.join(root, 'A Snowfall.wav'), silence()); await writeFile(path.join(root, 'B Winter.wav'), silence());
    await writeFile(path.join(root, 'run.cmd'), 'fixture');
    await media.setLibrary(root);
    assert.equal((await media.status()).trackCount, 2);
    assert.equal(media.search('play Snowfall please')[0].title, 'A Snowfall.wav');
    assert.equal((await media.status()).state, 'stopped');
    await assert.rejects(media.execute({ type: 'pause_media', target: '' }), /Nothing is playing/);
    assert.match((await media.execute({ type: 'play_media', target: 'Snowfall' })).message, /playing.*Snowfall/);
    assert.equal((await media.status()).playlist.length, 2);
    await delay(300);
    await media.execute({ type: 'pause_media', target: '' });
    const paused = await media.status(); assert.equal(paused.state, 'paused');
    await delay(200); assert.ok(Math.abs((await media.status()).position - paused.position) < .1);
    await media.execute({ type: 'resume_media', target: '' }); assert.equal((await media.status()).state, 'playing');
    await media.execute({ type: 'set_volume', target: '25' }); assert.equal((await media.status()).volume, 25);
    for (const target of ['101', '-1', '3.5', 'run']) await assert.rejects(media.execute({ type: 'set_volume', target }), /0 and 100/);
    await media.execute({ type: 'next_track', target: '' }); await delay(100); assert.equal((await media.status()).title, 'B Winter.wav');
    await assert.rejects(media.execute({ type: 'next_track', target: '' }), /no next/);
    await media.execute({ type: 'previous_track', target: '' }); await delay(100); assert.equal((await media.status()).title, 'A Snowfall.wav');
    await media.execute({ type: 'stop_media', target: '' }); assert.equal((await media.status()).state, 'stopped');
    await assert.rejects(media.execute({ type: 'play_media', target: path.join(root, 'missing.wav') }));
    await assert.rejects(media.execute({ type: 'play_media', target: path.join(root, 'run.cmd') }), /local audio/);
    await assert.rejects(media.execute({ type: 'play_media', target: 'https://example.com/audio.mp3' }), /No matching/);
  } finally { media.close(); await delay(300); await rm(root, { recursive: true, force: true }); }
});

test('music indexing stays inside the chosen root and unavailable mpv gives setup instructions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'misaki-index-'));
  const media = createMedia({ executable: path.join(root, 'missing.exe') });
  try {
    await mkdir(path.join(root, 'allowed')); await mkdir(path.join(root, 'outside'));
    await writeFile(path.join(root, 'outside', 'Private.wav'), silence(1));
    await writeFile(path.join(root, 'allowed', 'Good.wav'), silence(1));
    await symlink(path.join(root, 'outside'), path.join(root, 'allowed', 'escape'), 'junction');
    await media.setLibrary(path.join(root, 'allowed'));
    assert.deepEqual(media.search('').map(value => value.title), ['Good.wav']);
    assert.equal((await media.status()).available, false);
    await assert.rejects(media.execute({ type: 'play_media', target: path.join(root, 'allowed', 'Good.wav') }), /setup:media/);
    await assert.rejects(media.setLibrary('https://example.com'), /local music folder/);
  } finally { media.close(); await rm(root, { recursive: true, force: true }); }
});

test('mpv replies use request IDs, events do not become replies, and disconnect rejects pending actions', async () => {
  const commands = []; let client;
  const server = createServer(connection => {
    client = connection;
    let buffer = '';
    connection.on('data', data => {
      buffer += data;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'); const request = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        commands.push(request.command);
        connection.write('{"event":"idle"}\n');
        if (request.command[0] === 'set_property') { connection.destroy(); return; }
        const values = { 'idle-active': false, pause: false, path: 'song.wav', volume: 60, playlist: [], 'playlist-pos': 0 };
        connection.write(JSON.stringify({ request_id: request.request_id, error: 'success', data: values[request.command[1]] ?? 0 }) + '\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = new EventEmitter(); child.stdin = new PassThrough();
  const root = await mkdtemp(path.join(tmpdir(), 'misaki-ipc-')); await writeFile(path.join(root, 'song.wav'), silence(1));
  const media = createMedia({ executable: process.execPath, spawnPlayer: (_executable, pipe) => { assert.match(pipe, /misaki-/); return child; }, connectPipe: () => connect(server.address().port, '127.0.0.1') });
  try {
    // loadfile's reply arrives but never a file-loaded event; then the set_property disconnects.
    await assert.rejects(media.execute({ type: 'play_media', target: path.join(root, 'song.wav') }), /disconnected/);
    assert.deepEqual(commands.slice(0, 2).map(command => command[0]), ['loadfile', 'set_property']);
    assert.equal((await media.status()).state, 'stopped');
  } finally { media.close(); client?.destroy(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test('screens require explicit selection, cancel invalidates in-flight capture, and revoked grants cannot focus', async () => {
  let calls = 0, captured = [], wait = null;
  const thumbnail = { toDataURL: () => 'data:image/png;base64,fixture', toJPEG: () => Buffer.from([255, 216, 255, 217]), isEmpty: () => false, getSize: () => ({ width: 1920, height: 1080 }) };
  const source = { id: 'window:42:0', name: 'Fixture window', thumbnail };
  const screen = createScreen({ owner: () => ({ getMediaSourceId: () => 'window:99:0' }), focus: async (...values) => captured.push(values), desktopCapturer: { getSources: async () => { calls++; if (wait) await wait; return [source, { ...source, id: 'window:99:0', name: 'Misaki' }]; } } });
  assert.equal(calls, 0);
  await assert.rejects(screen.capture(source.id), /picker first/);
  assert.equal((await screen.list()).length, 1);
  const image = await screen.capture(source.id);
  assert.equal(image.width, 1920); assert.equal(image.source, 'Fixture window');
  if (process.platform === 'win32') { await screen.focusWindow(image.window.token); assert.deepEqual(captured, [['42', 'Fixture window']]); }
  screen.stop(); await assert.rejects(screen.focusWindow(image.window.token), /expired/);
  await screen.list(); let release; wait = new Promise(resolve => { release = resolve; });
  const pending = screen.capture(source.id); screen.stop(); release();
  await assert.rejects(pending, /cancelled/);
  assert.equal(captured.length, process.platform === 'win32' ? 1 : 0);
});

test('Desktop Agent routes legacy music through controlled media and keeps native pickers retryable', async () => {
  let cancel = true; const calls = [];
  const agent = createDesktopAgent({ configFile: null, app: { getPath: () => tmpdir() }, owner: () => null, dialog: { showOpenDialog: async () => ({ canceled: cancel, filePaths: ['C:\\Music\\Snowfall.mp3'] }) }, shell: { openPath: () => assert.fail('Music must not use the shell opener') }, media: { execute: async value => { calls.push(value); return { status: 'completed', message: 'Media playing.' }; }, status: async () => ({}), search: () => [], close: () => {} }, screen: { stop: () => {} } });
  try {
    assert.equal((await agent.action({ type: 'play_music', target: '' })).status, 'cancelled'); assert.equal(calls.length, 0);
    cancel = false; await agent.action({ type: 'play_music', target: '' }); assert.equal(calls[0].target, 'C:\\Music\\Snowfall.mp3');
    await assert.rejects(agent.action({ type: 'exec', target: 'cmd' }), /Unsupported/);
    await assert.rejects(agent.action({ type: 'play_media', target: '', command: 'run' }), /Unsupported/);
  } finally { agent.close(); }
});
