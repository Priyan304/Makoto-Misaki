import { createServer } from 'vite';

// The launcher owns stdin. Closing it means the launcher exited or was killed.
const server = await createServer();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.stdin.resume();
process.stdin.on('end', () => void close());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void close());
await server.listen();
server.printUrls();
