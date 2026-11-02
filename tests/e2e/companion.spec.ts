import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expressionChoices } from '../../src/live2d/expressions';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Buffer } } };
};
function changedPixels(first: Buffer, second: Buffer) {
  const a = PNG.sync.read(first), b = PNG.sync.read(second);
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    // Ignore tiny GPU antialiasing roundoff between otherwise identical frames.
    if ([0, 1, 2, 3].some(channel => Math.abs(a.data[i + channel] - b.data[i + channel]) > 2)) changed++;
  }
  return changed;
}

const ready = { api_version: '1', status: 'ready', models: ['qwen3:4b'], route: 'local', detail: 'Ollama connected' };
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/providers', route => route.fulfill({ json: { providers: [{ provider: 'gemini', configured: false, models: [] }, { provider: 'grok', configured: false, models: [] }] } }));
});
test('startup script failure stays visible and reload recovers the interface', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("startup test fixture");' }));
  await page.goto('/');
  await expect(page.getByText('Misaki could not finish opening', { exact: true })).toBeVisible();
  await expect(page.getByText('Startup code: UI_SCRIPT_ERROR', { exact: true })).toBeVisible();
  await page.unroute('**/src/main.tsx');
  await page.getByRole('button', { name: 'Reload interface', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message Misaki' })).toBeVisible();
  await expect(page.locator('#startup-screen')).toHaveCount(0);
});

test('React render failure offers reload without clearing preferences', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.addInitScript(() => { localStorage.setItem('misaki.settings.v1', JSON.stringify({ model: 'qwen3:4b', provider: 'local', reducedMotion: true, scale: 1.15 })); });
  await page.route('**/src/app/App.tsx', route => route.fulfill({ contentType: 'text/javascript', body: 'export default function App(){throw new Error("render test fixture");}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Misaki’s interface encountered an error');
  await expect(page.locator('#startup-screen')).toHaveCount(0);
  await page.unroute('**/src/app/App.tsx');
  await page.getByRole('button', { name: 'Reload interface', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message Misaki' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('misaki.settings.v1') || '{}').scale)).toBe(1.15);
});
test('offline launch, settings, mobile and compact recovery', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: { ...ready, status: 'offline', models: [], detail: 'Open Ollama, then reconnect.' } }));
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Misaki/ })).toBeVisible();
  await page.getByRole('button', { name: 'Connect a free local model to begin' }).click();
  await expect(page.getByText('Let’s connect Ollama')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy install command for Qwen 3 · 4B' })).toBeVisible();
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeChecked();
  await page.getByRole('button', { name: '← Back to your companion' }).click();
  await page.getByRole('button', { name: 'Preview desktop view' }).click();
  await expect(page.getByRole('textbox', { name: 'Message Misaki' })).toBeVisible();
  await page.screenshot({ path: 'test-results/compact.png' });
  await page.getByRole('button', { name: 'Expand studio' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Message Misaki' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('exactly one send, context, plain-text safety, export and private history', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  const requests: { request_id: string; history: { role: string; content: string }[] }[] = [];
  await page.route('**/api/v1/chat', async route => {
    const data = route.request().postDataJSON(); requests.push(data);
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: { request_id: data.request_id, reply: 'Hello! <img src=x onerror=alert(1)>', model: 'qwen3:4b', route: 'local', status: 'ok', citations: [], latency_ms: 500 } });
  });
  await page.goto('/');
  await expect(page.getByText('Here for you · running locally')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('Hi Misaki'); await input.press('Enter'); await input.press('Enter');
  await expect(page.getByText('Hello! <img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(await page.locator('.message-body img').count()).toBe(0);
  await input.fill('What did I say?'); await input.press('Enter');
  await expect(page.locator('.message.assistant')).toHaveCount(2);
  expect(requests[1].history[0].content).toBe('Hi Misaki');
  await page.screenshot({ path: 'test-results/raised-avatar-chat.png', fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem('misaki.history.v1'))).toBe(null);
  await page.getByRole('button', { name: 'Conversation options' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export as text' }).click();
  expect((await download).suggestedFilename()).toBe('misaki-conversation.txt');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('switch', { name: 'Keep conversation history' }).click();
  await page.reload();
  await expect(page.locator('.message.assistant')).toHaveCount(2);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.getByRole('switch', { name: 'Keep conversation history' }).click();
  expect(await page.evaluate(() => localStorage.getItem('misaki.history.v1'))).toBe(null);
});

test('cancel and backend error recover to a usable composer', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.route('**/api/v1/chat/*/cancel', route => route.fulfill({ json: { status: 'cancelled' } }));
  let calls = 0;
  await page.route('**/api/v1/chat', async route => {
    calls++;
    if (calls === 1) { await new Promise(resolve => setTimeout(resolve, 1500)); await route.abort().catch(() => {}); }
    else await route.fulfill({ status: 503, json: { detail: 'Cannot reach Ollama. Open Ollama and reconnect.' } });
  });
  await page.goto('/');
  await expect(page.getByText('Here for you · running locally')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('A long reply'); await input.press('Enter');
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByRole('button', { name: 'Stop response' })).toHaveCount(0);
  await expect(input).toBeEnabled();
  await input.fill('Try another'); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Cannot reach Ollama');
  await expect(input).toBeEnabled();
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(page.getByText('Right here with you')).toBeVisible();
});

test('studio renders the supplied Live2D model and recovers after hiding it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise the same script restrictions used by the desktop webview.
  const { app } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  await page.route('http://127.0.0.1:1420/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': app.security.devCsp } });
  });
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.goto('/');
  await expect(page.getByText('Here for you · running locally')).toBeVisible();
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect(page.locator('.live2d-avatar canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Hide avatar', exact: true }).click();
  await expect(page.locator('.live2d-avatar canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Misaki', exact: true }).click();
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  expect(errors).toEqual([]);
});

