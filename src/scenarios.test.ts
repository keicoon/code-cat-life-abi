import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CatStateMachine } from './cat-state-machine';
import { Pathfinder } from './pathfinder';
import { StepAnimator } from './step-animator';
import { TerrainGrid } from './terrain-grid';
import { DEFAULT_ENGINE_CONFIG } from './types';

test('Scenario 1: cat walks from start to exact destination along walkable floor', () => {
  const grid = new TerrainGrid();
  grid.update('  const alpha = 100;   const beta = 200;');
  const pf = new Pathfinder(grid, DEFAULT_ENGINE_CONFIG.maxJumpLines);
  const animator = new StepAnimator(DEFAULT_ENGINE_CONFIG);

  const start = { line: 0, col: 2 };
  const goal = { line: 0, col: 36 };
  const steps = pf.findPath(start, goal);
  assert.ok(steps && steps.length === 1 && steps[0].type === 'walk');

  animator.start(steps, start.line, start.col, 'right');

  const visitedCols: number[] = [start.col];
  for (let i = 0; i < 200 && !animator.isFinished(); i++) {
    const snap = animator.tick();
    assert.equal(snap.line, 0);
    assert.equal(snap.action, 'run');
    assert.equal(snap.direction, 'right');
    assert.equal(grid.isWalkable(0, Math.round(snap.col)), true);
    visitedCols.push(snap.col);
  }

  assert.equal(animator.isFinished(), true);
  assert.equal(visitedCols[visitedCols.length - 1], goal.col);
});

test('Scenario 2: A* routes around solid vertical obstacles to reach goal', () => {
  const grid = new TerrainGrid();
  // Line 1 blocks col 0..4 with solid text; cols 5..8 are spaces before 'ok' at 9..10
  grid.update([
    'aaaaaaaaaaa',
    'bbbbb    ok',
    'ccccccccccc',
  ].join('\n'));

  const pf = new Pathfinder(grid, DEFAULT_ENGINE_CONFIG.maxJumpLines);
  const start = { line: 0, col: 1 };
  const goal = { line: 2, col: 1 };
  const steps = pf.findPath(start, goal);

  assert.ok(steps && steps.length > 0, 'expected a valid route around obstacle');
  for (const step of steps) {
    assert.equal(grid.isWalkable(step.fromLine, step.fromCol), true);
    assert.equal(grid.isWalkable(step.toLine, step.toCol), true);
    if (step.type === 'jump' || step.type === 'fall') {
      const lineDelta = Math.abs(step.toLine - step.fromLine);
      if (lineDelta === 2) {
        // A 2-line jump/fall must not pass through solid chars on line 1
        assert.equal(grid.isSolidChar(1, step.fromCol), false);
      }
    }
  }

  const last = steps[steps.length - 1];
  assert.equal(last.toLine, goal.line);
  assert.equal(last.toCol, goal.col);
});

test('Scenario 3: jumping across gaps uses exact planned coordinates at every step', () => {
  const grid = new TerrainGrid();
  grid.update([
    '      topFloor',
    '',
    '  midFloor',
    '',
    'baseFloor',
  ].join('\n'));

  const pf = new Pathfinder(grid, DEFAULT_ENGINE_CONFIG.maxJumpLines);
  const animator = new StepAnimator(DEFAULT_ENGINE_CONFIG);

  const start = { line: 4, col: 2 };
  const goal = { line: 0, col: 10 };
  const steps = pf.findPath(start, goal);
  assert.ok(steps && steps.some(s => s.type === 'jump'), 'expected at least one jump step');

  animator.start(steps, start.line, start.col, 'right');

  let prevLine = start.line;
  let prevCol = start.col;
  let landTicks = 0;

  for (let i = 0; i < 300 && !animator.isFinished(); i++) {
    const snap = animator.tick();

    // Continuity check
    assert.ok(Math.abs(snap.line - prevLine) <= DEFAULT_ENGINE_CONFIG.jumpSpeed + 0.05);
    assert.ok(Math.abs(snap.col - prevCol) <= DEFAULT_ENGINE_CONFIG.runSpeed * 2 + 0.05);

    if (snap.action === 'run' || snap.action === 'land') {
      assert.equal(
        grid.isWalkable(Math.round(snap.line), Math.round(snap.col)),
        true,
        `grounded action ${snap.action} at (${snap.line}, ${snap.col}) must be on floor`,
      );
    }
    if (snap.action === 'land') {
      landTicks++;
    }

    prevLine = snap.line;
    prevCol = snap.col;
  }

  assert.equal(animator.isFinished(), true);
  assert.equal(prevLine, goal.line);
  assert.equal(prevCol, goal.col);
  assert.ok(landTicks >= DEFAULT_ENGINE_CONFIG.landingPauseDuration);
});

