import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, availableMonitors } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';

export const native = isTauri();
export async function initDesktop(onFailure: (message: string) => void): Promise<() => void> {
  if (!native) return () => {};
  const win = getCurrentWindow();
  try {
    let saved: { x: number; y: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem('misaki.position.v1') ?? 'null'); } catch { /* recenter */ }
    const monitors = await availableMonitors();
    const size = await win.outerSize();
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && monitors.some(m => saved!.x >= m.position.x && saved!.y >= m.position.y && saved!.x + size.width <= m.position.x + m.size.width && saved!.y + size.height <= m.position.y + m.size.height)) {
      await win.setPosition(new PhysicalPosition(saved.x, saved.y));
    } else await win.center();
    return await win.onMoved(({ payload }) => {
      try { localStorage.setItem('misaki.position.v1', JSON.stringify(payload)); } catch { onFailure('Window position could not be saved.'); }
    });
  } catch { onFailure('Window placement could not be restored. Use the tray to recover Misaki.'); return () => {}; }
}
export async function setTop(value: boolean): Promise<void> { if (window.misakiDesktop) await window.misakiDesktop.setAlwaysOnTop(value); else if (native) await getCurrentWindow().setAlwaysOnTop(value); }
export async function hideWindow(): Promise<void> { if (native) await getCurrentWindow().hide(); }
export async function dragWindow(): Promise<void> { if (native) await getCurrentWindow().startDragging(); }
