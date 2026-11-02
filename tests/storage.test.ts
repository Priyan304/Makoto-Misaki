import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, readHistory, readSettings, writeSettings } from '../src/app/storage';

describe('provider settings migration', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps existing local model preferences and defaults to local', () => {
    values.set('misaki.settings.v1', JSON.stringify({ model: 'custom-local:4b', scale: 1.15 }));
    expect(readSettings()).toMatchObject({ model: 'custom-local:4b', provider: 'local', scale: 1.15, cloudModels: { gemini: '', grok: '' } });
  });
  it('remembers model selections while discarding legacy credential fields', () => {
    values.set('misaki.settings.v1', JSON.stringify({ ...DEFAULTS, provider: 'gemini', cloudModels: { gemini: 'gemini-test', grok: 'grok-test' }, api_key: 'never-carry-this-key' }));
    const settings = readSettings();
    expect(settings.provider).toBe('gemini');
    writeSettings(settings);
    expect(values.get('misaki.settings.v1')).not.toContain('never-carry-this-key');
  });
  it('treats pre-provider history as local and preserves cloud provenance', () => {
    values.set('misaki.history.v1', JSON.stringify([
      { id: '1', role: 'user', content: 'Private local turn', time: 1, status: 'complete' },
      { id: '2', role: 'assistant', content: 'Cloud reply', time: 2, status: 'complete', provider: 'grok' },
    ]));
    expect(readHistory(true).map(message => message.provider)).toEqual(['local', 'grok']);
  });
});
