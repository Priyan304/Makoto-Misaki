import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const venv = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const result = spawnSync(process.env.MISAKI_PYTHON || (existsSync(venv) ? venv : 'python'), ['-m', 'unittest', 'discover', '-s', 'backend/tests', '-v'], { stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
