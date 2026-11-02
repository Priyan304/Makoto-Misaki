import { useRef, useState } from 'react';
import type { DesktopAction } from './electron';

type Outcome = { message: string; status: 'completed' | 'cancelled' | 'failed' };
function actionLabel(action: DesktopAction) {
  if (!action.target) return action.type === 'play_music' ? 'Choose music' : action.type === 'open_folder' ? 'Choose folder' : 'Choose file';
  return action.type === 'play_music' ? 'Play' : action.type === 'reveal_file' ? 'Show in Explorer' : 'Open';
}

export default function DesktopActions({ actions, onResult }: { actions: DesktopAction[]; onResult: (message: string) => void }) {
  const [results, setResults] = useState<Record<number, Outcome>>({});
  const [running, setRunning] = useState<number | null>(null);
  const lock = useRef(false);
  async function run(action: DesktopAction, index: number) {
    if (!window.misakiDesktop || lock.current || results[index]?.status === 'completed') return;
    lock.current = true; setRunning(index);
    try {
      const result = await window.misakiDesktop.action(action);
      setResults(previous => ({ ...previous, [index]: result }));
      onResult(`Desktop result: ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Desktop action failed.';
      setResults(previous => ({ ...previous, [index]: { status: 'failed', message } }));
      onResult(`Desktop result: Failed. ${message}`);
    } finally { lock.current = false; setRunning(null); }
  }
  return <div className="desktop-actions">{actions.map((action, index) => <div className="desktop-action" key={index}><strong>{action.type.replaceAll('_', ' ')}</strong><span>{action.target || 'Choose with the file picker'}</span>{results[index] && <small role="status">{results[index].message}</small>}{results[index]?.status !== 'completed' && <button type="button" className="button" disabled={running !== null || !window.misakiDesktop} onClick={() => void run(action, index)}>{running === index ? 'Opening…' : results[index] ? 'Try again' : actionLabel(action)}</button>}</div>)}</div>;
}
