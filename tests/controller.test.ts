import { describe, expect, it } from 'vitest';
import { transition, type CompanionState } from '../src/companion/controller';

describe('companion controller', () => {
  it('keeps text replies idle rather than simulating speaking', () => {
    let state: CompanionState = 'idle';
    for (const event of ['TYPE', 'SEND', 'COMPLETE'] as const) state = transition(state, event);
    expect(state).toBe('idle');
  });
  it('does not let focus/blur/double submits interrupt inference', () => {
    for (const event of ['TYPE', 'BLUR', 'SEND'] as const) expect(transition('thinking', event)).toBe('thinking');
  });
  it('recovers from failure and interruptions', () => {
    expect(transition('thinking', 'FAIL')).toBe('error');
    expect(transition('error', 'SEND')).toBe('thinking');
    for (const state of ['idle', 'listening', 'thinking', 'error'] as const) {
      expect(transition(state, 'CANCEL')).toBe('idle');
      expect(transition(state, 'RESET')).toBe('idle');
    }
  });
});