test('Live2D honors reduced motion and falls back on missing model data', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  const canvas = page.locator('.live2d-avatar canvas');
  const first = await canvas.screenshot();
  await page.waitForTimeout(350);
  expect(changedPixels(await canvas.screenshot(), first)).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Preview desktop view' }).click();
  await page.screenshot({ path: 'test-results/live2d-compact.png' });
  await page.route('**/*.moc3', route => route.abort());
  await page.reload();
  await expect(page.getByText('Avatar unavailable · showing fallback')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.avatar svg')).toBeVisible();
});

test('all supplied expressions visibly apply, combine, and reset in the hip-up view', async ({ page }) => {
  test.setTimeout(60000);
  expect(expressionChoices.map(choice => choice.file).sort()).toEqual(readdirSync('public/models/changli/EXP3').filter(file => file.endsWith('.exp3.json')).sort());
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  const canvas = page.locator('.live2d-avatar canvas');
  const neutral = await canvas.screenshot();
  const expressionMenu = page.getByRole('button', { name: 'Avatar expressions', exact: true });
  for (const choice of expressionChoices) {
    await expressionMenu.click();
    const button = page.getByRole('button', { name: choice.label, exact: false });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expressionMenu.click();
    expect(changedPixels(await canvas.screenshot(), neutral), `${choice.label} must visibly change the actual model`).toBeGreaterThan(20);
    await expressionMenu.click();
    await page.getByRole('button', { name: 'Reset expressions' }).click();
    await expressionMenu.click();
    expect(changedPixels(await canvas.screenshot(), neutral), `${choice.label} must reset to neutral`).toBeLessThanOrEqual(2);
  }
  await expressionMenu.click();
  await page.getByRole('button', { name: 'Blush', exact: false }).click();
  await page.getByRole('button', { name: 'Heart eyes', exact: false }).click();
  await expect(page.locator('.expression-trigger')).toContainText('2 expressions');
  await page.screenshot({ path: 'test-results/expressions-studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Avatar expressions', exact: true }).click();
  await page.screenshot({ path: 'test-results/hip-up-studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Preview desktop view' }).click();
  await page.screenshot({ path: 'test-results/hip-up-compact.png' });
  await page.getByRole('button', { name: 'Avatar expressions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Coat on / off', exact: false })).toBeInViewport();
  await page.screenshot({ path: 'test-results/expressions-compact.png' });
});

