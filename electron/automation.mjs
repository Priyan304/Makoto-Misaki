import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { canonicalLocal } from './file-library.mjs';

const exec = promisify(execFile);
export const automationTypes = new Set(['click_mouse', 'type_text', 'press_key', 'scroll_window']);
export function inputArguments(type, target) {
  let value; try { value = JSON.parse(target); } catch { throw new Error('Invalid input action.'); }
  const keys = { click_mouse: ['window', 'x', 'y'], type_text: ['window', 'text'], press_key: ['window', 'key'], scroll_window: ['window', 'steps'] }[type];
  if (!value || !keys || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)) || !/^[a-f0-9-]{36}$/.test(value.window)) throw new Error('Choose a shared application window first.');
  if (type === 'click_mouse' && ![value.x, value.y].every(n => Number.isInteger(n) && n >= 0 && n <= 16384)) throw new Error('Invalid click coordinates.');
  if (type === 'type_text' && (typeof value.text !== 'string' || !value.text.length || value.text.length > 500 || /[\x00-\x1f]/.test(value.text))) throw new Error('Type at most 500 printable characters at a time.');
  if (type === 'press_key' && !['Enter','Tab','Escape','Backspace','Left','Right','Up','Down','Home','End','PageUp','PageDown'].includes(value.key)) throw new Error('That key is not supported.');
  if (type === 'scroll_window' && (!Number.isInteger(value.steps) || !value.steps || Math.abs(value.steps) > 5)) throw new Error('Scroll between 1 and 5 steps in either direction.');
  return value;
}
export function createAutomation({ permissions, screen, dialog, owner, runner = async value => {
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./window-control.ps1', import.meta.url)), '-Payload', Buffer.from(JSON.stringify(value)).toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 8192 });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const messages = ['Window unavailable.', 'Window changed. Share it again.', 'Input is supported only in Notepad, Calculator and Paint.', 'Literal typing is supported only in Notepad.', 'Focus changed; action stopped.', 'Release modifier keys before retrying.', 'Click is outside the window.', 'Another window covers the click.', 'Windows blocked input.'];
    throw new Error(messages.find(message => error.stderr?.includes(message)) || 'Windows could not perform that action. Restore the selected window and try again.');
  }
}, launch = file => spawn(file, [], { shell: false, detached: false, windowsHide: false, stdio: 'ignore' }) }) {
  async function execute(action) {
    if (action.type === 'get_system_info') return { platform: os.platform(), release: os.release(), architecture: os.arch(), processors: os.cpus().length, totalMemory: os.totalmem(), freeMemory: os.freemem() };
    if (action.type === 'get_active_window') return runner({ operation: 'active' });
    if (action.type === 'open_application') {
      const app = permissions.snapshot().applications.find(value => value.id === action.target);
      if (!app || await canonicalLocal(app.path) !== app.path) throw new Error('Choose this application in Preferences first.');
      await new Promise((resolve, reject) => { const child = launch(app.path); child.once('spawn', resolve); child.once('error', () => reject(new Error('The application could not start.'))); });
      return { status: 'completed', message: `Launched ${app.name}.` };
    }
    const value = action.type === 'close_application' ? { window: action.target } : inputArguments(action.type, action.target);
    const grant = await screen.resolveWindow(value.window);
    const detail = action.type === 'type_text' ? value.text : action.type === 'click_mouse' ? `Left click at ${value.x}, ${value.y} inside the window.` : action.type === 'press_key' ? value.key : action.type === 'scroll_window' ? `${value.steps} scroll steps.` : 'Request this window to close. Its application may ask you to save changes. Misaki will not force it to close.';
    const approval = await dialog.showMessageBox(owner(), { type: 'question', title: 'Approve desktop action', message: `${action.type.replaceAll('_', ' ')} — ${grant.title}`, detail, buttons: ['Cancel', 'Allow once'], defaultId: 0, cancelId: 0, noLink: true });
    if (approval.response !== 1) return { status: 'cancelled', message: 'Desktop action cancelled.' };
    // Revalidate after the dialog: permission/window may have been revoked.
    await permissions.check(action.type === 'close_application' ? 'applications' : 'automation');
    const current = await screen.resolveWindow(value.window);
    if (action.type !== 'close_application') owner()?.minimize?.();
    return runner({ ...value, handle: current.handle, title: current.title, operation: action.type });
  }
  return { execute };
}
