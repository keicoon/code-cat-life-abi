import { TerrainGrid } from './terrain-grid';
import { GridPoint, MoveStep } from './types';

export interface ReachableTarget extends GridPoint {
  dist: number;
}

interface SearchNode {
  line: number;
  col: number;
  g: number;
  f: number;
}

interface ParentEdge {
  prevKey: string | null;
  line: number;
  col: number;
  type: 'walk' | 'jump' | 'fall' | 'start';
}

const STRIDE_PER_LINE = 2;

class MinHeap<T extends { f: number }> {
  private items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) { return undefined; }
    const top = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[parent].f <= this.items[idx].f) { break; }
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const len = this.items.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len && this.items[left].f < this.items[smallest].f) { smallest = left; }
      if (right < len && this.items[right].f < this.items[smallest].f) { smallest = right; }
      if (smallest === idx) { break; }
      [this.items[idx], this.items[smallest]] = [this.items[smallest], this.items[idx]];
      idx = smallest;
    }
  }
}

function pointKey(line: number, col: number): string {
  return `${line}:${col}`;
}

/**
 * Pure grid-based A* pathfinder and Dijkstra reachability solver over TerrainGrid.
 * Every position reported by findReachableTargets() is guaranteed to have a valid
 * MoveStep[] path returned by findPath().
 */
export class Pathfinder {
  constructor(
    private grid: TerrainGrid,
    private maxJumpLines: number,
  ) {}

  /**
   * Computes all floor positions reachable from `start` with Manhattan distance > minManhattanDist.
   */
  findReachableTargets(start: GridPoint, minManhattanDist = 3): ReachableTarget[] {
    if (!this.grid.isWalkable(start.line, start.col)) {
      return [];
    }

    const startKey = pointKey(start.line, start.col);
    const bestG = new Map<string, number>([[startKey, 0]]);
    const open = new MinHeap<SearchNode>();
    open.push({ line: start.line, col: start.col, g: 0, f: 0 });

    const targets: ReachableTarget[] = [];

    while (open.size > 0) {
      const cur = open.pop();
      if (!cur) { break; }
      const curKey = pointKey(cur.line, cur.col);
      if (cur.g > (bestG.get(curKey) ?? Infinity)) { continue; }

      const dist = Math.abs(cur.line - start.line) + Math.abs(cur.col - start.col);
      if (dist > minManhattanDist) {
        targets.push({ line: cur.line, col: cur.col, dist });
      }

      for (const next of this.getNeighbors(cur.line, cur.col)) {
        const nextKey = pointKey(next.line, next.col);
        const nextG = cur.g + next.cost;
        if (nextG < (bestG.get(nextKey) ?? Infinity)) {
          bestG.set(nextKey, nextG);
          open.push({ line: next.line, col: next.col, g: nextG, f: nextG });
        }
      }
    }

    return targets;
  }

  /**
   * Finds an optimal sequence of coalesced MoveSteps from `start` to `goal`.
   */
  findPath(start: GridPoint, goal: GridPoint): MoveStep[] | null {
    if (!this.grid.isWalkable(start.line, start.col) || !this.grid.isWalkable(goal.line, goal.col)) {
      return null;
    }
    if (start.line === goal.line && start.col === goal.col) {
      return [];
    }

    const startKey = pointKey(start.line, start.col);
    const goalKey = pointKey(goal.line, goal.col);
    const bestG = new Map<string, number>([[startKey, 0]]);
    const parents = new Map<string, ParentEdge>([
      [startKey, { prevKey: null, line: start.line, col: start.col, type: 'start' }],
    ]);

    const open = new MinHeap<SearchNode>();
    open.push({
      line: start.line,
      col: start.col,
      g: 0,
      f: this.heuristic(start.line, start.col, goal),
    });

    while (open.size > 0) {
      const cur = open.pop();
      if (!cur) { break; }
      const curKey = pointKey(cur.line, cur.col);
      if (curKey === goalKey) {
        return this.reconstructSteps(parents, goalKey);
      }
      if (cur.g > (bestG.get(curKey) ?? Infinity)) { continue; }

      for (const next of this.getNeighbors(cur.line, cur.col)) {
        const nextKey = pointKey(next.line, next.col);
        const nextG = cur.g + next.cost;
        if (nextG < (bestG.get(nextKey) ?? Infinity)) {
          bestG.set(nextKey, nextG);
          parents.set(nextKey, {
            prevKey: curKey,
            line: next.line,
            col: next.col,
            type: next.type,
          });
          open.push({
            line: next.line,
            col: next.col,
            g: nextG,
            f: nextG + this.heuristic(next.line, next.col, goal),
          });
        }
      }
    }

    return null;
  }

