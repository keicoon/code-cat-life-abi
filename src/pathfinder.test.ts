import test from 'node:test';
import assert from 'node:assert/strict';
import { Pathfinder } from './pathfinder';
import { TerrainGrid } from './terrain-grid';

test('coalesces same-line walk across interior spaces', () => {
  const grid = new TerrainGrid();
  grid.update('abc     def');
  const pf = new Pathfinder(grid, 3);

  const steps = pf.findPath({ line: 0, col: 1 }, { line: 0, col: 9 });
  assert.deepEqual(steps, [
    { type: 'walk', fromLine: 0, fromCol: 1, toLine: 0, toCol: 9 },
  ]);
});

test('every reachable target reported by Dijkstra has a valid A* path', () => {
  const grid = new TerrainGrid();
  grid.update([
    '  const alpha = 1;',
    '  const beta = 2;',
    '',
    '    return alpha + beta;',
    '  }',
    '',
    '  // unreachable gap below',
    '',
    '',
    '',
    '  const farAway = true;',
  ].join('\n'));

  const pf = new Pathfinder(grid, 3);
  const start = { line: 0, col: 2 };
  const targets = pf.findReachableTargets(start, 3);

  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.ok(target.dist > 3);
    assert.ok(target.line <= 6, `unexpectedly reached line ${target.line}`);
    const path = pf.findPath(start, target);
    assert.ok(path !== null && path.length > 0, `missing path to (${target.line},${target.col})`);
  }
});

test('respects vertical clearance and diagonal stride limits', () => {
  const grid = new TerrainGrid();
  grid.update([
    '0123456789',
    '0123456789',
    '0123456789',
  ].join('\n'));

  const pf = new Pathfinder(grid, 3);
  const steps = pf.findPath({ line: 0, col: 2 }, { line: 2, col: 6 });
  assert.ok(steps !== null);
  if (!steps) { return; }

  for (const step of steps) {
    if (step.type === 'jump' || step.type === 'fall') {
      const lineDelta = Math.abs(step.toLine - step.fromLine);
      const colDelta = Math.abs(step.toCol - step.fromCol);
      assert.ok(lineDelta >= 1 && lineDelta <= 3);
      assert.ok(colDelta === 0 || colDelta === 2 * lineDelta);
    }
  }
});

test('returns null when goal is beyond maxJumpLines', () => {
  const grid = new TerrainGrid();
  grid.update('top\n\n\n\nbottom');
  const pf = new Pathfinder(grid, 3);

  assert.equal(pf.findPath({ line: 0, col: 0 }, { line: 4, col: 0 }), null);
  assert.deepEqual(pf.findReachableTargets({ line: 0, col: 0 }, 3), []);
});

test('cannot walk across a wide interior gap on the same line', () => {
  const grid = new TerrainGrid();
  grid.update('left' + ' '.repeat(16) + 'right');
  const pf = new Pathfinder(grid, 3);

  assert.equal(pf.findPath({ line: 0, col: 1 }, { line: 0, col: 22 }), null);
});
