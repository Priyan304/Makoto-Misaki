// A separate stdin watchdog also stops mpv if Electron is abruptly terminated.
import { spawn } from 'node:child_process';
const [executable, pipe] = process.argv.slice(2);
if (!executable || !pipe) process.exit(1);
const player = spawn(executable, ['--no-config', '--load-scripts=no', '--access-references=no', '--autoload-files=no', '--idle=yes', '--no-video', '--no-terminal', '--input-terminal=no', '--input-default-bindings=no', '--input-media-keys=no', '--volume=60', '--ytdl=no', `--input-ipc-server=${pipe}`], { stdio: 'ignore', windowsHide: true });
let closing = false;
function close() { if (closing) return; closing = true; player.kill(); }
process.stdin.resume(); process.stdin.on('end', close); process.stdin.on('error', close);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
player.on('error', () => process.exit(1));
player.on('exit', code => process.exit(code || 0));
