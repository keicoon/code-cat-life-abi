import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGrid } from './terrain-grid';

test('indexes first-to-last non-space char as continuous floor for short gaps', () => {
  const grid = new TerrainGrid();
  grid.update('  abc   def  \n   \nxyz');

  assert.deepEqual(grid.getFloorSpans(0), [{ left: 2, right: 10 }]);
  assert.equal(grid.isWalkable(0, 2), true);
  assert.equal(grid.isWalkable(0, 6), true); // short interior space is walkable
  assert.equal(grid.isWalkable(0, 10), true);
  assert.equal(grid.isWalkable(0, 1), false);
  assert.equal(grid.isWalkable(0, 11), false);

  assert.equal(grid.isFloorLine(1), false);
  assert.deepEqual(grid.getFloorSpans(1), []);

  assert.deepEqual(grid.getFloorSpans(2), [{ left: 0, right: 2 }]);
});

test('splits a line into separate floor spans when interior gap meets maxWalkableGap', () => {
  const grid = new TerrainGrid();
  const wideGapLine = 'left' + ' '.repeat(16) + 'right';
  grid.update(wideGapLine);

  assert.deepEqual(grid.getFloorSpans(0), [
    { left: 0, right: 3 },
    { left: 20, right: 24 },
  ]);
  assert.equal(grid.isWalkable(0, 3), true);
  assert.equal(grid.isWalkable(0, 10), false);
  assert.equal(grid.isWalkable(0, 20), true);
  assert.equal(grid.clampToFloor(0, 18), 20);
});

test('respects visible line range bounds', () => {
  const grid = new TerrainGrid();
  grid.update('line0\nline1\nline2\nline3', 1, 2);

  assert.equal(grid.isFloorLine(0), false);
  assert.equal(grid.isFloorLine(1), true);
  assert.equal(grid.isFloorLine(2), true);
  assert.equal(grid.isFloorLine(3), false);
  assert.equal(grid.isSolidChar(0, 0), false);
  assert.equal(grid.isSolidChar(1, 0), true);
});

test('finds nearest floor line and clamps columns', () => {
  const grid = new TerrainGrid();
  grid.update('   \n   hello\n   \nworld');

  assert.equal(grid.findNearestFloorLine(0, true), 1);
  assert.equal(grid.findNearestFloorLine(2, false), 1);
  assert.equal(grid.findNearestFloorLine(2, true), 3);

  assert.equal(grid.clampToFloor(1, 0), 3);
  assert.equal(grid.clampToFloor(1, 5), 5);
  assert.equal(grid.clampToFloor(1, 20), 7);
});
