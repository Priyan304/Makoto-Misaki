export const desktopTypes = ['open_file', 'open_folder', 'play_music', 'open_website', 'reveal_file', 'play_media', 'pause_media', 'resume_media', 'stop_media', 'next_track', 'previous_track', 'set_volume', 'get_playback_status', 'search_media', 'focus_window'] as const;
export interface DesktopAction { type: typeof desktopTypes[number]; target: string }
export interface DesktopResult { status: 'completed' | 'cancelled'; message: string }
export interface Track { title: string; path: string }
export interface MediaStatus { available: boolean; state: 'stopped' | 'playing' | 'paused'; title: string | null; path: string | null; volume: number; position: number; duration: number; playlist: Track[]; index: number; error: string | null; library: string | null; trackCount: number; partial: boolean; scanning: boolean }
export interface ScreenSource { id: string; name: string; kind: 'screen' | 'window'; thumbnail: string }
export interface ScreenImage { mime_type: 'image/jpeg' | 'image/png'; data: string; source: string; width: number; height: number; window?: { token: string; title: string } | null }
declare global {
  interface Window {
    misakiDesktop?: {
      backend: (path: string, method: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
      action: (action: DesktopAction) => Promise<DesktopResult>;
      mediaStatus: () => Promise<MediaStatus>;
      chooseMusicLibrary: () => Promise<MediaStatus | null>;
      searchMedia: (query: string) => Promise<Track[]>;
      desktopContext: (query: string) => Promise<unknown>;
      screenSources: () => Promise<ScreenSource[]>;
      captureScreen: (id: string) => Promise<ScreenImage>;
      stopSharing: () => Promise<void>;
      setAlwaysOnTop: (value: boolean) => Promise<void>;
      reportInterface: (state: 'ready' | 'error') => Promise<void>;
    };
  }
}
export const electron = !!window.misakiDesktop;
export function validAction(value: unknown): value is DesktopAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DesktopAction;
  return Object.keys(value).every(key => ['type', 'target'].includes(key)) && desktopTypes.includes(action.type) && typeof action.target === 'string' && action.target.length <= 2048 && !/[\x00-\x1f]/.test(action.target);
}

export function desktopError(error: unknown) { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Desktop action failed. Try again.'; }
