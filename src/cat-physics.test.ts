import { CatPhysics } from './cat-physics';
import { CatState, DEFAULT_PHYSICS } from './types';

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

const TERRAIN_WIDE_GAP = [
  'short',
  '',
  '                                        far_right',
  'another_short',
].join('\n');

const TERRAIN_STAIRCASE = [
  'aaaaa',
  '     bbbbb',
  '          ccccc',
  '               ddddd',
  '                    eeeee',
].join('\n');

const TERRAIN_UNIFORM = Array(5).fill('xxxxxxxxxxxxxxxxxxxx').join('\n');

function runTicks(
  physics: CatPhysics,
  lines: string[],
  numTicks: number,
  opts?: { checkText?: boolean; checkContinuity?: boolean },
): void {
  const checkText = opts?.checkText ?? true;
  const checkContinuity = opts?.checkContinuity ?? true;

  for (let i = 0; i < numTicks; i++) {
    const prev = physics.getState();
    const state = physics.tick();
    const midFlight = state.action === 'jump' || state.action === 'fall';

    if (checkText && Number.isInteger(state.line) && !midFlight) {
      assert(
        isOnText(lines, state),
        `On-text constraint at tick ${i}`,
        `line=${state.line} col=${state.col.toFixed(2)} action=${state.action}`,
      );
    }

    if (
      checkText &&
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

    if (checkContinuity) {
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
}

function collectVerticalLandings(
  physics: CatPhysics,
  numTicks: number,
): Array<{ action: 'jump' | 'fall'; displacement: number }> {
  let jumpStartCol: number | null = null;
  let fallStartCol: number | null = null;
  const landings: Array<{ action: 'jump' | 'fall'; displacement: number }> = [];

  for (let i = 0; i < numTicks; i++) {
    const prev = physics.getState();
    const state = physics.tick();

    if (state.action === 'jump' && prev.action !== 'jump') { jumpStartCol = state.col; }
    if (state.action === 'fall' && prev.action !== 'fall') { fallStartCol = state.col; }

    if (prev.action === 'jump' && state.action !== 'jump' && jumpStartCol !== null) {
      landings.push({ action: 'jump', displacement: state.col - jumpStartCol });
      jumpStartCol = null;
    }

    if (prev.action === 'fall' && state.action !== 'fall' && fallStartCol !== null) {
      landings.push({ action: 'fall', displacement: state.col - fallStartCol });
      fallStartCol = null;
    }
  }

  return landings;
}

function isFixedStride(displacement: number): boolean {
  const abs = Math.abs(displacement);
  return abs < 0.01 || Math.abs(abs - 2) < 0.01;
}

function prepareVerticalTransition(
  action: 'jump' | 'fall',
  goalCol: number,
): { physics: CatPhysics; internal: any } {
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 99999 });
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(action === 'jump' ? 4 : 3);

  const internal = physics as any;
  internal.routeGoalCol = goalCol;
  internal.targetLine = action === 'jump' ? 3 : 4;
  internal.targetCol = 0;
  internal.state.line = action === 'jump' ? 4 : 3;
  internal.state.col = 0;
  internal.setState(action === 'jump' ? 'run_then_jump' : 'run_then_fall');

  return { physics, internal };
}

function testMovementStaysOnTextAndContinuous(): void {
  console.log('\n▸ movement stays on text and continuous');
  const scenarios: Array<{ name: string; terrain: string; spawnLine: number }> = [
    { name: 'basic', terrain: TERRAIN_BASIC, spawnLine: 0 },
    { name: 'wide_gap', terrain: TERRAIN_WIDE_GAP, spawnLine: 0 },
    { name: 'staircase', terrain: TERRAIN_STAIRCASE, spawnLine: 4 },
  ];

  for (const { name, terrain, spawnLine } of scenarios) {
    const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
    physics.updateTerrain(terrain);
    physics.spawn(spawnLine);
    runTicks(physics, terrain.split('\n'), 2500, { checkText: true, checkContinuity: true });
    console.log(`  checked: ${name}`);
  }
}

function testVerticalMovesUseOnlyZeroOrFixedStride(): void {
  console.log('\n▸ vertical moves use only zero or fixed stride');
  const scenarios: Array<{ name: string; terrain: string; spawnLine: number }> = [
    { name: 'basic', terrain: TERRAIN_BASIC, spawnLine: 0 },
    { name: 'wide_gap', terrain: TERRAIN_WIDE_GAP, spawnLine: 0 },
    { name: 'staircase', terrain: TERRAIN_STAIRCASE, spawnLine: 4 },
    { name: 'uniform', terrain: TERRAIN_UNIFORM, spawnLine: 4 },
  ];

  withMockedRandom(0, () => {
    for (const { name, terrain, spawnLine } of scenarios) {
      const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
      physics.updateTerrain(terrain);
      physics.spawn(spawnLine);

      const landings = collectVerticalLandings(physics, 3500);
      assert(landings.length > 0, `Observed vertical moves on ${name}`);
      for (const landing of landings) {
        assert(
          isFixedStride(landing.displacement),
          `[${name}] ${landing.action} displacement is 0 or 2`,
          `got ${landing.displacement.toFixed(2)}`,
        );
      }
    }
  });
}

function testFarGoalUsesFixedStrideForJumpAndFall(): void {
  console.log('\n▸ far goal uses fixed stride for jump and fall');

  for (const action of ['jump', 'fall'] as const) {
    const { physics, internal } = prepareVerticalTransition(action, 10);
    const state = physics.tick();

    assert(state.action === action, `${action} transition starts vertical motion`);
    assert(
      internal.targetCol === 2,
      `${action} lands two columns toward the goal`,
      `expected 2, got ${internal.targetCol}`,
    );
  }
}

function testNearGoalUsesZeroStrideForJumpAndFall(): void {
  console.log('\n▸ near goal uses zero stride for jump and fall');

  for (const action of ['jump', 'fall'] as const) {
    const { physics, internal } = prepareVerticalTransition(action, 1);
    const state = physics.tick();

    assert(state.action === action, `${action} transition starts vertical motion`);
    assert(
      internal.targetCol === 0,
      `${action} does not use a partial X stride`,
      `expected 0, got ${internal.targetCol}`,
    );
  }
}

function testVisibleRangeConstraint(): void {
  console.log('\n▸ visible range constrains movement');
  const fullTerrain = Array(20).fill('xxxxxxxxxxxxxxxxxxxx').join('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
  physics.updateTerrain(fullTerrain, 5, 10);
  physics.spawn(7);

  for (let i = 0; i < 1200; i++) {
    const state = physics.tick();
    const line = Math.round(state.line);
    assert(
      line >= 5 && line <= 10,
      `Visible range at tick ${i}`,
      `line=${line} action=${state.action}`,
    );
  }
}

console.log('═══════════════════════════════════════════');
console.log('  Code Cat — Movement Regression Suite');
console.log('═══════════════════════════════════════════');

testMovementStaysOnTextAndContinuous();
testVerticalMovesUseOnlyZeroOrFixedStride();
testFarGoalUsesFixedStrideForJumpAndFall();
testNearGoalUsesZeroStrideForJumpAndFall();
testVisibleRangeConstraint();

console.log('\n═══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
