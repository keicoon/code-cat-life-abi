import { Pathfinder, ReachableTarget } from './pathfinder';
import { StepAnimator } from './step-animator';
import { TerrainGrid } from './terrain-grid';
import {
  CatState,
  DEFAULT_ENGINE_CONFIG,
  EngineConfig,
  EngineDebugSnapshot,
  FishState,
} from './types';

export interface EngineCallbacks {
  onStateChange(state: CatState): void;
  onFishSpawn(fish: FishState): void;
  onFishEaten(total: number): void;
}

type MachinePhase = 'idle' | 'surprise' | 'chase' | 'eat' | 'post_eat' | 'sleep';

/**
 * Coordinates the cat's high-level state machine and fish-chasing sessions,
 * delegating terrain indexing to TerrainGrid, routing to Pathfinder, and
 * tick-level movement/frame interpolation to StepAnimator.
 */
export class CatStateMachine {
  private readonly grid = new TerrainGrid();
  private readonly pathfinder: Pathfinder;
  private readonly animator: StepAnimator;

  private phase: MachinePhase = 'idle';
  private state: CatState = {
    line: 0,
    col: 0,
    action: 'idle',
    direction: 'right',
    frame: 0,
    ticksInState: 0,
  };

  private fish: FishState = { line: -1, col: -1, active: false };
  private fishEaten = 0;
  private fishConsecutiveCount = 0;
  private fishSpawnTimer = 0;
  private fishChaseTicks = 0;
  private eatPhase = 0; // 0 = fish visible, 1 = fish gone

  private cachedVersion = -1;
  private cachedStartKey = '';
  private cachedTargets: ReachableTarget[] | null = null;

  constructor(
    private readonly config: EngineConfig = DEFAULT_ENGINE_CONFIG,
    private readonly callbacks?: EngineCallbacks,
  ) {
    this.pathfinder = new Pathfinder(this.grid, this.config.maxJumpLines);
    this.animator = new StepAnimator(this.config);
  }

  updateTerrain(text: string, visibleStart?: number, visibleEnd?: number): void {
    this.grid.update(text, visibleStart, visibleEnd);
    this.invalidateReachabilityCache();
    this.validatePosition();
  }

  spawn(nearLine: number): void {
    const floorLine = this.grid.findNearestFloorLine(nearLine, true);
    const span = floorLine !== null ? this.grid.getFirstFloorSpan(floorLine) : null;
    if (floorLine !== null && span) {
      this.state.line = floorLine;
      this.state.col = span.left;
    } else {
      this.state.line = 0;
      this.state.col = 0;
    }

    this.enterPhase('idle');
    this.animator.clear();
    this.clearFishState();
    this.fishConsecutiveCount = 0;
    // Trigger first fish on the initial tick
    this.fishSpawnTimer = this.config.quickFishDelay - 1;
    this.invalidateReachabilityCache();
  }

  reset(): void {
    const roundedLine = Math.round(this.state.line);
    const span = this.grid.getFirstFloorSpan(roundedLine);
    if (span) {
      this.state.line = roundedLine;
      this.state.col = span.left;
    }
    this.enterPhase('idle');
    this.animator.clear();
    this.clearFishState();
    this.fishSpawnTimer = 0;
    this.fishConsecutiveCount = 0;
    this.invalidateReachabilityCache();
  }

  canSpawnFishFromCurrentPosition(): boolean {
    return this.getReachableTargets().length > 0;
  }

  tick(): CatState {
    this.state.ticksInState++;

    this.updateFishTimers();

    switch (this.phase) {
      case 'idle':
      case 'sleep':
        if (this.fish.active && this.state.ticksInState > 10) {
          this.enterSurprise();
        }
        break;

      case 'post_eat':
        this.state.frame = 1;
        break;

      case 'surprise':
        if (this.state.ticksInState >= this.config.surpriseDuration) {
          this.startChase();
        }
        break;

      case 'chase':
        this.tickChase();
        break;

      case 'eat':
        this.tickEat();
        break;
    }

    this.callbacks?.onStateChange({ ...this.state });
    return { ...this.state };
  }

  getState(): CatState {
    return { ...this.state };
  }

  getFish(): FishState {
    return { ...this.fish };
  }

  getFishEaten(): number {
    return this.fishEaten;
  }

  getDebugSnapshot(): EngineDebugSnapshot {
    const progress = this.animator.getProgress();
    return {
      machineState: this.phase,
      targetLine: progress.targetLine,
      targetCol: progress.targetCol,
      stepIndex: progress.stepIndex,
      stepCount: progress.stepCount,
      fishSpawnTimer: this.fishSpawnTimer,
      fishChaseTicks: this.fishChaseTicks,
    };
  }

  private updateFishTimers(): void {
    if (!this.fish.active && this.phase !== 'eat') {
      this.fishSpawnTimer++;
      if (this.fishSpawnTimer >= this.config.quickFishDelay) {
        this.fishSpawnTimer = 0;
        this.spawnFish();
        if (
          this.fish.active &&
          (this.phase === 'idle' || this.phase === 'post_eat' || this.phase === 'sleep')
        ) {
          this.enterSurprise();
        }
      }
      return;
    }

    if (this.fish.active && this.phase !== 'eat') {
      this.fishChaseTicks++;
      if (this.fishChaseTicks >= this.config.fishChaseTimeout) {
        this.animator.clear();
        this.clearFishState();
        this.fishSpawnTimer = 0;
        this.fishConsecutiveCount = 0;
        this.enterPhase('idle');
      }
    }
  }

