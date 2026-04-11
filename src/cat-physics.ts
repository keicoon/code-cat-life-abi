import {
  CatState,
  CatAction,
  Direction,
  FishState,
  TextEdge,
  RouteStep,
  PhysicsConfig,
  DEFAULT_PHYSICS,
} from './types';

export interface PhysicsCallbacks {
  onStateChange(state: CatState): void;
  onFishSpawn(fish: FishState): void;
  onFishEaten(total: number): void;
}

interface AStarNode {
  line: number;
  g: number;
  f: number;
  parent: AStarNode | null;
  viaCol: number;
  action: 'jump' | 'fall' | null;
}

interface Neighbor {
  line: number;
  cost: number;
  viaCol: number;
  action: 'jump' | 'fall';
}

export class CatPhysics {
  private lines: string[] = [];
  private terrain: boolean[][] = [];
  private maxCol = 0;

  private state: CatState = {
    line: 0, col: 0,
    action: 'idle', direction: 'right',
    frame: 0, ticksInState: 0,
  };

  private fish: FishState = { line: -1, col: -1, active: false };
  private fishEaten = 0;
  private fishSpawnTimer = 0;
  private fishChaseTicks = 0;

  private route: RouteStep[] | null = null;
  private routeIdx = 0;
  private routeGoalCol = 0;
  private targetCol = 0;
  private targetLine = -1;

  private animTick = 0;

  constructor(
    private config: PhysicsConfig = DEFAULT_PHYSICS,
    private callbacks?: PhysicsCallbacks,
  ) {}

  // ---- Terrain ----

  updateTerrain(text: string): void {
    this.lines = text.split('\n');
    this.maxCol = 0;
    this.terrain = [];
    for (let l = 0; l < this.lines.length; l++) {
      const line = this.lines[l];
      if (line.length > this.maxCol) { this.maxCol = line.length; }
      this.terrain[l] = [];
      for (let c = 0; c <= this.maxCol; c++) {
        this.terrain[l][c] = c < line.length && line[c] !== ' ';
      }
    }
    this.validatePosition();
  }

  private validatePosition(): void {
    const line = Math.round(this.state.line);
    if (line >= this.lines.length || this.isEmptyLine(line)) {
      // Find nearest non-empty line
      for (let d = 0; d < this.lines.length; d++) {
        for (const dir of [line - d, line + d]) {
          if (dir >= 0 && dir < this.lines.length && !this.isEmptyLine(dir)) {
            const edges = this.textEdges(dir);
            if (edges) {
              this.state.line = dir;
              this.state.col = edges.left;
              return;
            }
          }
        }
      }
    }
  }

  private isSolid(line: number, col: number): boolean {
    if (line < 0 || line >= this.terrain.length) { return false; }
    if (col < 0 || col >= (this.terrain[line]?.length ?? 0)) { return false; }
    return this.terrain[line][col];
  }

  private isEmptyLine(line: number): boolean {
    return line >= 0 && line < this.lines.length && this.lines[line].trim().length === 0;
  }

