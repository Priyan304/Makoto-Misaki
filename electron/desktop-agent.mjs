import { createActions, validateAction } from './actions.mjs';
import { createMedia, mediaTypes } from './media.mjs';
import { createScreen } from './screen.mjs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// This is the only dispatcher for native tools. Model output stays a proposal.
export function createDesktopAgent({ app, dialog, shell, owner, desktopCapturer, media: suppliedMedia, screen: suppliedScreen, configFile = path.join(app.getPath('userData'), 'desktop-agent.json') }) {
  const media = suppliedMedia || createMedia({ musicPath: app.getPath('music') });
  const screen = suppliedScreen || createScreen({ desktopCapturer, owner });
  const files = createActions({ app, dialog, shell, owner });
  let libraryError = null;
  const restoring = (async () => {
    if (!configFile) return;
    try {
      const text = await readFile(configFile, 'utf8');
      if (text.length > 8192) return;
      const saved = JSON.parse(text);
      if (typeof saved.musicFolder === 'string') await media.setLibrary(saved.musicFolder);
    } catch (error) { if (error?.code !== 'ENOENT') libraryError = 'The saved music folder could not be indexed. Choose your music folder again.'; }
  })();
  async function status() { await restoring; const value = await media.status(); return { ...value, error: value.error || libraryError }; }
  let running = false;
  async function pick(kind) {
    const win = owner();
    if (win?.isMinimized()) win.restore();
    win?.show(); win?.focus();
    const onTop = win?.isAlwaysOnTop();
    if (onTop) win.setAlwaysOnTop(false);
    try {
      const value = await dialog.showOpenDialog(win, { title: kind === 'folder' ? 'Choose your music library' : 'Choose audio to play', defaultPath: app.getPath('music'), properties: [kind === 'folder' ? 'openDirectory' : 'openFile'], ...(kind === 'folder' ? {} : { filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'opus', 'wma'] }] }) });
      return value.canceled ? null : value.filePaths[0] || null;
    } finally { if (onTop && !win.isDestroyed()) win.setAlwaysOnTop(true); }
  }
  async function locked(callback) {
    if (running) throw new Error('Finish the current desktop action first.');
    running = true;
    try { return await callback(); }
    catch (error) { if (error?.code) throw new Error('That local item could not be accessed. Choose another file or folder.'); throw error; }
    finally { running = false; }
  }
  const action = raw => locked(async () => {
    const value = validateAction(raw);
    if (value.type === 'focus_window') return screen.focusWindow(value.target);
    if (!mediaTypes.has(value.type)) return files(value);
    if (['play_media', 'play_music'].includes(value.type) && !value.target) {
      value.target = await pick('file');
      if (!value.target) return { status: 'cancelled', message: 'No audio selected. You can choose one and try again.' };
    }
    return media.execute(value);
  });
  return {
    action,
    status,
    context: async query => {
      if (typeof query !== 'string' || query.length > 4000) throw new Error('Invalid desktop context request.');
      const { available, state, title, volume, error, library, trackCount } = await status();
      const context = { playback: { available, state, title, volume, error }, library: library ? { folder: library, trackCount, matches: media.search(query) } : null };
      while (JSON.stringify(context).length > 14000 && context.library?.matches.length) context.library.matches.pop();
      return context;
    },
    chooseLibrary: () => locked(async () => {
      await restoring;
      const folder = await pick('folder');
      if (!folder) return null;
      const value = await media.setLibrary(folder); libraryError = null;
      if (configFile) {
        try { await writeFile(`${configFile}.tmp`, JSON.stringify({ musicFolder: value.library }), { encoding: 'utf8', mode: 0o600 }); await rename(`${configFile}.tmp`, configFile); }
        catch { libraryError = 'The music folder works for this session but could not be saved.'; }
      }
      return { ...value, error: value.error || libraryError };
    }),
    search: query => media.search(query),
    sources: () => screen.list(), capture: id => screen.capture(id), stopSharing: () => screen.stop(),
    close: () => { screen.stop(); media.close(); },
  };
}
