import * as fs from 'fs';
import { CatPhysics } from './cat-physics';
import { CatState, DEFAULT_PHYSICS, Direction, RouteStep } from './types';

function textEdges(line: string): { left: number; right: number } | null {
  let left = -1;
  let right = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ' ') {
      if (left === -1) { left = i; }
      right = i;
    }
  }
  return left === -1 ? null : { left, right };
}

function isOnText(lines: string[], state: CatState): boolean {
  const line = Math.round(state.line);
  if (line < 0 || line >= lines.length) { return false; }
  const edges = textEdges(lines[line]);
  if (!edges) { return false; }
  const col = Math.round(state.col);
  return col >= edges.left && col <= edges.right;
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string, detail?: string): void {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error(`  FAIL: ${msg}`);
  if (detail) { console.error(`        ${detail}`); }
}

function withMockedRandom<T>(value: number, fn: () => T): T {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

const TERRAIN_BASIC = [
  'function hello() {',
  '  console.log("hi");',
  '}',
  '',
  'const x = 42;',
].join('\n');

const TERRAIN_STAIRCASE = [
  'aaaaa',
  '     bbbbb',
  '          ccccc',
  '               ddddd',
  '                    eeeee',
].join('\n');

const TERRAIN_UNIFORM = Array(5).fill('xxxxxxxxxxxxxxxxxxxx').join('\n');
const TERRAIN_FORCED_TWO_LINE_JUMP = [
  'xxxxxxxxxxxxxxxxxxxx',
  '',
  'xxxxxxxxxxxxxxxxxxxx',
  '',
  'xxxxxxxxxxxxxxxxxxxx',
].join('\n');

const TERRAIN_FORCED_TWO_LINE_JUMP_NARROW = [
  'xx',
  '',
  'xx',
  '',
  'xxxxxxxxxxxxxxxxxxxx',
].join('\n');

const TERRAIN_FAIL_DEMO = fs.readFileSync('./demo/fail.ts', 'utf8');

function runTicks(
  physics: CatPhysics,
  lines: string[],
  numTicks: number,
): void {
  for (let i = 0; i < numTicks; i++) {
    const prev = physics.getState();
    const state = physics.tick();
    const midFlight = state.action === 'jump' || state.action === 'fall';

    if (Number.isInteger(state.line) && !midFlight) {
      assert(
        isOnText(lines, state),
        `On-text constraint at tick ${i}`,
        `line=${state.line} col=${state.col.toFixed(2)} action=${state.action}`,
      );
    }

    if (
      (prev.action === 'jump' || prev.action === 'fall') &&
      state.action !== 'jump' &&
      state.action !== 'fall'
    ) {
      assert(
        isOnText(lines, state),
        `Landing on text at tick ${i}`,
        `line=${state.line} col=${state.col.toFixed(2)} action=${state.action}`,
      );
    }

    const deltaLine = Math.abs(state.line - prev.line);
    const deltaCol = Math.abs(state.col - prev.col);
    assert(
      deltaLine <= 1.5,
      `Line continuity at tick ${i}`,
      `delta=${deltaLine.toFixed(3)} action=${state.action}`,
    );
    assert(
      deltaCol <= 3.0,
      `Col continuity at tick ${i}`,
      `delta=${deltaCol.toFixed(3)} action=${state.action}`,
    );
  }
}

function collectVerticalLandings(
  physics: CatPhysics,
  numTicks: number,
): Array<{ action: 'jump' | 'fall'; displacement: number; lineDelta: number }> {
  let startCol: number | null = null;
  let startLine: number | null = null;
  let currentAction: 'jump' | 'fall' | null = null;
  const landings: Array<{ action: 'jump' | 'fall'; displacement: number; lineDelta: number }> = [];

  for (let i = 0; i < numTicks; i++) {
    const prev = physics.getState();
    const state = physics.tick();

    if ((state.action === 'jump' || state.action === 'fall') && prev.action !== state.action) {
      startCol = state.col;
      startLine = state.line;
      currentAction = state.action;
    }

    if (
      startCol !== null &&
      currentAction &&
      prev.action === currentAction &&
      state.action !== currentAction
    ) {
      landings.push({
        action: currentAction,
        displacement: state.col - startCol,
        lineDelta: Math.round(Math.abs(state.line - startLine!)),
      });
      startCol = null;
      startLine = null;
      currentAction = null;
    }
  }

  return landings;
}

function isFixedStride(displacement: number, lineDelta: number): boolean {
  const abs = Math.abs(displacement);
  return abs < 0.01 || Math.abs(abs - (2 * lineDelta)) < 0.01;
}

function buildRoute(
  terrain: string,
  goalLine: number,
  goalCol: number,
  opts?: { startLine?: number; startCol?: number; direction?: Direction },
): RouteStep[] {
  const startLine = opts?.startLine ?? 4;
  const startCol = opts?.startCol ?? 0;
  const direction = opts?.direction ?? 'right';

  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(terrain);
  physics.spawn(startLine);

  const internal = physics as any;
  internal.state.line = startLine;
  internal.state.col = startCol;
  internal.state.direction = direction;
  internal.routeGoalCol = goalCol;

  const path = internal.findPath(startLine, goalLine, goalCol);
  assert(path !== null, 'Path exists for direct route test');
  return internal.optimizeRouteColumns(path, startCol, startLine) as RouteStep[];
}

function testMovementStaysOnTextAndContinuous(): void {
  console.log('\n▸ movement stays on text and continuous');
  const scenarios: Array<{ name: string; terrain: string; spawnLine: number }> = [
    { name: 'basic', terrain: TERRAIN_BASIC, spawnLine: 0 },
    { name: 'staircase', terrain: TERRAIN_STAIRCASE, spawnLine: 4 },
  ];

  withMockedRandom(0, () => {
    for (const { name, terrain, spawnLine } of scenarios) {
      const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 5 });
      physics.updateTerrain(terrain);
      physics.spawn(spawnLine);
      runTicks(physics, terrain.split('\n'), 1200);
      console.log(`  checked: ${name}`);
    }
  });
}