  private textEdges(line: number): TextEdge | null {
    if (line < 0 || line >= this.lines.length) { return null; }
    const s = this.lines[line];
    let left = -1, right = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== ' ') { if (left === -1) { left = i; } right = i; }
    }
    if (left === -1) { return null; }
    return { left, right };
  }

  // ---- A* Pathfinding ----

  private isVerticalPathClear(fromLine: number, toLine: number, col: number): boolean {
    const c = Math.round(col);
    const step = toLine > fromLine ? 1 : -1;
    for (let l = fromLine + step; l !== toLine; l += step) {
      if (this.isSolid(l, c) || this.isSolid(l, c - 1) || this.isSolid(l, c + 1)) { return false; }
    }
    return true;
  }

  private findVerticalCol(fromLine: number, toLine: number): number {
    const edges = this.textEdges(fromLine);
    if (!edges) { return -1; }
    for (let c = edges.left; c <= edges.right; c++) {
      if (this.isVerticalPathClear(fromLine, toLine, c)) { return c; }
    }
    return -1;
  }

  private getLineNeighbors(line: number): Neighbor[] {
    const neighbors: Neighbor[] = [];
    const edges = this.textEdges(line);
    if (!edges) { return neighbors; }

    // Jump up: max 3 lines
    for (let up = 1; up <= this.config.maxJumpLines; up++) {
      const target = line - up;
      if (target < 0 || this.isEmptyLine(target)) { continue; }
      const col = this.findVerticalCol(line, target);
      if (col >= 0) {
        neighbors.push({ line: target, cost: up + 1, viaCol: col, action: 'jump' });
      }
    }

    // Fall down: unlimited, land on first text line
    for (let down = 1; down < this.lines.length; down++) {
      const target = line + down;
      if (target >= this.lines.length) { break; }
      if (this.isEmptyLine(target)) { continue; }
      const col = this.findVerticalCol(line, target);
      if (col >= 0) {
        neighbors.push({ line: target, cost: down, viaCol: col, action: 'fall' });
      }
      break;
    }

    // Walk to adjacent overlapping text
    for (const d of [-1, 1]) {
      const nb = line + d;
      if (nb >= 0 && nb < this.lines.length && !this.isEmptyLine(nb)) {
        const en = this.textEdges(nb);
        if (en && edges.left <= en.right + 1 && edges.right >= en.left - 1) {
          const walkCol = Math.max(edges.left, en.left);
          neighbors.push({ line: nb, cost: 1, viaCol: walkCol, action: d < 0 ? 'jump' : 'fall' });
        }
      }
    }

    return neighbors;
  }

  private findPath(fromLine: number, toLine: number): Array<{ line: number; viaCol: number; action: 'jump' | 'fall' }> | null {
    if (fromLine === toLine) { return []; }
    if (this.isEmptyLine(fromLine) || this.isEmptyLine(toLine)) { return null; }

    const open: AStarNode[] = [{ line: fromLine, g: 0, f: Math.abs(fromLine - toLine), parent: null, viaCol: -1, action: null }];
    const closed: Record<number, boolean> = {};

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) { bestIdx = i; }
      }
      const cur = open.splice(bestIdx, 1)[0];

      if (cur.line === toLine) {
        const path: Array<{ line: number; viaCol: number; action: 'jump' | 'fall' }> = [];
        let n: AStarNode | null = cur;
        while (n?.parent !== null) {
          if (n) { path.unshift({ line: n.line, viaCol: n.viaCol, action: n.action! }); }
          n = n?.parent ?? null;
        }
        return path;
      }

      if (closed[cur.line]) { continue; }
      closed[cur.line] = true;

      for (const nb of this.getLineNeighbors(cur.line)) {
        if (closed[nb.line]) { continue; }
        const g = cur.g + nb.cost;
        const h = Math.abs(nb.line - toLine);
        open.push({ line: nb.line, g, f: g + h, parent: cur, viaCol: nb.viaCol, action: nb.action });
      }
    }
    return null;
  }

  // ---- Route execution ----

  private executeNextRouteStep(): void {
    if (!this.route || this.routeIdx >= this.route.length) {
      this.route = null;
      this.setState('run');
      this.targetCol = this.routeGoalCol;
      this.targetLine = -1;
      return;
    }

    const step = this.route[this.routeIdx];
    this.routeIdx++;
    this.setState(step.action === 'jump' ? 'run_then_jump' : 'run_then_fall');
    this.targetCol = step.col;
    this.targetLine = step.line;
  }

  private planRoute(goalLine: number, goalCol: number): boolean {
    const currentLine = Math.round(this.state.line);
    this.routeGoalCol = goalCol;

    if (currentLine === goalLine) {
      this.route = null;
      this.setState('run');
      this.targetCol = goalCol;
      this.targetLine = -1;
      return true;
    }

    const path = this.findPath(currentLine, goalLine);
    if (!path) { return false; }

    this.route = path.map(p => ({ line: p.line, col: p.viaCol, action: p.action }));
    this.routeIdx = 0;
    this.executeNextRouteStep();
    return true;
  }

  // ---- Fish ----

  private getValidFishPositions(): Array<{ line: number; col: number; dist: number }> {
    const catLine = Math.round(this.state.line);
    const reachable: Record<number, boolean> = {};
    const positions: Array<{ line: number; col: number; dist: number }> = [];

    for (let l = 0; l < this.lines.length; l++) {
      if (this.isEmptyLine(l)) { continue; }
      if (reachable[l] === undefined) {
        reachable[l] = (l === catLine) || (this.findPath(catLine, l) !== null);
      }
      if (!reachable[l]) { continue; }
      const edges = this.textEdges(l);
      if (!edges) { continue; }
      for (let c = edges.left; c <= edges.right; c++) {
        if (this.terrain[l][c]) {
          const dist = Math.abs(l - catLine) + Math.abs(c - Math.round(this.state.col));
          if (dist > 3) { positions.push({ line: l, col: c, dist }); }
        }
      }
    }
    return positions;
  }

  private spawnFish(): void {
    const positions = this.getValidFishPositions();
    if (positions.length === 0) { return; }
    positions.sort((a, b) => b.dist - a.dist);
    const farHalf = Math.max(1, Math.floor(positions.length * 0.5));
    const pick = positions[Math.floor(Math.random() * farHalf)];
    this.fish = { line: pick.line, col: pick.col, active: true };
    this.fishChaseTicks = 0;
    this.callbacks?.onFishSpawn(this.fish);
  }

  private eatFish(): void {
    this.fish.active = false;
    this.fishEaten++;
    this.route = null;
    this.callbacks?.onFishEaten(this.fishEaten);
    this.setState('idle');
    this.fishSpawnTimer = -this.config.fishPostEatDelay;
  }

  private checkFishEat(): void {
    if (!this.fish.active) { return; }
    const dist = Math.abs(Math.round(this.state.line) - this.fish.line) +
                 Math.abs(this.state.col - this.fish.col);
    if (dist < 2) { this.eatFish(); }
  }

  private decideNextAction(): void {
    if (this.fish.active) {
      if (this.planRoute(this.fish.line, this.fish.col)) { return; }
    }
    this.setState('idle');
  }

  // ---- State helpers ----

  private setState(action: CatAction): void {
    this.state.action = action;
    this.state.ticksInState = 0;
    this.state.frame = 0;
  }

  // ---- Main tick ----

  tick(): CatState {
    this.animTick++;
    this.state.ticksInState++;

    // Fish spawn timer
    if (!this.fish.active) {
      this.fishSpawnTimer++;
      if (this.fishSpawnTimer >= this.config.fishSpawnInterval) {
        this.spawnFish();
        this.fishSpawnTimer = 0;
        if (this.state.action === 'idle' && this.fish.active) {
          this.decideNextAction();
        }
      }
    } else {
      this.fishChaseTicks++;
      if (this.fishChaseTicks >= this.config.fishChaseTimeout) {
        this.fish.active = false;
        this.fishSpawnTimer = 0;
        this.setState('idle');
      }
    }

    const { runSpeed, jumpSpeed, fallSpeed } = this.config;

    switch (this.state.action) {
      case 'idle':
      case 'sleep':
        if (this.fish.active && this.state.ticksInState > 10) {
          this.decideNextAction();
        }
        break;

      case 'run': {
        const dx = this.targetCol - this.state.col;
        if (Math.abs(dx) < runSpeed) {
          this.state.col = this.targetCol;
          this.checkFishEat();
          if (this.state.action === 'run') { this.decideNextAction(); }
        } else {
          this.state.direction = dx > 0 ? 'right' : 'left';
          this.state.col += (dx > 0 ? 1 : -1) * runSpeed;
          this.checkFishEat();
        }
        this.state.frame = (this.state.frame + 1) % 5;
        break;
      }

      case 'run_then_jump': {
        const dx = this.targetCol - this.state.col;
        if (Math.abs(dx) < runSpeed) {
          this.state.col = this.targetCol;
          this.setState('jump');
          this.targetCol = this.route?.[this.routeIdx - 1]?.col ?? this.targetCol;
        } else {
          this.state.direction = dx > 0 ? 'right' : 'left';
          this.state.col += (dx > 0 ? 1 : -1) * runSpeed;
        }
        this.state.frame = (this.state.frame + 1) % 5;
        break;
      }

      case 'run_then_fall': {
        const dx = this.targetCol - this.state.col;
        if (Math.abs(dx) < runSpeed) {
          this.state.col = this.targetCol;
          this.setState('fall');
          this.targetCol = this.route?.[this.routeIdx - 1]?.col ?? this.targetCol;
        } else {
          this.state.direction = dx > 0 ? 'right' : 'left';
          this.state.col += (dx > 0 ? 1 : -1) * runSpeed;
        }
        this.state.frame = (this.state.frame + 1) % 5;
        break;
      }

      case 'jump': {
        const dy = this.state.line - this.targetLine;
        if (dy > jumpSpeed) {
          this.state.line -= jumpSpeed;
          const jumpDx = this.targetCol - this.state.col;
          this.state.col += jumpDx * 0.1;
        } else {
          this.state.line = this.targetLine;
          this.state.col = this.targetCol;
          this.targetLine = -1;
          this.checkFishEat();
          if (this.state.action === 'jump') { this.executeNextRouteStep(); }
        }
        break;
      }

      case 'fall': {
        const dy = this.targetLine - this.state.line;
        if (dy > fallSpeed) {
          this.state.line += fallSpeed;
          const fallDx = this.targetCol - this.state.col;
          this.state.col += fallDx * 0.1;
        } else {
          this.state.line = this.targetLine;
          this.state.col = this.targetCol;
          this.targetLine = -1;
          this.checkFishEat();
          if (this.state.action === 'fall') { this.executeNextRouteStep(); }
        }
        break;
      }
    }

    this.callbacks?.onStateChange({ ...this.state });
    return { ...this.state };
  }

  // ---- Public API ----

  getState(): CatState { return { ...this.state }; }
  getFish(): FishState { return { ...this.fish }; }
  getFishEaten(): number { return this.fishEaten; }

  reset(): void {
    this.setState('idle');
    this.fish.active = false;
    this.fishSpawnTimer = 0;
    this.route = null;
    const edges = this.textEdges(this.state.line);
    if (edges) { this.state.col = edges.left; }
  }

  spawn(line: number): void {
    this.state.line = line;
    const edges = this.textEdges(line);
    if (edges) { this.state.col = edges.left; }
    this.setState('idle');
    this.fishSpawnTimer = 0;
    this.fish.active = false;
  }
}
