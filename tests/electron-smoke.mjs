import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer as createHttpServer } from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'misaki-electron-'));
let server;
const backendCalls = [];
const configured = { gemini: false, grok: false };
let malformed = false;
const bridge = createHttpServer(async (request, response) => {
  if (malformed) { response.writeHead(500, { 'Content-Type': 'text/plain' }); response.end('Internal server error'); return; }
  response.setHeader('Content-Type', 'application/json');
  if (request.headers.authorization !== 'Bearer electron-test-session-not-a-real-credential') {
    response.writeHead(401); response.end(JSON.stringify({ detail: 'Authenticated launcher session required' })); return;
  }
  let source = '';
  for await (const chunk of request) source += chunk;
  const body = source ? JSON.parse(source) : undefined;
  backendCalls.push({ path: request.url, body, authorization: request.headers.authorization });
  const status = provider => ({ provider, configured: configured[provider], models: configured[provider] ? [`${provider}-test`] : [] });
  let data;
  if (request.url === '/v1/health') data = { api_version: '1', status: 'ready', models: ['qwen3:4b'], route: 'local', detail: 'Test Ollama' };
  else if (request.url === '/v1/providers') data = { providers: ['gemini', 'grok'].map(status) };
  else if (/^\/v1\/providers\/(gemini|grok)$/.test(request.url)) {
    const provider = request.url.split('/').at(-1);
    if (body?.api_key === 'test-invalid-api-key') {
      response.writeHead(403); response.end(JSON.stringify({ detail: 'Gemini rejected this API key or model access. Check your key and account permissions.' })); return;
    }
    configured[provider] = request.method === 'POST';
    data = status(provider);
  } else if (request.url === '/v1/chat') data = { request_id: body.request_id, reply: 'I can open that for you.', actions: [{ type: body.message.includes('music') ? 'play_music' : 'open_folder', target: body.message.includes('music') ? '' : body.message.includes('project folder') ? path.resolve('.') : 'downloads' }], route: body.mode, status: 'ok', model: body.model, citations: [], latency_ms: 1 };
  else { response.writeHead(404); data = { detail: 'Unknown test endpoint' }; }
  response.end(JSON.stringify(data));
});
let desktop;
try {
  await writeFile(path.join(root, 'sample.mp3'), 'test audio fixture');
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  const bridgePort = bridge.address().port;
  const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
  server = spawn(process.execPath, ['scripts/desktop-ui.mjs'], { env: { ...env, MISAKI_UI_PORT: '0', MISAKI_BRIDGE_PORT: String(bridgePort), MISAKI_SESSION_TOKEN: 'electron-test-session-not-a-real-credential' }, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Built UI server did not start')), 10000);
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Built UI server exited early')); });
  });
  const launch = () => electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: ['electron/main.mjs', `--user-data-dir=${path.join(root, 'profile')}`], env: { ...env, MISAKI_SESSION_TOKEN: 'electron-test-session-not-a-real-credential', MISAKI_UI_PORT: String(port), MISAKI_BRIDGE_PORT: String(bridgePort) }, timeout: 30000 });
  desktop = await launch();
  desktop.process().stderr.on('data', value => process.stderr.write(value));
  desktop.process().stdout.on('data', value => process.stdout.write(value));
  await desktop.evaluate(({ dialog, shell }, folder) => {
    globalThis.testCalls = []; globalThis.opened = []; globalThis.pickerCancelled = false; globalThis.openError = '';
    globalThis.nativeOpenPath = shell.openPath;
    dialog.showMessageBox = async (_window, options) => { globalThis.testCalls.push({ kind: 'confirmation', detail: options.detail }); return { response: 0 }; };
    dialog.showOpenDialog = async () => ({ canceled: globalThis.pickerCancelled, filePaths: [folder + '/sample.mp3'] });
    shell.openPath = async value => { if (globalThis.openError) return globalThis.openError; globalThis.opened.push(value); return ''; };
    shell.openExternal = async value => { globalThis.opened.push(value); };
  }, root);
  const page = await desktop.firstWindow();
  await page.waitForURL(`http://127.0.0.1:${port}/`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.live2d-avatar[data-status="ready"]').waitFor({ timeout: 30000 });
  await expect(page.locator('#startup-screen')).toHaveCount(0);
  assert.equal(await page.locator('script[src*="/assets/index-"]').count(), 1);
  const health = await page.evaluate(() => window.misakiDesktop.backend('/v1/health', 'GET'));
  assert.equal(health.status, 200);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.misakiDesktop.action), 'function');
  assert.equal(await page.evaluate(() => JSON.stringify(window.misakiDesktop).includes('token')), false);
  await assert.rejects(page.evaluate(() => window.misakiDesktop.backend('/not-allowed', 'GET')), /Unsupported/);
  await assert.rejects(page.evaluate(() => window.misakiDesktop.action({ type: 'exec', target: 'cmd' })), /Unsupported/);
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Open my downloads folder');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
  assert.equal(await desktop.evaluate(() => globalThis.opened.length), 0);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.desktop-action').first().getByRole('status')).toContainText('Opened');
  assert.equal(await desktop.evaluate(() => globalThis.opened.length), 1);
  assert.equal(await desktop.evaluate(() => globalThis.testCalls.length), 0);
  // Cancelling the native picker must leave the original action retryable.
  await desktop.evaluate(() => { globalThis.pickerCancelled = true; });
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Play music');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Choose music', exact: true }).click();
  await page.getByRole('button', { name: 'Try again', exact: true }).click({ trial: true });
  assert.equal(await desktop.evaluate(() => globalThis.opened.length), 1);
  const beforeRetry = backendCalls.filter(value => value.path === '/v1/chat').length;
  await desktop.evaluate(() => { globalThis.pickerCancelled = false; });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('Desktop result: Opened sample.mp3 in your default music player.', { exact: true }).waitFor();
  assert.equal(backendCalls.filter(value => value.path === '/v1/chat').length, beforeRetry);
  // A default-app error must also allow retry without regenerating the action.
  await desktop.evaluate(() => { globalThis.openError = 'Fixture default application failure'; });
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Open my downloads folder');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.desktop-action').last().getByRole('status')).toContainText('Windows could not open');
  await desktop.evaluate(() => { globalThis.openError = ''; });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.desktop-action').last().getByRole('status')).toContainText('Opened');
  // Exercise real renderer -> preload -> main -> HTTP provider configuration.
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  for (const provider of ['gemini', 'grok']) {
    const name = provider === 'gemini' ? 'Gemini' : 'Grok';
    await page.getByRole('group', { name: 'Model provider', exact: true }).getByRole('button', { name, exact: true }).click();
    if (provider === 'gemini') {
      await page.getByLabel('Gemini API key', { exact: true }).fill('test-invalid-api-key');
      await page.getByRole('button', { name: 'Connect & load models' }).click();
      await page.getByRole('alert').filter({ hasText: 'Gemini rejected this API key' }).waitFor();
    }
    await page.getByLabel(`${name} API key`, { exact: true }).fill('test-valid-fake-key-not-a-real-credential');
    await page.getByRole('button', { name: 'Connect & load models' }).click();
    await page.getByText('Key connected for this session', { exact: true }).waitFor();
    await expect(page.getByLabel(`${name} API key`, { exact: true })).toHaveValue('');
  }
  await page.getByRole('button', { name: '← Back to your companion' }).click();
  for (const provider of ['gemini', 'grok', 'local']) {
    await page.evaluate(provider => {
      localStorage.setItem('misaki.settings.v1', JSON.stringify({ provider, model: 'qwen3:4b', cloudModels: { gemini: 'gemini-test', grok: 'grok-test' }, reducedMotion: true }));
    }, provider);
    await page.reload();
    await page.getByText(provider === 'local' ? 'Here for you · running locally' : `Here for you · ${provider === 'gemini' ? 'Gemini' : 'Grok'} cloud`, { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Play music');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Choose music', exact: true }).click();
    await page.getByText('Desktop result: Opened sample.mp3 in your default music player.', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Thank you');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.locator('.message.assistant').nth(2).waitFor();
  }
  const calls = backendCalls.filter(value => value.body?.message);
  assert.ok(calls.every(value => value.body.desktop === true));
  assert.ok(calls.every(value => value.authorization === 'Bearer electron-test-session-not-a-real-credential'));
  for (const provider of ['local', 'gemini', 'grok']) assert.ok(calls.some(value => value.body.mode === provider && value.body.history.some(turn => turn.content.startsWith('Desktop result: Opened'))));
  assert.equal(await desktop.evaluate(() => globalThis.opened.length), 6);
  assert.equal(await desktop.evaluate(() => globalThis.testCalls.length), 0);
  // A second window with the same preload still cannot invoke privileged IPC.
  const blocked = await desktop.evaluate(async ({ BrowserWindow }, preload) => {
    const main = BrowserWindow.getAllWindows()[0];
    const other = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    try {
      await other.loadURL(main.webContents.getURL());
      return await other.webContents.executeJavaScript(`Promise.resolve().then(() => window.misakiDesktop.action({type:'open_folder',target:'downloads'})).then(() => 'unexpected success', error => error.message)`);
    } finally { other.destroy(); }
  }, path.resolve('electron/preload.cjs'));
  assert.match(blocked, /Untrusted desktop request/);
  malformed = true;
  const unreadable = await page.evaluate(() => window.misakiDesktop.backend('/v1/providers', 'GET'));
  assert.equal(unreadable.status, 500);
  assert.match(unreadable.body.detail, /unreadable response \(500\).*npm run desktop/);
  malformed = false;
  bridge.closeAllConnections();
  await new Promise(resolve => bridge.close(resolve));
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  await page.getByRole('group', { name: 'Model provider', exact: true }).getByRole('button', { name: 'Gemini', exact: true }).click();
  await page.getByLabel('Gemini API key', { exact: true }).fill('test-valid-fake-key-not-a-real-credential');
  await page.getByRole('button', { name: 'Connect & load models' }).click();
  await page.getByRole('alert').filter({ hasText: 'The Electron app cannot reach its local bridge.' }).waitFor();
  await new Promise(resolve => bridge.listen(bridgePort, '127.0.0.1', resolve));
  await page.getByRole('button', { name: 'Connect & load models' }).click();
  await page.getByText('Key connected for this session', { exact: true }).waitFor();
  await expect(page.getByLabel('Gemini API key', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Use Gemini', exact: true }).click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/electron-desktop.png' });
  if (process.env.MISAKI_TEST_REAL_OPEN === '1') {
    await desktop.evaluate(({ shell }) => { shell.openPath = globalThis.nativeOpenPath; });
    await page.getByRole('textbox', { name: 'Message Misaki' }).fill('Open the Misaki project folder');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.locator('.desktop-action').filter({ hasText: path.resolve('.') }).getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByText('Desktop result: Opened Misaki.', { exact: true }).waitFor();
    console.log('Real OS check: Windows accepted opening C:\\learn\\Misaki with its file manager, through the chat Open button.');
  }
  console.log('Electron passed: direct chat-approved actions, picker cancellation and retry, default-app failure and retry, real loopback HTTP, provider setup, bridge reconnect, actual avatar and sandboxed IPC. Cloud calls are mocked.');
  // Repeat with the same browser profile and built files to cover warm startup.
  await desktop.close(); desktop = await launch();
  const warm = await desktop.firstWindow();
  await expect(warm.getByRole('textbox', { name: 'Message Misaki' })).toBeVisible({ timeout: 30000 });
  await expect(warm.locator('#startup-screen')).toHaveCount(0);
  await warm.locator('.live2d-avatar[data-status="ready"]').waitFor({ timeout: 30000 });
  await warm.screenshot({ path: 'test-results/electron-warm-start.png' });
  console.log('Built desktop UI passed both cold and warm profile startup with the actual avatar.');
} finally {
  if (desktop) await desktop.close();
  bridge.closeAllConnections();
  await new Promise(resolve => bridge.close(resolve));
  if (server && server.exitCode === null) { server.stdin.end(); await once(server, 'exit'); }
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