  private heuristic(line: number, col: number, goal: GridPoint): number {
    return Math.abs(line - goal.line) * 2 + Math.abs(col - goal.col) * 0.5;
  }

  private getNeighbors(
    line: number,
    col: number,
  ): Array<{ line: number; col: number; cost: number; type: 'walk' | 'jump' | 'fall' }> {
    const neighbors: Array<{ line: number; col: number; cost: number; type: 'walk' | 'jump' | 'fall' }> = [];

    // 1. Horizontal walk along the current floor span
    const span = this.grid.getFloorSpanAt(line, col);
    if (span) {
      if (col - 1 >= span.left) {
        neighbors.push({ line, col: col - 1, cost: 1, type: 'walk' });
      }
      if (col + 1 <= span.right) {
        neighbors.push({ line, col: col + 1, cost: 1, type: 'walk' });
      }
    }

    // 2. Vertical jump / fall to nearby floor lines
    for (const type of ['jump', 'fall'] as const) {
      const dir = type === 'jump' ? -1 : 1;
      for (let dist = 1; dist <= this.maxJumpLines; dist++) {
        const targetLine = line + dir * dist;
        if (!this.grid.isFloorLine(targetLine)) { continue; }
        if (!this.isVerticalPathClear(line, targetLine, col)) { continue; }

        const stride = STRIDE_PER_LINE * dist;
        const landingCandidates = [col, col - stride, col + stride];
        const baseCost = dist * dist + 2;

        for (const landingCol of landingCandidates) {
          if (this.grid.isWalkable(targetLine, landingCol)) {
            const diagonalPenalty = landingCol === col ? 0 : 0.25;
            neighbors.push({
              line: targetLine,
              col: landingCol,
              cost: baseCost + diagonalPenalty,
              type,
            });
          }
        }
      }
    }

    return neighbors;
  }

  private isVerticalPathClear(fromLine: number, toLine: number, col: number): boolean {
    const step = toLine > fromLine ? 1 : -1;
    for (let l = fromLine + step; l !== toLine; l += step) {
      if (
        this.grid.isSolidChar(l, col) ||
        this.grid.isSolidChar(l, col - 1) ||
        this.grid.isSolidChar(l, col + 1)
      ) {
        return false;
      }
    }
    return true;
  }

  private reconstructSteps(parents: Map<string, ParentEdge>, goalKey: string): MoveStep[] {
    const raw: Array<{ from: GridPoint; to: GridPoint; type: 'walk' | 'jump' | 'fall' }> = [];
    let curKey: string | null = goalKey;

    while (curKey) {
      const edge = parents.get(curKey);
      if (!edge || !edge.prevKey || edge.type === 'start') { break; }
      const prev = parents.get(edge.prevKey);
      if (!prev) { break; }
      raw.push({
        from: { line: prev.line, col: prev.col },
        to: { line: edge.line, col: edge.col },
        type: edge.type,
      });
      curKey = edge.prevKey;
    }

    raw.reverse();

    // Coalesce consecutive walk steps into a single walk segment
    const steps: MoveStep[] = [];
    for (const item of raw) {
      const prevStep = steps[steps.length - 1];
      if (
        item.type === 'walk' &&
        prevStep &&
        prevStep.type === 'walk' &&
        prevStep.toLine === item.from.line &&
        prevStep.toCol === item.from.col
      ) {
        prevStep.toCol = item.to.col;
      } else {
        steps.push({
          type: item.type,
          fromLine: item.from.line,
          fromCol: item.from.col,
          toLine: item.to.line,
          toCol: item.to.col,
        });
      }
    }

    return steps;
  }
}
