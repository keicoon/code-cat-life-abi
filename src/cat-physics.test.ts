/**
 * Movement rules test for CatPhysics.
 *
 * Validates the rules documented in docs/movement-rules.md:
 *   Rule 1: Cat always on text (absolute)
 *   Rule 2: Movement continuity (no teleportation)
 *   Rule 3: Per-line horizontal cap (best-effort)
 *   Rule 4: Visible range constraint
 *   Rule 5: Route / fish reachability
 *
 * Run:  npx ts-node src/cat-physics.test.ts
 */

import { CatPhysics, PhysicsCallbacks } from './cat-physics';
import { CatState, FishState, PhysicsConfig, DEFAULT_PHYSICS } from './types';

// ── helpers ────────────────────────────────────────────────────────

function textEdges(line: string): { left: number; right: number } | null {
  let left = -1, right = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ' ') { if (left === -1) { left = i; } right = i; }
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
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
    if (detail) { console.error(`          ${detail}`); }
  }
}

// ── test terrain builders ──────────────────────────────────────────

const TERRAIN_BASIC = [
  'function hello() {',       // line 0: cols 0-18
  '  console.log("hi");',     // line 1: cols 2-21
  '}',                         // line 2: col  0
  '',                          // line 3: empty
  'const x = 42;',             // line 4: cols 0-13
].join('\n');

const TERRAIN_WIDE_GAP = [
  'short',                                             // line 0: cols 0-4
  '',                                                  // line 1: empty
  '                                        far_right', // line 2: cols 40-48
  'another_short',                                     // line 3: cols 0-12
].join('\n');

const TERRAIN_STAIRCASE = [
  'aaaaa',                     // line 0: cols 0-4
  '     bbbbb',                // line 1: cols 5-9
  '          ccccc',           // line 2: cols 10-14
  '               ddddd',     // line 3: cols 15-19
  '                    eeeee', // line 4: cols 20-24
].join('\n');

const TERRAIN_UNIFORM = [
  'xxxxxxxxxxxxxxxxxxxx',      // line 0: 0-19
  'xxxxxxxxxxxxxxxxxxxx',      // line 1: 0-19
  'xxxxxxxxxxxxxxxxxxxx',      // line 2: 0-19
  'xxxxxxxxxxxxxxxxxxxx',      // line 3: 0-19
  'xxxxxxxxxxxxxxxxxxxx',      // line 4: 0-19
].join('\n');

// ── test runner ────────────────────────────────────────────────────

function runTicks(
  physics: CatPhysics,
  lines: string[],
  numTicks: number,
  opts?: {
    checkText?: boolean;
    checkContinuity?: boolean;
    maxColDelta?: number;
    maxLineDelta?: number;
  },
): CatState[] {
  const history: CatState[] = [];
  const checkText = opts?.checkText ?? true;
  const checkCont = opts?.checkContinuity ?? true;
  const maxColDelta = opts?.maxColDelta ?? 2.0;  // generous: runSpeed*2 + margin
  const maxLineDelta = opts?.maxLineDelta ?? 1.0;

  for (let i = 0; i < numTicks; i++) {
    const prev = physics.getState();
    const state = physics.tick();
    history.push(state);

    // Rule 1: text constraint (only when settled — not mid-flight during jump/fall)
    const midFlight = state.action === 'jump' || state.action === 'fall';
    if (checkText && Number.isInteger(state.line) && !midFlight) {
      assert(
        isOnText(lines, state),
        `Rule 1 violated at tick ${i}`,
        `line=${state.line} col=${state.col.toFixed(2)} action=${state.action}`,
      );
    }

    // Rule 1b: jump/fall landing must be on text
    if (checkText && midFlight && prev.action !== state.action) {
      // State just changed — if previous was jump/fall, prev is the landing tick
    }
    if (checkText && (prev.action === 'jump' || prev.action === 'fall') &&
        state.action !== 'jump' && state.action !== 'fall') {
      // Landed — check the landing position
      assert(
        isOnText(lines, state),
        `Rule 1 landing violated at tick ${i}`,
        `line=${state.line} col=${state.col.toFixed(2)} action=${state.action} (was ${prev.action})`,
      );
    }

    // Rule 2: movement continuity
    if (checkCont) {
      const dl = Math.abs(state.line - prev.line);
      const dc = Math.abs(state.col - prev.col);
      // During jump/fall, col can change proportionally
      // Max per-tick: line changes by effectiveSpeed (~0.25), col by maxHSpeed (~0.8)
      // Be generous: allow 1.5 line and 3 cols per tick
      assert(
        dl <= 1.5,
        `Rule 2 line continuity at tick ${i}`,
        `Δline=${dl.toFixed(3)} (prev=${prev.line.toFixed(2)} → ${state.line.toFixed(2)}) action=${state.action}`,
      );
      assert(
        dc <= 3.0,
        `Rule 2 col continuity at tick ${i}`,
        `Δcol=${dc.toFixed(3)} (prev=${prev.col.toFixed(2)} → ${state.col.toFixed(2)}) action=${state.action}`,
      );
    }
  }
  return history;
}

