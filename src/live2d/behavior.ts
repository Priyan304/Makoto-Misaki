import type { CompanionState } from '../companion/controller';
import type { ExpressionId } from './expressions';

export const emotions = ['neutral', 'happy', 'affectionate', 'amused', 'curious', 'concerned', 'sad', 'surprised', 'angry'] as const;
export type Emotion = typeof emotions[number];
export type Reaction = { id: string; emotion: Emotion; phase?: 'reply' };
export const isEmotion = (value: unknown): value is Emotion => typeof value === 'string' && emotions.includes(value as Emotion);

// A small, immediate cue while the chosen chat model prepares its contextual
// reaction. Only submitted user text is examined; no extra API call is made.
export function immediateEmotion(message: string): Emotion {
  const text = message.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(sad|lonely|upset|anxious|worried|stressed|depressed|grieving|frustrated)\b|\b(bad|rough|terrible) day\b|😢|😭/.test(text)) return 'concerned';
  if (/\b(?:i love you|love you misaki|you're (?:so )?(?:cute|beautiful)|you are (?:so )?(?:cute|beautiful))\b|🥰|💕/.test(text)) return 'affectionate';
  if (/\b(?:thank you|thanks|i did it|i passed|we did it|great news)\b|🎉/.test(text)) return 'happy';
  if (/\b(?:haha|hahaha|lol)\b|😂|🤣/.test(text)) return 'amused';
  if (/\b(?:how|why|what|explain|help)\b|\?/.test(text)) return 'curious';
  return 'neutral';
}

type Pose = Record<string, number>;
const neutral: Pose = {
  ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
  ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
  ParamEyeBallX: 0, ParamEyeBallY: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1,
  ParamBrowLY: 0, ParamBrowRY: 0, ParamBrowLForm: 0, ParamBrowRForm: 0,
  ParamMouthForm: 0, ParamMouthOpenY: 0,
};
const moods: Record<Emotion, { pose: Pose; expressions?: ExpressionId[] }> = {
  neutral: { pose: {} },
  happy: { pose: { ParamMouthForm: .65, ParamAngleZ: -3, ParamBrowLY: .12, ParamBrowRY: .12 } },
  affectionate: { pose: { ParamMouthForm: .55, ParamAngleZ: 5, ParamAngleY: -2 }, expressions: ['heart-eyes', 'blush'] },
  amused: { pose: { ParamMouthForm: .85, ParamEyeLOpen: .75, ParamEyeROpen: .75, ParamAngleZ: -4 } },
  curious: { pose: { ParamAngleZ: 7, ParamAngleY: 3, ParamBrowLY: .3, ParamBrowRY: .15 } },
  concerned: { pose: { ParamAngleZ: -4, ParamAngleY: -3, ParamBrowLForm: -.4, ParamBrowRForm: -.4, ParamMouthForm: -.2 } },
  sad: { pose: { ParamAngleY: -5, ParamEyeLOpen: .8, ParamEyeROpen: .8, ParamBrowLForm: -.65, ParamBrowRForm: -.65, ParamMouthForm: -.45 } },
  surprised: { pose: { ParamAngleY: 4, ParamBrowLY: .6, ParamBrowRY: .6, ParamMouthOpenY: .25 } },
  angry: { pose: { ParamAngleY: -3, ParamAngleZ: 2 }, expressions: ['angry'] },
};

export const gestures = ['look-around', 'head-tilt', 'nod', 'weight-shift', 'soft-smile'] as const;
type Gesture = typeof gestures[number];
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Only advances on visible animation frames. No timers, network or OS actions. */
export class AvatarBehavior {
  private time = 0;
  private idleTime = 0;
  private nextGesture: number;
  private gesture?: { kind: Gesture; start: number; duration: number; side: number };
  private previous?: Gesture;
  private nextBlink: number;
  private blinkStart = -10;
  private reactionKey = '';
  private reactionAge = 0;
  private pose = { ...neutral };

  constructor(private random = Math.random) {
    this.nextGesture = 2 + random() * 2;
    this.nextBlink = 2 + random() * 3;
  }

  update(dt: number, state: CompanionState, reaction?: Reaction, still = false) {
    const key = `${reaction?.id ?? ''}:${reaction?.emotion ?? 'neutral'}:${reaction?.phase ?? 'input'}`;
    if (key !== this.reactionKey) { this.reactionKey = key; this.reactionAge = 0; }
    const step = still ? 0 : Math.max(0, Math.min(dt, .05));
    this.time += step;
    this.reactionAge += step;
    const emotion = reaction?.emotion ?? 'neutral';
    // Hold a reaction, then gently return to a relaxed face during a long idle.
    const intensity = still ? 1 : 1 - smooth(Math.min(1, Math.max(0, (this.reactionAge - 18) / 6)));
    const target = { ...neutral };
    for (const [id, value] of Object.entries(moods[emotion].pose)) target[id] += (value - neutral[id]) * intensity;
    if (state === 'thinking') { target.ParamAngleY -= 3; target.ParamAngleZ += 3; target.ParamEyeBallY = .2; }
    if (state === 'listening') target.ParamAngleY += 2;
    if (state === 'error') { target.ParamBrowLY = -.2; target.ParamBrowRY = -.2; }

    let action: Gesture | 'rest' = 'rest';
    if (!still) {
      target.ParamAngleX += Math.sin(this.time * .65) * 2;
      target.ParamAngleZ += Math.sin(this.time * .43) * 1.3;
      target.ParamBodyAngleX += Math.sin(this.time * .4) * 1.4;
      if (state === 'idle') {
        this.idleTime += step;
        if (!this.gesture && this.idleTime >= this.nextGesture) {
          const choices = gestures.filter(kind => kind !== this.previous);
          const kind = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
          this.gesture = { kind, start: this.idleTime, duration: 2.5 + this.random() * 2, side: this.random() < .5 ? -1 : 1 };
          this.previous = kind;
        }
        if (this.gesture) {
          const { kind, start, duration, side } = this.gesture;
          const phase = (this.idleTime - start) / duration;
          if (phase >= 1) {
            this.gesture = undefined;
            this.nextGesture = this.idleTime + 4 + this.random() * 5;
          } else {
            action = kind;
            const amount = Math.sin(Math.PI * phase) ** 2;
            if (kind === 'look-around') { target.ParamAngleX += side * 11 * amount; target.ParamEyeBallX = side * .55 * amount; target.ParamAngleY += 3 * amount; }
            if (kind === 'head-tilt') { target.ParamAngleZ += side * 9 * amount; target.ParamBodyAngleZ -= side * 2 * amount; }
            if (kind === 'nod') target.ParamAngleY -= Math.sin(phase * Math.PI * 4) * 6 * amount;
            if (kind === 'weight-shift') { target.ParamBodyAngleX += side * 7 * amount; target.ParamBodyAngleZ += side * 3 * amount; target.ParamAngleZ -= side * 3 * amount; }
            // A sympathetic face must not randomly turn into a grin.
            if (kind === 'soft-smile' && (intensity === 0 || ['neutral', 'happy', 'affectionate', 'amused'].includes(emotion))) {
              target.ParamMouthForm += .5 * amount;
              target.ParamEyeLOpen -= .22 * amount; target.ParamEyeROpen -= .22 * amount;
            }
          }
        }
      } else {
        this.gesture = undefined;
        this.nextGesture = this.idleTime + 2 + this.random() * 2;
      }
    }
    const blend = still ? 1 : 1 - Math.exp(-step / .18);
    for (const id of Object.keys(target)) this.pose[id] += (target[id] - this.pose[id]) * blend;
    const parameters = { ...this.pose };
    if (!still) {
      if (this.time >= this.nextBlink) { this.blinkStart = this.time; this.nextBlink = this.time + 2.8 + this.random() * 3.5; }
      const phase = (this.time - this.blinkStart) / .2;
      const open = phase >= 0 && phase <= 1 ? Math.abs(phase * 2 - 1) : 1;
      parameters.ParamEyeLOpen *= open; parameters.ParamEyeROpen *= open;
    }
    return { parameters, action, emotion: intensity > 0 ? emotion : 'neutral', intensity, expressions: moods[emotion].expressions ?? [] };
  }
}
