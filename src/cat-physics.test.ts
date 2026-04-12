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

const TERRAIN_FAIL_REPRO = [
  '/**',
  ' * VS Code extension entry point for Code Type Animal Sound.',
  ' */',
  '',
  "import * as vscode from 'vscode';",
  "import { AudioWebviewProvider } from './audio/audioWebviewProvider';",
  "import { AudioRenderer } from './audio/audioRenderer';",
  "import { VscodeInputMonitor } from './vscodeInputMonitor';",
  "import { TypingAudioService } from './service/typingAudioService';",
  '',
  'let service: TypingAudioService | undefined;',
  'let audioProvider: AudioWebviewProvider | undefined;',
  'let statusBarItem: vscode.StatusBarItem | undefined;',
  '',
  'function getConfig() {',
  "  const config = vscode.workspace.getConfiguration('codeTypeAnimalSound');",
  '  return {',
  "    enabled: config.get<boolean>('enabled', true),",
  "    volume: config.get<number>('volume', 0.7),",
  "    koreanVoice: config.get<string>('koreanVoice', 'f1'),",
  "    englishVoice: config.get<string>('englishVoice', 'f1'),",
  '  };',
  '}',
  '',
  'function updateStatusBar(listening: boolean): void {',
].join('\n');

const TERRAIN_NO_FISH_SPAWN = 'xxx';

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

function testDisjointVisibleRangesExcludeHiddenLinesFromFishSpawns(): void {
  console.log('\n▸ disjoint visible ranges exclude hidden gap lines from fish spawns');
  const terrain = Array(7).fill('xxxxxxxxxx').join('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(terrain, [
    { start: 0, end: 2 },
    { start: 4, end: 6 },
  ]);
  physics.spawn(0);

  const internal = physics as any;
  const positions = internal.getValidFishPositions() as Array<{ line: number; col: number; dist: number }>;

  assert(positions.length > 0, 'Disjoint visible ranges still produce fish candidates');
  assert(
    positions.some(pos => pos.line >= 4 && pos.line <= 6),
    'Fish candidates can still appear in the second visible range',
  );
  assert(
    !positions.some(pos => pos.line === 3),
    'Fish candidates never appear on hidden gap lines between visible ranges',
  );
}

function testSameLineRunTreatsInteriorSpacesAsTraversable(): void {
  console.log('\n▸ same-line movement crosses interior spaces within text edges');
  const terrain = 'abc   def';
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(terrain);
  physics.spawn(0);

  const internal = physics as any;
  internal.fishSpawnTimer = 0;
  assert(internal.planRoute(0, 8), 'Route plans across a same-line interior gap');

  let state = physics.getState();
  for (let i = 0; i < 40 && (state.action !== 'idle' || Math.round(state.col) !== 8); i++) {
    state = physics.tick();
  }

  assert(Math.round(state.line) === 0, 'Same-line traversal stays on the original line');
  assert(Math.round(state.col) === 8, 'Same-line traversal reaches the goal column past spaces');
}

function testFishSpawnCandidatesRequireExactReachability(): void {
  console.log('\n▸ fish spawn candidates require exact reachability');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(TERRAIN_FAIL_REPRO);
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

function testCanSpawnFishFromCurrentPositionDetectsEmptyChaseCases(): void {
  console.log('\n▸ spawn detection rejects terrains with no fish candidates');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(TERRAIN_NO_FISH_SPAWN);
  physics.spawn(0);

  assert(
    !physics.canSpawnFishFromCurrentPosition(),
    'Single short line offers no valid fish spawn candidates',
  );
}

function testResetClearsTransientMovementAndFishState(): void {
  console.log('\n▸ reset clears transient movement and fish state');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, quickFishDelay: 99999 });
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(4);

  const internal = physics as any;
  internal.state.line = 2.6;
  internal.state.col = 7.4;
  internal.state.direction = 'left';
  internal.route = [{ line: 1, col: 6, landingCol: 8, action: 'jump' }];
  internal.routeIdx = 1;
  internal.routeGoalCol = 12;
  internal.targetCol = 8;
  internal.plannedLandingCol = 8;
  internal.targetLine = 1;
  internal.pathFailCount = 2;
  internal.jumpStartLine = 4;
  internal.jumpStartCol = 3;
  internal.fish = { line: 1, col: 8, active: true };
  internal.fishSpawnTimer = 42;
  internal.fishChaseTicks = 13;
  internal.eatPhase = 1;
  internal.fishConsecutiveCount = 3;

  physics.reset();

  const state = physics.getState();
  const fish = physics.getFish();
  const snapshot = physics.getDebugSnapshot();

  assert(state.action === 'idle', 'Reset returns the cat to idle');
  assert(state.line === 3, 'Reset rounds the current line before restoring text anchoring');
  assert(state.col === 0, 'Reset snaps to the left text edge on the rounded line');
  assert(!fish.active && fish.line === -1 && fish.col === -1, 'Reset clears fish target state');
  assert(snapshot.targetLine === -1, 'Reset clears target line');
  assert(snapshot.targetCol === 0, 'Reset clears target column to the current anchor');
  assert(snapshot.plannedLandingCol === -1, 'Reset clears planned landing column');
  assert(snapshot.routeIdx === 0 && snapshot.routeLength === 0, 'Reset clears the route state');
  assert(snapshot.routeGoalCol === 0, 'Reset clears the route goal column');
  assert(snapshot.jumpStartLine === 3 && snapshot.jumpStartCol === 0, 'Reset realigns jump start state');
  assert(snapshot.fishSpawnTimer === 0 && snapshot.fishChaseTicks === 0, 'Reset clears fish timers');
  assert(internal.pathFailCount === 0, 'Reset clears path failure count');
  assert(internal.fishConsecutiveCount === 0, 'Reset clears fish session progress');
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
testDisjointVisibleRangesExcludeHiddenLinesFromFishSpawns();
testSameLineRunTreatsInteriorSpacesAsTraversable();
testFishSpawnCandidatesRequireExactReachability();
testCanSpawnFishFromCurrentPositionDetectsEmptyChaseCases();
testResetClearsTransientMovementAndFishState();

console.log('\n═══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
