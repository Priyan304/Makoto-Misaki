import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = process.argv.includes('--desktop');
const desktopProfile = process.argv.find(arg => arg.startsWith('--user-data-dir='));
const bridgePort = Number(process.env.MISAKI_BRIDGE_PORT || 8765);
const uiPort = Number(process.env.MISAKI_UI_PORT || 1420);
if ([bridgePort, uiPort].some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || bridgePort === uiPort) throw new Error('Choose distinct valid MISAKI_BRIDGE_PORT and MISAKI_UI_PORT values.');
const env = { ...process.env, MISAKI_SESSION_TOKEN: randomBytes(32).toString('hex'), PYTHONUNBUFFERED: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.MISAKI_PYTHON || (existsSync(venv) ? venv : 'python');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  // EOF also reaches children if Windows abruptly terminates this launcher.
  for (const child of children) {
    child.stdin?.end();
    if (desktop && child === children.at(-1)) child.kill();
  }
  setTimeout(() => {
    for (const child of children) { if (child.exitCode === null) child.kill(); }
    process.exit(code);
  }, 5000).unref();
}
function run(command, args, extraEnv = {}, windowsHide = true) {
  const child = spawn(command, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['pipe', 'inherit', 'inherit'], windowsHide });
  children.push(child);
  child.stdin.on('error', () => { /* child already stopped */ });
  child.on('error', err => { console.error(err.message); stop(1); });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`Misaki child exited: ${path.basename(command)} (${code === null ? signal : `code ${code}`}).`);
      stop(code ?? 1);
    }
  });
  return child;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
// Electron's single-instance mechanism focuses an existing window without
// replacing its bridge token, provider keys or current conversation.
let electron;
const electronArgs = [path.join(root, 'electron/main.mjs'), ...(desktopProfile ? [desktopProfile] : [])];
if (desktop) {
  electron = createRequire(import.meta.url)('electron');
  const code = await new Promise((resolve, reject) => {
    const probe = spawn(electron, [...electronArgs, '--focus-existing'], { cwd: root, env, stdio: 'ignore', windowsHide: true });
    probe.once('error', reject);
    probe.once('exit', resolve);
  });
  if (code === 0) { console.log('Misaki is already running. Brought its desktop window forward.'); process.exit(0); }
  if (code !== 3) { console.error(`Could not check the existing Misaki desktop (exit ${code}).`); process.exit(1); }
}
// Detect conflicts before creating a second bridge with a different token.
for (const port of [bridgePort, uiPort]) {
  try {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
  } catch (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the existing Misaki session before starting another.`
      : `Cannot use port ${port}: ${error.message}`);
    process.exit(1);
  }
}
if (desktop) {
  console.log('Building the Misaki desktop interface…');
  for (const args of [[path.join(root, 'node_modules/typescript/bin/tsc'), '-b'], [path.join(root, 'node_modules/vite/bin/vite.js'), 'build']]) {
    const code = await new Promise((resolve, reject) => {
      const build = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
      build.once('error', reject); build.once('exit', resolve);
    });
    if (code !== 0) { console.error('Desktop build failed. Fix the error above before starting Misaki.'); process.exit(1); }
  }
}
run(python, ['-m', 'backend'], { MISAKI_MANAGED_STDIN: '1' });
let ready = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/health`, {
      headers: { Authorization: `Bearer ${env.MISAKI_SESSION_TOKEN}` }, signal: AbortSignal.timeout(3000),
    });
    if (response.ok) { ready = true; break; }
    if (response.status === 401) {
      console.error(`Port ${bridgePort} belongs to another session. Stop that session before starting Misaki.`);
      stop(1); break;
    }
  } catch { /* backend still starting */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ready && !stopping) { console.error('Bridge did not start. Check the errors above and backend/requirements.lock.txt.'); stop(1); }
else if (!stopping) {
  run(process.execPath, [path.join(root, desktop ? 'scripts/desktop-ui.mjs' : 'scripts/dev-ui.mjs')]);
  if (desktop) {
    let uiReady = false;
    for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${uiPort}`, { signal: AbortSignal.timeout(1000) })).ok) { uiReady = true; break; } } catch { /* Vite starting */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!uiReady && !stopping) { console.error('The desktop UI did not start.'); stop(1); }
    else if (!stopping) {
      // Electron is the visible GUI, not a background helper. SW_HIDE startup
      // hints can override its first ShowWindow when launched from a console.
      run(electron, electronArgs, { MISAKI_PARENT_PID: String(process.pid) }, false);
    }
  }
  if (!stopping) console.log(`\n  ${desktop ? 'Misaki desktop started' : 'Misaki is ready'} at http://127.0.0.1:${uiPort}\n  Selected cloud providers send chat to their APIs. Ctrl+C to stop.\n`);
}
