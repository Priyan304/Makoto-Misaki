import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, KeyRound, LoaderCircle, Trash2 } from 'lucide-react';
import { connectProvider, forgetProvider, providerNames, type CloudProvider, type ProviderStatus } from '../api/client';

export default function ProviderSettings({ provider, status, model, busy, onModel, onConfigured, onBack }: {
  provider: CloudProvider; status?: ProviderStatus; model: string; busy: boolean;
  onModel: (model: string) => void; onConfigured: (status: ProviderStatus) => void; onBack: () => void;
}) {
  const [key, setKey] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const name = providerNames[provider];
  useEffect(() => () => request.current?.abort(), []);

  async function configure(remove = false, saved = false) {
    if (working || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setWorking(true); setError('');
    try {
      const result = remove ? await forgetProvider(provider, controller.signal) : await connectProvider(provider, saved ? '' : key.trim(), controller.signal);
      if (controller.signal.aborted) return;
      onConfigured(result); setKey('');
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : `Could not connect ${name}.`); }
    finally { if (!controller.signal.aborted) setWorking(false); }
  }

  return <section className="cloud-provider" aria-label={`${name} connection`}>
    <div className="cloud-status"><KeyRound size={20}/><div><h3>{name} API</h3><p>{status?.loading ? 'Connecting with your saved key…' : status?.configured ? status.source === 'saved' ? 'Key loaded automatically' : 'Key connected for this session' : 'Connect with your own API key'}</p></div>{status?.configured && <Check size={18}/>}</div>
    <p className="cloud-disclosure">Using {name} sends your message and this provider’s conversation context to {provider === 'gemini' ? 'Google' : 'xAI'}. Provider usage charges and limits may apply.</p>
    <form onSubmit={event => { event.preventDefault(); void configure(); }}>
      <label className="field-label" htmlFor={`${provider}-key`}>{status?.configured ? `Replace ${name} API key` : `${name} API key`}</label>
      <input id={`${provider}-key`} aria-label={`${name} API key`} type="password" autoComplete="off" spellCheck={false} value={key} onChange={event => setKey(event.target.value)} maxLength={512} disabled={working || busy} placeholder="Paste your API key"/>
      <p className="credential-note">Keys entered here last for this session. For automatic connection after restart, add {provider === 'gemini' ? 'GEMINI_API_KEY' : 'GROK_API_KEY'} to the project’s .env file. Keys are never saved in browser storage or chat history.</p>
      {status?.saved_key && <p className="credential-note">A saved key is available from .env or the environment. Disconnecting here lasts for this session; edit .env to remove the saved key permanently.</p>}
      <div className="provider-actions"><button className="primary" type="submit" disabled={working || busy || key.trim().length < 16}>{working ? <LoaderCircle size={15} className="spin"/> : <KeyRound size={15}/>}Connect & load models</button>{status?.saved_key && !status.loading && !status.configured && <button type="button" className="button" onClick={() => void configure(false, true)} disabled={working || busy}>Retry saved key</button>}{status?.configured && <button type="button" className="button subtle" onClick={() => void configure(true)} disabled={working || busy}><Trash2 size={14}/>{status.saved_key ? 'Disconnect for this session' : 'Remove key'}</button>}</div>
    </form>
    <a href={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://console.x.ai/'} target="_blank" rel="noreferrer">Get a {name} API key <ArrowRight size={12}/></a>
    {(error || status?.error) && <p className="provider-error" role="alert">{error || status?.error}</p>}
    {status?.configured && <label className="field-label cloud-model-field">{name} model<select aria-label={`${name} model`} value={model} onChange={event => onModel(event.target.value)} disabled={working || busy}>{!status.models.includes(model) && <option value="">Choose a model</option>}{status.models.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
    {status?.configured && status.models.includes(model) && <button className="primary" onClick={onBack} disabled={working}>Use {name}<ArrowRight size={15}/></button>}
  </section>;
}
