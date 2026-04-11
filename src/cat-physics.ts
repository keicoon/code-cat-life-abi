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
  private visibleStart = 0;
  private visibleEnd = 0;

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
  private pathFailCount = 0;
  private jumpStartCol = 0;
  private jumpStartLine = 0;
  private eatPhase = 0; // 0=first eat (fish visible), 1=second eat (fish gone)

  constructor(
    private config: PhysicsConfig = DEFAULT_PHYSICS,
    private callbacks?: PhysicsCallbacks,
  ) {}

  // ---- Terrain ----

  updateTerrain(text: string, visibleStart?: number, visibleEnd?: number): void {
    this.lines = text.split('\n');
    this.maxCol = 0;
    this.terrain = [];

    // Constrain to visible range if provided
    const vStart = visibleStart ?? 0;
    const vEnd = visibleEnd ?? this.lines.length - 1;
    this.visibleStart = vStart;
    this.visibleEnd = vEnd;

    for (let l = 0; l < this.lines.length; l++) {
      const line = this.lines[l];
      if (line.length > this.maxCol) { this.maxCol = line.length; }
      this.terrain[l] = [];
      for (let c = 0; c <= this.maxCol; c++) {
        // Only treat lines within visible range as solid terrain
        const inView = l >= vStart && l <= vEnd;
        this.terrain[l][c] = inView && c < line.length && line[c] !== ' ';
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
    if (line < this.visibleStart || line > this.visibleEnd) { return true; }
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

  private clampToTextEdges(line: number, col: number): number {
    const edges = this.textEdges(line);
    if (!edges) { return col; }
    return Math.max(edges.left, Math.min(edges.right, col));
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

  /** Like findVerticalCol but picks a RANDOM valid column for path variety */
  private findRandomVerticalCol(fromLine: number, toLine: number): number {
    const edges = this.textEdges(fromLine);
    if (!edges) { return -1; }
    const valid: number[] = [];
    for (let c = edges.left; c <= edges.right; c++) {
      if (this.isVerticalPathClear(fromLine, toLine, c)) { valid.push(c); }
    }
    if (valid.length === 0) { return -1; }
    return valid[Math.floor(Math.random() * valid.length)];
  }

  /** Find the valid transit column closest to preferCol, prioritizing overlap with destination */
  private findNearestValidCol(fromLine: number, toLine: number, preferCol: number): number {
    const fromEdges = this.textEdges(fromLine);
    if (!fromEdges) { return -1; }
    const toEdges = this.textEdges(toLine);

    // Prefer columns valid on BOTH source and destination lines
    const overlapL = toEdges ? Math.max(fromEdges.left, toEdges.left) : fromEdges.left;
    const overlapR = toEdges ? Math.min(fromEdges.right, toEdges.right) : fromEdges.right;

    if (overlapL <= overlapR) {
      const pref = Math.max(overlapL, Math.min(overlapR, preferCol));
      for (let d = 0; d <= overlapR - overlapL; d++) {
        for (const c of [pref + d, pref - d]) {
          if (c >= overlapL && c <= overlapR && this.isVerticalPathClear(fromLine, toLine, c)) {
            return c;
          }
        }
      }
    }

    // Fallback: no overlap — prefer source col closest to target text
    // to minimize horizontal displacement during diagonal jump/fall
    let fallbackPref = preferCol;
    if (toEdges) {
      if (fromEdges.right < toEdges.left) {
        fallbackPref = fromEdges.right;   // source left of target → right edge
      } else if (fromEdges.left > toEdges.right) {
        fallbackPref = fromEdges.left;    // source right of target → left edge
      }
    }
    const pref = Math.max(fromEdges.left, Math.min(fromEdges.right, fallbackPref));
    for (let d = 0; d <= fromEdges.right - fromEdges.left; d++) {
      for (const c of [pref + d, pref - d]) {
        if (c >= fromEdges.left && c <= fromEdges.right && this.isVerticalPathClear(fromLine, toLine, c)) {
          return c;
        }
      }
    }
    return -1;
  }

  private getLineNeighbors(line: number): Neighbor[] {
    const neighbors: Neighbor[] = [];
    const edges = this.textEdges(line);
    if (!edges) { return neighbors; }

    // Jump up: max 3 lines — exponential cost strongly prefers 1-line hops
    for (let up = 1; up <= this.config.maxJumpLines; up++) {
      const target = line - up;
      if (target < 0 || this.isEmptyLine(target)) { continue; }
      const col = this.findRandomVerticalCol(line, target);
      if (col >= 0) {
        // 1-line: cost 2, 2-line: cost 5, 3-line: cost 10
        const cost = up * up + 1;
        neighbors.push({ line: target, cost, viaCol: col, action: 'jump' });
      }
    }

    // Fall down: land on first text line below
    for (let down = 1; down < this.lines.length; down++) {
      const target = line + down;
      if (target >= this.lines.length) { break; }
      if (this.isEmptyLine(target)) { continue; }
      const col = this.findRandomVerticalCol(line, target);
      if (col >= 0) {
        neighbors.push({ line: target, cost: down, viaCol: col, action: 'fall' });
      }
      break;
    }

    // Walk to adjacent overlapping text — cheapest option (cost 1)
    for (const d of [-1, 1]) {
      const nb = line + d;
      if (nb >= 0 && nb < this.lines.length && !this.isEmptyLine(nb)) {
        const en = this.textEdges(nb);
        if (en && edges.left <= en.right + 1 && edges.right >= en.left - 1) {
          const overlapL = Math.max(edges.left, en.left);
          const overlapR = Math.min(edges.right, en.right);
          const walkCol = overlapL + Math.floor(Math.random() * Math.max(1, overlapR - overlapL + 1));
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
        // Random noise creates varied, scenic paths instead of always-optimal routes
        const noise = 1 + Math.random() * 1.5;
        const g = cur.g + nb.cost * noise;
        const h = Math.abs(nb.line - toLine);
        open.push({ line: nb.line, g, f: g + h, parent: cur, viaCol: nb.viaCol, action: nb.action });
      }
    }
    return null;
  }

  // ---- Route execution ----

  /** Post-process A* path: reassign columns to minimize horizontal travel */
  private optimizeRouteColumns(
    path: Array<{ line: number; viaCol: number; action: 'jump' | 'fall' }>,
    startCol: number,
    startLine: number,
  ): RouteStep[] {
    let prevCol = startCol;
    let prevLine = startLine;

    return path.map(step => {
      const bestCol = this.findNearestValidCol(prevLine, step.line, prevCol);
      const col = bestCol >= 0 ? bestCol : step.viaCol;
      // Estimate actual landing considering per-line horizontal cap
      const rawLanding = this.clampToTextEdges(step.line, col);
      const vertDist = Math.abs(step.line - prevLine);
      const maxH = Math.min(this.config.maxJumpCols, Math.max(3, vertDist * 3));
      let estLanding = rawLanding;
      if (Math.abs(rawLanding - col) > maxH) {
        estLanding = col + Math.sign(rawLanding - col) * maxH;
      }
      prevCol = estLanding;
      prevLine = step.line;
      return { line: step.line, col, action: step.action };
    });
  }

  private executeNextRouteStep(): void {
    if (!this.route || this.routeIdx >= this.route.length) {
      this.route = null;
      this.setState('run');
      this.targetCol = this.clampToTextEdges(Math.round(this.state.line), this.routeGoalCol);
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

    this.route = this.optimizeRouteColumns(path, Math.round(this.state.col), currentLine);
    this.routeIdx = 0;
    this.executeNextRouteStep();
    return true;
  }

  // ---- Fish ----

  private getValidFishPositions(): Array<{ line: number; col: number; dist: number }> {
    const catLine = Math.round(this.state.line);
    const reachable: Record<number, boolean> = {};
    const positions: Array<{ line: number; col: number; dist: number }> = [];

    // Only consider lines within visible range
    for (let l = this.visibleStart; l <= this.visibleEnd; l++) {
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
    this.fishEaten++;
    this.route = null;
    this.callbacks?.onFishEaten(this.fishEaten);
    this.eatPhase = 0; // phase 0: eat with fish visible
    this.setState('eat');
  }

  private checkFishEat(): void {
    if (!this.fish.active) { return; }
    const dist = Math.abs(Math.round(this.state.line) - this.fish.line) +
                 Math.abs(this.state.col - this.fish.col);
    if (dist < 2) { this.eatFish(); }
  }

  private decideNextAction(): void {
    if (this.fish.active) {
      if (this.planRoute(this.fish.line, this.fish.col)) {
        this.pathFailCount = 0;
        return;
      }
      this.pathFailCount++;
      if (this.pathFailCount >= 3) {
        // Give up on unreachable fish
        this.fish.active = false;
        this.fishSpawnTimer = 0;
        this.pathFailCount = 0;
      }
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

    // Fish spawn timer (paused during eat animation)
    if (!this.fish.active && this.state.action !== 'eat') {
      this.fishSpawnTimer++;
      if (this.fishSpawnTimer >= this.config.fishSpawnInterval) {
        this.spawnFish();
        this.fishSpawnTimer = 0;
        if (this.state.action === 'idle' && this.fish.active) {
          // Face toward the fish
          this.state.direction = this.fish.col >= this.state.col ? 'right' : 'left';
          this.setState('surprise');
        }
      }
    } else if (this.state.action !== 'eat') {
      this.fishChaseTicks++;
      if (this.fishChaseTicks >= this.config.fishChaseTimeout) {
        this.fish.active = false;
        this.fishSpawnTimer = 0;
        this.route = null;
        this.targetLine = -1;
        this.setState('idle');
      }
    }

    const { runSpeed, jumpSpeed, fallSpeed } = this.config;

    switch (this.state.action) {
      case 'idle':
      case 'sleep':
        if (this.fish.active && this.state.ticksInState > 10) {
          this.state.direction = this.fish.col >= this.state.col ? 'right' : 'left';
          this.setState('surprise');
        }
        break;

      case 'surprise':
        if (this.state.ticksInState >= this.config.surpriseDuration) {
          this.decideNextAction();
        }
        break;

      case 'eat':
        this.state.frame = Math.floor(this.state.ticksInState / 4) % 2;
        if (this.state.ticksInState >= this.config.eatDuration) {
          if (this.eatPhase === 0) {
            // Phase 0 done → fish disappears, start phase 1 (second eat)
            this.fish.active = false;
            this.eatPhase = 1;
            this.setState('eat');
          } else {
            // Phase 1 done → go to sleep
            this.setState('idle');
            this.fishSpawnTimer = -this.config.fishPostEatDelay;
          }
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
          // Save start position for linear interpolation during jump
          this.jumpStartCol = this.state.col;
          this.jumpStartLine = this.state.line;
          this.setState('jump');
          const vertDist = Math.abs(this.targetLine - this.jumpStartLine);
          // Per-line horizontal cap: ~3 cols per line (≈ lineHeight/charWidth)
          const maxH = Math.min(this.config.maxJumpCols, Math.max(3, vertDist * 3));
          let jumpTarget = this.clampToTextEdges(this.targetLine, this.state.col);
          // Bias toward fish/goal for natural diagonal arc instead of straight vertical
          if (Math.abs(jumpTarget - this.jumpStartCol) < 2 && this.routeGoalCol >= 0) {
            const goalDir = Math.sign(this.routeGoalCol - this.jumpStartCol);
            if (goalDir !== 0) {
              const biasAmount = Math.min(maxH, Math.ceil(vertDist * 1.5));
              const biased = this.clampToTextEdges(this.targetLine, this.jumpStartCol + goalDir * biasAmount);
              if (Math.abs(biased - this.jumpStartCol) <= maxH) {
                jumpTarget = biased;
              }
            }
          }
          // Enforce per-line horizontal cap
          if (Math.abs(jumpTarget - this.jumpStartCol) > maxH) {
            jumpTarget = this.jumpStartCol + (jumpTarget > this.jumpStartCol ? maxH : -maxH);
          }
          this.targetCol = jumpTarget;
          if (Math.abs(this.targetCol - this.jumpStartCol) > 1) {
            this.state.direction = this.targetCol > this.jumpStartCol ? 'right' : 'left';
          }
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
          // Save start position for linear interpolation during fall
          this.jumpStartCol = this.state.col;
          this.jumpStartLine = this.state.line;
          this.setState('fall');
          const vertDist = Math.abs(this.targetLine - this.jumpStartLine);
          // Per-line horizontal cap: ~3 cols per line (≈ lineHeight/charWidth)
          const maxH = Math.min(this.config.maxJumpCols, Math.max(3, vertDist * 3));
          let fallTarget = this.clampToTextEdges(this.targetLine, this.state.col);
          // Bias toward fish/goal for natural diagonal arc
          if (Math.abs(fallTarget - this.jumpStartCol) < 2 && this.routeGoalCol >= 0) {
            const goalDir = Math.sign(this.routeGoalCol - this.jumpStartCol);
            if (goalDir !== 0) {
              const biasAmount = Math.min(maxH, Math.ceil(vertDist * 1.5));
              const biased = this.clampToTextEdges(this.targetLine, this.jumpStartCol + goalDir * biasAmount);
              if (Math.abs(biased - this.jumpStartCol) <= maxH) {
                fallTarget = biased;
              }
            }
          }
          // Enforce per-line horizontal cap
          if (Math.abs(fallTarget - this.jumpStartCol) > maxH) {
            fallTarget = this.jumpStartCol + (fallTarget > this.jumpStartCol ? maxH : -maxH);
          }
          this.targetCol = fallTarget;
          if (Math.abs(this.targetCol - this.jumpStartCol) > 1) {
            this.state.direction = this.targetCol > this.jumpStartCol ? 'right' : 'left';
          }
        } else {
          this.state.direction = dx > 0 ? 'right' : 'left';
          this.state.col += (dx > 0 ? 1 : -1) * runSpeed;
        }
        this.state.frame = (this.state.frame + 1) % 5;
        break;
      }

      case 'jump': {
        const totalDy = this.jumpStartLine - this.targetLine;
        const hDist = Math.abs(this.targetCol - this.jumpStartCol);

        // Adaptive speed: slow vertical if horizontal distance is large
        // This caps horizontal speed to ~2× runSpeed
        const maxHSpeed = runSpeed * 2;
        const MAX_TICKS = 30; // cap at ~2.4 seconds
        const minVTicks = totalDy / jumpSpeed;
        const minHTicks = hDist > 0 ? hDist / maxHSpeed : 0;
        const jumpTicks = Math.min(MAX_TICKS, Math.max(minVTicks, minHTicks));
        const effectiveSpeed = totalDy / Math.max(1, jumpTicks);

        const currentDy = this.state.line - this.targetLine;
        if (currentDy > effectiveSpeed) {
          this.state.line -= effectiveSpeed;
          // Linear interpolation: col moves proportionally to vertical progress
          if (totalDy > 0) {
            const progress = 1 - ((this.state.line - this.targetLine) / totalDy);
            this.state.col = this.jumpStartCol + (this.targetCol - this.jumpStartCol) * progress;
          }
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
        const totalDy = this.targetLine - this.jumpStartLine;
        const hDist = Math.abs(this.targetCol - this.jumpStartCol);

        // Adaptive speed: slow vertical if horizontal distance is large
        const maxHSpeed = runSpeed * 2;
        const MAX_TICKS = 30;
        const minVTicks = totalDy / fallSpeed;
        const minHTicks = hDist > 0 ? hDist / maxHSpeed : 0;
        const fallTicks = Math.min(MAX_TICKS, Math.max(minVTicks, minHTicks));
        const effectiveSpeed = totalDy / Math.max(1, fallTicks);

        const currentDy = this.targetLine - this.state.line;
        if (currentDy > effectiveSpeed) {
          this.state.line += effectiveSpeed;
          // Linear interpolation: col moves proportionally to vertical progress
          if (totalDy > 0) {
            const progress = 1 - ((this.targetLine - this.state.line) / totalDy);
            this.state.col = this.jumpStartCol + (this.targetCol - this.jumpStartCol) * progress;
          }
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

  spawn(nearLine: number): void {
    // Find the nearest non-empty line to spawn on
    for (let d = 0; d < this.lines.length; d++) {
      for (const candidate of [nearLine + d, nearLine - d]) {
        if (candidate >= 0 && candidate < this.lines.length && !this.isEmptyLine(candidate)) {
          const edges = this.textEdges(candidate);
          if (edges) {
            this.state.line = candidate;
            this.state.col = edges.left;
            this.setState('idle');
            // Fish spawns on the very first tick for an immediate intro
            this.fishSpawnTimer = this.config.fishSpawnInterval - 1;
            this.fish.active = false;
            this.pathFailCount = 0;
            return;
          }
        }
      }
    }
    // No valid line found — stay at 0,0 in idle
    this.state.line = 0;
    this.state.col = 0;
    this.setState('idle');
    this.fishSpawnTimer = this.config.fishSpawnInterval - 1;
    this.fish.active = false;
  }
}
