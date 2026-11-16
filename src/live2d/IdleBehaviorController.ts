export type IdleState = 'idle' | 'waiting' | 'bored' | 'sleepy' | 'attention' | 'conversation' | 'executing';
export const gestures = ['look-around', 'head-tilt', 'nod', 'weight-shift', 'soft-smile', 'thinking', 'yawn', 'sleepy', 'pout'] as const;
export type Gesture = typeof gestures[number];
export interface IdleOptions {
  enabled: boolean; sleepy: boolean; activity: number; executing: boolean;
  waitingAfter: number; boredAfter: number; sleepyAfter: number; intensity: number;
}
export const idleDefaults: IdleOptions = { enabled: true, sleepy: true, activity: 0, executing: false, waitingAfter: 30, boredAfter: 90, sleepyAfter: 600, intensity: 1 };

/** A local animation clock: paused frames never accumulate inactivity. */
export class IdleBehaviorController {
  private time = 0;
  private inactive = 0;
  private activity = 0;
  private attentionUntil = 0;
  private next = 0;
  private last?: Gesture;
  private cooldown = new Map<Gesture, number>();
  private gesture?: { kind: Gesture; start: number; duration: number; side: number };
  constructor(private random = Math.random) { this.next = 2 + random() * 2; }
  update(dt: number, conversation: boolean, options: IdleOptions = idleDefaults) {
    this.time += dt;
    if (options.activity !== this.activity) {
      if (this.inactive >= options.waitingAfter) this.attentionUntil = this.time + 3;
      this.activity = options.activity; this.inactive = 0; this.gesture = undefined; this.next = this.time + 2;
    }
    if (conversation || options.executing) this.inactive = 0; else this.inactive += dt;
    const state: IdleState = options.executing ? 'executing' : conversation ? 'conversation' : this.time < this.attentionUntil ? 'attention'
      : options.sleepy && this.inactive >= options.sleepyAfter ? 'sleepy' : this.inactive >= options.boredAfter ? 'bored' : this.inactive >= options.waitingAfter ? 'waiting' : 'idle';
    if (!options.enabled || conversation || options.executing) { this.gesture = undefined; this.next = this.time + 2; }
    else if (!this.gesture && this.time >= this.next) {
      const weights: Record<Gesture, number> = { 'look-around': state === 'waiting' ? 5 : 3, 'head-tilt': 3, nod: 2, 'weight-shift': 3, 'soft-smile': 1.5,
        thinking: state === 'bored' ? 2 : .5, yawn: options.sleepy && state === 'sleepy' ? 2 : 0, sleepy: options.sleepy && state === 'sleepy' ? 3 : 0, pout: state === 'bored' ? .3 : 0 };
      const choices = gestures.filter(kind => kind !== this.last && weights[kind] > 0 && (this.cooldown.get(kind) ?? 0) <= this.time);
      let roll = this.random() * choices.reduce((sum, kind) => sum + weights[kind], 0);
      const kind = choices.find(kind => (roll -= weights[kind]) < 0) ?? choices.at(-1);
      if (kind) {
        this.gesture = { kind, start: this.time, duration: 2.5 + this.random() * 2, side: this.random() < .5 ? -1 : 1 };
        this.last = kind;
        this.cooldown.set(kind, this.time + (['yawn', 'sleepy', 'pout'].includes(kind) ? 60 : 12));
      } else this.next = this.time + 2;
    }
    const gesture = this.gesture;
    const phase = gesture ? (this.time - gesture.start) / gesture.duration : 0;
    if (phase >= 1) { this.gesture = undefined; this.next = this.time + 4 + this.random() * 5; }
    return { state, action: this.gesture?.kind ?? 'rest' as Gesture | 'rest', phase: this.gesture ? phase : 0, side: this.gesture?.side ?? 1, inactive: this.inactive };
  }
}

/** Only one unsolicited message per unanswered stretch; failures back off too. */
export class IdleConversationScheduler {
  private quiet = 0;
  private elapsed = 0;
  private lastAttempt = -Infinity;
  private sent = false;
  private delay: number;
  constructor(private frequency: number, private random = Math.random) { this.delay = frequency * (1 + random() * .35); }
  activity() { this.quiet = 0; this.sent = false; this.delay = this.frequency * (1 + this.random() * .35); }
  tick(seconds: number, blocked: boolean, cooldown: number) {
    this.elapsed += seconds;
    if (blocked) { this.quiet = 0; return false; }
    this.quiet += seconds;
    return !this.sent && this.quiet >= this.delay && this.elapsed - this.lastAttempt >= cooldown;
  }
  attempted() { this.sent = true; this.lastAttempt = this.elapsed; }
}
