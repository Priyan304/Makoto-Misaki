import { test, expect } from '@playwright/test';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHioAAAAASUVORK5CYII=';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(png => {
    localStorage.setItem('misaki.settings.v1', JSON.stringify({ provider: 'gemini', cloudModels: { gemini: 'gemini-test', grok: '' }, reducedMotion: true, rememberHistory: true }));
    const fixture = { captures: 0, lists: 0, stops: 0, contexts: 0, requests: [] as Record<string, unknown>[], actions: [] as { type: string; target: string }[], media: { available: true, state: 'stopped' as 'playing' | 'paused' | 'stopped', title: null as string | null, path: null, volume: 60, position: 0, duration: 30, playlist: [] as { title: string; path: string }[], index: -1, error: null, library: null as string | null, trackCount: 0, partial: false, scanning: false } };
    (window as unknown as { fixture: typeof fixture }).fixture = fixture;
    window.misakiDesktop = {
      backend: async (path, _method, body) => {
        if (path === '/v1/health') return { status: 200, body: { api_version: '1', status: 'ready', models: ['qwen3:4b'], route: 'local', detail: 'Fixture local model' } };
        if (path === '/v1/providers') return { status: 200, body: { providers: [{ provider: 'gemini', configured: true, models: ['gemini-test'] }, { provider: 'grok', configured: false, models: [] }] } };
        const request = body as Record<string, unknown>; fixture.requests.push(request);
        return { status: 200, body: { request_id: request.request_id, reply: 'Fixture reply.', actions: [], route: request.mode, model: request.model, status: 'ok', citations: [], latency_ms: 1 } };
      },
      action: async action => {
        fixture.actions.push(action);
        if (action.type === 'play_media') { fixture.media.state = 'playing'; fixture.media.title = 'Snowfall.wav'; fixture.media.playlist = [{ title: 'Snowfall.wav', path: 'C:\\Fixture\\Snowfall.wav' }, { title: 'Winter.wav', path: 'C:\\Fixture\\Winter.wav' }]; fixture.media.index = 0; }
        if (action.type === 'pause_media') fixture.media.state = 'paused';
        if (action.type === 'resume_media') fixture.media.state = 'playing';
        if (action.type === 'stop_media') fixture.media.state = 'stopped';
        if (action.type === 'next_track') { fixture.media.index = 1; fixture.media.title = 'Winter.wav'; }
        if (action.type === 'previous_track') { fixture.media.index = 0; fixture.media.title = 'Snowfall.wav'; }
        if (action.type === 'set_volume') fixture.media.volume = Number(action.target);
        return { status: 'completed', message: `Media ${fixture.media.state}: ${fixture.media.title}. Volume ${fixture.media.volume}%.` };
      },
      mediaStatus: async () => ({ ...fixture.media }),
      chooseMusicLibrary: async () => { fixture.media.library = 'C:\\Fixture'; fixture.media.trackCount = 2; return { ...fixture.media }; },
      searchMedia: async query => fixture.media.library ? [{ title: 'Snowfall.wav', path: 'C:\\Fixture\\Snowfall.wav' }, { title: 'Winter.wav', path: 'C:\\Fixture\\Winter.wav' }].filter(track => track.title.toLowerCase().includes(query.toLowerCase())) : [],
      desktopContext: async () => { fixture.contexts++; return { playback: fixture.media }; },
      screenSources: async () => { fixture.lists++; return [{ id: 'window:42:0', name: 'Test Editor', kind: 'window', thumbnail: `data:image/png;base64,${png}` }]; },
      captureScreen: async () => { fixture.captures++; return { mime_type: 'image/png', data: png, source: 'Test Editor', width: 1, height: 1, window: { token: '12345678-1234-1234-1234-123456789abc', title: 'Test Editor' } }; },
      stopSharing: async () => { fixture.stops++; },
      setAlwaysOnTop: async () => {}, reportInterface: async () => {},
    };
  }, PNG);
  await page.goto('/');
  await expect(page.getByText('Here for you · Gemini cloud', { exact: true })).toBeVisible();
});