// ── TESTS ──────────────────────────────────────────────────────────

function testSpawnOnText(): void {
  console.log('\n▸ Test: spawn always on text');
  const lines = TERRAIN_BASIC.split('\n');
  const physics = new CatPhysics();
  physics.updateTerrain(TERRAIN_BASIC);

  for (let spawnLine = 0; spawnLine < lines.length; spawnLine++) {
    physics.spawn(spawnLine);
    const s = physics.getState();
    assert(isOnText(lines, s), `spawn at line ${spawnLine}`, `got (${s.line}, ${s.col.toFixed(1)})`);
  }

  // Spawn on empty line → should relocate
  physics.spawn(3);
  const s = physics.getState();
  assert(isOnText(lines, s), 'spawn on empty line relocates', `got (${s.line}, ${s.col.toFixed(1)})`);
}

function testRunStaysOnText(): void {
  console.log('\n▸ Test: run stays on text');
  const lines = TERRAIN_BASIC.split('\n');
  const config: PhysicsConfig = { ...DEFAULT_PHYSICS, fishSpawnInterval: 99999 };
  const physics = new CatPhysics(config);
  physics.updateTerrain(TERRAIN_BASIC);
  physics.spawn(0);
  runTicks(physics, lines, 200);
}

function testJumpFallTextConstraint(): void {
  console.log('\n▸ Test: jump/fall always land on text (wide gap terrain)');
  const lines = TERRAIN_WIDE_GAP.split('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
  physics.updateTerrain(TERRAIN_WIDE_GAP);
  physics.spawn(0);
  runTicks(physics, lines, 2000, { checkText: true, checkContinuity: true });
}

function testPerLineHorizontalCap(): void {
  console.log('\n▸ Test: per-line horizontal cap on staircase terrain');
  const lines = TERRAIN_STAIRCASE.split('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
  physics.updateTerrain(TERRAIN_STAIRCASE);
  physics.spawn(0);

  const history = runTicks(physics, lines, 2000, { checkText: true, checkContinuity: true });

  // Check that no single jump/fall transition exceeds per-line cap significantly
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    // Detect state transition to jump/fall (ticksInState reset)
    if ((cur.action === 'jump' || cur.action === 'fall') && cur.ticksInState === 1) {
      // Nothing to check at the start of jump/fall — track the endpoint
    }
    // Detect landing (jump/fall → different state)
    if ((prev.action === 'jump' || prev.action === 'fall') &&
        prev.action !== cur.action) {
      // We can't reconstruct jumpStartCol from outside, but we can check
      // that the cat is on text at landing
      assert(
        isOnText(lines, cur),
        `Landing on text at tick ${i}`,
        `line=${cur.line} col=${cur.col.toFixed(2)} action=${cur.action}`,
      );
    }
  }
}

function testNoMovementOnIdleSleep(): void {
  console.log('\n▸ Test: idle/sleep don\'t change position');
  const lines = TERRAIN_UNIFORM.split('\n');
  const config: PhysicsConfig = { ...DEFAULT_PHYSICS, fishSpawnInterval: 99999 };
  const physics = new CatPhysics(config);
  physics.updateTerrain(TERRAIN_UNIFORM);
  physics.spawn(2);
  const initial = physics.getState();

  for (let i = 0; i < 50; i++) {
    const state = physics.tick();
    if (state.action === 'idle' || state.action === 'sleep') {
      assert(
        state.line === initial.line && Math.abs(state.col - initial.col) < 0.01,
        `No movement in ${state.action} at tick ${i}`,
        `expected (${initial.line},${initial.col}) got (${state.line},${state.col.toFixed(2)})`,
      );
    }
  }
}

function testVisibleRangeConstraint(): void {
  console.log('\n▸ Test: cat stays within visible range');
  const fullTerrain = Array(20).fill('xxxxxxxxxxxxxxxxxxxx').join('\n');
  const lines = fullTerrain.split('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
  // Only lines 5-10 visible
  physics.updateTerrain(fullTerrain, 5, 10);
  physics.spawn(7);

  const history = runTicks(physics, lines, 1000, { checkContinuity: true, checkText: false });

  for (let i = 0; i < history.length; i++) {
    const s = history[i];
    const line = Math.round(s.line);
    assert(
      line >= 5 && line <= 10,
      `Visible range at tick ${i}`,
      `line=${line} (expected 5-10), action=${s.action}`,
    );
  }
}

function testFishSpawnOnReachablePosition(): void {
  console.log('\n▸ Test: fish spawns on text position');
  const lines = TERRAIN_BASIC.split('\n');
  let fishPositions: FishState[] = [];
  const callbacks: PhysicsCallbacks = {
    onStateChange: () => {},
    onFishSpawn: (f) => { fishPositions.push({ ...f }); },
    onFishEaten: () => {},
  };
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 10 }, callbacks);
  physics.updateTerrain(TERRAIN_BASIC);
  physics.spawn(0);

  runTicks(physics, lines, 500, { checkText: true, checkContinuity: true });

  for (const fish of fishPositions) {
    const fLine = fish.line;
    assert(
      fLine >= 0 && fLine < lines.length,
      `Fish line in range: ${fLine}`,
    );
    if (fLine >= 0 && fLine < lines.length) {
      const edges = textEdges(lines[fLine]);
      assert(
        edges !== null && fish.col >= edges.left && fish.col <= edges.right,
        `Fish on text: (${fLine}, ${fish.col})`,
        edges ? `text range: ${edges.left}-${edges.right}` : 'empty line!',
      );
    }
  }
}

