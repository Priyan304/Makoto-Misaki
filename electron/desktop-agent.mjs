import { createActions, validateAction, toolRegistry } from './actions.mjs';
import { createPermissions } from './permissions.mjs';
import { createFileLibrary } from './file-library.mjs';
import { createAutomation, automationTypes } from './automation.mjs';
import { createMedia, mediaTypes } from './media.mjs';
import { createScreen } from './screen.mjs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// This is the only dispatcher for native tools. Model output stays a proposal.
export function createDesktopAgent({ app, dialog, shell, owner, desktopCapturer, media: suppliedMedia, screen: suppliedScreen, configFile = path.join(app.getPath('userData'), 'desktop-agent.json') }) {
  const media = suppliedMedia || createMedia({ musicPath: app.getPath('music') });
  const screen = suppliedScreen || createScreen({ desktopCapturer, owner });
  const permissions = createPermissions({ file: path.join(app.getPath('userData'), 'permissions.json'), dialog, owner });
  const library = createFileLibrary(permissions.folders);
  const files = createActions({ app, dialog, shell, owner, authorize: library.resolve });
  const automation = createAutomation({ permissions, screen, dialog, owner });
  let libraryError = null;
  const restoring = (async () => {
    if (!configFile) return;
    try {
      const text = await readFile(configFile, 'utf8');
      if (text.length > 8192) return;
      const saved = JSON.parse(text);
      await permissions.ready;
      if (permissions.snapshot().enabled.media && typeof saved.musicFolder === 'string') await media.setLibrary(saved.musicFolder);
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
    await permissions.check(toolRegistry.find(tool => tool.name === value.type).permission);
    if (value.type === 'focus_window') return screen.focusWindow(value.target);
    if (value.type === 'take_screenshot') return { status: 'completed', message: 'Choose a screen or window and preview the snapshot before sending.', requestScreen: true };
    if (value.type === 'search_files' || value.type === 'get_file_information') {
      const data = await (value.type === 'search_files' ? library.search(value.target) : library.information(value.target));
      return { status: 'completed', message: JSON.stringify(data), data };
    }
    if (automationTypes.has(value.type) || ['open_application','close_application','get_active_window','get_system_info'].includes(value.type)) {
      const result = await automation.execute(value);
      return result.status ? result : { status: 'completed', message: JSON.stringify(result), data: result };
    }
    if (!mediaTypes.has(value.type)) return files(value);
    let picked = false;
    if (['play_media', 'play_music'].includes(value.type) && !value.target) {
      value.target = await pick('file');
      if (!value.target) return { status: 'cancelled', message: 'No audio selected. You can choose one and try again.' };
      picked = true;
    }
    if (['play_media','play_music'].includes(value.type) && path.isAbsolute(value.target) && !picked) {
      const current = await status();
      const approved = createFileLibrary(() => [...permissions.folders(), ...(current.library ? [current.library] : [])]);
      value.target = await approved.resolve(value.target);
    }
    return media.execute(value);
  });
  return {
    action,
    permissions: async () => { await permissions.ready; return { ...permissions.snapshot(), tools: toolRegistry }; },
    setPermission: async value => { const result = await permissions.change(value); if (value.permission === 'screen' || value.permission === 'automation') screen.stop(); if (value.permission === 'media' && !value.enabled) { try { await media.execute({ type: 'stop_media', target: '' }); } catch { /* stopped */ } } return result; },
    chooseGrant: permissions.choose, revokeGrant: permissions.revoke,
    status,
    context: async query => {
      if (typeof query !== 'string' || query.length > 4000) throw new Error('Invalid desktop context request.');
      await permissions.ready;
      const grants = permissions.snapshot();
      const { available, state, title, volume, error, library, trackCount } = grants.enabled.media ? await status() : {};
      const context = { playback: grants.enabled.media ? { available, state, title, volume, error } : null, library: library ? { folder: library, trackCount, matches: media.search(query) } : null, applications: grants.enabled.applications ? grants.applications.map(({id,name}) => ({id,name})) : [], permissions: grants.enabled };
      while (JSON.stringify(context).length > 14000 && context.library?.matches.length) context.library.matches.pop();
      return context;
    },
    chooseLibrary: () => locked(async () => {
      await permissions.check('media');
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
    search: async query => { await permissions.check('media'); return media.search(query); },
    sources: async () => { await permissions.check('screen'); return screen.list(); }, capture: async id => { await permissions.check('screen'); return screen.capture(id); }, stopSharing: () => screen.stop(),
    close: () => { screen.stop(); media.close(); },
  };
}
