import { mkdir, writeFile } from 'node:fs/promises';

const model = process.env.MISAKI_SMOKE_MODEL || 'qwen3:4b';
const result = { checked_at: new Date().toISOString(), model, status: 'failed' };
try {
  const health = await fetch('http://127.0.0.1:1420/api/v1/health', { signal: AbortSignal.timeout(8000) });
  result.health = await health.json();
  if (!health.ok || result.health.status !== 'ready') throw new Error('Start npm run dev and open Ollama first.');
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:1420/api/v1/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(135000),
    body: JSON.stringify({ request_id: crypto.randomUUID(), model, mode: 'local', history: [], message: 'Say hello in one short sentence and tell me your name.' }),
  });
  result.elapsed_ms = Math.round(performance.now() - started);
  result.http_status = response.status;
  result.response = await response.json();
  if (!response.ok || result.response.status !== 'ok' || !result.response.reply || result.response.route !== 'local') throw new Error('Local inference did not return a valid successful reply.');
  if (result.response.reply.length > 300 || /<\/?think>/.test(result.response.reply) || !/Makoto|Misaki/i.test(result.response.reply)) {
    result.response.reply_characters = result.response.reply.length;
    delete result.response.reply;
    throw new Error('The greeting did not contain a concise final answer with the companion name.');
  }
  result.status = 'passed';
} catch (error) { result.error = error.message; process.exitCode = 1; }
await mkdir('docs/experiments', { recursive: true });
await writeFile('docs/experiments/local-smoke.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