function testLongRunWithWideGap(): void {
  console.log('\n▸ Test: long run with wide gap — stress test all rules');
  const lines = TERRAIN_WIDE_GAP.split('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 8 });
  physics.updateTerrain(TERRAIN_WIDE_GAP);
  physics.spawn(0);
  // Run 5000 ticks — should never violate text constraint or continuity
  runTicks(physics, lines, 5000, { checkText: true, checkContinuity: true });
}

function testStaircaseLargeHorizontal(): void {
  console.log('\n▸ Test: staircase — large horizontal gap between adjacent lines');
  const lines = TERRAIN_STAIRCASE.split('\n');
  const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 8 });
  physics.updateTerrain(TERRAIN_STAIRCASE);
  physics.spawn(0);
  runTicks(physics, lines, 3000, { checkText: true, checkContinuity: true });
}

function testJumpFallMaxHDisplacement(): void {
  console.log('\n▸ Test: jump/fall X displacement ≤ maxH=2 (regression)');
  const maxH = 2;

  // Test on multiple terrains where the cap should be respected
  const terrains: Array<{ name: string; terrain: string }> = [
    { name: 'staircase', terrain: TERRAIN_STAIRCASE },
    { name: 'wide_gap', terrain: TERRAIN_WIDE_GAP },
    { name: 'basic', terrain: TERRAIN_BASIC },
  ];

  for (const { name, terrain } of terrains) {
    const lines = terrain.split('\n');
    const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
    physics.updateTerrain(terrain);
    physics.spawn(0);

    let jumpStartCol: number | null = null;
    let fallStartCol: number | null = null;

    for (let i = 0; i < 3000; i++) {
      const prev = physics.getState();
      const state = physics.tick();

      // Detect jump start (transition into jump)
      if (state.action === 'jump' && prev.action !== 'jump') {
        jumpStartCol = state.col;
      }
      // Detect jump landing
      if (prev.action === 'jump' && state.action !== 'jump' && jumpStartCol !== null) {
        const displacement = Math.abs(state.col - jumpStartCol);
        assert(
          displacement <= maxH + 0.01,
          `[${name}] Jump X displacement at tick ${i}`,
          `|${state.col.toFixed(2)} - ${jumpStartCol.toFixed(2)}| = ${displacement.toFixed(2)} > maxH=${maxH}`,
        );
        jumpStartCol = null;
      }

      // Detect fall start (transition into fall)
      if (state.action === 'fall' && prev.action !== 'fall') {
        fallStartCol = state.col;
      }
      // Detect fall landing
      if (prev.action === 'fall' && state.action !== 'fall' && fallStartCol !== null) {
        const displacement = Math.abs(state.col - fallStartCol);
        assert(
          displacement <= maxH + 0.01,
          `[${name}] Fall X displacement at tick ${i}`,
          `|${state.col.toFixed(2)} - ${fallStartCol.toFixed(2)}| = ${displacement.toFixed(2)} > maxH=${maxH}`,
        );
        fallStartCol = null;
      }
    }
  }
}