test('garden scene keeps the portrait clear of side or bottom conversation', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect.poll(() => page.locator('.japanese-backdrop').evaluate(async element => {
    const url = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!url) return false;
    const image = new Image(); image.src = url;
    try { await image.decode(); return image.naturalWidth > 1000; } catch { return false; }
  })).toBe(true);
  for (const viewport of [{ width: 1920, height: 936 }, { width: 1440, height: 1000 }, { width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const portrait = await page.locator('.live2d-avatar').boundingBox();
    const dock = await page.getByRole('region', { name: 'Conversation', exact: true }).boundingBox();
    expect(portrait).not.toBeNull(); expect(dock).not.toBeNull();
    const center = viewport.width >= 1100 && viewport.width < 1400 ? viewport.width * .43 : viewport.width / 2;
    expect(Math.abs(portrait!.x + portrait!.width / 2 - center)).toBeLessThan(2);
    expect(portrait!.height).toBeGreaterThan(viewport.height * .6);
    if (viewport.width >= 1100) {
      expect(dock!.x).toBeGreaterThan(viewport.width * .68);
      expect(dock!.width).toBeLessThan(viewport.width * .33);
      expect(dock!.height).toBeGreaterThan(350);
    } else expect(dock!.y).toBeGreaterThan(viewport.height * .6);
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.getByRole('textbox', { name: 'Message Misaki' }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const background = await page.locator('.composer').evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).toMatch(/^rgba\(/);
    await expect(page.getByRole('textbox', { name: 'Message Misaki' })).toBeInViewport();
    await page.screenshot({ path: `test-results/garden-${viewport.width}.png`, fullPage: true });
  }
  // Adding history to the side panel must leave the actual portrait unchanged.
  await page.setViewportSize({ width: 1920, height: 936 });
  const face = { x: 780, y: 44, width: 360, height: 430 };
  const portraitBeforeChat = await page.screenshot({ clip: face });
  await page.route('**/api/v1/chat', route => route.fulfill({ json: { request_id: route.request().postDataJSON().request_id, reply: 'A quiet evening together. Your portrait stays right here.', model: 'qwen3:4b', route: 'local', status: 'ok', citations: [], latency_ms: 100 } }));
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('Hi Misaki'); await input.press('Enter');
  await expect(page.getByText('A quiet evening together. Your portrait stays right here.', { exact: true })).toBeVisible();
  expect(changedPixels(await page.screenshot({ clip: face }), portraitBeforeChat)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: 'test-results/garden-side-chat.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/garden-preferences-mobile.png', fullPage: true });
});

