import test from 'node:test';
import assert from 'node:assert/strict';
import { StepAnimator } from './step-animator';
import { DEFAULT_ENGINE_CONFIG } from './types';

test('walk step advances continuously at runSpeed without teleporting', () => {
  const animator = new StepAnimator(DEFAULT_ENGINE_CONFIG);
  animator.start(
    [{ type: 'walk', fromLine: 2, fromCol: 0, toLine: 2, toCol: 4 }],
    2,
    0,
    'right',
  );

  let prevCol = 0;
  let ticks = 0;
  while (!animator.isFinished() && ticks < 50) {
    const snap = animator.tick();
    ticks++;
    assert.equal(snap.line, 2);
    assert.equal(snap.action, 'run');
    assert.equal(snap.direction, 'right');
    assert.ok(snap.col - prevCol <= DEFAULT_ENGINE_CONFIG.runSpeed + 1e-9);
    prevCol = snap.col;
  }

  assert.equal(animator.isFinished(), true);
  assert.equal(prevCol, 4);
});

test('vertical step interpolates smoothly and inserts landing pause', () => {
  const animator = new StepAnimator(DEFAULT_ENGINE_CONFIG);
  animator.start(
    [
      { type: 'fall', fromLine: 0, fromCol: 2, toLine: 2, toCol: 6 },
      { type: 'walk', fromLine: 2, fromCol: 6, toLine: 2, toCol: 8 },
    ],
    0,
    2,
    'right',
  );

  const actions: string[] = [];
  let prevLine = 0;
  let prevCol = 2;

  for (let i = 0; i < 60 && !animator.isFinished(); i++) {
    const snap = animator.tick();
    actions.push(snap.action);
    assert.ok(Math.abs(snap.line - prevLine) <= DEFAULT_ENGINE_CONFIG.fallSpeed + 0.05);
    assert.ok(Math.abs(snap.col - prevCol) <= DEFAULT_ENGINE_CONFIG.runSpeed * 2 + 0.05);
    prevLine = snap.line;
    prevCol = snap.col;
  }

  assert.equal(animator.isFinished(), true);
  assert.equal(prevLine, 2);
  assert.equal(prevCol, 8);
  assert.ok(actions.includes('fall'));
  assert.ok(actions.includes('land'));
  assert.ok(actions.includes('run'));
});
