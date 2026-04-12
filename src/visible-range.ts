export interface VisibleLineRange {
  start: number;
  end: number;
}

function clampRange(range: VisibleLineRange, maxLine: number): VisibleLineRange | null {
  const start = Math.max(0, Math.min(maxLine, range.start));
  const end = Math.max(0, Math.min(maxLine, range.end));
  if (start > end) { return null; }
  return { start, end };
}

export function normalizeVisibleRanges(
  ranges: VisibleLineRange[],
  lineCount: number,
): VisibleLineRange[] {
  const maxLine = Math.max(0, lineCount - 1);
  if (ranges.length === 0) {
    return [{ start: 0, end: maxLine }];
  }
  return ranges
    .map(range => clampRange(range, maxLine))
    .filter((range): range is VisibleLineRange => range !== null)
    .sort((a, b) => a.start - b.start);
}

export function selectActiveVisibleRange(
  ranges: VisibleLineRange[],
  focusLine: number,
  lineCount: number,
): VisibleLineRange {
  const normalized = normalizeVisibleRanges(ranges, lineCount);
  return normalized.find(range => focusLine >= range.start && focusLine <= range.end) ?? normalized[0];
}

export function formatVisibleRanges(ranges: VisibleLineRange[]): string {
  return ranges.map(range => `${range.start}-${range.end}`).join(',');
}
