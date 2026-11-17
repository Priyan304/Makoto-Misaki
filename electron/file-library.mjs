import path from 'node:path';
import { readdir, realpath, stat } from 'node:fs/promises';
import { localPath } from './media.mjs';

export const inside = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
export async function canonicalLocal(value) {
  if (!localPath(value) || value.length > 2048) throw new Error('Choose a local path. Network and device paths are unavailable.');
  const resolved = await realpath(value);
  if (!localPath(resolved)) throw new Error('This item resolves outside local storage.');
  return resolved;
}
export function createFileLibrary(roots) {
  async function resolve(file) {
    const resolved = await canonicalLocal(file);
    for (const root of roots()) {
      // A replaced root/junction must not silently extend a previous grant.
      try { if (await canonicalLocal(root) === root && inside(root, resolved)) return resolved; } catch { /* revoked/missing root */ }
    }
    throw new Error('This path is outside your approved folders. Add its folder in Preferences or choose it with the file picker.');
  }
  async function search(query) {
    if (typeof query !== 'string' || query.length > 200) throw new Error('Use a filename query of at most 200 characters.');
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = [], visited = new Set(); let count = 0;
    const queue = [...roots()];
    while (queue.length && count < 10000 && matches.length < 40) {
      const dir = queue.shift(); let canonical, entries;
      try { canonical = await resolve(dir); if (visited.has(canonical)) continue; visited.add(canonical); entries = await readdir(canonical, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (++count > 10000 || matches.length >= 40) break;
        if (entry.isSymbolicLink()) continue;
        const file = path.join(canonical, entry.name);
        if (entry.isDirectory()) queue.push(file);
        else if (entry.isFile() && words.every(word => entry.name.toLocaleLowerCase().includes(word))) {
          try { matches.push({ name: entry.name, path: await resolve(file) }); } catch { /* outside grant */ }
        }
      }
    }
    return { matches, partial: count >= 10000 || matches.length >= 40 || queue.length > 0 };
  }
  async function information(file) {
    const resolved = await resolve(file), info = await stat(resolved);
    return { path: resolved, name: path.basename(resolved), kind: info.isDirectory() ? 'folder' : 'file', bytes: info.size, modified: info.mtime.toISOString(), extension: path.extname(resolved) };
  }
  return { resolve, search, information };
}
