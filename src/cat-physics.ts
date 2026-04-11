import {
  CatState,
  CatAction,
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
  landingCol: number;
  action: 'jump' | 'fall' | null;
}

interface Neighbor {
  line: number;
  cost: number;
  viaCol: number;
  landingCol: number;
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
  private plannedLandingCol = -1;
  private targetLine = -1;

  private pathFailCount = 0;
  private jumpStartCol = 0;
  private jumpStartLine = 0;
  private eatPhase = 0; // 0=first eat (fish visible), 1=second eat (fish gone)
  private fishConsecutiveCount = 0;

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

  private static readonly MAX_H_CAP = 2;

  private getStrideCap(fromLine: number, toLine: number): number {
    return CatPhysics.MAX_H_CAP * Math.max(1, Math.abs(toLine - fromLine));
  }

  private getStrideLandingCols(fromLine: number, targetLine: number, transitCol: number): number[] {
    const targetEdges = this.textEdges(targetLine);
    if (!targetEdges) { return []; }

    const stride = this.getStrideCap(fromLine, targetLine);
    const landings: number[] = [];
    for (const landing of [
      transitCol,
      transitCol - stride,
      transitCol + stride,
    ]) {
      if (landing >= targetEdges.left && landing <= targetEdges.right && !landings.includes(landing)) {
        landings.push(landing);
      }
    }
    return landings;
  }

  private getPreferredStrideMoves(
    fromLine: number,
    targetLine: number,
    transitCol: number,
    goalCol?: number,
    preferDiagonal = false,
  ): number[] {
    const stride = this.getStrideCap(fromLine, targetLine);

    if (goalCol === undefined) {
      return [0, stride, -stride];
    }

    const goalDir = Math.sign(goalCol - transitCol);
    if (!goalDir) {
      const landingCols = this.getStrideLandingCols(fromLine, targetLine, transitCol);
      const facingMove = this.state.direction === 'left'
        ? -stride
        : stride;
      const neutralMoves = [facingMove, -facingMove]
        .filter((move, idx, moves) =>
          landingCols.includes(transitCol + move) && moves.indexOf(move) === idx,
        );
      return preferDiagonal ? [...neutralMoves, 0] : [0, ...neutralMoves];
    }

    return [goalDir * stride, 0];
  }

  private estimateLandingCol(
    fromLine: number,
    targetLine: number,
    transitCol: number,
    goalCol?: number,
    preferDiagonal = false,
  ): number {
    const landingCols = this.getStrideLandingCols(fromLine, targetLine, transitCol);
    if (landingCols.length === 0) { return -1; }

    for (const move of this.getPreferredStrideMoves(
      fromLine,
      targetLine,
      transitCol,
      goalCol,
      preferDiagonal,
    )) {
      const landing = transitCol + move;
      if (landingCols.includes(landing)) { return landing; }
    }
    return -1;
  }

