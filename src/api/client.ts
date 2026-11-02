import { invoke, isTauri } from '@tauri-apps/api/core';
import { validAction, type DesktopAction } from '../app/electron';

export type Provider = 'local' | 'gemini' | 'grok';
export type CloudProvider = Exclude<Provider, 'local'>;
export interface ProviderStatus { provider: CloudProvider; configured: boolean; models: string[]; saved_key?: boolean; source?: 'saved' | 'session' | null; loading?: boolean; error?: string | null }
export const providerNames: Record<Provider, string> = { local: 'Local · Ollama', gemini: 'Gemini', grok: 'Grok' };

export interface Health {
  api_version: string;
  status: 'offline' | 'starting' | 'ready' | 'failed';
  models: string[];
  route: 'local';
  detail: string;
}
export interface Turn { role: 'user' | 'assistant'; content: string }
export interface ChatReply {
  request_id: string; reply: string; model: string; route: Provider; status: 'ok'; latency_ms: number;
  citations: { title: string; uri?: string }[];
  actions?: DesktopAction[];
}
export class ApiError extends Error {}

async function request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const launch = window.misakiDesktop ? 'npm run desktop' : 'npm run dev';
  try {
    let status: number;
    let payload: unknown;
    if (window.misakiDesktop) {
      const response = await window.misakiDesktop.backend(path, method, body);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      status = response.status;
      payload = response.body;
    } else if (isTauri()) {
      const response = await invoke<{ status: number; body: string }>('backend_request', { path, method, body: body ? JSON.stringify(body) : null });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      status = response.status;
      payload = JSON.parse(response.body);
    } else {
      const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal });
      status = response.status;
      try { payload = await response.json(); }
      catch { throw new ApiError(`The local bridge returned an unreadable response (${status}). Restart Misaki with ${launch}.`); }
    }
    if (status < 200 || status >= 300) {
      if (status === 401) throw new ApiError(`The bridge session has expired or belongs to another launcher. Close Misaki and restart with ${launch}.`);
      if (status === 404 && path.startsWith('/v1/providers')) throw new ApiError(`Restart Misaki with ${launch} to enable cloud providers.`);
      const detail = (payload as { detail?: unknown })?.detail;
      throw new ApiError(typeof detail === 'string' ? detail : `The local bridge returned an error (${status}).`);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ApiError(`The local bridge is unavailable. Close Misaki and restart it with ${launch}, then reconnect.`);
  }
}

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const data = await request('/v1/health', 'GET', undefined, signal) as Health;
  if (data.api_version !== '1' || data.route !== 'local' || !['offline', 'starting', 'ready', 'failed'].includes(data.status) || !Array.isArray(data.models) || !data.models.every(m => typeof m === 'string')) {
    throw new ApiError('The bridge version is incompatible. Restart the current Misaki bridge.');
  }
  return data;
}

export async function chat(input: { request_id: string; conversation_id: string; message: string; model: string; mode: Provider; history: Turn[]; desktop?: boolean }, signal: AbortSignal): Promise<ChatReply> {
  const data = await request('/v1/chat', 'POST', input, signal) as ChatReply;
  if (data.request_id !== input.request_id || typeof data.reply !== 'string' || data.route !== input.mode || data.status !== 'ok') throw new ApiError('The bridge returned an invalid reply.');
  if (data.actions !== undefined && (!Array.isArray(data.actions) || data.actions.length > 3 || !data.actions.every(validAction))) throw new ApiError('The model returned invalid desktop actions.');
  return data;
}

export async function cancelChat(id: string): Promise<void> {
  await request(`/v1/chat/${id}/cancel`, 'POST', {}, AbortSignal.timeout(5000));
}

function validProvider(value: unknown): value is ProviderStatus {
  if (!value || typeof value !== 'object') return false;
  const data = value as ProviderStatus;
  return ['gemini', 'grok'].includes(data.provider) && typeof data.configured === 'boolean' && Array.isArray(data.models) && data.models.every(model => typeof model === 'string');
}
export async function getProviders(signal?: AbortSignal): Promise<ProviderStatus[]> {
  const data = await request('/v1/providers', 'GET', undefined, signal) as { providers: ProviderStatus[] };
  if (!Array.isArray(data.providers) || !data.providers.every(validProvider)) throw new ApiError('The bridge returned an invalid provider list.');
  return data.providers;
}
export async function connectProvider(provider: CloudProvider, key: string, signal: AbortSignal): Promise<ProviderStatus> {
  const data = await request(`/v1/providers/${provider}`, 'POST', key ? { api_key: key } : {}, signal) as ProviderStatus;
  if (!validProvider(data) || data.provider !== provider) throw new ApiError('The bridge returned an invalid provider.');
  return data;
}
export async function forgetProvider(provider: CloudProvider, signal: AbortSignal): Promise<ProviderStatus> {
  const data = await request(`/v1/providers/${provider}`, 'DELETE', undefined, signal) as ProviderStatus;
  if (!validProvider(data) || data.provider !== provider) throw new ApiError('The bridge returned an invalid provider.');
  return data;
}