function testConsecutiveFishEating(): void {
  console.log('\n▸ Test: consecutive fish eating (4-7 per session)');

  // Use seeded-style approach: run multiple sessions and check counts
  const lines = TERRAIN_UNIFORM.split('\n');

  const sessionCounts: number[] = [];

  // Run several sessions to observe the pattern
  for (let session = 0; session < 10; session++) {
    const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
    physics.updateTerrain(TERRAIN_UNIFORM);
    physics.spawn(0);

    let eatCount = 0;
    let prevAction = '';
    let hadLongIdle = false;
    let idleTicks = 0;
    // fishPostEatDelay is 60, so > 30 ticks of idle means long idle
    const longIdleThreshold = 30;

    for (let i = 0; i < 8000; i++) {
      const state = physics.tick();

      // Count eats (transition into eat)
      if (state.action === 'eat' && prevAction !== 'eat') {
        eatCount++;
      }

      // Track idle duration
      if (state.action === 'idle' || state.action === 'sleep') {
        idleTicks++;
      } else {
        if (idleTicks >= longIdleThreshold && eatCount > 0) {
          hadLongIdle = true;
        }
        idleTicks = 0;
      }

      // Once we detect a long idle after some eats, that's one session
      if (hadLongIdle) {
        break;
      }

      prevAction = state.action;
    }

    if (eatCount > 0) {
      sessionCounts.push(eatCount);
    }
  }

  // Check that we got some sessions
  assert(
    sessionCounts.length >= 3,
    'Got enough completed sessions',
    `Only got ${sessionCounts.length} sessions`,
  );

  // Check each session count is in the 4-7 range
  for (let i = 0; i < sessionCounts.length; i++) {
    assert(
      sessionCounts[i] >= 4 && sessionCounts[i] <= 7,
      `Session ${i} fish count in range [4,7]`,
      `Got ${sessionCounts[i]}`,
    );
  }

  // Check we got some variation (not all the same)
  const unique = new Set(sessionCounts);
  if (sessionCounts.length >= 5) {
    assert(
      unique.size >= 2,
      'Fish counts show variation',
      `All sessions had ${sessionCounts[0]} fish`,
    );
  }
}

