import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const mediaTypes = new Set(['play_media', 'play_music', 'pause_media', 'resume_media', 'stop_media', 'next_track', 'previous_track', 'set_volume', 'get_playback_status', 'search_media']);
const audio = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.opus', '.wma']);
export const localPath = value => typeof value === 'string' && path.isAbsolute(value) && !value.startsWith('\\\\') && !value.startsWith('//') && !value.slice(2).includes(':') && !/[\x00-\x1f]/.test(value);
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };

export function createMedia({ musicPath, executable = process.env.MISAKI_MPV_PATH || fileURLToPath(new URL('../.cache/mpv/mpv.exe', import.meta.url)), spawnPlayer, connectPipe = connect } = {}) {
  let child, socket, starting, stopped = false, serial = 0, buffer = '', mediaError = null;
  let library = null, tracks = [], partial = false, scanning = false;
  const pending = new Map();
  const events = new Set();
  const available = () => !!executable && existsSync(executable);
  function disconnected() {
    socket = undefined;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Media player disconnected. Try playing the track again.')); }
    pending.clear();
  }
  function attach(connection) {
    socket = connection; buffer = '';
    connection.setEncoding('utf8');
    connection.on('data', data => {
      buffer += data;
      if (buffer.length > 1_048_576) { connection.destroy(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let value;
        try { value = JSON.parse(line); } catch { continue; }
        if (value.event === 'end-file' && value.reason === 'error') mediaError = 'This audio file could not be played. Check its format or choose another track.';
        if (value.event) for (const listener of events) listener(value);
        const request = pending.get(value.request_id);
        if (request) {
          clearTimeout(request.timer); pending.delete(value.request_id);
          if (value.error === 'success') request.resolve(value.data);
          else request.reject(new Error('Media player could not complete that action.'));
        }
      }
    });
    connection.on('error', () => {});
    connection.once('close', () => { if (socket === connection) disconnected(); });
  }
  async function start() {
    if (stopped) throw new Error('Media player is closing.');
    if (socket && !socket.destroyed) return;
    if (starting) return starting;
    if (!available()) throw new Error('mpv is unavailable. Run npm run setup:media once, then restart Misaki.');
    starting = (async () => {
      // Never expose this pipe or raw mpv commands to the renderer/model.
      const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\misaki-${randomUUID()}` : path.join(process.env.TMPDIR || '/tmp', `misaki-${randomUUID()}.sock`);
      child = spawnPlayer ? spawnPlayer(executable, pipe) : spawn(process.execPath, [fileURLToPath(new URL('./media-supervisor.mjs', import.meta.url)), executable, pipe], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      child.stdin?.on('error', () => { /* supervisor already exited */ });
      let exited = false;
      child.on('error', () => { exited = true; });
      child.once('exit', () => { exited = true; socket?.destroy(); });
      for (let attempt = 0; attempt < 60 && !stopped && !exited; attempt++) {
        const connection = await new Promise(resolve => {
          const client = connectPipe(pipe);
          const timer = setTimeout(() => { client.destroy(); resolve(null); }, 200);
          client.once('connect', () => { clearTimeout(timer); resolve(client); });
          client.once('error', () => { clearTimeout(timer); client.destroy(); resolve(null); });
        });
        if (connection) { attach(connection); return; }
        await delay(100);
      }
      child?.stdin?.end();
      throw new Error('mpv could not start. Run npm run setup:media and check the player installation.');
    })().finally(() => { starting = null; });
    return starting;
  }
  function command(command) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.destroyed) { reject(new Error('No media player is active. Play a track first.')); return; }
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Media player timed out. Try again.')); }, 3000);
      pending.set(id, { resolve, reject, timer });
      socket.write(JSON.stringify({ command, request_id: id }) + '\n');
    });
  }
  async function load(operation) {
    let listener, timer;
    const loaded = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The track did not load. Choose another audio file.')), 10000);
      listener = event => {
        if (event.event === 'file-loaded') resolve();
        if (event.event === 'end-file' && event.reason === 'error') reject(new Error(mediaError));
      };
      events.add(listener);
    });
    const completion = loaded.then(() => null, error => error);
    try { await operation(); const error = await completion; if (error) throw error; }
    finally { clearTimeout(timer); events.delete(listener); }
  }
  async function status() {
    const base = { available: available(), state: 'stopped', title: null, path: null, volume: 60, position: 0, duration: 0, playlist: [], index: -1, error: mediaError, library, trackCount: tracks.length, partial, scanning };
    if (!socket || socket.destroyed) return base;
    try {
      const [idle, pause, filename, volume, position, duration, playlist, index] = await Promise.all(['idle-active', 'pause', 'path', 'volume', 'time-pos', 'duration', 'playlist', 'playlist-pos'].map(property => command(['get_property', property]).catch(() => null)));
      return { ...base, state: idle ? 'stopped' : pause ? 'paused' : filename ? 'playing' : 'stopped', path: filename, title: filename ? path.basename(filename) : null, volume: volume ?? 60, position: position ?? 0, duration: duration ?? 0, playlist: (playlist || []).slice(0, 500).map(item => ({ title: path.basename(item.filename), path: item.filename })), index: index ?? -1 };
    } catch { return { ...base, error: 'Media player disconnected.' }; }
  }
  async function setLibrary(folder) {
    if (scanning) throw new Error('The music library is still being indexed.');
    if (!localPath(folder) || folder.length > 2048) throw new Error('Choose a local music folder with a shorter path.');
    const canonical = await realpath(folder);
    if (!localPath(canonical) || !(await stat(canonical)).isDirectory()) throw new Error('Choose a local music folder.');
    scanning = true;
    try {
      const found = []; const queue = [canonical]; let visited = 0; let truncated = false;
      while (queue.length && visited < 10000 && found.length < 5000) {
        const dir = queue.shift();
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
          if (++visited > 10000 || found.length >= 5000) { truncated = true; break; }
          if (entry.isSymbolicLink()) continue;
          const file = path.join(dir, entry.name);
          // Resolve directories too: Windows junctions must not escape the grant.
          let resolved;
          try { resolved = await realpath(file); } catch { continue; }
          if (!inside(canonical, resolved) || !localPath(resolved) || resolved.length > 2048) continue;
          if (entry.isDirectory()) queue.push(resolved);
          else if (entry.isFile() && audio.has(path.extname(entry.name).toLowerCase())) found.push({ title: entry.name, path: resolved });
        }
      }
      library = canonical; tracks = found.sort((a, b) => a.title.localeCompare(b.title)); partial = truncated || queue.length > 0;
      return status();
    } finally { scanning = false; }
  }
  function search(query) {
    if (typeof query !== 'string' || query.length > 4000) throw new Error('Use a shorter music search.');
    const words = query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(word => word.length > 1);
    return tracks.map(track => ({ ...track, score: words.reduce((score, word) => score + (track.title.toLocaleLowerCase().includes(word) ? word.length : 0), 0) })).filter(track => !words.length || track.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12).map(({ title, path }) => ({ title, path }));
  }
  async function resolveTrack(target) {
    let file = target;
    if (!localPath(file)) {
      const matches = search(target);
      if (matches.length !== 1) throw new Error(matches.length ? 'Several tracks match. Choose a track from Desktop tools or use its exact path.' : 'No matching audio was found. Choose your music folder or pick an audio file.');
      file = matches[0].path;
    }
    file = await realpath(file);
    if (!localPath(file) || !audio.has(path.extname(file).toLowerCase()) || !(await stat(file)).isFile()) throw new Error('Choose an existing local audio file.');
    return file;
  }
  async function execute(action) {
    if (action.type === 'search_media') return { status: 'completed', message: library ? `Music matches: ${JSON.stringify(search(action.target).slice(0, 3))}` : 'No music folder is selected. Choose a music folder in Desktop tools first.' };
    if (action.type === 'get_playback_status') {
      const { available, state, title, volume, position, duration, error, playlist, index } = await status();
      return { status: 'completed', message: JSON.stringify({ available, state, title, volume, position, duration, error, queueLength: playlist.length, index }) };
    }
    if (['play_media', 'play_music'].includes(action.type)) {
      const file = await resolveTrack(action.target);
      await start(); mediaError = null;
      await load(async () => { await command(['loadfile', file, 'replace']); await command(['set_property', 'pause', false]); });
      // Queue the rest of the selected library, so Next/Previous have a meaning.
      const index = tracks.findIndex(track => track.path === file);
      if (index >= 0) {
        for (const track of tracks.slice(index + 1, index + 501)) await command(['loadfile', track.path, 'append']);
      }
    } else {
      if (!socket || socket.destroyed) throw new Error('Nothing is playing. Choose a track first.');
      if (action.type === 'set_volume') {
        if (!/^\d{1,3}$/.test(action.target) || Number(action.target) > 100) throw new Error('Volume must be between 0 and 100.');
        await command(['set_property', 'volume', Number(action.target)]);
      } else {
        const current = await status();
        if (action.type !== 'stop_media' && current.state === 'stopped') throw new Error('Nothing is playing. Choose a track first.');
        if (action.type === 'next_track' && current.index >= current.playlist.length - 1) throw new Error('There is no next track in this queue.');
        if (action.type === 'previous_track' && current.index <= 0) throw new Error('There is no previous track in this queue.');
        const operations = { pause_media: ['set_property', 'pause', true], resume_media: ['set_property', 'pause', false], stop_media: ['stop'], next_track: ['playlist-next', 'weak'], previous_track: ['playlist-prev', 'weak'] };
        if (!operations[action.type]) throw new Error('Unsupported media action.');
        if (['next_track', 'previous_track'].includes(action.type)) await load(() => command(operations[action.type]));
        else await command(operations[action.type]);
        if (action.type === 'stop_media') mediaError = null;
      }
    }
    const playback = await status();
    return { status: 'completed', message: `Media ${playback.state}${playback.title ? `: ${playback.title}` : ''}. Volume ${Math.round(playback.volume)}%.${playback.error ? ` ${playback.error}` : ''}` };
  }
  function close() { stopped = true; socket?.destroy(); disconnected(); child?.stdin?.end(); }
  return { execute, status, setLibrary, search, close, musicPath };
}
