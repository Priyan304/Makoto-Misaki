import { app, BrowserWindow, dialog, ipcMain, shell, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActions, website } from './actions.mjs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { watchLauncher } from './launcher-lifecycle.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const focusOnly = process.argv.includes('--focus-existing');
const trace = message => {
  if (focusOnly || process.env.MISAKI_DESKTOP_TRACE !== '1') return;
  const dir = path.join(root, '../.cache');
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `desktop-startup-${process.env.MISAKI_PARENT_PID || process.pid}.log`), `${new Date().toISOString()} ${message}\n`);
};
trace(`entry pid=${process.pid} parent=${process.ppid}`);
let quitting = false;
app.on('before-quit', () => { quitting = true; trace('before-quit'); });
app.on('will-quit', () => trace('will-quit'));
process.on('exit', code => trace(`exit ${code}`));
const port = Number(process.env.MISAKI_UI_PORT || 1420);
const bridgePort = Number(process.env.MISAKI_BRIDGE_PORT || 8765);
if ([port, bridgePort].some(value => !Number.isInteger(value) || value < 1024 || value > 65535)) throw new Error('Invalid local port');
const origin = `http://127.0.0.1:${port}`;
const token = process.env.MISAKI_SESSION_TOKEN;
let win;
function showDesktop() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); win.webContents.invalidate();
}
const authorized = event => !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && new URL(event.senderFrame.url).origin === origin;
const handle = (channel, callback) => ipcMain.handle(channel, (event, value) => {
  if (!authorized(event)) throw new Error('Untrusted desktop request');
  return callback(value);
});
if (!app.requestSingleInstanceLock()) { trace('single-instance lock unavailable'); app.quit(); }
else if (focusOnly) app.exit(3); // No running desktop; let the launcher start its servers.
else {
  trace('single-instance lock acquired');
  app.on('second-instance', showDesktop);
  void app.whenReady().then(async () => {
  trace('app ready');
  if (!token || token.length < 32) {
    dialog.showErrorBox('Start Misaki', 'Launch with npm run desktop so the local bridge starts with an authenticated session.');
    app.quit();
  } else {
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 760, minHeight: 640, title: 'Misaki', backgroundColor: '#171e1b', show: true, autoHideMenuBar: true,
      webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false } });
    if (process.env.MISAKI_PARENT_PID) {
      const dispose = watchLauncher(Number(process.env.MISAKI_PARENT_PID), () => { trace('launcher process exited'); app.quit(); });
      app.once('will-quit', dispose);
    }
    win.once('ready-to-show', () => win.webContents.invalidate());
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(({ url }) => { try { void shell.openExternal(website(url)).catch(() => {}); } catch { /* unsupported URI */ } return { action: 'deny' }; });
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith(`${origin}/`)) {
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:${port}; object-src 'none'; frame-src 'none'; base-uri 'self'`] } });
      } else callback({});
    });
    const execute = createActions({ app, dialog, shell, owner: () => win });
    let interfaceReady = false;
    handle('misaki:interface', state => {
      if (!['ready', 'error'].includes(state)) throw new Error('Invalid interface state');
      if (state === 'ready') {
        if (!interfaceReady) {
          showDesktop();
          trace(`renderer ready; window visible=${win.isVisible()}`);
          console.log('Misaki interface ready.');
        }
        interfaceReady = true;
      } else { trace('renderer startup error'); console.error('Misaki interface failed to render. Use Reload interface in its window.'); }
    });
    win.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) interfaceReady = false; });
    win.webContents.on('render-process-gone', (_event, details) => {
      if (quitting || win.isDestroyed()) return;
      trace(`renderer stopped: ${details.reason}`);
      console.error(`Misaki renderer stopped (${details.reason}).`);
      dialog.showMessageBox(win, { type: 'error', title: 'Misaki interface stopped', message: 'The interface stopped responding.', detail: 'Reload the interface to try again.', buttons: ['Reload interface', 'Close Misaki'], defaultId: 0, cancelId: 1 }).then(({ response }) => { if (win.isDestroyed()) return; if (response === 0) void win.loadURL(origin); else win.close(); }).catch(() => {});
    });
    handle('misaki:action', execute);
    handle('misaki:top', value => { if (typeof value !== 'boolean') throw new Error('Invalid window option'); win.setAlwaysOnTop(value); });
    handle('misaki:backend', async value => {
      const method = value?.method;
      const route = value?.path;
      const allowed = (method === 'GET' && ['/v1/health', '/v1/providers'].includes(route)) || (['POST', 'DELETE'].includes(method) && /^\/v1\/providers\/(gemini|grok)$/.test(route)) || (method === 'POST' && (route === '/v1/chat' || /^\/v1\/chat\/[a-f0-9-]{36}\/cancel$/.test(route)));
      if (!allowed || (value.body !== undefined && JSON.stringify(value.body).length > 65536)) throw new Error('Unsupported bridge request');
      try {
        const response = await fetch(`http://127.0.0.1:${bridgePort}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(value.body ?? {}) : undefined, signal: AbortSignal.timeout(130000), redirect: 'error' });
        try { return { status: response.status, body: await response.json() }; }
        catch { return { status: response.ok ? 502 : response.status, body: { detail: `The local bridge returned an unreadable response (${response.status}). Check the Misaki launcher terminal and restart with npm run desktop.` } }; }
      } catch (error) {
        const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return { status: timeout ? 504 : 503, body: { detail: timeout ? 'The local bridge timed out. Reconnect and try again.' : 'The Electron app cannot reach its local bridge. Close Misaki and restart it with npm run desktop, then reconnect your provider.' } };
      }
    });
    globalShortcut.register('CommandOrControl+Shift+M', showDesktop);
    await win.loadURL(origin).catch(error => {
      // Reload/HMR can replace the initial navigation while scripts are loading.
      // This does not mean the application or its bridge should be shut down.
      if (error.code === 'ERR_ABORTED' || error.errno === -3) { trace('page navigation replaced'); return; }
      throw error;
    });
    trace('page loaded');
  }
  }).catch(error => { trace(`startup error ${error.message}`); console.error('Electron could not start:', error.message); app.quit(); });
  app.on('window-all-closed', () => { trace('all windows closed'); app.quit(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
