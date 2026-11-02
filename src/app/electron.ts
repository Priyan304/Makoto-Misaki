export interface DesktopAction { type: 'open_file' | 'open_folder' | 'play_music' | 'open_website' | 'reveal_file'; target: string }
export interface DesktopResult { status: 'completed' | 'cancelled'; message: string }
declare global {
  interface Window {
    misakiDesktop?: {
      backend: (path: string, method: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
      action: (action: DesktopAction) => Promise<DesktopResult>;
      setAlwaysOnTop: (value: boolean) => Promise<void>;
      reportInterface: (state: 'ready' | 'error') => Promise<void>;
    };
  }
}
export const electron = !!window.misakiDesktop;
export function validAction(value: unknown): value is DesktopAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DesktopAction;
  return ['open_file', 'open_folder', 'play_music', 'open_website', 'reveal_file'].includes(action.type) && typeof action.target === 'string' && action.target.length <= 2048 && !/[\x00-\x1f]/.test(action.target);
}
