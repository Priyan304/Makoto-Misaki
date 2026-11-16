import { describe, expect, it } from 'vitest';
import { AvatarBehavior, gestures, immediateEmotion } from '../src/live2d/behavior';

describe('avatar behavior', () => {
  it('varies bounded idle gestures, avoids consecutive repeats, and pauses when time stops', () => {
    let seed = 7;
    const behavior = new AvatarBehavior(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
    const observed: string[] = [];
    let previous = 'rest';
    let frame = behavior.update(0, 'idle');
    for (let i = 0; i < 4000; i++) {
      frame = behavior.update(.05, 'idle');
      if (frame.action !== 'rest' && frame.action !== previous) observed.push(frame.action);
      previous = frame.action;
      for (const [id, value] of Object.entries(frame.parameters)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThanOrEqual(id.includes('Angle') ? 20 : 1);
      }
    }
    expect(observed.every(kind => gestures.includes(kind as typeof gestures[number]))).toBe(true);
    expect(new Set(observed).size).toBeGreaterThanOrEqual(5);
    expect(observed.every((action, index) => index === 0 || action !== observed[index - 1])).toBe(true);
    for (let i = 0; i < 5; i++) expect(behavior.update(0, 'idle')).toEqual(frame);
    expect(behavior.update(.05, 'thinking').action).toBe('rest');
  });

  it('holds, fades and replaces reactions without persisting an expression or toggling accessories', () => {
    const behavior = new AvatarBehavior(() => .5);
    const reaction = { id: 'one', emotion: 'affectionate' as const };
    let frame = behavior.update(.05, 'idle', reaction);
    expect(frame.expressions).toEqual(['heart-eyes', 'blush']);
    for (let i = 0; i < 500; i++) frame = behavior.update(.05, 'idle', reaction);
    expect(frame.intensity).toBe(0);
    expect(frame.emotion).toBe('neutral');
    frame = behavior.update(.05, 'idle', { id: 'two', emotion: 'concerned' });
    expect(frame.intensity).toBe(1);
    expect(frame.expressions).toEqual([]);
    for (let i = 0; i < 300; i++) {
      frame = behavior.update(.05, 'idle', { id: 'two', emotion: 'concerned' });
      expect(frame.parameters.ParamMouthForm).toBeLessThan(.01);
    }
  });

  it('keeps reduced motion still but applies new expressions immediately', () => {
    const behavior = new AvatarBehavior(() => .5);
    const reaction = { id: 'one', emotion: 'curious' as const };
    const first = behavior.update(.05, 'idle', reaction, true);
    for (let i = 0; i < 600; i++) expect(behavior.update(.05, 'idle', reaction, true)).toEqual(first);
    expect(first.action).toBe('rest');
    expect(behavior.update(.05, 'idle', { id: 'two', emotion: 'happy' }, true).parameters).not.toEqual(first.parameters);
  });

  it('uses supportive immediate cues and leaves nuanced interpretation to the chat model', () => {
    expect(immediateEmotion('I had a terrible day, thanks for listening.')).toBe('concerned');
    expect(immediateEmotion('I love you Misaki')).toBe('affectionate');
    expect(immediateEmotion('Thanks!')).toBe('happy');
    expect(immediateEmotion('Why does this happen?')).toBe('curious');
    expect(immediateEmotion('Play Snowfall')).toBe('neutral');
  });
});
