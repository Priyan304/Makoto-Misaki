import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalLocal } from './file-library.mjs';

const defaults = { files: true, media: true, screen: true, applications: false, automation: false, system: false };
export function createPermissions({ file, dialog, owner }) {
  let state = { enabled: { ...defaults }, folders: [], applications: [] };
  const ready = (async () => {
    try {
      const raw = await readFile(file, 'utf8'); if (raw.length > 32768) return;
      const saved = JSON.parse(raw);
      for (const key of Object.keys(defaults)) if (typeof saved.enabled?.[key] === 'boolean') state.enabled[key] = saved.enabled[key];
      state.folders = (saved.folders || []).filter(value => typeof value === 'string' && value.length <= 2048).slice(0, 10);
      state.applications = (saved.applications || []).filter(value => typeof value.id === 'string' && /^[a-f0-9-]{36}$/.test(value.id) && typeof value.path === 'string' && value.path.length <= 2048 && typeof value.name === 'string').slice(0, 20);
    } catch { /* first run or invalid settings: keep defaults */ }
  })();
  let writing = Promise.resolve();
  async function save() { const data = JSON.stringify(state); writing = writing.catch(() => {}).then(async () => { await writeFile(`${file}.tmp`, data, { mode: 0o600 }); await rename(`${file}.tmp`, file); }); await writing; }
  const snapshot = () => structuredClone(state);
  async function check(permission) { await ready; if (!state.enabled[permission]) throw new Error(`Enable ${permission} access in Preferences first.`); }
  async function change(value) {
    await ready;
    if (!value || !Object.hasOwn(defaults, value.permission) || typeof value.enabled !== 'boolean' || Object.keys(value).length !== 2) throw new Error('Invalid permission change.');
    state.enabled[value.permission] = value.enabled; await save(); return snapshot();
  }
  async function choose(kind) {
    await ready;
    if (!['folder', 'application'].includes(kind)) throw new Error('Invalid permission picker.');
    const result = await dialog.showOpenDialog(owner(), { title: kind === 'folder' ? 'Allow Misaki to search this folder' : 'Choose an application Misaki may launch', properties: [kind === 'folder' ? 'openDirectory' : 'openFile'], ...(kind === 'application' ? { filters: [{ name: 'Application', extensions: ['exe'] }] } : {}) });
    if (result.canceled || !result.filePaths[0]) return snapshot();
    const filePath = await canonicalLocal(result.filePaths[0]);
    const info = await stat(filePath);
    if (kind === 'folder') {
      if (!info.isDirectory() || state.folders.length >= 10) throw new Error('Choose a folder; at most 10 folders can be approved.');
      state.folders = [...new Set([...state.folders, filePath])];
    } else {
      if (!info.isFile() || path.extname(filePath).toLowerCase() !== '.exe' || state.applications.length >= 20) throw new Error('Choose an executable application; at most 20 can be approved.');
      if (!state.applications.some(app => app.path === filePath)) state.applications.push({ id: randomUUID(), name: path.basename(filePath, '.exe'), path: filePath });
    }
    await save(); return snapshot();
  }
  async function revoke(value) {
    await ready;
    if (!value || !['folder', 'application'].includes(value.kind) || typeof value.id !== 'string') throw new Error('Invalid grant.');
    if (value.kind === 'folder') state.folders = state.folders.filter(folder => folder !== value.id);
    else state.applications = state.applications.filter(app => app.id !== value.id);
    await save(); return snapshot();
  }
  return { ready, check, snapshot, change, choose, revoke, folders: () => state.folders };
}