  private startChase(): void {
    if (!this.fish.active) {
      this.enterPhase('idle');
      return;
    }

    const start = {
      line: Math.round(this.state.line),
      col: Math.round(this.state.col),
    };
    const goal = { line: this.fish.line, col: this.fish.col };
    const steps = this.pathfinder.findPath(start, goal);

    if (!steps) {
      this.animator.clear();
      this.clearFishState();
      this.fishSpawnTimer = 0;
      this.fishConsecutiveCount = 0;
      this.enterPhase('idle');
      return;
    }

    this.state.line = start.line;
    this.state.col = start.col;
    this.animator.start(steps, start.line, start.col, this.state.direction);
    this.enterPhase('chase');
    if (this.isNearFish()) {
      this.beginEating();
    }
  }

  private tickChase(): void {
    const snap = this.animator.tick();
    this.state.line = snap.line;
    this.state.col = snap.col;
    this.state.action = snap.action;
    this.state.direction = snap.direction;
    this.state.frame = snap.frame;

    if (this.isNearFish()) {
      this.beginEating();
      return;
    }

    if (snap.finished) {
      this.enterPhase('idle');
    }
  }

  private tickEat(): void {
    this.state.frame = Math.floor(this.state.ticksInState / 4) % 2;
    if (this.state.ticksInState < this.config.eatDuration) { return; }

    if (this.eatPhase === 0) {
      this.fish = { line: -1, col: -1, active: false };
      this.fishChaseTicks = 0;
      this.eatPhase = 1;
      this.enterPhase('eat');
      return;
    }

    this.fishConsecutiveCount++;
    if (this.fishConsecutiveCount >= this.config.fishSessionCount) {
      this.fishConsecutiveCount = 0;
      this.enterPhase('sleep');
      this.scheduleNextFish(this.config.sleepDelay);
    } else {
      this.enterPhase('post_eat');
      this.state.frame = 1;
      this.scheduleNextFish(this.config.quickFishDelay);
    }
  }

  private isNearFish(): boolean {
    if (!this.fish.active) { return false; }
    const dLine = Math.abs(this.state.line - this.fish.line);
    const dCol = Math.abs(this.state.col - this.fish.col);
    return dLine < 0.01 && dCol < 1.5;
  }

  private beginEating(): void {
    this.fishEaten++;
    this.animator.clear();
    this.eatPhase = 0;
    this.enterPhase('eat');
    this.callbacks?.onFishEaten(this.fishEaten);
  }

  private enterSurprise(): void {
    if (!this.fish.active) { return; }
    if (this.fish.col > this.state.col) { this.state.direction = 'right'; }
    else if (this.fish.col < this.state.col) { this.state.direction = 'left'; }
    this.enterPhase('surprise');
  }

  private enterPhase(phase: MachinePhase): void {
    this.phase = phase;
    this.state.action = phase === 'chase' ? 'run' : phase;
    this.state.ticksInState = 0;
    this.state.frame = 0;
  }

  private scheduleNextFish(delayTicks: number): void {
    this.fishSpawnTimer = this.config.quickFishDelay - Math.max(1, delayTicks);
  }

  private spawnFish(): void {
    const targets = this.getReachableTargets();
    if (targets.length === 0) { return; }

    const sorted = [...targets].sort((a, b) => b.dist - a.dist);
    const farHalf = Math.max(1, Math.floor(sorted.length * 0.5));
    const pick = sorted[Math.floor(Math.random() * farHalf)];
    this.fish = { line: pick.line, col: pick.col, active: true };
    this.fishChaseTicks = 0;
    this.callbacks?.onFishSpawn(this.fish);
  }

  private getReachableTargets(): ReachableTarget[] {
    const startLine = Math.round(this.state.line);
    const startCol = Math.round(this.state.col);
    const key = `${startLine}:${startCol}`;
    const version = this.grid.getVersion();

    if (this.cachedTargets && this.cachedVersion === version && this.cachedStartKey === key) {
      return this.cachedTargets;
    }

    const targets = this.pathfinder.findReachableTargets({ line: startLine, col: startCol }, 3);
    this.cachedVersion = version;
    this.cachedStartKey = key;
    this.cachedTargets = targets;
    return targets;
  }

  private invalidateReachabilityCache(): void {
    this.cachedTargets = null;
  }

  private clearFishState(): void {
    this.fish = { line: -1, col: -1, active: false };
    this.fishChaseTicks = 0;
    this.eatPhase = 0;
  }

  private validatePosition(): void {
    const line = Math.round(this.state.line);
    if (!this.grid.isFloorLine(line)) {
      const nearest = this.grid.findNearestFloorLine(line, false);
      const span = nearest !== null ? this.grid.getFirstFloorSpan(nearest) : null;
      if (nearest !== null && span) {
        this.state.line = nearest;
        this.state.col = span.left;
      }
    } else {
      this.state.col = this.grid.clampToFloor(line, this.state.col);
    }
  }
}
