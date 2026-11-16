import { test, expect, type Page } from '@playwright/test';

async function fixture(page: Page, enabled = true) {
  await page.clock.install();
  await page.addInitScript(enabled => {
    localStorage.setItem('misaki.settings.v1', JSON.stringify({ provider: 'gemini', cloudModels: { gemini: 'gemini-test' }, reducedMotion: true, idleConversations: enabled, idleFrequency: 120, idleCooldown: 300 }));
    (window as any).idleFixture = { calls: [], playing: false, hold: false, release: null };
    window.misakiDesktop = {
      backend: async (path: string, _method: string, body?: unknown) => {
        if (path === '/v1/health') return { status: 200, body: { api_version: '1', status: 'ready', models: ['qwen3:4b'], route: 'local', detail: 'Fixture' } };
        if (path === '/v1/providers') return { status: 200, body: { providers: [{ provider: 'gemini', configured: true, models: ['gemini-test'] }] } };
        if (path.endsWith('/cancel')) return { status: 200, body: { status: 'cancelled' } };
        const f = (window as any).idleFixture;
        f.calls.push(body);
        if (f.hold) await new Promise(resolve => { f.release = resolve; });
        const input = body as { request_id: string; mode: string; kind?: string };
        return { status: 200, body: { request_id: input.request_id, reply: input.kind === 'idle' ? `A fresh conversation starter ${f.calls.length}.` : 'A normal reply.', emotion: 'embarrassed', expression: 'blush', motion: 'nod', intensity: .7, actions: [{ type: 'play_media', target: '' }], route: input.mode, status: 'ok', citations: [], latency_ms: 1 } };
      },
      action: async () => { throw Error('Idle must never execute actions'); },
      mediaStatus: async () => ({ state: (window as any).idleFixture.playing ? 'playing' : 'stopped' }) as any,
      desktopContext: async () => ({}), stopSharing: async () => {}, setAlwaysOnTop: async () => {}, reportInterface: async () => {},
    } as any;
  }, enabled);
  await page.goto('/');
  await expect(page.getByText('Here for you · Gemini cloud')).toBeVisible();
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  // Install before application timers, then pause once the model has loaded.
  // No test-only timer shortcuts exist in production.
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
async function advance(page: Page, seconds: number) { await page.clock.fastForward(seconds * 1000); }
const count = (page: Page) => page.evaluate(() => (window as any).idleFixture.calls.length);

test('opt-in starter is displayed without fake user messages or actions, and stops until interaction', async ({ page }) => {
  await fixture(page);
  await advance(page, 170);
  await expect(page.locator('.message.assistant')).toHaveCount(1);
  await expect(page.locator('.message.user')).toHaveCount(0);
  await expect(page.locator('.desktop-actions')).toHaveCount(0);
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-emotion', 'embarrassed');
  const request = await page.evaluate(() => (window as any).idleFixture.calls[0]);
  expect(request.kind).toBe('idle');
  expect(request).not.toHaveProperty('desktop'); expect(request).not.toHaveProperty('screen'); expect(request).not.toHaveProperty('desktop_context');
  await advance(page, 1200); expect(await count(page)).toBe(1);
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('typing');
  await advance(page, 170); expect(await count(page)).toBe(1);
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('');
  await advance(page, 170);
  await expect(page.locator('.message.assistant')).toHaveCount(2);
  await expect(page.getByText('Right here with you', { exact: true })).toBeVisible();
});

test('disabled, music, hidden windows and desktop tasks suppress starters', async ({ page }) => {
  await fixture(page, false);
  await advance(page, 200); expect(await count(page)).toBe(0);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('heading', { name: 'Companion behavior' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/companion-behavior-settings.png' });
  await page.getByRole('switch', { name: 'Conversation starters' }).click();
  await page.getByRole('button', { name: '← Back to your companion' }).click();
  await page.evaluate(() => { (window as any).idleFixture.playing = true; });
  await advance(page, 200); expect(await count(page)).toBe(0);
  await page.evaluate(() => { (window as any).idleFixture.playing = false; Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await advance(page, 200); expect(await count(page)).toBe(0);
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new CustomEvent('misaki-desktop-task', { detail: { phase: 'start' } })); });
  await advance(page, 200); expect(await count(page)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('misaki-desktop-task', { detail: { phase: 'end', status: 'completed' } })));
  await advance(page, 170); await expect(page.locator('.message.assistant')).toHaveCount(1);
});

test('typing cancels a pending starter and late replies cannot interrupt the conversation', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { (window as any).idleFixture.hold = true; });
  await advance(page, 170);
  expect(await count(page)).toBe(1);
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('I am back');
  await page.evaluate(() => { (window as any).idleFixture.release?.(); });
  await advance(page, 2);
  await expect(page.locator('.message.assistant')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('switch', { name: 'Conversation starters' }).click();
  await page.getByRole('button', { name: '← Back to your companion' }).click();
  await advance(page, 900); expect(await count(page)).toBe(1);
});

test('music beginning during generation drops the reply and provider switches invalidate pending starters', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { (window as any).idleFixture.hold = true; });
  await advance(page, 170); expect(await count(page)).toBe(1);
  await page.evaluate(() => { const f = (window as any).idleFixture; f.playing = true; f.release?.(); });
  await advance(page, 1); await expect(page.locator('.message.assistant')).toHaveCount(0);
  await page.evaluate(() => { (window as any).idleFixture.playing = false; });
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('hello');
  await page.getByRole('textbox', { name: 'Message Misaki' }).fill('');
  await advance(page, 350); expect(await count(page)).toBe(2);
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('group', { name: 'Choose provider' }).getByRole('button', { name: 'Local · Ollama', exact: true }).click();
  await page.evaluate(() => { (window as any).idleFixture.release?.(); });
  await advance(page, 1); await expect(page.locator('.message.assistant')).toHaveCount(0);
});