function testVerticalLandingsUseOnlyZeroOrFixedStride(): void {
  console.log('\n▸ vertical landings use only zero or fixed stride');
  const scenarios: Array<{ name: string; terrain: string; spawnLine: number }> = [
    { name: 'basic', terrain: TERRAIN_BASIC, spawnLine: 0 },
    { name: 'uniform', terrain: TERRAIN_UNIFORM, spawnLine: 4 },
  ];

  withMockedRandom(0, () => {
    for (const { name, terrain, spawnLine } of scenarios) {
      const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 5 });
      physics.updateTerrain(terrain);
      physics.spawn(spawnLine);

      const landings = collectVerticalLandings(physics, 1600);
      assert(landings.length > 0, `Observed vertical moves on ${name}`);
      for (const landing of landings) {
        assert(
          isFixedStride(landing.displacement, landing.lineDelta),
          `[${name}] ${landing.action} displacement is 0 or ${2 * landing.lineDelta}`,
          `got ${landing.displacement.toFixed(2)} across ${landing.lineDelta} lines`,
        );
      }
    }
  });
}

function testGoalDirectedRouteUsesProgressiveDiagonalStride(): void {
  console.log('\n▸ goal-directed route keeps taking short diagonal steps');
  const route = buildRoute(TERRAIN_UNIFORM, 1, 10, { startLine: 4, startCol: 0, direction: 'right' });

  let expectedCol = 0;
  for (const [idx, step] of route.entries()) {
    assert(step.action === 'jump', `Step ${idx} is a jump`);
    assert(step.col === expectedCol, `Step ${idx} starts from the current column`);
    assert(
      step.landingCol - step.col === 2,
      `Step ${idx} advances two columns toward the goal`,
      `col=${step.col} landing=${step.landingCol}`,
    );
    expectedCol = step.landingCol;
  }
}

