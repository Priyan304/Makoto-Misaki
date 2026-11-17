import type { Settings } from './storage';

export default function BehaviorSettings({ settings, update, status }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; status: string }) {
  return <section className="setting-section"><h3>Companion behavior</h3>
    {([
      ['idleAnimations', 'Random idle gestures', 'Head turns, nods and occasional expressions, even without an AI connection.'],
      ['sleepyBehavior', 'Sleepy behavior', 'Gentle sleepy eyes and yawns after a quiet stretch.'],
      ['idleConversations', 'Conversation starters', 'Let Misaki occasionally start a conversation using your selected model. Cloud requests may be billed.'],
    ] as const).map(([key, title, detail]) => <div className="setting-row" key={key}><div><strong>{title}</strong><p>{detail}</p></div><button type="button" className={`toggle ${settings[key] ? 'on' : ''}`} role="switch" aria-label={title} aria-checked={settings[key]} onClick={() => update(key, !settings[key])}><span/></button></div>)}
    <div className="setting-row"><div><strong>Conversation frequency</strong><p>Time since you last interacted with Misaki, plus a small random delay.</p></div><select aria-label="Conversation frequency" value={settings.idleFrequency} onChange={event => update('idleFrequency', Number(event.target.value))}>{[120,180,300,600].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} minutes</option>)}</select></div>
    <div className="setting-row"><div><strong>Message cooldown</strong><p>Minimum gap between starters. At most one until you interact again.</p></div><select aria-label="Idle message cooldown" value={settings.idleCooldown} onChange={event => update('idleCooldown', Number(event.target.value))}>{[300,600,1200,1800].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} minutes</option>)}</select></div>
    <div className="setting-row"><div><strong>Sleepy after</strong><p>Quiet time before sleepy gestures become available.</p></div><select aria-label="Sleepy after" value={settings.sleepyAfter} onChange={event => update('sleepyAfter', Number(event.target.value))}>{[300,600,1200].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} minutes</option>)}</select></div>
    <div className="setting-row"><div><strong>Animation intensity</strong><p>Strength of automatic expressions and movements.</p></div><select aria-label="Animation intensity" value={settings.animationIntensity} onChange={event => update('animationIntensity', Number(event.target.value))}><option value={.4}>Subtle</option><option value={.7}>Gentle</option><option value={1}>Full</option></select></div>
    <p className="muted">Starters pause while you type, play music in Misaki, use desktop tools, or hide the app. They cannot capture your screen or perform computer actions.</p>
    {status && <p className="muted" role="status">{status}</p>}
    <h3>AI response settings</h3>
    <div className="setting-row"><div><strong>Response variety</strong><p>Controls sampling for Gemini and local models.</p></div><select aria-label="Response variety" value={settings.temperature} onChange={event => update('temperature',Number(event.target.value))}><option value={.3}>Focused</option><option value={.7}>Balanced</option><option value={1}>Varied</option></select></div>
    <div className="setting-row"><div><strong>Response limit</strong><p>Maximum output tokens; local models use a smaller resource limit.</p></div><select aria-label="Response limit" value={settings.maxTokens} onChange={event => update('maxTokens',Number(event.target.value))}>{[512,1024,4096,8192].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <div className="setting-row"><div><strong>Offer local fallback</strong><p>When cloud chat fails, offer a retry with your selected local model. Screenshots and desktop tool turns are never retried automatically.</p></div><button className={`toggle ${settings.fallbackLocal ? 'on' : ''}`} role="switch" aria-label="Offer local fallback" aria-checked={settings.fallbackLocal} onClick={() => update('fallbackLocal',!settings.fallbackLocal)}><span/></button></div>
  </section>;
}