test('Gemini and Grok keys, model selection, cloud chat, removal and local recovery', async ({ page }) => {
  test.setTimeout(60000);
  const states = { gemini: { provider: 'gemini', configured: false, models: [] as string[] }, grok: { provider: 'grok', configured: false, models: [] as string[] } };
  const fakeKey = 'test-only-api-key-not-a-real-secret';
  const calls: { mode: string; model: string; history: { content: string }[] }[] = [];
  await page.route('**/api/v1/health', route => route.fulfill({ json: { ...ready, status: 'offline', models: [] } }));
  await page.route('**/api/v1/providers', route => route.fulfill({ json: { providers: Object.values(states) } }));
  await page.route(/\/api\/v1\/providers\/(gemini|grok)$/, route => {
    const provider = route.request().url().split('/').at(-1) as 'gemini' | 'grok';
    if (route.request().method() === 'DELETE') states[provider] = { provider, configured: false, models: [] };
    else {
      expect(route.request().postDataJSON()).toEqual({ api_key: fakeKey });
      states[provider] = { provider, configured: true, models: provider === 'gemini' ? ['gemini-test-flash', 'gemini-test-pro'] : ['grok-test'] };
    }
    return route.fulfill({ json: states[provider] });
  });
  await page.route('**/api/v1/chat', route => {
    const data = route.request().postDataJSON(); calls.push(data);
    return route.fulfill({ json: { request_id: data.request_id, reply: `Reply from ${data.mode}.`, model: data.model, route: data.mode, status: 'ok', citations: [], latency_ms: 100 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  await expect(page.getByLabel('Gemini API key', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Gemini API key', { exact: true }).fill(fakeKey);
  await page.getByRole('button', { name: 'Connect & load models' }).click();
  await expect(page.getByText('Key connected for this session')).toBeVisible();
  await expect(page.getByLabel('Gemini API key', { exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Gemini model' }).selectOption('gemini-test-pro');
  await page.screenshot({ path: 'test-results/gemini-connection.png', fullPage: true });
  await page.getByRole('button', { name: 'Use Gemini', exact: true }).click();
  await expect(page.getByText('Here for you · Gemini cloud')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('Only Gemini should receive this.'); await input.press('Enter');
  await expect(page.getByText('Reply from gemini.', { exact: true })).toBeVisible();
  expect(calls[0]).toMatchObject({ mode: 'gemini', model: 'gemini-test-pro', history: [] });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(fakeKey);
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('button', { name: 'Grok', exact: true }).click();
  await page.getByLabel('Grok API key', { exact: true }).fill(fakeKey);
  await page.getByRole('button', { name: 'Connect & load models' }).click();
  await page.getByRole('button', { name: 'Use Grok', exact: true }).click();
  await expect(page.getByText('Here for you · Grok cloud')).toBeVisible();
  await input.fill('Hello Grok.'); await input.press('Enter');
  await expect(page.getByText('Reply from grok.', { exact: true })).toBeVisible();
  expect(calls[1]).toMatchObject({ mode: 'grok', model: 'grok-test', history: [] });
  await page.reload();
  await expect(page.getByText('Here for you · Grok cloud')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(fakeKey);
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('button', { name: 'Manage connection & API keys' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/grok-connection-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove key', exact: true }).click();
  await expect(page.getByText('Connect with your own API key')).toBeVisible();
  await page.getByRole('button', { name: 'Local · Ollama', exact: true }).click();
  await expect(page.getByText('Let’s connect Ollama')).toBeVisible();
});

test('provider errors allow retry without persisting keys', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.route('**/api/v1/providers/gemini', route => route.fulfill({ status: 403, json: { detail: 'Gemini rejected this API key or model access.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  const key = page.getByLabel('Gemini API key', { exact: true });
  await key.fill('test-invalid-api-key');
  await page.getByRole('button', { name: 'Connect & load models' }).click();
  await expect(page.getByRole('alert')).toContainText('Gemini rejected');
  await expect(key).toBeEnabled();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('test-invalid-api-key');
});

test('saved Gemini key connects automatically and can reconnect without key entry', async ({ page }) => {
  let loadingUntil = 0;
  let connectedSaved = true;
  await page.addInitScript(() => localStorage.setItem('misaki.settings.v1', JSON.stringify({ provider: 'gemini', model: 'qwen3:4b', cloudModels: { gemini: '', grok: '' } })));
  await page.route('**/api/v1/health', route => route.fulfill({ json: { ...ready, status: 'offline', models: [] } }));
  const savedStatus = () => ({ provider: 'gemini', configured: connectedSaved && Date.now() >= loadingUntil, saved_key: true, source: connectedSaved ? 'saved' : null, loading: Date.now() < loadingUntil, models: connectedSaved && Date.now() >= loadingUntil ? ['gemini-env-test'] : [] });
  await page.route('**/api/v1/providers', route => {
    if (!loadingUntil) loadingUntil = Date.now() + 1500;
    return route.fulfill({ json: { providers: [savedStatus(), { provider: 'grok', configured: false, models: [] }] } });
  });
  await page.route('**/api/v1/providers/gemini', route => {
    if (route.request().method() === 'DELETE') connectedSaved = false;
    else { expect(route.request().postDataJSON()).toEqual({}); connectedSaved = true; }
    return route.fulfill({ json: savedStatus() });
  });
  await page.goto('/');
  await expect(page.getByText('Here for you · Gemini cloud', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  await expect(page.getByText('Key loaded automatically', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Gemini API key', { exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Gemini model' })).toHaveValue('gemini-env-test');
  await page.getByRole('button', { name: 'Disconnect for this session', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved key', exact: true }).click();
  await expect(page.getByText('Key loaded automatically', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Gemini API key', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByText('Here for you · Gemini cloud', { exact: true })).toBeVisible();
});

test('avatar follows browser zoom and display pixel density without reloading', async ({ page }) => {
  await page.route('**/api/v1/health', route => route.fulfill({ json: ready }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const display = await page.context().newCDPSession(page);
  const setDisplay = (width: number, height: number, deviceScaleFactor: number) => display.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  // Windows 125% scaling: browser zoom 50% has DPR .625; 100% has DPR 1.25.
  await setDisplay(3072, 1496, .625);
  await page.goto('/');
  await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  const canvas = page.locator('.live2d-avatar canvas');
  for (const [width, height, dpr] of [[1536, 748, 1.25], [1536, 748, 2.5], [1536, 748, 1], [3072, 1496, .625], [1536, 748, 1.25]]) {
    await setDisplay(width, height, dpr);
    await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
    // A density-only change must work too: the canvas's CSS size need not change.
    await expect.poll(() => canvas.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return Math.min((element as HTMLCanvasElement).width / bounds.width, (element as HTMLCanvasElement).height / bounds.height);
    })).toBeGreaterThanOrEqual(dpr - .01);
    await expect(page.locator('.live2d-avatar')).toHaveAttribute('data-status', 'ready');
  }
  await page.screenshot({ path: 'test-results/avatar-native-100-percent.png', fullPage: true });
  await display.detach();
});