function testAlignedGoalRouteUsesTemporaryDiagonalThenSettles(): void {
  console.log('\n▸ aligned goal route uses a temporary diagonal then settles back');

  const rightRoute = buildRoute(TERRAIN_UNIFORM, 1, 10, { startLine: 4, startCol: 10, direction: 'right' });
  assert(rightRoute[0].landingCol === 12, 'Facing right prefers the right diagonal first');
  assert(rightRoute[1].landingCol === 10, 'Second step settles back onto the goal column');
  assert(rightRoute[2].landingCol === 10, 'Final step stays aligned with the goal');

  const leftRoute = buildRoute(TERRAIN_UNIFORM, 1, 10, { startLine: 4, startCol: 10, direction: 'left' });
  assert(leftRoute[0].landingCol === 8, 'Facing left prefers the left diagonal first');
  assert(leftRoute[1].landingCol === 10, 'Second step settles back onto the goal column');
  assert(leftRoute[2].landingCol === 10, 'Final step stays aligned with the goal');
}

function testMultiLineVerticalStrideScalesWithLineDistance(): void {
  console.log('\n▸ multi-line vertical steps scale diagonal distance');
  const route = buildRoute(TERRAIN_FORCED_TWO_LINE_JUMP, 2, 12, {
    startLine: 4,
    startCol: 0,
    direction: 'right',
  });

  assert(route.length === 1, 'Forced gap terrain produces a single two-line jump');
  assert(route[0].col === 0, 'Two-line jump starts from the current column');
  assert(route[0].landingCol === 4, 'Two-line jump lands four columns away');
}

function testMultiLineVerticalStrideFallsBackToZeroWhenLandingIsImpossible(): void {
  console.log('\n▸ multi-line vertical steps fall back to zero when scaled landing is impossible');
  const route = buildRoute(TERRAIN_FORCED_TWO_LINE_JUMP_NARROW, 2, 12, {
    startLine: 4,
    startCol: 0,
    direction: 'right',
  });

  assert(route.length === 1, 'Forced narrow gap terrain still produces a single two-line jump');
  assert(route[0].col === 0, 'Fallback jump starts from the current column');
  assert(route[0].landingCol === 0, 'Scaled diagonal falls back to zero when target text is too narrow');
}

