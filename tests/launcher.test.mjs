import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = new URL('../', import.meta.url);
// Isolated ports leave the user's running Misaki session untouched.
const bridgePort = 18765, uiPort = 11420;
const launch = (desktop = false, profile) => {
  const child = spawn(process.execPath, ['scripts/dev.mjs', ...(desktop ? ['--desktop', `--user-data-dir=${profile}`] : [])], { cwd: root, env: { ...process.env, GEMINI_API_KEY: '', GROK_API_KEY: '', MISAKI_BRIDGE_PORT: String(bridgePort), MISAKI_UI_PORT: String(uiPort), MISAKI_DESKTOP_TRACE: desktop ? '1' : '0' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  return { child, output: () => output };
};
const listening = port => new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => { socket.destroy(); resolve(false); });
});
async function waitFor(predicate, message, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await delay(100);
  }
  assert.fail(message());
}

test('launcher conflict reporting and cleanup after abrupt parent termination', { timeout: 60000 }, async () => {
  for (const port of [bridgePort, uiPort]) assert.equal(await listening(port), false, `Stop the existing server on ${port} before running launcher tests.`);
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(bridgePort, '127.0.0.1', resolve));
  try {
    const conflict = launch();
    const [code] = await once(conflict.child, 'exit');
    assert.equal(code, 1);
    assert.match(conflict.output(), /Port 18765 is already in use/);
    assert.doesNotMatch(conflict.output(), /Bridge did not start|Install backend/);
    assert.equal(await listening(uiPort), false);
  } finally { await new Promise(resolve => blocker.close(resolve)); }

  // Repeated browser starts and an Electron start must release the owned servers.
  for (const desktop of [false, false, true]) {
    const profile = desktop ? await mkdtemp(path.join(tmpdir(), 'misaki-launcher-')) : undefined;
    const session = launch(desktop, profile);
    let electronPid;
    const trace = () => readFile(new URL(`.cache/desktop-startup-${session.child.pid}.log`, root), 'utf8').catch(() => '');
    try {
      await waitFor(async () => {
        try { return (await fetch(`http://127.0.0.1:${uiPort}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok; }
        catch { return false; }
      }, () => `Launcher did not become ready:\n${session.output()}`);
      if (desktop) {
        await waitFor(async () => (await trace()).includes('renderer ready'), () => `Electron did not render its interface:\n${session.output()}`);
        const document = await (await fetch(`http://127.0.0.1:${uiPort}/`)).text();
        assert.match(document, /\/assets\/index-/);
        assert.doesNotMatch(document, /\/@vite\/client|\/src\/main.tsx/);
        const script = document.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
        const asset = await fetch(`http://127.0.0.1:${uiPort}${script}`);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get('content-type'), /javascript/);
        for (const unsafePath of ['/backend/app.py', '/%2e%2e%2fbackend/app.py', '/%5c..%5cbackend%5capp.py']) assert.equal((await fetch(`http://127.0.0.1:${uiPort}${unsafePath}`)).status, 404);
        assert.equal((await fetch(`http://127.0.0.1:${uiPort}/api/v1/providers`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
        electronPid = Number((await trace()).match(/entry pid=(\d+)/)?.[1]);
        assert.ok(electronPid > 0);
        if (process.platform === 'win32') {
          // A renderer can report ready while SW_HIDE leaves no visible native
          // window. Check the OS handle, not just DOM or an offscreen screenshot.
          await waitFor(() => Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${electronPid}).MainWindowHandle.ToInt64()`], { windowsHide: true, encoding: 'utf8' }).trim()) > 0, () => 'Electron rendered but did not expose a visible Windows window.');
        }
        // The previous Windows stdin watchdog exited just after loadURL completed.
        await delay(5000);
        assert.equal(session.child.exitCode, null, session.output());
        assert.doesNotMatch(await trace(), /before-quit|launcher stdin ended/);
        assert.doesNotThrow(() => process.kill(electronPid, 0));
        const repeat = launch(true, profile);
        const [code] = await once(repeat.child, 'exit');
        assert.equal(code, 0, repeat.output());
        assert.match(repeat.output(), /already running.*window forward/);
        assert.doesNotMatch(repeat.output(), /already in use|Started server process/);
        assert.equal(session.child.exitCode, null);
        assert.doesNotThrow(() => process.kill(electronPid, 0));
        assert.equal((await fetch(`http://127.0.0.1:${uiPort}/api/v1/health`)).status, 200);
      }
    } finally {
      // SIGKILL deliberately bypasses the launcher's signal cleanup handlers.
      session.child.kill('SIGKILL');
      await waitFor(async () => !(await listening(bridgePort)) && !(await listening(uiPort)), () => `Server survived its launcher:\n${session.output()}`);
      if (electronPid) {
        await waitFor(() => { try { process.kill(electronPid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } }, () => 'Electron survived its terminated launcher.');
        // A Windows job may terminate the owned child before its PID watcher runs.
        // Either way the actual Electron process, not just its servers, must exit.
      }
      if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
});
