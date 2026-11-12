import { useState } from 'react';
import { FolderOpen, Headphones, ListMusic, Music2, Pause, Play, Search, SkipBack, SkipForward, Square, X } from 'lucide-react';
import type { DesktopAction, MediaStatus, Track } from './electron';

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
const songName = (title: string) => title.replace(/\.(mp3|wav|flac|m4a|ogg|aac|opus|wma)$/i, '');

export default function MusicPlaylist({ status, working, error, query, matches, compact, onQuery, onAction, onChooseLibrary, onClose }: {
  status: MediaStatus | null; working: boolean; error: string; query: string; matches: Track[]; compact: boolean;
  onQuery: (query: string) => void; onAction: (action: DesktopAction) => void; onChooseLibrary: () => void; onClose: () => void;
}) {
  const [browse, setBrowse] = useState(false);
  const playing = status?.state === 'playing';
  const active = !!status && status.state !== 'stopped';
  const queue = status?.playlist ?? [];
  const libraryView = browse || !queue.length;
  const tracks = libraryView ? matches : queue;
  const progress = status?.duration ? Math.min(100, Math.max(0, status.position / status.duration * 100)) : 0;
  const play = (track: Track) => onAction({ type: 'play_media', target: track.path });
  return <aside className={`music-playlist${compact ? ' music-playlist--compact' : ''}`} aria-label="Music playlist" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="playlist-header"><span className="playlist-emblem"><Headphones size={19}/></span><div><span className="playlist-eyebrow">A LITTLE MUSIC</span><h2>Your playlist</h2></div><button type="button" className="playlist-icon" aria-label="Close playlist" title="Hide playlist; music keeps playing" onClick={onClose}><X size={17}/></button></header>
    <div className="playlist-now-playing"><div className={`playlist-art${playing ? ' is-playing' : ''}`} aria-hidden="true"><Music2 size={29}/><span/><span/><span/></div><div className="playlist-track-info"><span className="playlist-eyebrow">{playing ? 'NOW PLAYING' : active ? 'PAUSED' : 'MAKE YOURSELF AT HOME'}</span><strong title={status?.title ?? ''}>{status?.title ? songName(status.title) : 'A soundtrack for your day'}</strong><p role="status">{status ? `${status.available ? status.state : 'Player unavailable'}${status.title ? ` · ${status.title}` : ''}` : 'Loading your music…'}</p></div></div>
    <div className="playlist-timeline"><progress aria-label="Track progress" max={100} value={progress}/><div><span>{clock(status?.position ?? 0)}</span><span>{clock(status?.duration ?? 0)}</span></div></div>
    <div className="playlist-controls" role="group" aria-label="Playlist playback controls">
      <button type="button" className="playlist-icon" aria-label="Previous track" disabled={working || !active || status!.index <= 0} onClick={() => onAction({ type: 'previous_track', target: '' })}><SkipBack size={17}/></button>
      <button type="button" className="playlist-play" aria-label={playing ? 'Pause music' : active ? 'Resume music' : 'Play music'} disabled={working || !status?.available} onClick={() => onAction({ type: playing ? 'pause_media' : active ? 'resume_media' : 'play_media', target: active ? '' : tracks[0]?.path ?? '' })}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button>
      <button type="button" className="playlist-icon" aria-label="Next track" disabled={working || !active || status!.index >= queue.length - 1} onClick={() => onAction({ type: 'next_track', target: '' })}><SkipForward size={17}/></button>
      <button type="button" className="playlist-icon" aria-label="Stop music" disabled={working || !active} onClick={() => onAction({ type: 'stop_media', target: '' })}><Square size={14}/></button>
      <label className="playlist-volume">Volume<select aria-label="Playback volume" value={Math.round((status?.volume ?? 60) / 10) * 10} disabled={working || !active} onChange={event => onAction({ type: 'set_volume', target: event.target.value })}>{Array.from({ length: 11 }, (_, index) => <option key={index} value={index * 10}>{index * 10}%</option>)}</select></label>
    </div>
    <div className="playlist-list-heading"><strong><ListMusic size={15}/>{libraryView ? 'Your music' : 'Play queue'}</strong><span>{libraryView ? `${status?.trackCount ?? 0} tracks` : `${queue.length} tracks`}</span>{queue.length > 0 && status?.library && <button type="button" onClick={() => setBrowse(value => !value)}>{browse ? 'Show queue' : 'Browse library'}</button>}</div>
    {libraryView && status?.library && <label className="playlist-search"><Search size={14}/><input aria-label="Search playlist library" placeholder="Find a song…" value={query} maxLength={200} onChange={event => onQuery(event.target.value)}/></label>}
    <ol className="playlist-tracks" aria-label={libraryView ? 'Library tracks' : 'Queued tracks'}>{tracks.map((track, index) => {
      const selected = active && (libraryView ? status?.path === track.path : status?.index === index);
      return <li key={`${track.path}-${index}`}><button type="button" aria-label={`Play ${track.title}`} aria-current={selected ? 'true' : undefined} className={selected ? 'current-track' : ''} disabled={working} onClick={() => play(track)} title={track.title}><span className="playlist-track-number">{selected ? <Music2 size={14}/> : String(index + 1).padStart(2, '0')}</span><span className="playlist-song"><strong>{songName(track.title)}</strong><small>{selected ? playing ? 'Playing now' : 'Paused' : track.title.split('.').at(-1)?.toUpperCase()}</small></span><Play size={13} className="playlist-row-play"/></button></li>;
    })}</ol>
    {!tracks.length && <div className="playlist-empty"><Music2 size={23}/><p>{!status ? 'Loading your playlist…' : status.library ? query ? 'No songs match your search.' : 'No audio files in this folder yet.' : 'Bring your favourite songs along.'}</p><small>{status?.library ? 'Try another search or music folder.' : 'Choose a music folder to see your songs here.'}</small></div>}
    {libraryView && status && matches.length < status.trackCount && <p className="playlist-search-hint">Showing {matches.length} matches · search to find more</p>}
    {(error || status?.error) && <p className="playlist-error" role="alert">{error || status?.error}</p>}
    {status && !status.available && <p className="playlist-error">Install the player with <code>npm run setup:media</code>, then restart Misaki.</p>}
    <footer className="playlist-footer"><button type="button" disabled={working || status?.scanning} onClick={onChooseLibrary}><FolderOpen size={14}/>{status?.library ? 'Change music folder' : 'Choose music folder'}</button><button type="button" disabled={working} onClick={() => onAction({ type: 'play_media', target: '' })}>Open audio…</button></footer>
  </aside>;
}