  /** Find the natural transit/landing pair closest to the current flow of movement. */
  private findBestVerticalStep(
    fromLine: number,
    toLine: number,
    preferCol: number,
    goalCol?: number,
    preferDiagonal = false,
  ): { col: number; landingCol: number } | null {
    const fromEdges = this.textEdges(fromLine);
    if (!fromEdges) { return null; }

    let bestCol = -1;
    let bestLandingCol = -1;
    let bestScore = Infinity;
    for (let c = fromEdges.left; c <= fromEdges.right; c++) {
      if (!this.isVerticalPathClear(fromLine, toLine, c)) { continue; }
      const landing = this.estimateLandingCol(fromLine, toLine, c, goalCol, preferDiagonal);
      if (landing < 0) { continue; }
      const goalPenalty = goalCol === undefined ? 0 : Math.abs(landing - goalCol);
      const zeroPenalty = goalCol !== undefined && preferDiagonal && landing === c ? 3 : 0;
      const score = Math.abs(c - preferCol) * 3 + goalPenalty + zeroPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestCol = c;
        bestLandingCol = landing;
      } else if (score === bestScore && bestCol >= 0) {
        const currentDelta = Math.abs(c - preferCol);
        const bestDelta = Math.abs(bestCol - preferCol);
        if (currentDelta < bestDelta) {
          bestCol = c;
          bestLandingCol = landing;
        }
      }
    }
    if (bestCol < 0 || bestLandingCol < 0) { return null; }
    return { col: bestCol, landingCol: bestLandingCol };
  }

  /** Minimum horizontal distance between text ranges on two lines (0 if overlapping) */
  private minTextGap(lineA: number, lineB: number): number {
    const a = this.textEdges(lineA);
    const b = this.textEdges(lineB);
    if (!a || !b) { return Infinity; }
    if (a.right < b.left) { return b.left - a.right; }
    if (b.right < a.left) { return a.left - b.right; }
    return 0;
  }

  private getLineNeighbors(line: number, goalLine: number, goalCol?: number): Neighbor[] {
    const neighbors: Neighbor[] = [];

    for (const action of ['jump', 'fall'] as const) {
      const direction = action === 'jump' ? -1 : 1;
      for (let dist = 1; dist <= this.config.maxJumpLines; dist++) {
        const target = line + direction * dist;
        if (target < 0 || target >= this.lines.length || this.isEmptyLine(target)) { continue; }
        if (this.minTextGap(line, target) > this.getStrideCap(line, target)) { continue; }
        const preferDiagonal = goalCol !== undefined && Math.abs(goalLine - target) > 0;
        const sourceEdges = this.textEdges(line);
        const preferredSourceCol = sourceEdges ? this.clampToTextEdges(line, goalCol ?? sourceEdges.left) : 0;
        const choice = this.findBestVerticalStep(line, target, preferredSourceCol, goalCol, preferDiagonal);
        if (choice) {
          const cost = dist * dist + 1;
          neighbors.push({
            line: target,
            cost,
            viaCol: choice.col,
            landingCol: choice.landingCol,
            action,
          });
        }
      }
    }

    return neighbors;
  }

  private findPath(
    fromLine: number,
    toLine: number,
    goalCol?: number,
  ): Array<{ line: number; viaCol: number; landingCol: number; action: 'jump' | 'fall' }> | null {
    if (fromLine === toLine) { return []; }
    if (this.isEmptyLine(fromLine) || this.isEmptyLine(toLine)) { return null; }

    const open: AStarNode[] = [{
      line: fromLine,
      g: 0,
      f: Math.abs(fromLine - toLine),
      parent: null,
      viaCol: -1,
      landingCol: -1,
      action: null,
    }];
    const closed: Record<number, boolean> = {};

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) { bestIdx = i; }
      }
      const cur = open.splice(bestIdx, 1)[0];

      if (cur.line === toLine) {
        const path: Array<{ line: number; viaCol: number; landingCol: number; action: 'jump' | 'fall' }> = [];
        let n: AStarNode | null = cur;
        while (n?.parent !== null) {
          if (n) {
            path.unshift({
              line: n.line,
              viaCol: n.viaCol,
              landingCol: n.landingCol >= 0 ? n.landingCol : n.viaCol,
              action: n.action!,
            });
          }
          n = n?.parent ?? null;
        }
        return path;
      }

      if (closed[cur.line]) { continue; }
      closed[cur.line] = true;

      for (const nb of this.getLineNeighbors(cur.line, toLine, goalCol)) {
        if (closed[nb.line]) { continue; }
        const g = cur.g + nb.cost;
        const h = Math.abs(nb.line - toLine);
        open.push({
          line: nb.line,
          g,
          f: g + h,
          parent: cur,
          viaCol: nb.viaCol,
          landingCol: nb.landingCol,
          action: nb.action,
        });
      }
    }
    return null;
  }

  // ---- Route execution ----

  /** Post-process A* path: keep each vertical step anchored to the current flow of movement. */
  private optimizeRouteColumns(
    path: Array<{ line: number; viaCol: number; landingCol: number; action: 'jump' | 'fall' }>,
    startCol: number,
    startLine: number,
  ): RouteStep[] {
    let prevCol = startCol;
    let prevLine = startLine;

    return path.map((step, idx) => {
      const preferDiagonal = idx < path.length - 1;
      const choice = this.findBestVerticalStep(prevLine, step.line, prevCol, this.routeGoalCol, preferDiagonal);
      const col = choice?.col ?? step.viaCol;
      let landingCol = choice?.landingCol ?? this.estimateLandingCol(
        prevLine,
        step.line,
        col,
        this.routeGoalCol,
        preferDiagonal,
      );
      if (landingCol < 0) { landingCol = step.landingCol; }
      prevCol = landingCol >= 0 ? landingCol : this.clampToTextEdges(step.line, col);
      prevLine = step.line;
      return { line: step.line, col, landingCol: prevCol, action: step.action };
    });
  }

  private startVerticalMove(action: 'jump' | 'fall'): void {
    this.jumpStartCol = this.state.col;
    this.jumpStartLine = this.state.line;
    this.setState(action);
    const landing = this.plannedLandingCol >= 0
      ? this.plannedLandingCol
      : this.estimateLandingCol(this.jumpStartLine, this.targetLine, this.jumpStartCol, this.routeGoalCol);
    this.targetCol = landing >= 0 ? landing : this.clampToTextEdges(this.targetLine, this.jumpStartCol);
    this.plannedLandingCol = this.targetCol;
    if (Math.abs(this.targetCol - this.jumpStartCol) > 1) {
      this.state.direction = this.targetCol > this.jumpStartCol ? 'right' : 'left';
    }
  }

  private tickRunThenVertical(action: 'jump' | 'fall', runSpeed: number): void {
    const dx = this.targetCol - this.state.col;
    if (Math.abs(dx) < runSpeed) {
      this.state.col = this.targetCol;
      this.startVerticalMove(action);
    } else {
      this.state.direction = dx > 0 ? 'right' : 'left';
      this.state.col += (dx > 0 ? 1 : -1) * runSpeed;
    }
    this.state.frame = (this.state.frame + 1) % 5;
  }

  private tickVerticalMove(action: 'jump' | 'fall', verticalSpeed: number, runSpeed: number): void {
    const totalDy = Math.abs(this.targetLine - this.jumpStartLine);
    const hDist = Math.abs(this.targetCol - this.jumpStartCol);

    // Adaptive speed: slow vertical if horizontal distance is large
    // This caps horizontal speed to ~2× runSpeed
    const maxHSpeed = runSpeed * 2;
    const maxTicks = 30;
    const minVTicks = totalDy / verticalSpeed;
    const minHTicks = hDist > 0 ? hDist / maxHSpeed : 0;
    const travelTicks = Math.min(maxTicks, Math.max(minVTicks, minHTicks));
    const effectiveSpeed = totalDy / Math.max(1, travelTicks);
    const remainingDy = action === 'jump'
      ? this.state.line - this.targetLine
      : this.targetLine - this.state.line;

    if (remainingDy > effectiveSpeed) {
      this.state.line += action === 'jump' ? -effectiveSpeed : effectiveSpeed;
      if (totalDy > 0) {
        const verticalRemaining = action === 'jump'
          ? this.state.line - this.targetLine
          : this.targetLine - this.state.line;
        const progress = 1 - (verticalRemaining / totalDy);
        this.state.col = this.jumpStartCol + (this.targetCol - this.jumpStartCol) * progress;
      }
      return;
    }

    this.state.line = this.targetLine;
    this.state.col = this.targetCol;
    this.targetLine = -1;
    this.checkFishEat();
    if (this.state.action === action) { this.executeNextRouteStep(); }
  }

  private executeNextRouteStep(): void {
    if (!this.route || this.routeIdx >= this.route.length) {
      this.route = null;
      this.setState('run');
      this.targetCol = this.clampToTextEdges(Math.round(this.state.line), this.routeGoalCol);
      this.plannedLandingCol = this.targetCol;
      this.targetLine = -1;
      return;
    }

    const step = this.route[this.routeIdx];
    this.routeIdx++;
    this.setState(step.action === 'jump' ? 'run_then_jump' : 'run_then_fall');
    this.targetCol = step.col;
    this.plannedLandingCol = step.landingCol;
    this.targetLine = step.line;
  }

  private planRoute(goalLine: number, goalCol: number): boolean {
    const currentLine = Math.round(this.state.line);
    this.routeGoalCol = goalCol;

    if (currentLine === goalLine) {
      this.route = null;
      this.setState('run');
      this.targetCol = goalCol;
      this.plannedLandingCol = goalCol;
      this.targetLine = -1;
      return true;
    }

    const path = this.findPath(currentLine, goalLine, goalCol);
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

  private scheduleNextFish(delayTicks: number): void {
    this.fishSpawnTimer = this.config.quickFishDelay - Math.max(1, delayTicks);
  }

  private enterPostEatDelay(delayTicks: number): void {
    this.setState('post_eat');
    this.state.frame = 1;
    this.scheduleNextFish(delayTicks);
  }

  private enterSleepDelay(delayTicks: number): void {
    this.setState('sleep');
    this.scheduleNextFish(delayTicks);
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
        this.fishConsecutiveCount = 0;
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
    this.state.ticksInState++;

    // Fish spawn timer (paused during eat animation)
    if (!this.fish.active && this.state.action !== 'eat') {
      this.fishSpawnTimer++;
      if (this.fishSpawnTimer >= this.config.quickFishDelay) {
        this.spawnFish();
        this.fishSpawnTimer = 0;
        if (
          (this.state.action === 'idle' || this.state.action === 'post_eat' || this.state.action === 'sleep') &&
          this.fish.active
        ) {
          // Face toward the fish
          if (this.fish.col > this.state.col) { this.state.direction = 'right'; }
          else if (this.fish.col < this.state.col) { this.state.direction = 'left'; }
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
        this.fishConsecutiveCount = 0;
        this.setState('idle');
      }
    }

    const { runSpeed, jumpSpeed, fallSpeed } = this.config;

    switch (this.state.action) {
      case 'idle':
      case 'sleep':
        if (this.fish.active && this.state.ticksInState > 10) {
          if (this.fish.col > this.state.col) { this.state.direction = 'right'; }
          else if (this.fish.col < this.state.col) { this.state.direction = 'left'; }
          this.setState('surprise');
        }
        break;

      case 'post_eat':
        this.state.frame = 1;
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
            // Phase 1 done — check consecutive fish session
            this.fishConsecutiveCount++;
            if (this.fishConsecutiveCount >= this.config.fishSessionCount) {
              // Session over: sleep through the configured rest delay
              this.enterSleepDelay(this.config.sleepDelay);
              this.fishConsecutiveCount = 0;
            } else {
              // Quick respawn: keep the last eat pose while waiting for the next fish
              this.enterPostEatDelay(this.config.quickFishDelay);
            }
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
        this.tickRunThenVertical('jump', runSpeed);
        break;
      }

      case 'run_then_fall': {
        this.tickRunThenVertical('fall', runSpeed);
        break;
      }

      case 'jump': {
        this.tickVerticalMove('jump', jumpSpeed, runSpeed);
        break;
      }

      case 'fall': {
        this.tickVerticalMove('fall', fallSpeed, runSpeed);
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
    this.state.line = Math.round(this.state.line);
    this.fish.active = false;
    this.fishSpawnTimer = 0;
    this.route = null;
    this.plannedLandingCol = -1;
    this.fishConsecutiveCount = 0;
    this.targetLine = -1;
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
            this.fishSpawnTimer = this.config.quickFishDelay - 1;
            this.fish.active = false;
            this.pathFailCount = 0;
            this.plannedLandingCol = -1;
            this.fishConsecutiveCount = 0;
            return;
          }
        }
      }
    }
    // No valid line found — stay at 0,0 in idle
    this.state.line = 0;
    this.state.col = 0;
    this.setState('idle');
    this.fishSpawnTimer = this.config.quickFishDelay - 1;
    this.fish.active = false;
    this.plannedLandingCol = -1;
  }
}
