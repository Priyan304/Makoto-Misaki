import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, CircleHelp, Code2, Coffee, Download, Ellipsis, Expand, Flower2, GripHorizontal, Heart, Leaf, LoaderCircle, LockKeyhole, Maximize2, MessageCircle, Minus, Monitor, Moon, Pin, PlugZap, RefreshCw, Settings2, ShieldCheck, Sparkles, Square, Terminal, Trash2, WifiOff, X } from 'lucide-react';
import Avatar from '../live2d/Avatar';
import { stateLabels, transition } from '../companion/controller';
import { cancelChat, chat, getHealth, getProviders, providerNames, type Provider, type ProviderStatus, type Health, type Turn } from '../api/client';
import { DEFAULTS, readHistory, readSettings, saveHistory, writeSettings, type Message, type Settings } from './storage';
import { dragWindow, hideWindow, initDesktop, native, setTop } from './desktop';
import ProviderSettings from './ProviderSettings';
import { electron, type DesktopAction } from './electron';
import DesktopActions from './DesktopActions';

type Page = 'companion' | 'connection' | 'settings';
const initialSettings = readSettings();
const modelChoices = [
  { id: 'qwen3:4b', name: 'Qwen 3 · 4B', tag: 'Balanced', size: '2.5 GB', description: 'A thoughtful everyday companion. Our default for this project.' },
  { id: 'qwen3:1.7b', name: 'Qwen 3 · 1.7B', tag: 'Lightweight', size: '1.4 GB', description: 'A smaller download and a lighter starting point for modest hardware.' },
  { id: 'qwen3:8b', name: 'Qwen 3 · 8B', tag: 'More capable', size: '5.2 GB', description: 'More room for reasoning, with higher memory and compute needs.' },
];
const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; };
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [messages, setMessages] = useState<Message[]>(() => readHistory(initialSettings.rememberHistory));
  const [page, setPage] = useState<Page>('companion');
  const [state, dispatch] = useReducer(transition, 'idle');
  const [health, setHealth] = useState<Health | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [checking, setChecking] = useState(true);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compact, setCompact] = useState(native);
  const [avatarVisible, setAvatarVisible] = useState(true);
  const [modelMenu, setModelMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [copied, setCopied] = useState('');
  const [proposals, setProposals] = useState<Record<string, DesktopAction[]>>({});
  const request = useRef<{ id: string; controller: AbortController; userId: string } | null>(null);
  const healthCheck = useRef<AbortController | null>(null);
  const conversation = useRef(crypto.randomUUID());
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const busy = state === 'thinking';
  const connected = health?.status === 'ready';
  const cloudStatus = providers.find(value => value.provider === settings.provider);
  const currentModel = settings.provider === 'local' ? settings.model : settings.cloudModels[settings.provider];
  const modelReady = settings.provider === 'local' ? connected && health.models.includes(settings.model) : !!cloudStatus?.configured && cloudStatus.models.includes(currentModel);
  const modelName = settings.provider === 'local' ? modelChoices.find(m => m.id === settings.model)?.name ?? settings.model : `${providerNames[settings.provider]} · ${currentModel || 'add API key'}`;
  const availableModels = settings.provider === 'local' ? [...new Set([settings.model, ...(health?.models ?? []), ...modelChoices.map(m => m.id)])] : cloudStatus?.models ?? [];

  const refresh = useCallback(async () => {
    healthCheck.current?.abort();
    const controller = new AbortController();
    healthCheck.current = controller;
    setChecking(true);
    void getProviders(controller.signal).then(result => { if (mounted.current && !controller.signal.aborted) setProviders(result); }).catch(() => { /* local health still reports bridge errors */ });
    try { const result = await getHealth(controller.signal); if (mounted.current && !controller.signal.aborted) setHealth(result); }
    catch (err) {
      if (mounted.current && !controller.signal.aborted) setHealth({ api_version: '1', status: 'offline', models: [], route: 'local', detail: err instanceof Error ? err.message : 'Bridge unavailable' });
    } finally { if (mounted.current && healthCheck.current === controller) setChecking(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    let dispose: (() => void) | undefined;
    let disposed = false;
    void initDesktop(setNotice).then(cleanup => { if (disposed) cleanup(); else dispose = cleanup; });
    return () => {
      mounted.current = false; disposed = true; dispose?.(); clearInterval(interval); healthCheck.current?.abort();
      if (request.current) { void cancelChat(request.current.id).catch(() => {}); request.current.controller.abort(); }
    };
  }, [refresh]);
  useEffect(() => { if (!writeSettings(settings)) setNotice('Settings could not be saved in this browser.'); }, [settings]);
  useEffect(() => {
    if (!providers.some(provider => provider.loading)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void getProviders(controller.signal).then(result => { if (!controller.signal.aborted) setProviders(result); }).catch(() => {});
    }, 1000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [providers]);
  useEffect(() => {
    setSettings(previous => {
      const cloudModels = { ...previous.cloudModels };
      for (const status of providers) {
        if (status.configured && status.models.length && !status.models.includes(cloudModels[status.provider])) cloudModels[status.provider] = status.models[0];
      }
      return cloudModels.gemini === previous.cloudModels.gemini && cloudModels.grok === previous.cloudModels.grok ? previous : { ...previous, cloudModels };
    });
  }, [providers]);
  useEffect(() => { if (!saveHistory(messages, settings.rememberHistory)) setNotice('Chat history could not be saved.'); }, [messages, settings.rememberHistory]);
  useEffect(() => { void setTop(settings.alwaysOnTop).catch(() => setNotice('Could not change always-on-top. Please retry.')); }, [settings.alwaysOnTop]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: settings.reducedMotion ? 'instant' : 'smooth', block: 'nearest' }); }, [messages, busy, settings.reducedMotion]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setPage(p => p === 'settings' ? 'companion' : 'settings'); }
      if (event.key === 'Escape') { setModelMenu(false); setMoreMenu(false); if (page !== 'companion') setPage('companion'); else input.current?.blur(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') { event.preventDefault(); setPage('companion'); input.current?.focus(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [page]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings(previous => ({ ...previous, [key]: value })); }
  function chooseProvider(provider: Provider) {
    if (busy) return;
    update('provider', provider); setModelMenu(false); setError(''); dispatch('RESET');
  }
  function chooseModel(model: string) {
    if (settings.provider === 'local') update('model', model);
    else update('cloudModels', { ...settings.cloudModels, [settings.provider]: model });
  }
  function configuredProvider(status: ProviderStatus) {
    setProviders(previous => [...previous.filter(value => value.provider !== status.provider), status]);
    setSettings(previous => ({ ...previous, cloudModels: { ...previous.cloudModels, [status.provider]: status.models.includes(previous.cloudModels[status.provider]) ? previous.cloudModels[status.provider] : status.models[0] ?? '' } }));
  }
  async function submit(text = draft) {
    const content = text.trim();
    if (!content || request.current || content.length > 4000) return;
    if (!modelReady) { setPage('connection'); setNotice(settings.provider === 'local' ? 'Connect Ollama and select an installed model to start chatting.' : `Add your ${providerNames[settings.provider]} API key and choose a model.`); return; }
    const id = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const controller = new AbortController();
    request.current = { id, controller, userId };
    let context: Turn[] = messages.filter(m => m.status === 'complete' && (m.provider ?? 'local') === settings.provider).slice(-12).map(m => ({ role: m.role, content: m.content }));
    while (context.reduce((sum, m) => sum + m.content.length, 0) > 24000 || context.some(m => m.content.length > 8000)) context = context.slice(1);
    setMessages(previous => [...previous, { id: userId, role: 'user', content, status: 'pending', time: Date.now(), provider: settings.provider }]);
    setDraft(''); setError(''); dispatch('SEND');
    const timeout = setTimeout(() => {
      if (request.current?.id === id) { void cancelChat(id).catch(() => {}); controller.abort(new DOMException('Timed out', 'TimeoutError')); }
    }, 130000);
    try {
      const response = await chat({ request_id: id, conversation_id: conversation.current, message: content, model: currentModel, mode: settings.provider, history: context, ...(electron ? { desktop: true } : {}) }, controller.signal);
      if (!mounted.current || request.current?.id !== id || controller.signal.aborted) return;
      const replyId = crypto.randomUUID();
      if (electron && response.actions?.length) setProposals(previous => ({ ...previous, [replyId]: response.actions! }));
      setMessages(previous => [...previous.map(m => m.id === userId ? { ...m, status: 'complete' as const } : m), { id: replyId, role: 'assistant', content: response.reply, status: 'complete', time: Date.now(), latency: response.latency_ms, provider: response.route }]);
      dispatch('COMPLETE');
    } catch (err) {
      if (!mounted.current || request.current?.id !== id) return;
      setMessages(previous => previous.map(m => m.id === userId ? { ...m, status: 'failed' } : m));
      if (controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError') dispatch('CANCEL');
      else { setError(controller.signal.reason?.name === 'TimeoutError' ? 'The model took too long. Try a smaller model, or send a shorter message.' : err instanceof Error ? err.message : 'Something went wrong. Please retry.'); dispatch('FAIL'); }
    } finally { clearTimeout(timeout); if (request.current?.id === id) request.current = null; }
  }
  function cancel() {
    const current = request.current;
    if (!current) return;
    request.current = null;
    current.controller.abort();
    void cancelChat(current.id).catch(() => setNotice('The bridge did not confirm cancellation. The UI has stopped waiting.'));
    setMessages(previous => previous.map(m => m.id === current.userId ? { ...m, status: 'failed' } : m));
    dispatch('CANCEL'); setNotice('Response stopped.');
  }
  function clearChat() { if (request.current) cancel(); setMessages([]); setProposals({}); conversation.current = crypto.randomUUID(); setError(''); dispatch('RESET'); setMoreMenu(false); setNotice('Conversation cleared from this device.'); }
  function exportChat() {
    const body = messages.map(m => `${m.role === 'user' ? 'You' : 'Misaki'} · ${new Date(m.time).toLocaleString()}\n${m.content}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([body || 'No messages yet.'], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'misaki-conversation.txt'; link.click(); URL.revokeObjectURL(url); setMoreMenu(false);
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied(value); setTimeout(() => setCopied(''), 2000); } catch { setNotice('Copy unavailable. Select the command and copy it manually.'); } }

  const localConnectionPage = <div className="detail-page">
    <div className="eyebrow"><PlugZap size={14} /> LOCAL INTELLIGENCE</div><h1>A little setup.<br />A world of possibility.</h1><p className="page-intro">Give Misaki a mind of her own, right on your computer.<br />Free models. No accounts. No API bills.</p>
    <div className="connection-status"><div className={`status-icon ${connected ? 'good' : ''}`}>{checking ? <LoaderCircle className="spin" /> : connected ? <Check /> : <WifiOff />}</div><div><strong>{checking ? 'Checking your runtime…' : connected ? 'Ollama is connected' : 'Let’s connect Ollama'}</strong><p>{health?.detail ?? 'Looking for your local runtime.'}</p></div><button className="icon-button" title="Reconnect" aria-label="Reconnect" onClick={() => void refresh()} disabled={checking}><RefreshCw size={17} className={checking ? 'spin' : ''} /></button></div>
    <div className="setup-steps"><div><span className="step-number">01</span><div><h3>Install & open Ollama</h3><p>The free runtime that runs your model locally.</p><a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">Get Ollama for Windows <ArrowRight size={14}/></a></div></div><div><span className="step-number">02</span><div><h3>Choose your companion’s model</h3><p>Run the pull command in a terminal, then reconnect.</p></div></div></div>
    <div className="model-cards">{modelChoices.map(model => <div className={`model-card ${settings.model === model.id ? 'selected' : ''}`} key={model.id}><button className="model-select" onClick={() => update('model', model.id)} disabled={busy}><span className="radio">{settings.model === model.id && <span/>}</span><div><strong>{model.name}</strong><span className="tag">{model.tag}</span><p>{model.description}</p></div><small>{model.size}</small></button><button className="command" onClick={() => void copy(`ollama pull ${model.id}`)} aria-label={`Copy install command for ${model.name}`}><Terminal size={14}/><code>ollama pull {model.id}</code>{copied === `ollama pull ${model.id}` ? <Check size={14}/> : <span>Copy</span>}</button></div>)}</div>
    {(health?.models.length ?? 0) > 0 && <label className="field-label">Installed models<select value={settings.model} onChange={e => update('model', e.target.value)} disabled={busy}>{!health?.models.includes(settings.model) && <option value={settings.model}>{settings.model} (not installed)</option>}{health?.models.map(model => <option key={model}>{model}</option>)}</select></label>}
    <div className="privacy-note"><ShieldCheck size={19}/><p>Only local models are used. Your messages go to Ollama on this computer. Model downloads are a separate, explicit step.</p></div>
    <button className="primary" onClick={() => { if (modelReady) setPage('companion'); else void refresh(); }}>{modelReady ? 'Meet your companion' : 'Check connection'}<ArrowRight size={16}/></button>
  </div>;

  const connectionPage = <div>
    <div className="provider-tabs" role="group" aria-label="Model provider">{(['local', 'gemini', 'grok'] as const).map(provider => <button key={provider} type="button" aria-pressed={settings.provider === provider} disabled={busy} onClick={() => chooseProvider(provider)}>{providerNames[provider]}</button>)}</div>
    {settings.provider === 'local' ? localConnectionPage : <ProviderSettings key={settings.provider} provider={settings.provider} status={cloudStatus} model={currentModel} busy={busy} onModel={chooseModel} onConfigured={configuredProvider} onBack={() => setPage('companion')}/>}
  </div>;

  const settingsPage = <div className="detail-page settings-page"><div className="eyebrow"><Settings2 size={14}/> MAKE YOURSELF AT HOME</div><h1>Your companion,<br />your way.</h1><p className="page-intro">A few small things to make this space feel like you.</p>
    <section className="setting-section"><h3><Monitor size={17}/> Presence</h3><div className="setting-row"><div><strong>Always on top</strong><p>Keep Misaki beside your work in the desktop app.</p></div><Toggle label="Always on top" checked={settings.alwaysOnTop} onChange={v => update('alwaysOnTop', v)}/></div><div className="setting-row"><div><strong>Reduced motion</strong><p>A still avatar and gentler transitions.</p></div><Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={v => update('reducedMotion', v)}/></div><div className="setting-row"><div><strong>Character size</strong><p>A little more or a little less presence.</p></div><select aria-label="Character size" value={settings.scale} onChange={e => update('scale', Number(e.target.value))}><option value={0.85}>Small</option><option value={1}>Default</option><option value={1.15}>Large</option></select></div></section>
    <section className="setting-section"><h3><LockKeyhole size={17}/> Your space, protected</h3><div className="setting-row"><div><strong>Keep conversation history</strong><p>{settings.rememberHistory ? 'Saved on this device. Switch off to delete saved history.' : 'Off by default. This conversation lasts for this session.'}</p></div><Toggle label="Keep conversation history" checked={settings.rememberHistory} onChange={v => update('rememberHistory', v)}/></div><div className="setting-row"><div><strong>Clear this conversation</strong><p>Delete current and saved messages from this device.</p></div><button className="button subtle danger" onClick={clearChat}><Trash2 size={15}/>Clear</button></div></section>
    <section className="setting-section"><h3><Monitor size={17}/> Computer actions</h3><p className="muted">{electron ? 'Ask Misaki to open a file, open Downloads, play music, show a file in Explorer, or open a website. Review the target before opening. File contents stay on your computer.' : 'Launch npm run desktop to let Misaki open files and folders, play music, and open websites through Electron.'}</p><p className="muted">Cloud providers receive the paths you type in chat. Programs and scripts cannot be launched.</p></section><section className="setting-section"><h3><Sparkles size={17}/> A work in progress</h3><p className="muted">Voice, push-to-talk, and LocalMind memory are future milestones. The microphone is never accessed in this version.</p><div className="shortcut-list"><span>Focus chat<kbd>Ctrl L</kbd></span><span>Open preferences<kbd>Ctrl ,</kbd></span><span>Recover desktop window<kbd>Ctrl Shift M</kbd></span></div></section>
    <button className="button" onClick={() => { setSettings(DEFAULTS); setNotice('Preferences restored to defaults.'); }}>Restore defaults</button>
  </div>;

  return <div className={`app-shell ${compact ? 'compact' : ''} ${native ? 'native' : ''} ${settings.reducedMotion ? 'reduced-motion' : ''}`} data-page={page}>
    <div className="japanese-backdrop" aria-hidden="true"/>
    {!compact && <aside className="rail"><button className="brand-mark" title="Misaki home" aria-label="Misaki home" onClick={() => setPage('companion')}><span>m</span><Sparkles size={12}/></button><div className="rail-nav">{([{ id: 'companion', icon: MessageCircle, label: 'Companion' }, { id: 'connection', icon: PlugZap, label: 'Connection' }, { id: 'settings', icon: Settings2, label: 'Preferences' }] as const).map(item => <button key={item.id} className={`rail-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)} title={item.label} aria-label={item.label} aria-current={page === item.id ? 'page' : undefined}><item.icon size={21}/><span>{item.label}</span></button>)}</div><div className="rail-bottom"><button className="icon-button" title="Setup guide" aria-label="Setup guide" onClick={() => setPage('connection')}><CircleHelp size={20}/></button><span className="profile">P<span/></span></div></aside>}
    <div className="workspace">
      <header className="topbar"><div className="wordmark"><Flower2 size={22}/><strong>misaki<span> / </span></strong><span className="top-subtitle">a little company, a little magic.</span></div><div className="top-actions">{!compact && <span className="local-badge"><span/>LOCAL FIRST</span>}{compact && <button className="icon-button drag-handle" title="Drag companion" aria-label="Drag companion window" onPointerDown={() => void dragWindow().catch(() => setNotice('Could not move window.'))}><GripHorizontal size={18}/></button>}{compact && <button className="icon-button" aria-label="Preferences" title="Preferences" onClick={() => setPage(p => p === 'settings' ? 'companion' : 'settings')}><Settings2 size={16}/></button>}<button className="icon-button" title={compact ? 'Expand studio' : 'Preview desktop view'} aria-label={compact ? 'Expand studio' : 'Preview desktop view'} onClick={() => { if (native) setNotice('This is the desktop companion. Use preferences to customize it.'); else setCompact(v => !v); }}>{compact ? <Expand size={16}/> : <Maximize2 size={16}/>}</button></div></header>
      {page === 'companion' ? <main className="companion-page"><div className="page-heading"><div><div className="eyebrow">YOUR EVERYDAY COMPANION</div><h1>{greeting()}, <span>Priyadharshan.</span><span className="greeting-flower">✳</span></h1><p>A quiet corner, just for you and Misaki.</p></div><button className="button desktop-button" onClick={() => setCompact(true)}><Monitor size={16}/>Desktop view<ArrowRight size={14}/></button></div>
        <div className="companion-grid"><section className={`presence-card ${!avatarVisible ? 'avatar-hidden' : ''}`} aria-label="Companion avatar"><div className="presence-top"><span className="character-label"><span/>MAKOTO MISAKI</span><button className={`icon-button ${settings.alwaysOnTop ? 'pinned' : ''}`} aria-label="Toggle always on top" title="Always on top" onClick={() => update('alwaysOnTop', !settings.alwaysOnTop)}><Pin size={16}/></button></div><div className="avatar-scene"><div className="scene-circle"/><div className="scene-orbit"/><span className="scene-star star-one">✧</span><span className="scene-star star-two">✦</span><span className="scene-star star-three">✧</span><span className="scene-caption">そばにいるよ</span>{avatarVisible ? <Avatar state={state} reducedMotion={settings.reducedMotion} scale={settings.scale}/> : <div className="hidden-state"><Moon size={35}/><p>Taking a little quiet time.</p><button className="button" onClick={() => setAvatarVisible(true)}>Show Misaki</button></div>}<div className="character-caption"><span>まこと みさき</span><h2>A little presence.<br />A softer kind of everyday.</h2></div></div><div className="presence-bottom"><div className={`state-pill ${busy ? 'thinking' : ''}`}><span/>{stateLabels[state]}</div><div><button className="icon-button" title={avatarVisible ? 'Hide avatar' : 'Show avatar'} aria-label={avatarVisible ? 'Hide avatar' : 'Show avatar'} onClick={() => { if (native) void hideWindow().catch(() => setNotice('Could not hide window.')); else setAvatarVisible(v => !v); }}><Minus size={18}/></button><button className="icon-button" title="Character preferences" aria-label="Character preferences" onClick={() => setPage('settings')}><Settings2 size={16}/></button></div></div></section>
          <section className="chat-card" aria-label="Conversation"><div className="chat-header"><span className="mini-avatar"><Flower2 size={20}/></span><div><h2>A moment with Misaki</h2><p><span className={`connection-dot ${modelReady ? 'connected' : ''}`}/>{settings.provider === 'local' && checking && !health ? 'Finding your local mind…' : modelReady ? settings.provider === 'local' ? 'Here for you · running locally' : `Here for you · ${providerNames[settings.provider]} cloud` : 'Your space is ready · connect a model'}</p></div><div className="menu-wrap"><button className="icon-button" title="Conversation options" aria-label="Conversation options" aria-expanded={moreMenu} onClick={() => setMoreMenu(v => !v)}><Ellipsis size={21}/></button>{moreMenu && <div className="dropdown options-menu"><button onClick={clearChat}><Trash2 size={14}/>Clear conversation</button><button onClick={exportChat}><Download size={14}/>Export as text</button><button onClick={() => { setMoreMenu(false); setPage('settings'); }}><Settings2 size={14}/>Preferences</button></div>}</div></div>
            <div className="chat-scroll" role="log" aria-live="polite" aria-relevant="additions text">{messages.length === 0 ? <div className="chat-welcome"><span className="welcome-icon"><Sparkles size={23}/></span><div className="eyebrow">A NEW LITTLE BEGINNING</div><h3>Hey, I’m Misaki.<span>It’s nice to be here.</span></h3><p>Bring your big ideas, your tangled code,<br className="wide-only"/> or just yourself. We’ll figure it out together.</p><div className="starter-grid"><button onClick={() => { setDraft('Help me untangle a coding problem.'); input.current?.focus(); }}><Code2 size={17}/><span>Untangle some code</span><ArrowRight size={14}/></button><button onClick={() => { setDraft('Help me plan a calm, focused day.'); input.current?.focus(); }}><Leaf size={17}/><span>Find a little focus</span><ArrowRight size={14}/></button><button onClick={() => { setDraft('Hi Misaki! Let’s get to know each other.'); input.current?.focus(); }}><Coffee size={17}/><span>Just have a chat</span><ArrowRight size={14}/></button></div></div> : <div className="message-list"><div className="conversation-date">{new Date(messages[0].time).toLocaleDateString([], { month: 'long', day: 'numeric' })} · your little corner</div>{messages.map(message => <article key={message.id} className={`message ${message.role} ${message.status === 'failed' ? 'failed' : ''}`}><div className="message-meta">{message.role === 'assistant' ? 'Misaki' : 'You'}<span>{time(message.time)}</span></div><div className="message-body">{message.content}</div>{proposals[message.id] && <DesktopActions actions={proposals[message.id]} onResult={content => setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', content, time: Date.now(), status: 'complete', provider: message.provider }])}/>}{message.status === 'failed' && <small>Not included in the next reply’s context.</small>}{message.latency !== undefined && <small>{(message.latency / 1000).toFixed(1)}s · {(message.provider ?? 'local') === 'local' ? 'local inference' : `${providerNames[message.provider!]} cloud`}</small>}</article>)}{busy && <div className="thinking-message"><span/><span/><span/><small>Misaki is thinking…</small></div>}<div ref={bottom}/></div>}</div>
            {error && <div className="chat-error" role="alert"><WifiOff size={16}/><div>{error}<button onClick={() => { const last = messages.filter(m => m.role === 'user').at(-1); if (last) void submit(last.content); }}>Try again<RefreshCw size={12}/></button></div><button className="icon-button" aria-label="Dismiss error" onClick={() => { setError(''); dispatch('RESET'); }}><X size={14}/></button></div>}
            <div className="composer-area">{!modelReady && <button className="connect-prompt" onClick={() => setPage('connection')}><PlugZap size={15}/><span>{settings.provider === 'local' ? 'Connect a free local model to begin' : `Connect ${providerNames[settings.provider]} to begin`}</span><ArrowRight size={14}/></button>}<form className={`composer ${busy ? 'busy' : ''}`} onSubmit={e => { e.preventDefault(); void submit(); }}><textarea ref={input} aria-label="Message Misaki" placeholder="What’s on your mind?" value={draft} maxLength={4000} rows={2} disabled={busy} onFocus={() => dispatch('TYPE')} onBlur={() => dispatch('BLUR')} onChange={e => { setDraft(e.target.value); dispatch('TYPE'); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}/><div className="composer-bottom"><span><LockKeyhole size={12}/>{draft.length > 3600 ? `${draft.length}/4000` : settings.provider === 'local' ? 'Just between us, on your device.' : `Sent to ${providerNames[settings.provider]} · API usage may be billed`}</span>{busy ? <button className="send-button stop" type="button" aria-label="Stop response" title="Stop response" onClick={cancel}><Square size={15}/></button> : <button className="send-button" type="submit" aria-label="Send message" title="Send message" disabled={!draft.trim()}><ArrowRight size={18}/></button>}</div></form><div className="model-footer"><div className="menu-wrap"><button className="model-picker" aria-label="Select model" aria-expanded={modelMenu} onClick={() => setModelMenu(v => !v)} disabled={busy}><span className={`connection-dot ${modelReady ? 'connected' : ''}`}/><span className="selected-model-name">{modelName}</span><ChevronDown size={12}/></button>{modelMenu && <div className="dropdown model-dropdown"><div className="provider-tabs menu-provider-tabs" role="group" aria-label="Choose provider">{(['local', 'gemini', 'grok'] as const).map(provider => <button key={provider} type="button" aria-pressed={settings.provider === provider} onClick={() => { chooseProvider(provider); if (provider !== 'local' && !providers.find(value => value.provider === provider)?.configured) setPage('connection'); else setModelMenu(true); }}>{providerNames[provider]}</button>)}</div><div className="provider-model-list">{availableModels.map(model => <button key={model} onClick={() => { chooseModel(model); setModelMenu(false); }}><span>{model}</span>{currentModel === model && <Check size={14}/>}<small>{settings.provider === 'local' ? health?.models.includes(model) ? 'Installed' : 'Needs download' : providerNames[settings.provider]}</small></button>)}</div><button onClick={() => { setModelMenu(false); setPage('connection'); }}>Manage connection & API keys<ArrowRight size={14}/></button></div>}</div><span>Enter to send <span>↵</span></span></div></div></section></div>
        <footer className="bottom-strip"><div><ShieldCheck size={17}/><span>Your world stays yours.</span><p>Private by default. Local by design.</p></div><span className="made-with">Made for the everyday <Heart size={12}/></span></footer>
      </main> : <main className="detail-container"><button className="back-link" onClick={() => setPage('companion')}>← Back to your companion</button>{page === 'connection' ? connectionPage : settingsPage}</main>}
    </div>{notice && <div className="toast" role="status"><Sparkles size={16}/>{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={14}/></button></div>}
  </div>;
}

