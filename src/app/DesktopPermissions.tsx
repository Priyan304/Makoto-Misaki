import { useEffect, useState } from 'react';
import { desktopError, type DesktopPermissions as Grants } from './electron';

export default function DesktopPermissions() {
  const api = window.misakiDesktop;
  const [grants, setGrants] = useState<Grants>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (api?.permissions) void api.permissions().then(setGrants).catch(error => setError(desktopError(error))); }, [api]);
  async function change(run: () => Promise<Grants>) { setBusy(true); setError(''); try { setGrants(await run()); } catch (error) { setError(desktopError(error)); } finally { setBusy(false); } }
  if (!api?.permissions) return null;
  const labels: Record<string,string> = { files: 'File access', media: 'Music playback', screen: 'Screen sharing', applications: 'Application launching and closing', automation: 'Mouse and keyboard control', system: 'System and active-window information' };
  return <section className="setting-section"><h3>Desktop permissions</h3><p>Every chat action requires your approval. File searches use only the folders below. Search results and tool outcomes are sent to the model you selected; file contents stay on this computer.</p>
    {grants && Object.entries(labels).map(([key,label]) => <div className="setting-row" key={key}><strong>{label}</strong><button className={`toggle ${grants.enabled[key] ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={grants.enabled[key]} disabled={busy} onClick={() => void change(() => api.setPermission({ permission: key, enabled: !grants.enabled[key] }))}><span/></button></div>)}
    <p>Input controls support shared Notepad, Calculator and Paint windows. Typing is limited to Notepad. Each click, key press, typed text, or close request has a separate confirmation.</p>
    <h4>Approved folders</h4>{grants?.folders.map(folder => <div className="setting-row" key={folder}><span style={{overflowWrap:'anywhere'}}>{folder}</span><button className="button" disabled={busy} onClick={() => void change(() => api.revokeGrant({kind:'folder',id:folder}))}>Remove</button></div>)}
    <button className="button" disabled={busy} onClick={() => void change(() => api.chooseGrant('folder'))}>Add folder</button>
    <h4>Approved applications</h4>{grants?.applications.map(app => <div className="setting-row" key={app.id}><span title={app.path}>{app.name}</span><button className="button" disabled={busy} onClick={() => void change(() => api.revokeGrant({kind:'application',id:app.id}))}>Remove</button></div>)}
    <button className="button" disabled={busy} onClick={() => void change(() => api.chooseGrant('application'))}>Add application</button>
    <p>Choose your music folder from the playlist. Use Share screen to select and preview a single snapshot; removing it revokes window access.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
