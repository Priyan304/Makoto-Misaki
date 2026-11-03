// Portable, pinned first-party mpv CI build; no PATH changes or global install.
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const name = 'mpv-v0.41.0-dev-g9e2ed65eb-41103006513-x86_64-pc-windows-msvc.zip';
const sha256 = 'f55adac4f3635e73e21352cd871ecd819ba0093b5f65dfd0963a6b6738698193';
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Install mpv for your platform and set MISAKI_MPV_PATH to its executable.');
const root = fileURLToPath(new URL('../.cache/mpv/', import.meta.url));
await mkdir(root, { recursive: true });
const archive = path.join(root, name);
let bytes;
try { bytes = await readFile(archive); } catch { /* download below */ }
if (!bytes || createHash('sha256').update(bytes).digest('hex') !== sha256) {
  console.log('Downloading the pinned portable mpv player from mpv-player/mpv…');
  const response = await fetch(`https://github.com/mpv-player/mpv/releases/download/git-release/${name}`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 100_000_000) throw new Error(`mpv download failed (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('mpv checksum mismatch; download was not installed.');
  await writeFile(archive, bytes);
}
execFileSync('tar.exe', ['-xf', archive, '-C', root], { windowsHide: true, stdio: 'pipe' });
if (!(await stat(path.join(root, 'mpv.exe'))).isFile()) throw new Error('mpv.exe is missing from the verified archive.');
await writeFile(path.join(root, 'provenance.json'), JSON.stringify({ repository: 'https://github.com/mpv-player/mpv', archive: name, sha256 }, null, 2));
console.log('Portable media player installed in .cache/mpv. No system settings changed.');
