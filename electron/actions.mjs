import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { mediaTypes } from './media.mjs';

const documents = new Set(['.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.mp4', '.mkv', '.webm']);
const audio = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac']);
const types = new Set(['open_file', 'open_folder', 'open_website', 'reveal_file', 'focus_window', ...mediaTypes]);
const folders = new Set(['home', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos']);

export function validateAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['type', 'target'].includes(key)) || !types.has(value.type) || typeof value.target !== 'string' || value.target.length > 2048 || /[\x00-\x1f]/.test(value.target)) throw new Error('Unsupported desktop action.');
  if (['pause_media', 'resume_media', 'stop_media', 'next_track', 'previous_track', 'get_playback_status'].includes(value.type) && value.target !== '') throw new Error('This media control takes no target.');
  if (value.type === 'set_volume' && (!/^\d{1,3}$/.test(value.target) || Number(value.target) > 100)) throw new Error('Volume must be between 0 and 100.');
  if (value.type === 'focus_window' && !/^[a-f0-9-]{36}$/.test(value.target)) throw new Error('Choose a shared window first.');
  return { type: value.type, target: value.target.trim() };
}

export function website(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP and HTTPS websites are supported.');
  return url.href;
}

// No command interpreter, executable launch, file reading, or model-supplied code.
export function createActions({ app, dialog, shell, owner }) {
  let running = false;
  return async raw => {
    if (running) throw new Error('Finish the current desktop action first.');
    const action = validateAction(raw);
    if (!['open_file', 'open_folder', 'open_website', 'reveal_file'].includes(action.type)) throw new Error('Use the Desktop Agent for this action.');
    running = true;
    try {
      let target = action.target;
      if (action.type === 'open_website') target = website(target);
      else {
        if (action.type === 'open_folder' && folders.has(target.toLowerCase())) target = app.getPath(target.toLowerCase());
        if (!target) {
          const win = owner();
          if (win?.isMinimized()) win.restore();
          win?.show(); win?.focus();
          const wasOnTop = win?.isAlwaysOnTop();
          if (wasOnTop) win.setAlwaysOnTop(false);
          let result;
          try { result = await dialog.showOpenDialog(win, {
            title: action.type === 'play_music' ? 'Choose music for Misaki to play' : action.type === 'open_folder' ? 'Choose a folder to open' : 'Choose a file to open',
            properties: [action.type === 'open_folder' ? 'openDirectory' : 'openFile'],
            ...(action.type === 'play_music' ? { defaultPath: app.getPath('music'), filters: [{ name: 'Music', extensions: [...audio].map(ext => ext.slice(1)) }] } : {}),
          }); } finally {
            if (wasOnTop && !win.isDestroyed()) win.setAlwaysOnTop(true);
          }
          if (result.canceled || !result.filePaths[0]) return { status: 'cancelled', message: 'No item selected. You can choose one and try again.' };
          target = result.filePaths[0];
        }
        // Disallow UNC/network paths and Windows device/alternate stream paths.
        if (!path.isAbsolute(target) || target.startsWith('\\\\') || target.startsWith('//') || target.slice(2).includes(':')) throw new Error('Choose an absolute path on this computer.');
        target = await realpath(target);
        if (target.startsWith('\\\\') || target.startsWith('//') || target.slice(2).includes(':')) throw new Error('Network and device paths are unavailable.');
        const info = await stat(target);
        if (action.type === 'open_folder') {
          if (!info.isDirectory()) throw new Error('That path is not a folder.');
        } else {
          if (!info.isFile()) throw new Error('That path is not a file.');
          if (action.type !== 'reveal_file' && !(action.type === 'play_music' ? audio : documents).has(path.extname(target).toLowerCase())) throw new Error('Choose a document, image, video or music file. Programs and scripts cannot be launched.');
        }
      }
      // The user approves the displayed action with its Open/Play button in chat.
      // A second native confirmation is unnecessary and can obscure the result.
      if (action.type === 'open_website') await shell.openExternal(target);
      else if (action.type === 'reveal_file') shell.showItemInFolder(target);
      else {
        const error = await shell.openPath(target);
        if (error) throw new Error('Windows could not open this item. Check its default application.');
      }
      const label = action.type === 'open_website' ? target : path.basename(target) || target;
      return { status: 'completed', message: action.type === 'play_music' ? `Opened ${label} in your default music player.` : `Opened ${label}.` };
    } catch (error) {
      // Never expose raw OS errors (which can contain unrelated environment details).
      if (error?.code === 'ENOENT') throw new Error('That item does not exist. Ask me to open a file without a path to choose it.');
      if (error?.code) throw new Error('That item could not be accessed. Choose another file or folder.');
      throw error;
    } finally { running = false; }
  };
}
