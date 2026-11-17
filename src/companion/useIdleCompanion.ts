import { useEffect, useRef, useState } from 'react';
import { chat, cancelChat, type ChatReply, type Provider, type Turn } from '../api/client';
import type { Message, Settings } from '../app/storage';
import { IdleConversationScheduler } from '../live2d/IdleBehaviorController';

type Options = { settings: Settings; provider: Provider; model: string; ready: boolean; blocked: boolean; messages: Message[]; conversation: string; onReply: (reply: ChatReply) => void; onTask: (status: string) => void };
export default function useIdleCompanion(options: Options) {
  const current = useRef(options); current.current = options;
  const [activity, setActivity] = useState(0);
  const [executing, setExecuting] = useState(false);
  const [status, setStatus] = useState('');
  const pending = useRef<{ id: string; abort: AbortController } | null>(null);
  const scheduler = useRef(new IdleConversationScheduler(options.settings.idleFrequency));
  const revision = useRef(0);
  const lastActivity = useRef(0);
  const lastTick = useRef(performance.now());
  const nativeTasks = useRef(0);
  const checking = useRef(false);
  const cancel = () => {
    revision.current++;
    if (pending.current) { const request = pending.current; pending.current = null; request.abort.abort(); void cancelChat(request.id).catch(() => {}); }
  };
  const interact = () => {
    cancel(); scheduler.current.activity();
    lastTick.current = performance.now();
    if (performance.now() - lastActivity.current > 500) { lastActivity.current = performance.now(); setActivity(value => value + 1); }
  };
  useEffect(() => {
    const visibility = () => { interact(); };
    const task = (event: Event) => {
      const phase = (event as CustomEvent<{ phase: string }>).detail.phase;
      nativeTasks.current = Math.max(0, nativeTasks.current + (phase === 'start' ? 1 : -1));
      setExecuting(nativeTasks.current > 0); interact();
      if (phase === 'end') current.current.onTask((event as CustomEvent<{ status: string }>).detail.status);
    };
    const move = () => { if (performance.now() - lastActivity.current > 1000) interact(); };
    window.addEventListener('pointermove', move, { passive: true });
    for (const name of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(name, interact, { passive: true });
    window.addEventListener('misaki-desktop-task', task);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancel(); window.removeEventListener('pointermove', move);
      for (const name of ['pointerdown', 'keydown', 'wheel']) window.removeEventListener(name, interact);
      window.removeEventListener('misaki-desktop-task', task); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    cancel(); scheduler.current = new IdleConversationScheduler(options.settings.idleFrequency); setStatus('');
    return cancel;
  }, [options.settings.idleConversations, options.settings.idleFrequency, options.settings.idleCooldown, options.provider, options.model, options.conversation]);
  useEffect(() => { if (options.blocked || !options.ready) { cancel(); scheduler.current.activity(); } }, [options.blocked, options.ready]);
  useEffect(() => {
    const blocked = () => document.hidden || current.current.blocked || !current.current.ready || !current.current.settings.idleConversations || nativeTasks.current > 0 || !!document.querySelector('[role="dialog"]') || !!window.speechSynthesis?.speaking;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(0, (now - lastTick.current) / 1000);
      lastTick.current = now;
      if (blocked() || checking.current || pending.current) { scheduler.current.tick(elapsed, true, current.current.settings.idleCooldown); return; }
      if (!scheduler.current.tick(elapsed, false, current.current.settings.idleCooldown)) return;
      const stamp = revision.current;
      checking.current = true;
      void (async () => {
        // Query player state locally only when a starter is due. Never send
        // paths, player context or screenshots in an autonomous request.
        if (window.misakiDesktop) {
          try {
            const media = await window.misakiDesktop.mediaStatus();
            if (media.state === 'playing') { scheduler.current.tick(0, true, current.current.settings.idleCooldown); return; }
          } catch { scheduler.current.tick(0, true, current.current.settings.idleCooldown); setStatus('Conversation starters are paused while playback status is unavailable.'); return; }
        }
        if (stamp !== revision.current || blocked()) return;
        const snapshot = current.current;
        const id = crypto.randomUUID(), abort = new AbortController();
        pending.current = { id, abort }; scheduler.current.attempted(); setStatus('');
        let history: Turn[] = snapshot.messages.filter(message => message.status === 'complete' && (message.provider ?? 'local') === snapshot.provider).slice(-12).map(({ role, content }) => ({ role, content }));
        while (history.some(turn => turn.content.length > 8000) || history.reduce((sum, turn) => sum + turn.content.length, 0) > 24000) history = history.slice(1);
        const timeout = setTimeout(() => { abort.abort(); void cancelChat(id).catch(() => {}); }, 45000);
        try {
          const reply = await chat({ request_id: id, conversation_id: snapshot.conversation, kind: 'idle', message: 'Offer a brief optional conversation starter.', model: snapshot.model, mode: snapshot.provider, history, temperature: snapshot.settings.temperature, max_tokens: snapshot.settings.maxTokens }, abort.signal);
          if (stamp !== revision.current || abort.signal.aborted || blocked()) return;
          // Recheck music before delivery; starting playback during generation
          // must not cause an interruption when the response finishes.
          if (window.misakiDesktop && (await window.misakiDesktop.mediaStatus()).state === 'playing') return;
          if (stamp !== revision.current || blocked() || abort.signal.aborted) return;
          const normalized = reply.reply.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          if (snapshot.messages.slice(-12).some(message => message.role === 'assistant' && message.content.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === normalized)) return;
          snapshot.onReply({ ...reply, actions: [] });
        } catch { if (!abort.signal.aborted && stamp === revision.current) setStatus('The last conversation starter was unavailable. Normal chat still works; no automatic retry.'); }
        finally { clearTimeout(timeout); if (pending.current?.id === id) pending.current = null; }
      })().finally(() => { checking.current = false; });
    }, 1000);
    return () => { clearInterval(timer); cancel(); };
  }, []);
  return { activity, executing, interact, status };
}
