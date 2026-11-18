import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const uv = path.join(root, '.cache/voice-tools', win ? 'bin/uv.exe' : 'bin/uv');
const python = path.join(root, '.cache/voice-env', win ? 'Scripts/python.exe' : 'bin/python');
const env = { ...process.env, UV_PYTHON_INSTALL_DIR: path.join(root, '.cache/voice-python'), UV_CACHE_DIR: path.join(root, '.cache/uv'), PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' };
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  // Windows venv launchers can own a second Python process. Stop only the
  // process tree created by this command, so cancelled inference frees the GPU.
  const stop = () => {
    if (!child.pid || child.exitCode !== null) return;
    if (win) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
    else child.kill();
  };
  const cleanup = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('error', error => { cleanup(); reject(error); });
  child.once('exit', code => { cleanup(); code === 0 ? resolve() : reject(new Error(`Voice command exited with code ${code}.`)); });
});
try {
  const [command, ...args] = process.argv.slice(2);
  const reference = () => run(python, ['-m', 'voice.reference']);
  if (command === 'reference') {
    if (!existsSync(python)) throw new Error('Run npm run setup:voice first.');
    await reference();
  } else if (command === 'setup') {
    if (!existsSync(uv)) await run(process.env.MISAKI_SETUP_PYTHON || 'python', ['-m', 'pip', 'install', '--target', '.cache/voice-tools', 'uv==0.9.11']);
    await run(uv, ['python', 'install', '3.11.13', '--native-tls']);
    if (!existsSync(python)) await run(uv, ['venv', '.cache/voice-env', '--python', '3.11.13', '--native-tls']);
    console.log('Installing the isolated speech runtime (the GPU download is several GB)…');
    await run(uv, ['pip', 'install', '--quiet', '--python', python, '--native-tls', '--index', 'https://download.pytorch.org/whl/cu124', '--index-strategy', 'unsafe-best-match', '-r', win ? 'voice/requirements.windows.lock.txt' : 'voice/requirements.txt', '--override', 'voice/overrides.txt']);
    console.log('Downloading the pinned V3 voice model…');
    await run(python, ['-m', 'voice.poc', 'download']);
    await reference();
  } else {
    if (!existsSync(python)) throw new Error('Run npm run setup:voice first.');
    await run(python, ['-m', 'voice.poc', command || 'generate', ...args]);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
