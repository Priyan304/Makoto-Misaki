import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createActions, validateAction, website } from '../electron/actions.mjs';
import { watchLauncher } from '../electron/launcher-lifecycle.mjs';
import { setTimeout as delay } from 'node:timers/promises';

test('Electron remains alive while its launcher exists and quits only after the launcher exits', async () => {
  let result = 'alive';
  let exits = 0;
  let probes = 0;
  const dispose = watchLauncher(42, () => exits++, { interval: 5, probe: pid => {
    assert.equal(pid, 42); probes++;
    if (result !== 'alive') throw Object.assign(new Error('fixture'), { code: result });
  } });
  try {
    await delay(25);
    assert.ok(probes > 0);
    assert.equal(exits, 0);
    result = 'EPERM'; await delay(25);
    assert.equal(exits, 0);
    result = 'ESRCH'; await delay(25);
    assert.equal(exits, 1);
    await delay(20); assert.equal(exits, 1);
  } finally { dispose(); }
  assert.throws(() => watchLauncher(0, () => {}), /Invalid/);
});

test('desktop boundary rejects commands, URI handlers, credentials and oversized payloads', () => {
  for (const value of [{ type: 'exec', target: 'cmd' }, { type: 'open_file', target: '', command: 'calc' }, { type: 'open_file', target: 'x\n.exe' }, { type: 'open_file', target: 'a'.repeat(2049) }]) assert.throws(() => validateAction(value));
  for (const url of ['file:///C:/test.txt', 'javascript:alert(1)', 'ms-settings:test', 'https://user:pass@example.com']) assert.throws(() => website(url));
  assert.equal(website('https://example.com'), 'https://example.com/');
});

test('chat-approved file actions open directly and validate actual files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'misaki-actions-'));
  const opened = [];
  let selected = path.join(root, 'song.mp3');
  let pickerCancelled = false;
  let failure = '';
  const execute = createActions({
    app: { getPath: () => root }, owner: () => null,
    dialog: { showOpenDialog: async () => ({ canceled: pickerCancelled, filePaths: [selected] }), showMessageBox: async () => { assert.fail('Chat approval must not trigger a second confirmation'); } },
    shell: { openPath: async target => { opened.push(target); return failure; }, showItemInFolder: target => opened.push(target), openExternal: async target => opened.push(target) },
  });
  try {
    await writeFile(selected, 'fixture');
    await writeFile(path.join(root, 'program.exe'), 'fixture');
    await mkdir(path.join(root, 'folder'));
    assert.equal((await execute({ type: 'open_folder', target: 'downloads' })).status, 'completed');
    assert.equal(opened.length, 1);
    assert.equal((await execute({ type: 'open_file', target: selected })).status, 'completed');
    await assert.rejects(execute({ type: 'play_music', target: '' }), /Desktop Agent/);
    await assert.rejects(execute({ type: 'open_file', target: path.join(root, 'program.exe') }), /Programs and scripts/);
    await assert.rejects(execute({ type: 'open_file', target: path.join(root, 'missing.txt') }), /does not exist/);
    await assert.rejects(execute({ type: 'open_file', target: 'relative.txt' }), /absolute path/);
    await assert.rejects(execute({ type: 'open_file', target: '\\\\server\\file.txt' }), /absolute path/);
    await assert.rejects(execute({ type: 'open_file', target: path.join(root, 'folder') }), /not a file/);
    await assert.rejects(execute({ type: 'open_folder', target: selected }), /not a folder/);
    // Resolve a junction before launching: a directory alias may not mask a file.
    await symlink(path.join(root, 'folder'), path.join(root, 'alias'), 'junction');
    assert.equal((await execute({ type: 'open_folder', target: path.join(root, 'alias') })).status, 'completed');
    selected = path.join(root, 'program.exe');
    await assert.rejects(execute({ type: 'open_file', target: '' }), /Programs and scripts/);
    pickerCancelled = true;
    assert.equal((await execute({ type: 'open_file', target: '' })).status, 'cancelled');
    pickerCancelled = false;
    selected = path.join(root, 'song.mp3');
    assert.equal((await execute({ type: 'open_file', target: '' })).status, 'completed');
    assert.equal((await execute({ type: 'open_website', target: 'https://example.com' })).status, 'completed');
    failure = 'No handler';
    await assert.rejects(execute({ type: 'open_file', target: path.join(root, 'song.mp3') }), /default application/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
