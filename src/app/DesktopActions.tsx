import { useRef, useState } from 'react';
import type { DesktopAction, ScreenImage, ToolResult } from './electron';
import { desktopTask } from './electron';

type Outcome = { message: string; status: 'completed' | 'cancelled' | 'failed' };
function actionLabel(action: DesktopAction) {
  const labels: Partial<Record<DesktopAction['type'], string>> = { pause_media: 'Pause', resume_media: 'Resume', stop_media: 'Stop', next_track: 'Next track', previous_track: 'Previous track', set_volume: `Set volume to ${action.target}%`, get_playback_status: 'Check playback', search_media: 'Search music', search_music: 'Search music', search_files: 'Search files', get_file_information: 'File details', open_application: 'Launch application', close_application: 'Review close request', get_active_window: 'Check active window', get_system_info: 'Check system', take_screenshot: 'Choose screen', click_mouse: 'Review click', type_text: 'Review typing', press_key: 'Review key press', scroll_window: 'Review scroll', focus_window: 'Focus shared window' };
  if (labels[action.type]) return labels[action.type];
  if (action.type === 'play_media') return action.target ? 'Play' : 'Choose music';
  if (!action.target) return action.type === 'play_music' ? 'Choose music' : action.type === 'open_folder' ? 'Choose folder' : 'Choose file';
  return action.type === 'play_music' ? 'Play' : action.type === 'reveal_file' ? 'Show in Explorer' : 'Open';
}

export default function DesktopActions({ actions, onResult, windowGrant, onComplete, disabled = false }: { actions: DesktopAction[]; onResult: (message: string) => void; windowGrant?: ScreenImage['window']; onComplete?: (results: ToolResult[]) => void; disabled?: boolean }) {
  const [results, setResults] = useState<Record<number, Outcome>>({});
  const [running, setRunning] = useState<number | null>(null);
  const lock = useRef(false);
  const [sent, setSent] = useState(false);
  async function run(action: DesktopAction, index: number) {
    if (!window.misakiDesktop || lock.current || disabled || sent || results[index]?.status === 'completed') return;
    lock.current = true; setRunning(index);
    try {
      const result = await desktopTask(() => window.misakiDesktop!.action(action));
      setResults(previous => ({ ...previous, [index]: result }));
      if (result.requestScreen) window.dispatchEvent(new Event('misaki-request-screen'));
      onResult(`Desktop result: ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Desktop action failed.';
      setResults(previous => ({ ...previous, [index]: { status: 'failed', message } }));
      onResult(`Desktop result: Failed. ${message}`);
    } finally { lock.current = false; setRunning(null); }
  }
  return <div className="desktop-actions">{actions.map((action, index) => <div className="desktop-action" key={index}><strong>{action.type.replaceAll('_', ' ')}</strong><span>{action.type === 'focus_window' ? windowGrant?.token === action.target ? windowGrant.title : 'Share this window again to renew access.' : action.target || (['play_music', 'play_media', 'open_file', 'open_folder', 'reveal_file'].includes(action.type) ? 'Choose with the file picker' : 'No target required')}</span>{results[index] && <small role="status">{results[index].message}</small>}{results[index]?.status !== 'completed' && !sent && <><button type="button" className="button" disabled={disabled || running !== null || !window.misakiDesktop || (action.type === 'focus_window' && windowGrant?.token !== action.target)} onClick={() => void run(action, index)}>{running === index ? 'Working…' : results[index] ? 'Try again' : actionLabel(action)}</button>{onComplete && <button type="button" disabled={disabled || running !== null} onClick={() => setResults(previous => ({...previous,[index]:{status:'cancelled',message:'User skipped this action.'}}))}>Skip</button>}</>}</div>)}{onComplete && !sent && <button className="button" disabled={disabled || running !== null || actions.some((_,index) => !results[index])} onClick={() => { setSent(true); onComplete(actions.map((_,index) => ({status:results[index].status,message:results[index].message.slice(0,16000)}))); }}>Send results to Misaki</button>}</div>;
}
