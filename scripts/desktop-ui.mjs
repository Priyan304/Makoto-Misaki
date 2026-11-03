import { createServer } from 'node:http';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number(process.env.MISAKI_UI_PORT || 1420);
const bridgePort = Number(process.env.MISAKI_BRIDGE_PORT || 8765);
let origin = `http://127.0.0.1:${port}`;
const token = process.env.MISAKI_SESSION_TOKEN || '';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const withinRoot = file => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const server = createServer(async (request, response) => {
  if (request.url.startsWith('/api/')) {
    const route = new URL(request.url, origin).pathname.slice(4);
    const allowed = (request.method === 'GET' && ['/v1/health', '/v1/providers'].includes(route)) || (['POST', 'DELETE'].includes(request.method) && /^\/v1\/providers\/(gemini|grok)$/.test(route)) || (request.method === 'POST' && (route === '/v1/chat' || /^\/v1\/chat\/[a-f0-9-]{36}\/cancel$/.test(route)));
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    if (!allowed || token.length < 32 || (request.headers.origin && request.headers.origin !== origin)) { response.writeHead(403); response.end(JSON.stringify({ detail: 'Unsupported bridge request' })); return; }
    try {
      let body = Buffer.alloc(0);
      for await (const chunk of request) {
        body = Buffer.concat([body, chunk]);
        if (body.length > (route === '/v1/chat' ? 2097152 : 65536)) { response.writeHead(413); response.end(JSON.stringify({ detail: 'Request too large' })); return; }
      }
      const upstream = await fetch(`http://127.0.0.1:${bridgePort}${route}`, { method: request.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: request.method === 'POST' ? body : undefined, redirect: 'error', signal: AbortSignal.timeout(130000) });
      response.writeHead(upstream.status); response.end(await upstream.text());
    } catch { response.writeHead(503); response.end(JSON.stringify({ detail: 'The local bridge is unavailable. Restart Misaki with npm run desktop.' })); }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid path');
    const candidate = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!withinRoot(candidate)) throw new Error('Outside UI');
    const file = await realpath(candidate);
    if (!withinRoot(file)) throw new Error('Outside UI');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('UI file not found'); }
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.stdin.resume();
process.stdin.on('end', close);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
server.listen(port, '127.0.0.1', () => { origin = `http://127.0.0.1:${server.address().port}`; console.log(`Misaki desktop UI: ${origin}`); });
server.on('error', error => { console.error(`Desktop UI server failed: ${error.code || 'unknown'}`); process.exit(1); });