test('Scenario 4: full cat lifecycle from spawn to eating fish on staircase terrain', () => {
  const grid = new TerrainGrid();
  const terrain = [
    'const step1 = 1;',
    '  const step2 = 2;',
    '    const step3 = 3;',
    '      const step4 = 4;',
  ].join('\n');
  grid.update(terrain);

  const engine = new CatStateMachine({
    ...DEFAULT_ENGINE_CONFIG,
    fishSessionCount: 1,
    sleepDelay: 15,
  });
  engine.updateTerrain(terrain);
  engine.spawn(0);

  const seenActions = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const state = engine.tick();
    seenActions.add(state.action);
    if (state.action === 'run' || state.action === 'land' || state.action === 'eat') {
      assert.equal(
        grid.isWalkable(Math.round(state.line), Math.round(state.col)),
        true,
        `action ${state.action} must stay on walkable floor`,
      );
    }
    if (engine.getFishEaten() >= 1 && state.action === 'sleep') {
      break;
    }
  }

  assert.equal(seenActions.has('surprise'), true);
  assert.equal(seenActions.has('eat'), true);
  assert.equal(seenActions.has('sleep'), true);
  assert.ok(engine.getFishEaten() >= 1);
});

test('Scenario 5: multi-fish session holds post_eat between catches and sleeps only after fishSessionCount', () => {
  const terrain = [
    'const firstLine = 100;',
    'const secondLine = 200;',
  ].join('\n');

  const engine = new CatStateMachine({
    ...DEFAULT_ENGINE_CONFIG,
    fishSessionCount: 3,
    sleepDelay: 25,
  });
  engine.updateTerrain(terrain);
  engine.spawn(0);

  let enteredSleepBeforeThird = false;
  let sawPostEat = false;
  let wokeUpAfterSleep = false;
  let sleptAt = -1;

  for (let i = 0; i < 1200; i++) {
    const state = engine.tick();
    if (state.action === 'post_eat') { sawPostEat = true; }
    if (state.action === 'sleep') {
      if (engine.getFishEaten() < 3) {
        enteredSleepBeforeThird = true;
      }
      if (sleptAt === -1) { sleptAt = i; }
    }
    if (sleptAt !== -1 && i > sleptAt && state.action === 'surprise') {
      wokeUpAfterSleep = true;
      break;
    }
  }

  assert.equal(enteredSleepBeforeThird, false);
  assert.equal(sawPostEat, true);
  assert.ok(engine.getFishEaten() >= 3);
  assert.equal(wokeUpAfterSleep, true);
});

test('Scenario 6: dynamic terrain shrinkage relocates or clamps cat onto valid floor', () => {
  const engine = new CatStateMachine(DEFAULT_ENGINE_CONFIG);
  engine.updateTerrain('alpha\nbetaLongLineHere\ngamma');
  engine.spawn(1);

  for (let i = 0; i < 20; i++) {
    engine.tick();
  }

  // Shrink line 1 into whitespace and shorten line 2
  engine.updateTerrain('alpha\n     \ngam');
  const relocated = engine.getState();
  const grid = new TerrainGrid();
  grid.update('alpha\n     \ngam');

  assert.equal(
    grid.isWalkable(Math.round(relocated.line), Math.round(relocated.col)),
    true,
  );
});

test('Scenario 7: animationSpeed 2x completes walk in half the ticks without overshooting', () => {
  const step = { type: 'walk' as const, fromLine: 0, fromCol: 0, toLine: 0, toCol: 8 };
  const normal = new StepAnimator(DEFAULT_ENGINE_CONFIG);
  const fast = new StepAnimator({
    ...DEFAULT_ENGINE_CONFIG,
    runSpeed: DEFAULT_ENGINE_CONFIG.runSpeed * 2,
  });

  normal.start([step], 0, 0, 'right');
  fast.start([step], 0, 0, 'right');

  let normalTicks = 0;
  let fastTicks = 0;
  while (!normal.isFinished() && normalTicks < 100) {
    normal.tick();
    normalTicks++;
  }
  while (!fast.isFinished() && fastTicks < 100) {
    const snap = fast.tick();
    assert.ok(snap.col <= 8);
    fastTicks++;
  }

  assert.equal(normalTicks, 20);
  assert.equal(fastTicks, 10);
});

test('Scenario 8: maxJumpLines boundary allows 3-line jump and blocks 4-line jump', () => {
  const grid = new TerrainGrid();
  grid.update([
    'topFloor',
    '',
    '',
    'threeDown',
    '',
    '',
    '',
    'fourDown',
  ].join('\n'));

  const pf = new Pathfinder(grid, 3);
  assert.ok(pf.findPath({ line: 0, col: 0 }, { line: 3, col: 0 }) !== null);
  assert.equal(pf.findPath({ line: 3, col: 0 }, { line: 7, col: 0 }), null);
});

test('Scenario 9: all demo terrain files run smoothly without errors or teleportation', () => {
  const demoDir = path.resolve(__dirname, '..', 'demo');
  const demoFiles = fs.readdirSync(demoDir).filter(f => f.endsWith('.ts')).sort();
  assert.ok(demoFiles.length >= 5);

  for (const file of demoFiles) {
    const content = fs.readFileSync(path.join(demoDir, file), 'utf-8');
    const engine = new CatStateMachine(DEFAULT_ENGINE_CONFIG);
    engine.updateTerrain(content, 0, Math.min(30, content.split('\n').length - 1));
    engine.spawn(0);

    let prev = engine.getState();
    for (let t = 0; t < 200; t++) {
      const next = engine.tick();
      assert.ok(
        Math.abs(next.line - prev.line) <= 0.25 && Math.abs(next.col - prev.col) <= 0.85,
        `${file}: discontinuous move at tick ${t}`,
      );
      prev = next;
    }
  }
});
