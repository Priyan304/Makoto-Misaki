import type { Provider } from '../api/client';
export interface Settings { model: string; provider: Provider; cloudModels: { gemini: string; grok: string }; alwaysOnTop: boolean; reducedMotion: boolean; rememberHistory: boolean; scale: number }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; time: number; status: 'pending' | 'complete' | 'failed'; latency?: number; provider?: Provider }
export const DEFAULTS: Settings = { model: 'qwen3:4b', provider: 'local', cloudModels: { gemini: '', grok: '' }, alwaysOnTop: true, reducedMotion: false, rememberHistory: false, scale: 1 };
const KEY = 'misaki.settings.v1';
const HISTORY = 'misaki.history.v1';
export function readSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!stored || typeof stored !== 'object') return DEFAULTS;
    return {
      model: typeof stored.model === 'string' && /^[a-zA-Z0-9_.:/-]{1,100}$/.test(stored.model) ? stored.model : DEFAULTS.model,
      provider: ['gemini', 'grok'].includes(stored.provider) ? stored.provider : 'local',
      cloudModels: {
        gemini: typeof stored.cloudModels?.gemini === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(stored.cloudModels.gemini) ? stored.cloudModels.gemini : '',
        grok: typeof stored.cloudModels?.grok === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(stored.cloudModels.grok) ? stored.cloudModels.grok : '',
      },
      alwaysOnTop: typeof stored.alwaysOnTop === 'boolean' ? stored.alwaysOnTop : DEFAULTS.alwaysOnTop,
      reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : DEFAULTS.reducedMotion,
      rememberHistory: stored.rememberHistory === true,
      scale: typeof stored.scale === 'number' && [0.85, 1, 1.15].includes(stored.scale) ? stored.scale : 1,
    };
  } catch { return DEFAULTS; }
}
export function writeSettings(settings: Settings): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
export function readHistory(remember: boolean): Message[] {
  if (!remember) return [];
  try {
    const data: unknown = JSON.parse(localStorage.getItem(HISTORY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((m): m is Message => m && typeof m.id === 'string' && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.length <= 16000 && Number.isFinite(m.time) && m.status === 'complete').slice(-100).map(m => ({ ...m, provider: ['gemini', 'grok'].includes(m.provider ?? '') ? m.provider : 'local' }));
  } catch { return []; }
}
export function saveHistory(messages: Message[], remember: boolean): boolean {
  try {
    if (remember) localStorage.setItem(HISTORY, JSON.stringify(messages.filter(m => m.status === 'complete').slice(-100)));
    else localStorage.removeItem(HISTORY);
    return true;
  } catch { return false; }
}
