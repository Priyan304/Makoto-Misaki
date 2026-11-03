import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FolderOpen, Music2, Pause, Play, SkipBack, SkipForward, Square, X } from 'lucide-react';
import { desktopError, type DesktopAction, type MediaStatus, type ScreenImage, type ScreenSource, type Track } from './electron';

export default function DesktopTools({ provider, busy, screen, onScreen, onStop, onResult, awareness, onAwareness }: { provider: string; busy: boolean; screen: ScreenImage | null; onScreen: (image: ScreenImage) => void; onStop: () => void; onResult: (message: string) => void; awareness: boolean; onAwareness: (value: boolean) => void }) {
  const api = window.misakiDesktop;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Track[]>([]);
  const epoch = useRef(0);
  const picker = useRef<HTMLElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!api || !open) return;
    let active = true;
    const refresh = () => { if (!document.hidden) void api.mediaStatus().then(value => { if (active) setStatus(value); }).catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [api, open]);
  useEffect(() => {
    if (!api || !open) return;
    let active = true;
    const timer = setTimeout(() => { void api.searchMedia(query).then(value => { if (active) setMatches(value); }).catch(() => {}); }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [api, open, query, status?.library, status?.trackCount]);
  useEffect(() => () => { epoch.current++; }, []);
  useEffect(() => { epoch.current++; setSources(null); setPicking(false); }, [provider]);
  useEffect(() => {
    if (!sources) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => picker.current?.querySelector('button')?.focus());
    return () => { cancelAnimationFrame(frame); previous?.focus(); };
  }, [sources]);
  async function execute(action: DesktopAction) {
    if (!api || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try { const result = await api.action(action); onResult(`Desktop result: ${result.message}`); setStatus(await api.mediaStatus()); }
    catch (failure) { setError(desktopError(failure)); }
    finally { lock.current = false; setWorking(false); }
  }
  async function chooseLibrary() {
    if (!api || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try { const value = await api.chooseMusicLibrary(); if (value) { setStatus(value); onAwareness(true); } }
    catch (failure) { setError(desktopError(failure)); }
    finally { lock.current = false; setWorking(false); }
  }
  async function pickScreen() {
    if (!api || picking || screen) return;
    const current = ++epoch.current; setPicking(true); setError('');
    try { const value = await api.screenSources(); if (current === epoch.current) setSources(value); }
    catch (failure) { if (current === epoch.current) setError(desktopError(failure)); }
    finally { if (current === epoch.current) setPicking(false); }
  }
  function cancelPicker() { epoch.current++; setSources(null); setPicking(false); onStop(); }
  async function capture(source: ScreenSource) {
    if (!api || picking) return;
    const current = ++epoch.current; setPicking(true); setError(''); setSources(null);
    try { const value = await api.captureScreen(source.id); if (current === epoch.current) { onScreen(value); setSources(null); } }
    catch (failure) { if (current === epoch.current) setError(desktopError(failure)); }
    finally { if (current === epoch.current) setPicking(false); }
  }
  if (!api) return null;
  return <div className="desktop-tools">
    <div className="desktop-toolbar"><button type="button" className="desktop-tool-button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Music2 size={14}/>Desktop tools</button><button type="button" className="desktop-tool-button" disabled={busy || picking || !!screen} onClick={() => void pickScreen()}><Camera size={14}/>{picking ? 'Preparing…' : 'Share screen'}</button></div>
    {open && <div className="desktop-tools-panel">
      <strong>Misaki’s music player</strong><p role="status">{status ? `${status.available ? status.state : 'Player unavailable'}${status.title ? ` · ${status.title}` : ''}` : 'Checking player…'}</p>
      {status && !status.available && <p>Run <code>npm run setup:media</code> once to install the portable player.</p>}
      <div className="media-controls" role="group" aria-label="Music controls">
        <button type="button" title="Previous track" aria-label="Previous track" disabled={working || !status || status.state === 'stopped' || status.index <= 0} onClick={() => void execute({ type: 'previous_track', target: '' })}><SkipBack size={15}/></button>
        <button type="button" title={status?.state === 'playing' ? 'Pause music' : 'Resume music'} aria-label={status?.state === 'playing' ? 'Pause music' : 'Resume music'} disabled={working || !status || status.state === 'stopped'} onClick={() => void execute({ type: status?.state === 'playing' ? 'pause_media' : 'resume_media', target: '' })}>{status?.state === 'playing' ? <Pause size={15}/> : <Play size={15}/>}</button>
        <button type="button" title="Stop music" aria-label="Stop music" disabled={working || !status || status.state === 'stopped'} onClick={() => void execute({ type: 'stop_media', target: '' })}><Square size={15}/></button>
        <button type="button" title="Next track" aria-label="Next track" disabled={working || !status || status.state === 'stopped' || status.index >= status.playlist.length - 1} onClick={() => void execute({ type: 'next_track', target: '' })}><SkipForward size={15}/></button>
        <label>Volume<select aria-label="Playback volume" value={Math.round((status?.volume ?? 60) / 10) * 10} disabled={working || !status || status.state === 'stopped'} onChange={event => void execute({ type: 'set_volume', target: event.target.value })}>{Array.from({ length: 11 }, (_, index) => <option key={index} value={index * 10}>{index * 10}%</option>)}</select></label>
      </div>
      <div className="desktop-toolbar"><button type="button" className="desktop-tool-button" disabled={working} onClick={() => void execute({ type: 'play_media', target: '' })}><Play size={13}/>Choose audio</button><button type="button" className="desktop-tool-button" disabled={working || status?.scanning} onClick={() => void chooseLibrary()}><FolderOpen size={13}/>Choose music folder</button></div>
      <p>{status?.library ? `${status.trackCount} tracks${status.partial ? ' (limited scan)' : ''} · ${status.library}` : 'Choose a folder to let Misaki find songs by name. Only that folder is indexed.'}</p>
      {status?.library && <><input aria-label="Search music library" placeholder="Search your music…" value={query} maxLength={200} onChange={event => setQuery(event.target.value)}/><div className="music-matches">{matches.map(track => <button key={track.path} type="button" disabled={working} title={track.path} onClick={() => void execute({ type: 'play_media', target: track.path })}><Play size={12}/>{track.title}</button>)}{matches.length === 0 && <small>No matching audio.</small>}</div></>}
      <label className="desktop-awareness"><input type="checkbox" checked={awareness} onChange={event => onAwareness(event.target.checked)}/>Use playback state and matching song names in chat</label><p>With this on, matching filenames, paths and playback state go to {provider}. Audio files stay local. Volume controls affect Misaki’s player.</p>
      <button className="desktop-tool-button" type="button" onClick={cancelPicker}>Revoke screen and window access</button>
      {status?.error && <p role="alert">{status.error}</p>}
    </div>}
    {screen && <div className="screen-attachment"><img src={`data:${screen.mime_type};base64,${screen.data}`} alt={`Screenshot preview: ${screen.source}`}/><div><strong>Screenshot ready · {screen.source}</strong><p>Sent once to {provider} with your next message. Remove to stop sharing.</p></div><button type="button" aria-label="Remove screenshot and stop sharing" onClick={onStop}><X size={15}/></button></div>}
    {error && <p className="desktop-tool-error" role="alert">{error}</p>}
    {sources && createPortal(<div className="screen-picker-backdrop" onClick={cancelPicker}><section ref={picker} role="dialog" aria-modal="true" aria-label="Share a screen or window" className="screen-picker" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancelPicker(); }
      if (event.key === 'Tab') {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'));
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } }}><header><h3>Share a screen or window</h3><button type="button" aria-label="Cancel screen sharing" onClick={cancelPicker}><X size={18}/></button></header><p>Choose one snapshot. Preview it before sending to {provider}. No recording or background capture.</p><div className="screen-source-grid">{sources.map(source => <button key={source.id} type="button" disabled={picking} onClick={() => void capture(source)}><img src={source.thumbnail} alt=""/><strong>{source.name}</strong><small>{source.kind === 'screen' ? 'Entire screen' : 'Application window'}</small></button>)}</div>{!sources.length && <p>No capturable screens or windows. Restore a window and try again.</p>}<button type="button" className="button" onClick={cancelPicker}>Cancel</button></section></div>, document.body)}
  </div>;
}