test('screen selection previews locally, removal revokes, and each image is sent only once without persistence', async ({ page }) => {
  const counts = () => page.evaluate(() => { const f = (window as any).fixture; return { captures: f.captures, lists: f.lists, requests: f.requests.length }; });
  expect(await counts()).toEqual({ captures: 0, lists: 0, requests: 0 });
  const attach = async () => { await page.getByRole('button', { name: 'Share screen', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Share a screen or window' })).toBeVisible(); await page.getByRole('button', { name: 'Test Editor Application window' }).click(); await expect(page.getByAltText('Screenshot preview: Test Editor')).toBeVisible(); };
  await attach(); expect(await counts()).toEqual({ captures: 1, lists: 1, requests: 0 });
  await expect(page.getByText('Sent once to Gemini with your next message. Remove to stop sharing.')).toBeVisible();
  const beforeStop = await page.evaluate(() => (window as any).fixture.stops);
  await page.getByRole('button', { name: 'Remove screenshot and stop sharing' }).click();
  expect(await page.evaluate(() => (window as any).fixture.stops)).toBe(beforeStop + 1);
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('No screen attached'); await input.press('Enter');
  await expect(input).toBeEnabled();
  expect(await page.evaluate(() => (window as any).fixture.requests[0].screen)).toBeUndefined();
  await attach(); await input.fill('What is this error?'); await input.press('Enter');
  await expect(page.getByAltText('Screenshot preview: Test Editor')).toHaveCount(0);
  await expect(input).toBeEnabled();
  const request = await page.evaluate(() => (window as any).fixture.requests[1]);
  expect(request.screen).toEqual({ mime_type: 'image/png', data: PNG, source: 'Test Editor', width: 1, height: 1 });
  expect(request.desktop_context).toContain('12345678-1234-1234-1234-123456789abc');
  await input.fill('Thank you'); await input.press('Enter'); await expect(input).toBeEnabled();
  expect(await page.evaluate(() => (window as any).fixture.requests[2].screen)).toBeUndefined();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(PNG);
  await page.screenshot({ path: 'test-results/desktop-tools-screen.png' });
});

test('music controls report state and selected library supplies matches to chat with opt-out', async ({ page }) => {
  await page.getByRole('button', { name: 'Desktop tools', exact: true }).click();
  await page.getByRole('button', { name: 'Choose music folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search music library' }).fill('Snowfall');
  await page.getByRole('button', { name: 'Snowfall.wav', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'playing · Snowfall.wav' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause music', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'paused · Snowfall.wav' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume music', exact: true }).click();
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'playing · Winter.wav' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous track', exact: true }).click();
  await page.getByLabel('Playback volume').selectOption('30');
  await page.getByRole('button', { name: 'Stop music', exact: true }).click();
  expect(await page.evaluate(() => (window as any).fixture.actions.map((value: any) => value.type))).toEqual(['play_media', 'pause_media', 'resume_media', 'next_track', 'previous_track', 'set_volume', 'stop_media']);
  await page.getByRole('checkbox', { name: 'Use playback state and matching song names in chat' }).uncheck();
  const input = page.getByRole('textbox', { name: 'Message Misaki' });
  await input.fill('Hello'); await input.press('Enter'); await expect(input).toBeEnabled();
  expect(await page.evaluate(() => (window as any).fixture.contexts)).toBe(0);
  await page.getByRole('checkbox', { name: 'Use playback state and matching song names in chat' }).check();
  await input.fill('Play Snowfall'); await input.press('Enter'); await expect(input).toBeEnabled();
  expect(await page.evaluate(() => (window as any).fixture.contexts)).toBe(1);
  expect(await page.evaluate(() => (window as any).fixture.requests[1].desktop_context)).toContain('Snowfall.wav');
  await page.screenshot({ path: 'test-results/desktop-tools-media.png' });
});

test('switching provider removes an unsent screenshot and revokes window permission', async ({ page }) => {
  await page.getByRole('button', { name: 'Share screen', exact: true }).click();
  await page.getByRole('button', { name: 'Test Editor Application window' }).click();
  await page.getByRole('button', { name: 'Select model', exact: true }).click();
  await page.getByRole('group', { name: 'Choose provider', exact: true }).getByRole('button', { name: 'Local · Ollama', exact: true }).click();
  await expect(page.getByAltText('Screenshot preview: Test Editor')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fixture.requests.length)).toBe(0);
});
