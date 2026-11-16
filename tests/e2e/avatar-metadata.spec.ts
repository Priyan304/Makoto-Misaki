import { test, expect } from '@playwright/test';

test('structured reply metadata drives supported motions and persisted behavior preferences', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => { if (!localStorage.getItem('misaki.settings.v1')) localStorage.setItem('misaki.settings.v1', JSON.stringify({ idleAnimations: false })); });
  await page.route('**/api/v1/health', route => route.fulfill({ json: { api_version: '1', status: 'ready', models: ['qwen3:4b'], route: 'local', detail: 'Fixture' } }));
  await page.route('**/api/v1/providers', route => route.fulfill({ json: { providers: [] } }));
  let motion = 'nod';
  await page.route('**/api/v1/chat', route => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { request_id: request.request_id, reply: 'Hehe, welcome back!', message: 'Hehe, welcome back!', emotion: 'embarrassed', expression: 'blush', intensity: .8, motion, route: 'local', model: request.model, status: 'ok', citations: [], actions: [], latency_ms: 1 } });
  });
  await page.goto('/');
  const avatar = page.locator('.live2d-avatar');
  await expect(avatar).toHaveAttribute('data-status', 'ready', { timeout: 30000 });
  await expect(avatar).toHaveAttribute('data-gesture', 'rest');
  for (const selected of ['nod', 'shake-head', 'look-around', 'yawn', 'laugh', 'thinking']) {
    motion = selected;
    const input = page.getByRole('textbox', { name: 'Message Misaki' });
    await input.fill('A fixture message'); await input.press('Enter');
    await expect(input).toBeEnabled();
    await expect(avatar).toHaveAttribute('data-gesture', selected);
    await expect(avatar).toHaveAttribute('data-emotion', 'embarrassed');
    if (selected === 'nod') {
      await page.waitForTimeout(700);
      await page.screenshot({ path: 'test-results/avatar-blush-nod.png' });
    }
  }
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Random idle gestures' })).not.toBeChecked();
  await page.getByLabel('Animation intensity', { exact: true }).selectOption('0.4');
  await page.getByLabel('Sleepy after', { exact: true }).selectOption('300');
  await page.reload();
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByLabel('Animation intensity', { exact: true })).toHaveValue('0.4');
  await expect(page.getByLabel('Sleepy after', { exact: true })).toHaveValue('300');
  await expect(page.getByRole('switch', { name: 'Conversation starters' })).not.toBeChecked();
});