function testVisibleRangeConstraint(): void {
  console.log('\n▸ visible range constrains movement');
  const fullTerrain = Array(20).fill('xxxxxxxxxxxxxxxxxxxx').join('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 5 });
  physics.updateTerrain(fullTerrain, 5, 10);
  physics.spawn(7);

  for (let i = 0; i < 600; i++) {
    const state = physics.tick();
    const line = Math.round(state.line);
    assert(
      line >= 5 && line <= 10,
      `Visible range at tick ${i}`,
      `line=${line} action=${state.action}`,
    );
  }
}

function testFishSpawnCandidatesRequireExactReachability(): void {
  console.log('\n▸ fish spawn candidates require exact reachability');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(TERRAIN_FAIL_DEMO);
  physics.spawn(1);

  const internal = physics as any;
  const positions = internal.getValidFishPositions() as Array<{ line: number; col: number; dist: number }>;
  const catLine = Math.round(physics.getState().line);

  assert(positions.length > 0, 'Fail demo still produces fish spawn candidates');
  assert(
    positions.some(pos => pos.line === 24 && pos.col === 4),
    'Known reachable candidate on fail demo remains eligible',
  );
  assert(
    !positions.some(pos => pos.line === 24 && pos.col === 24),
    'Known unreachable candidate on fail demo is excluded',
  );

  for (const pos of positions) {
    const exactReachable = pos.line === catLine || internal.findPath(catLine, pos.line, pos.col) !== null;
    assert(
      exactReachable,
      `Fish candidate (${pos.line}, ${pos.col}) is exactly reachable`,
    );
  }
}

function testLandingPauseSeparatesConsecutiveVerticalMoves(): void {
  console.log('\n▸ landing pause separates consecutive vertical moves');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(4);

  const internal = physics as any;
  internal.state.line = 4;
  internal.state.col = 0;
  internal.state.direction = 'right';

  assert(internal.planRoute(1, 10), 'Route for repeated jumps is planned');

  let sawVerticalEnd = false;
  let sawSecondVerticalStart = false;
  let landingTicks = 0;

  for (let i = 0; i < 200; i++) {
    const prev = physics.getState();
    const state = physics.tick();

    if ((prev.action === 'jump' || prev.action === 'fall') && state.action === 'land') {
      sawVerticalEnd = true;
      landingTicks = 1;
      continue;
    }

    if (sawVerticalEnd && state.action === 'land') {
      landingTicks++;
      continue;
    }

    if (
      sawVerticalEnd &&
      (state.action === 'jump' || state.action === 'fall') &&
      prev.action !== state.action
    ) {
      sawSecondVerticalStart = true;
      break;
    }
  }

  assert(sawVerticalEnd, 'A landing pause occurs after the first vertical move');
  assert(
    landingTicks === DEFAULT_PHYSICS.landingPauseDuration,
    'Landing pause lasts for the configured number of ticks',
    `got ${landingTicks} ticks`,
  );
  assert(sawSecondVerticalStart, 'Route resumes with another vertical move after the landing pause');
}

function testPostEatHoldsLastPoseUntilRespawn(): void {
  console.log('\n▸ post-eat delay holds the last eat pose');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 40, fishSessionCount: 2 });
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(4);

  const internal = physics as any;
  internal.eatPhase = 1;
  internal.fishConsecutiveCount = 0;
  internal.setState('eat');
  internal.state.frame = 1;
  internal.state.ticksInState = DEFAULT_PHYSICS.eatDuration - 1;

  let state = physics.tick();
  assert(state.action === 'post_eat', 'After eating, the cat holds a post-eat pose');
  assert(state.frame === 1, 'Post-eat pose uses the final eat frame');

  for (let i = 0; i < 5; i++) {
    state = physics.tick();
    assert(state.action === 'post_eat', `Post-eat pose persists during delay tick ${i}`);
    assert(state.frame === 1, `Post-eat frame stays frozen at tick ${i}`);
  }
}

function testSessionEndSleepsUntilRespawn(): void {
  console.log('\n▸ session end enters sleep before the next fish');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 40, sleepDelay: 80, fishSessionCount: 1 });
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(4);

  const internal = physics as any;
  internal.eatPhase = 1;
  internal.fishConsecutiveCount = 0;
  internal.setState('eat');
  internal.state.ticksInState = DEFAULT_PHYSICS.eatDuration - 1;

  let state = physics.tick();
  assert(state.action === 'sleep', 'After the configured session count, the cat enters sleep');

  for (let i = 0; i < 5; i++) {
    state = physics.tick();
    assert(state.action === 'sleep', `Sleep persists during rest tick ${i}`);
  }
}

console.log('═══════════════════════════════════════════');
console.log('  Code Cat Life Abi — Movement Regression Suite');
console.log('═══════════════════════════════════════════');

testMovementStaysOnTextAndContinuous();
testVerticalLandingsUseOnlyZeroOrFixedStride();
testGoalDirectedRouteUsesProgressiveDiagonalStride();
testAlignedGoalRouteUsesTemporaryDiagonalThenSettles();
testMultiLineVerticalStrideScalesWithLineDistance();
testMultiLineVerticalStrideFallsBackToZeroWhenLandingIsImpossible();
testLandingPauseSeparatesConsecutiveVerticalMoves();
testPostEatHoldsLastPoseUntilRespawn();
testSessionEndSleepsUntilRespawn();
testVisibleRangeConstraint();
testFishSpawnCandidatesRequireExactReachability();

console.log('\n═══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
