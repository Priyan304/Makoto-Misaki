export type CompanionState = 'idle' | 'listening' | 'thinking' | 'error';
export type CompanionEvent = 'TYPE' | 'BLUR' | 'SEND' | 'COMPLETE' | 'FAIL' | 'CANCEL' | 'RESET';

export function transition(state: CompanionState, event: CompanionEvent): CompanionState {
  if (event === 'RESET' || event === 'CANCEL') return 'idle';
  if (event === 'SEND' && state !== 'thinking') return 'thinking';
  if (state === 'thinking') {
    if (event === 'COMPLETE') return 'idle';
    if (event === 'FAIL') return 'error';
    return state;
  }
  if (event === 'TYPE') return 'listening';
  if (event === 'BLUR') return 'idle';
  return state;
}

export const stateLabels: Record<CompanionState, string> = {
  idle: 'Right here with you', listening: 'You have my attention', thinking: 'Thinking it through…', error: 'Let’s reconnect',
};
