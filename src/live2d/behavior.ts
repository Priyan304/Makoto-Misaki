import type { CompanionState } from '../companion/controller';
import type { ExpressionId } from './expressions';
import { IdleBehaviorController, idleDefaults, type IdleOptions } from './IdleBehaviorController';
export { gestures } from './IdleBehaviorController';

export const emotions = ['neutral', 'happy', 'affectionate', 'amused', 'curious', 'concerned', 'sad', 'surprised', 'angry', 'embarrassed', 'thinking', 'relieved', 'sleepy'] as const;
export const motions = ['idle', 'nod', 'shake-head', 'look-around', 'yawn', 'laugh', 'thinking'] as const;
export const expressions = ['neutral', 'smile', 'sad', 'blush', 'angry', 'surprised', 'thinking', 'relaxed', 'sleepy', 'heart-eyes'] as const;
export type AvatarMetadata = { emotion?: Emotion; expression?: typeof expressions[number]; motion?: typeof motions[number]; intensity?: number };
export type Emotion = typeof emotions[number];
export type Reaction = AvatarMetadata & { id: string; emotion: Emotion; phase?: 'reply' };
export const isEmotion = (value: unknown): value is Emotion => typeof value === 'string' && emotions.includes(value as Emotion);

// A small, immediate cue while the chosen chat model prepares its contextual
// reaction. Only submitted user text is examined; no extra API call is made.
export function immediateEmotion(message: string): Emotion {
  const text = message.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(sad|lonely|upset|anxious|worried|stressed|depressed|grieving|frustrated)\b|\b(bad|rough|terrible) day\b|😢|😭/.test(text)) return 'concerned';
  if (/\b(?:you're|you are) (?:so )?(?:cute|beautiful)\b/.test(text)) return 'embarrassed';
  if (/\b(?:i love you|love you misaki)\b|🥰|💕/.test(text)) return 'affectionate';
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
  embarrassed: { pose: { ParamAngleY: -3, ParamAngleZ: 5, ParamEyeBallX: -.2, ParamMouthForm: .3 }, expressions: ['blush'] },
  thinking: { pose: { ParamAngleY: -3, ParamAngleZ: 5, ParamEyeBallY: .3 } },
  relieved: { pose: { ParamEyeLOpen: .8, ParamEyeROpen: .8, ParamMouthForm: .35, ParamAngleY: -2 } },
  sleepy: { pose: { ParamEyeLOpen: .55, ParamEyeROpen: .55, ParamAngleY: -5 } },
};

const expressionMoods: Record<typeof expressions[number], Emotion> = { neutral: 'neutral', smile: 'happy', sad: 'sad', blush: 'embarrassed', angry: 'angry', surprised: 'surprised', thinking: 'thinking', relaxed: 'relieved', sleepy: 'sleepy', 'heart-eyes': 'affectionate' };
const smooth = (value: number) => value * value * (3 - 2 * value);

/** Only advances on visible animation frames. No timers, network or OS actions. */
export class AvatarBehavior {
  private time = 0;
  private idle: IdleBehaviorController;
  private nextBlink: number;
  private blinkStart = -10;
  private reactionKey = '';
  private reactionAge = 0;
  private pose = { ...neutral };

  constructor(private random = Math.random) {
    this.idle = new IdleBehaviorController(random);
    this.nextBlink = 2 + random() * 3;
  }

  update(dt: number, state: CompanionState, reaction?: Reaction, still = false, settings: IdleOptions = idleDefaults) {
    const key = `${reaction?.id ?? ''}:${reaction?.emotion ?? 'neutral'}:${reaction?.phase ?? 'input'}`;
    if (key !== this.reactionKey) { this.reactionKey = key; this.reactionAge = 0; }
    const step = still ? 0 : Math.max(0, Math.min(dt, .05));
    this.time += step;
    this.reactionAge += step;
    const emotion = reaction?.emotion ?? 'neutral';
    // Hold a reaction, then gently return to a relaxed face during a long idle.
    const intensity = (still ? 1 : 1 - smooth(Math.min(1, Math.max(0, (this.reactionAge - 18) / 6)))) * (reaction?.intensity ?? 1);
    const target = { ...neutral };
    for (const [id, value] of Object.entries(moods[emotion].pose)) target[id] += (value - neutral[id]) * intensity;
    const expressionMood = reaction?.expression ? expressionMoods[reaction.expression] : emotion;
    if (reaction?.expression && reaction.expression !== 'neutral') {
      for (const [id, value] of Object.entries(moods[expressionMood].pose)) if (!id.includes('Angle')) target[id] = neutral[id] + (value - neutral[id]) * intensity;
    }
    if (state === 'thinking') { target.ParamAngleY -= 3; target.ParamAngleZ += 3; target.ParamEyeBallY = .2; }
    if (state === 'listening') target.ParamAngleY += 2;
    if (state === 'error') { target.ParamBrowLY = -.2; target.ParamBrowRY = -.2; }

    const idle = this.idle.update(step, state === 'thinking' || state === 'listening', { ...settings, enabled: settings.enabled && !still });
    let action: string = 'rest';
    if (idle.state === 'executing') { target.ParamAngleZ = 4; target.ParamEyeBallY = .2; }
    if (!still) {
      target.ParamAngleX += Math.sin(this.time * .65) * 2;
      target.ParamAngleZ += Math.sin(this.time * .43) * 1.3;
      target.ParamBodyAngleX += Math.sin(this.time * .4) * 1.4;
      if (state === 'idle') {
          const requested = reaction?.phase === 'reply' && reaction.motion && reaction.motion !== 'idle' && this.reactionAge < 3.5;
          const kind = requested ? reaction.motion! : idle.action;
          const phase = requested ? this.reactionAge / 3.5 : idle.phase;
          const side = idle.side;
          if (kind !== 'rest') {
            action = kind;
            const amount = Math.sin(Math.PI * phase) ** 2;
            if (kind === 'look-around') { target.ParamAngleX += side * 11 * amount; target.ParamEyeBallX = side * .55 * amount; target.ParamAngleY += 3 * amount; }
            if (kind === 'head-tilt') { target.ParamAngleZ += side * 9 * amount; target.ParamBodyAngleZ -= side * 2 * amount; }
            if (kind === 'nod') target.ParamAngleY -= Math.sin(phase * Math.PI * 4) * 6 * amount;
            if (kind === 'shake-head') target.ParamAngleX += Math.sin(phase * Math.PI * 4) * 9 * amount;
            if (kind === 'thinking') { target.ParamAngleZ += 7 * amount; target.ParamEyeBallY = .4 * amount; }
            if (kind === 'yawn') { target.ParamMouthOpenY = .5 * amount; target.ParamEyeLOpen -= .6 * amount; target.ParamEyeROpen -= .6 * amount; }
            if (kind === 'sleepy') { target.ParamEyeLOpen -= .5 * amount; target.ParamEyeROpen -= .5 * amount; target.ParamAngleY -= 6 * amount; }
            if (kind === 'pout' && emotion === 'neutral') target.ParamMouthForm -= .5 * amount;
            if (kind === 'laugh') { target.ParamMouthForm = .8 * amount; target.ParamMouthOpenY = .15 * amount; target.ParamAngleY += Math.sin(phase * Math.PI * 6) * 2 * amount; }
            if (kind === 'weight-shift') { target.ParamBodyAngleX += side * 7 * amount; target.ParamBodyAngleZ += side * 3 * amount; target.ParamAngleZ -= side * 3 * amount; }
            // A sympathetic face must not randomly turn into a grin.
            if (kind === 'soft-smile' && (intensity === 0 || ['neutral', 'happy', 'affectionate', 'amused'].includes(emotion))) {
              target.ParamMouthForm += .5 * amount;
              target.ParamEyeLOpen -= .22 * amount; target.ParamEyeROpen -= .22 * amount;
            }
          }
        if (idle.state === 'attention') target.ParamAngleY += 3;
      }
    }
    for (const id of Object.keys(target)) target[id] = neutral[id] + (target[id] - neutral[id]) * settings.intensity;
    const blend = still ? 1 : 1 - Math.exp(-step / .18);
    for (const id of Object.keys(target)) this.pose[id] += (target[id] - this.pose[id]) * blend;
    const parameters = { ...this.pose };
    if (!still) {
      if (this.time >= this.nextBlink) { this.blinkStart = this.time; this.nextBlink = this.time + 2.8 + this.random() * 3.5; }
      const phase = (this.time - this.blinkStart) / .2;
      const open = phase >= 0 && phase <= 1 ? Math.abs(phase * 2 - 1) : 1;
      parameters.ParamEyeLOpen *= open; parameters.ParamEyeROpen *= open;
    }
    return { parameters, action, idleState: idle.state, emotion: intensity > 0 ? emotion : 'neutral', intensity: intensity * settings.intensity, expressions: moods[expressionMood].expressions ?? [] };
  }
}
