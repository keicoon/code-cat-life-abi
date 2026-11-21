import test from 'node:test';
import assert from 'node:assert/strict';
import { CatStateMachine } from './cat-state-machine';
import { DEFAULT_ENGINE_CONFIG } from './types';

const SAMPLE_CODE = [
  'function greet(name: string) {',
  '  const msg = `Hello, ${name}!`;',
  '  console.log(msg);',
  '',
  '  if (name.length > 0) {',
  '    return msg.toUpperCase();',
  '  }',
  '  return "anon";',
  '}',
].join('\n');

test('spawns on nearest floor and stays on text continuously across ticks', () => {
  const engine = new CatStateMachine({
    ...DEFAULT_ENGINE_CONFIG,
    fishSessionCount: 2,
    sleepDelay: 20,
  });
  engine.updateTerrain(SAMPLE_CODE);
  engine.spawn(0);

  assert.equal(engine.canSpawnFishFromCurrentPosition(), true);

  let prev = engine.getState();
  let sawEat = false;
  let sawPostEat = false;
  let sawSleep = false;

  for (let i = 0; i < 800; i++) {
    const state = engine.tick();
    const dLine = Math.abs(state.line - prev.line);
    const dCol = Math.abs(state.col - prev.col);

    assert.ok(dLine <= 0.25, `line jump too large: ${dLine}`);
    assert.ok(dCol <= 0.85, `col jump too large: ${dCol}`);

    if (state.action === 'eat') { sawEat = true; }
    if (state.action === 'post_eat') { sawPostEat = true; }
    if (state.action === 'sleep') { sawSleep = true; }
    prev = state;
  }

  assert.equal(sawEat, true);
  assert.equal(sawPostEat, true);
  assert.equal(sawSleep, true);
});

test('skips spawn check when no reachable fish targets exist', () => {
  const engine = new CatStateMachine(DEFAULT_ENGINE_CONFIG);
  engine.updateTerrain('hi\n\n\n\n\nbye', 0, 1);
  engine.spawn(0);

  assert.equal(engine.canSpawnFishFromCurrentPosition(), false);
});

test('reset clears fish and returns cat to idle on floor', () => {
  const engine = new CatStateMachine(DEFAULT_ENGINE_CONFIG);
  engine.updateTerrain(SAMPLE_CODE);
  engine.spawn(0);

  for (let i = 0; i < 30; i++) {
    engine.tick();
  }
  assert.equal(engine.getFish().active, true);

  engine.reset();
  assert.equal(engine.getFish().active, false);
  assert.equal(engine.getState().action, 'idle');
  assert.equal(engine.getDebugSnapshot().stepCount, 0);
});