function testNoJitterDuringJumpFall(): void {
  console.log('\n▸ Test: no X drift during jump/fall on uniform terrain');

  // On uniform terrain, jump/fall should have minimal X displacement
  // because text ranges are identical on every line
  const lines = TERRAIN_UNIFORM.split('\n');

  for (let trial = 0; trial < 20; trial++) {
    const physics = new CatPhysics({ ...DEFAULT_PHYSICS, fishSpawnInterval: 5 });
    physics.updateTerrain(TERRAIN_UNIFORM);
    physics.spawn(0);

    let jumpStartCol: number | null = null;
    let fallStartCol: number | null = null;
    let prevLandingCol: number | null = null;

    for (let i = 0; i < 2000; i++) {
      const prev = physics.getState();
      const state = physics.tick();

      // Track jump start/landing
      if (state.action === 'jump' && prev.action !== 'jump') {
        jumpStartCol = state.col;
      }
      if (prev.action === 'jump' && state.action !== 'jump' && jumpStartCol !== null) {
        const displacement = Math.abs(state.col - jumpStartCol);
        // On uniform terrain, X displacement during jump should be 0 or very small
        // (only non-zero when text doesn't overlap, which doesn't happen on uniform)
        assert(
          displacement <= 0.5,
          `Trial ${trial}: jump X drift at tick ${i}`,
          `|${state.col.toFixed(2)} - ${jumpStartCol.toFixed(2)}| = ${displacement.toFixed(2)}`,
        );

        // Check for "drift then reverse" pattern
        if (prevLandingCol !== null) {
          const runToJumpStart = jumpStartCol - prevLandingCol;
          const jumpDrift = state.col - jumpStartCol;
          // If the run reversed the previous jump's drift, that's jitter
          if (Math.abs(runToJumpStart) > 0.5 && Math.abs(jumpDrift) > 0.5) {
            const reversed = Math.sign(runToJumpStart) !== Math.sign(jumpDrift);
            assert(
              !reversed,
              `Trial ${trial}: drift-reverse jitter at tick ${i}`,
              `run ${runToJumpStart.toFixed(2)} then jump ${jumpDrift.toFixed(2)}`,
            );
          }
        }
        prevLandingCol = state.col;
        jumpStartCol = null;
      }

      // Track fall start/landing (same logic)
      if (state.action === 'fall' && prev.action !== 'fall') {
        fallStartCol = state.col;
      }
      if (prev.action === 'fall' && state.action !== 'fall' && fallStartCol !== null) {
        const displacement = Math.abs(state.col - fallStartCol);
        assert(
          displacement <= 0.5,
          `Trial ${trial}: fall X drift at tick ${i}`,
          `|${state.col.toFixed(2)} - ${fallStartCol.toFixed(2)}| = ${displacement.toFixed(2)}`,
        );

        if (prevLandingCol !== null) {
          const runToFallStart = fallStartCol - prevLandingCol;
          const fallDrift = state.col - fallStartCol;
          if (Math.abs(runToFallStart) > 0.5 && Math.abs(fallDrift) > 0.5) {
            const reversed = Math.sign(runToFallStart) !== Math.sign(fallDrift);
            assert(
              !reversed,
              `Trial ${trial}: drift-reverse jitter at tick ${i}`,
              `run ${runToFallStart.toFixed(2)} then fall ${fallDrift.toFixed(2)}`,
            );
          }
        }
        prevLandingCol = state.col;
        fallStartCol = null;
      }

      // Reset tracking on idle
      if (state.action === 'idle' || state.action === 'sleep') {
        prevLandingCol = null;
      }
    }
  }
}

// ── main ───────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════');
console.log('  Code Cat — Movement Rules Test Suite');
console.log('═══════════════════════════════════════════');

testSpawnOnText();
testRunStaysOnText();
testJumpFallTextConstraint();
testPerLineHorizontalCap();
testNoMovementOnIdleSleep();
testVisibleRangeConstraint();
testFishSpawnOnReachablePosition();
testLongRunWithWideGap();
testStaircaseLargeHorizontal();
testJumpFallMaxHDisplacement();
testConsecutiveFishEating();
testNoJitterDuringJumpFall();

console.log('\n═══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
