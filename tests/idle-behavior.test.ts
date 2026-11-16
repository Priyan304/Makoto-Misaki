import { describe, expect, it } from 'vitest';
import { AvatarBehavior } from '../src/live2d/behavior';
import { IdleBehaviorController, IdleConversationScheduler, idleDefaults } from '../src/live2d/IdleBehaviorController';

describe('independent idle controllers', () => {
  it('transitions through quiet, returning, conversation and task states and honors settings', () => {
    const controller = new IdleBehaviorController(() => .5);
    expect(controller.update(0, false).state).toBe('idle');
    expect(controller.update(31, false).state).toBe('waiting');
    expect(controller.update(60, false).state).toBe('bored');
    expect(controller.update(510, false).state).toBe('sleepy');
    expect(controller.update(0, false, { ...idleDefaults, sleepy: false }).state).toBe('bored');
    expect(controller.update(0, false, { ...idleDefaults, activity: 1 }).state).toBe('attention');
    expect(controller.update(4, false, { ...idleDefaults, activity: 1 }).state).toBe('idle');
    expect(controller.update(0, true).state).toBe('conversation');
    expect(controller.update(0, false, { ...idleDefaults, executing: true }).state).toBe('executing');
    for (let i = 0; i < 100; i++) expect(controller.update(1, false, { ...idleDefaults, enabled: false }).action).toBe('rest');
  });
  it('starts at most once until user activity, waits out cooldowns and postpones while blocked', () => {
    const scheduler = new IdleConversationScheduler(120, () => 0);
    expect(scheduler.tick(119, false, 300)).toBe(false);
    expect(scheduler.tick(1, false, 300)).toBe(true);
    scheduler.attempted();
    expect(scheduler.tick(1000, false, 300)).toBe(false);
    scheduler.activity();
    expect(scheduler.tick(120, false, 300)).toBe(true);
    scheduler.attempted(); scheduler.activity();
    expect(scheduler.tick(120, false, 300)).toBe(false);
    expect(scheduler.tick(180, false, 300)).toBe(true);
    expect(scheduler.tick(1, true, 300)).toBe(false);
    expect(scheduler.tick(119, false, 300)).toBe(false);
    expect(scheduler.tick(1, false, 300)).toBe(true);
  });
  it('renders a blush, scales intensity, and plays a requested motion only once', () => {
    const driver = new AvatarBehavior(() => .5);
    const reaction = { id: 'one', emotion: 'embarrassed' as const, expression: 'blush' as const, motion: 'nod' as const, intensity: .8, phase: 'reply' as const };
    const still = driver.update(0, 'idle', reaction, true);
    expect(still.expressions).toEqual(['blush']); expect(still.intensity).toBe(.8);
    expect(driver.update(0, 'idle', reaction, true, { ...idleDefaults, intensity: .4 }).intensity).toBeCloseTo(.32);
    let frame = driver.update(.05, 'idle', reaction, false, { ...idleDefaults, enabled: false });
    expect(frame.action).toBe('nod');
    for (let i = 0; i < 100; i++) frame = driver.update(.05, 'idle', reaction, false, { ...idleDefaults, enabled: false });
    expect(frame.action).toBe('rest');
  });
});
