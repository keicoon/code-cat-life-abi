import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVisibleRanges,
  normalizeVisibleRanges,
  selectActiveVisibleRange,
} from './visible-range';

test('normalizes and sorts visible ranges within document bounds', () => {
  const normalized = normalizeVisibleRanges(
    [{ start: 10, end: 25 }, { start: -2, end: 5 }],
    20,
  );
  assert.deepEqual(normalized, [
    { start: 0, end: 5 },
    { start: 10, end: 19 },
  ]);
  assert.equal(formatVisibleRanges(normalized), '0-5,10-19');
});

test('selects the contiguous visible segment containing the focus line', () => {
  const ranges = [
    { start: 2, end: 8 },
    { start: 18, end: 25 },
  ];
  assert.deepEqual(selectActiveVisibleRange(ranges, 20, 40), { start: 18, end: 25 });
  assert.deepEqual(selectActiveVisibleRange(ranges, 12, 40), { start: 2, end: 8 });
});
