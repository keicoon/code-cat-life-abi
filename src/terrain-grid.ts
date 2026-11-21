import { TextSpan } from './types';

interface LineData {
  spans: TextSpan[];
  solid: boolean[];
}

export const DEFAULT_MAX_WALKABLE_GAP = 16;

/**
 * Indexes editor text within an active visible line range into a 2D floor grid.
 * On each visible non-empty line, contiguous text and short interior spaces
 * (< maxWalkableGap) form a walkable floor span, while wider gaps split the line
 * into separate spans.
 */
export class TerrainGrid {
  private lines: LineData[] = [];
  private visibleStart = 0;
  private visibleEnd = 0;
  private version = 0;

  constructor(private readonly maxWalkableGap = DEFAULT_MAX_WALKABLE_GAP) {}

  update(text: string, visibleStart?: number, visibleEnd?: number): void {
    const rawLines = text.split('\n');
    const maxLine = Math.max(0, rawLines.length - 1);
    this.visibleStart = Math.max(0, Math.min(maxLine, visibleStart ?? 0));
    this.visibleEnd = Math.max(this.visibleStart, Math.min(maxLine, visibleEnd ?? maxLine));
    this.version++;

    this.lines = rawLines.map((line, index) => {
      const inView = index >= this.visibleStart && index <= this.visibleEnd;
      if (!inView) {
        return { spans: [], solid: [] };
      }
      return {
        spans: this.computeSpans(line),
        solid: Array.from(line, char => char !== ' '),
      };
    });
  }

  getVersion(): number {
    return this.version;
  }

  getLineCount(): number {
    return this.lines.length;
  }

  getVisibleBounds(): { start: number; end: number } {
    return { start: this.visibleStart, end: this.visibleEnd };
  }

  isFloorLine(line: number): boolean {
    return this.getFloorSpans(line).length > 0;
  }

  getFloorSpans(line: number): TextSpan[] {
    if (line < this.visibleStart || line > this.visibleEnd) { return []; }
    if (line < 0 || line >= this.lines.length) { return []; }
    return this.lines[line].spans;
  }

  getFirstFloorSpan(line: number): TextSpan | null {
    const spans = this.getFloorSpans(line);
    return spans.length > 0 ? spans[0] : null;
  }

  getFloorSpanAt(line: number, col: number): TextSpan | null {
    for (const span of this.getFloorSpans(line)) {
      if (col >= span.left && col <= span.right) {
        return span;
      }
    }
    return null;
  }

  isWalkable(line: number, col: number): boolean {
    return this.getFloorSpanAt(line, col) !== null;
  }

  isSolidChar(line: number, col: number): boolean {
    if (line < this.visibleStart || line > this.visibleEnd) { return false; }
    if (line < 0 || line >= this.lines.length) { return false; }
    const row = this.lines[line].solid;
    if (col < 0 || col >= row.length) { return false; }
    return row[col];
  }

  clampToFloor(line: number, col: number): number {
    const spans = this.getFloorSpans(line);
    if (spans.length === 0) { return col; }

    let bestCol = spans[0].left;
    let bestDist = Infinity;
    for (const span of spans) {
      const clamped = Math.max(span.left, Math.min(span.right, col));
      const dist = Math.abs(clamped - col);
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = clamped;
      }
    }
    return bestCol;
  }

  findNearestFloorLine(nearLine: number, preferBelowFirst: boolean): number | null {
    for (let dist = 0; dist < this.lines.length; dist++) {
      const candidates = dist === 0
        ? [nearLine]
        : preferBelowFirst
          ? [nearLine + dist, nearLine - dist]
          : [nearLine - dist, nearLine + dist];
      for (const candidate of candidates) {
        if (this.isFloorLine(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private computeSpans(line: string): TextSpan[] {
    const spans: TextSpan[] = [];
    let segStart = -1;
    let lastNonSpace = -1;
    let spaceRun = 0;

    for (let i = 0; i < line.length; i++) {
      if (line[i] !== ' ') {
        if (segStart === -1) {
          segStart = i;
        } else if (spaceRun >= this.maxWalkableGap) {
          spans.push({ left: segStart, right: lastNonSpace });
          segStart = i;
        }
        lastNonSpace = i;
        spaceRun = 0;
      } else if (segStart !== -1) {
        spaceRun++;
      }
    }

    if (segStart !== -1) {
      spans.push({ left: segStart, right: lastNonSpace });
    }
    return spans;
  }
}
