import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const runFile = promisify(execFile);
export function createScreen({ desktopCapturer, owner, focus = async (handle, title) => {
  await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./focus-window.ps1', import.meta.url)), '-Handle', handle, '-ExpectedTitle', title], { windowsHide: true, timeout: 10000, maxBuffer: 4096 });
} }) {
  let listed = new Set();
  let revision = 0;
  const grants = new Map();
  const sources = thumbnailSize => desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize, fetchWindowIcons: false });
  async function list() {
    const epoch = revision;
    const result = (await sources({ width: 320, height: 180 })).filter(source => source.id !== owner()?.getMediaSourceId());
    if (epoch !== revision) throw new Error('Screen selection was cancelled.');
    listed = new Set(result.map(source => source.id));
    return result.map(source => ({ id: source.id, name: source.name.slice(0, 200), kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail.toDataURL() }));
  }
  async function capture(id) {
    if (typeof id !== 'string' || !listed.has(id)) throw new Error('Choose a screen or window from the sharing picker first.');
    const epoch = revision;
    const win = owner();
    const hideForCapture = id.startsWith('screen:') && win?.isVisible();
    let source;
    try {
      if (hideForCapture) { win.hide(); await delay(250); }
      if (epoch !== revision) throw new Error('Screen selection was cancelled.');
      source = (await desktopCapturer.getSources({ types: [id.startsWith('screen:') ? 'screen' : 'window'], thumbnailSize: { width: 1920, height: 1080 }, fetchWindowIcons: false })).find(value => value.id === id);
    } finally { if (hideForCapture && !win.isDestroyed()) { win.show(); win.focus(); } }
    if (epoch !== revision) throw new Error('Screen selection was cancelled.');
    if (!source || source.thumbnail.isEmpty()) throw new Error('This window cannot be captured. Restore it or choose a different source.');
    listed.clear(); grants.clear();
    let bitmap = source.thumbnail;
    let bytes = bitmap.toJPEG(85);
    if (bytes.length > 786432) bytes = bitmap.toJPEG(60);
    if (bytes.length > 786432) { bitmap = bitmap.resize({ width: 1280 }); bytes = bitmap.toJPEG(65); }
    if (bytes.length > 786432) throw new Error('This screenshot is too large. Choose an individual window instead.');
    const size = bitmap.getSize();
    const window = source.id.startsWith('window:') ? { token: randomUUID(), title: source.name.slice(0, 200) } : null;
    if (window) grants.set(window.token, { id: source.id, title: source.name, expires: Date.now() + 300000 });
    return { mime_type: 'image/jpeg', data: bytes.toString('base64'), source: source.name.slice(0, 200), width: size.width, height: size.height, window };
  }
  async function focusWindow(token) {
    const grant = grants.get(token);
    if (!grant || grant.expires < Date.now()) throw new Error('This window permission expired. Share that window again.');
    const source = (await sources({ width: 0, height: 0 })).find(value => value.id === grant.id && value.name === grant.title);
    if (grants.get(token) !== grant || grant.expires < Date.now()) throw new Error('This window permission expired. Share that window again.');
    if (!source) throw new Error('That window is no longer available. Share it again.');
    const handle = source.id.match(/^window:(\d+):/u)?.[1];
    if (!handle || process.platform !== 'win32') throw new Error('Window focusing is supported on Windows.');
    try { await focus(handle, grant.title); }
    catch { throw new Error('Windows could not focus that window. Restore it and try again.'); }
    owner()?.minimize?.(); // Keep an always-on-top companion from covering the target.
    return { status: 'completed', message: `Focused ${grant.title.slice(0, 200)}. Press Ctrl+Shift+M to return to Misaki.` };
  }
  function stop() { revision++; listed.clear(); grants.clear(); }
  return { list, capture, focusWindow, stop };
}
