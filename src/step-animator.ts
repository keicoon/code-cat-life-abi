import { CatAction, Direction, EngineConfig, MoveStep, VerticalStep, WalkStep } from './types';

export interface AnimatorSnapshot {
  readonly line: number;
  readonly col: number;
  readonly action: CatAction;
  readonly direction: Direction;
  readonly frame: number;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly targetLine: number;
  readonly targetCol: number;
  readonly finished: boolean;
}

const MAX_VERTICAL_TICKS = 30;
const RUN_FRAME_COUNT = 5;

/**
 * Executes a sequence of MoveSteps smoothly tick-by-tick,
 * interpolating walk/jump/fall positions and inserting brief landing pauses.
 */
export class StepAnimator {
  private steps: readonly MoveStep[] = [];
  private stepIdx = 0;
  private line = 0;
  private col = 0;
  private direction: Direction = 'right';
  private frame = 0;
  private landingTicks = 0;
  private verticalStartLine = 0;
  private verticalStartCol = 0;
  private verticalActive = false;

  constructor(private config: EngineConfig) {}

  start(steps: readonly MoveStep[], startLine: number, startCol: number, direction: Direction): void {
    this.steps = steps;
    this.stepIdx = 0;
    this.line = startLine;
    this.col = startCol;
    this.direction = direction;
    this.frame = 0;
    this.landingTicks = 0;
    this.verticalActive = false;
  }

  clear(): void {
    this.steps = [];
    this.stepIdx = 0;
    this.landingTicks = 0;
    this.verticalActive = false;
  }

  isFinished(): boolean {
    return this.landingTicks === 0 && this.stepIdx >= this.steps.length;
  }

  getProgress(): { stepIndex: number; stepCount: number; targetLine: number; targetCol: number } {
    const current = this.steps[this.stepIdx];
    return {
      stepIndex: this.stepIdx,
      stepCount: this.steps.length,
      targetLine: current ? current.toLine : Math.round(this.line),
      targetCol: current ? current.toCol : this.col,
    };
  }

  tick(): AnimatorSnapshot {
    if (this.landingTicks > 0) {
      this.landingTicks--;
      if (this.landingTicks > 0 || this.stepIdx >= this.steps.length) {
        return this.snapshot('land');
      }
    }

    if (this.stepIdx >= this.steps.length) {
      return this.snapshot('idle');
    }

    const step = this.steps[this.stepIdx];
    if (step.type === 'walk') {
      return this.tickWalk(step);
    }
    return this.tickVertical(step);
  }

  private tickWalk(step: WalkStep): AnimatorSnapshot {
    const dx = step.toCol - this.col;
    const speed = this.config.runSpeed;

    if (dx !== 0) {
      this.direction = dx > 0 ? 'right' : 'left';
    }

    if (Math.abs(dx) <= speed + 1e-6) {
      this.col = step.toCol;
      this.line = step.toLine;
      this.stepIdx++;
    } else {
      this.col += (dx > 0 ? 1 : -1) * speed;
    }

    this.frame = (this.frame + 1) % RUN_FRAME_COUNT;
    return this.snapshot('run');
  }

  private tickVertical(step: VerticalStep): AnimatorSnapshot {
    if (!this.verticalActive) {
      this.verticalActive = true;
      this.verticalStartLine = this.line;
      this.verticalStartCol = this.col;
      this.frame = 0;
      if (Math.abs(step.toCol - this.verticalStartCol) > 0.5) {
        this.direction = step.toCol > this.verticalStartCol ? 'right' : 'left';
      }
    }

    const totalDy = Math.abs(step.toLine - this.verticalStartLine);
    const hDist = Math.abs(step.toCol - this.verticalStartCol);
    const verticalSpeed = step.type === 'jump' ? this.config.jumpSpeed : this.config.fallSpeed;
    const maxHSpeed = this.config.runSpeed * 2;

    const minVTicks = totalDy / verticalSpeed;
    const minHTicks = hDist > 0 ? hDist / maxHSpeed : 0;
    const travelTicks = Math.min(MAX_VERTICAL_TICKS, Math.max(minVTicks, minHTicks));
    const effectiveSpeed = totalDy / Math.max(1, travelTicks);

    const remainingDy = step.type === 'jump'
      ? this.line - step.toLine
      : step.toLine - this.line;

    if (remainingDy > effectiveSpeed) {
      this.line += step.type === 'jump' ? -effectiveSpeed : effectiveSpeed;
      if (totalDy > 0) {
        const verticalRemaining = step.type === 'jump'
          ? this.line - step.toLine
          : step.toLine - this.line;
        const progress = 1 - verticalRemaining / totalDy;
        this.col = this.verticalStartCol + (step.toCol - this.verticalStartCol) * progress;
      }
      return this.snapshot(step.type);
    }

    // Reached target line
    this.line = step.toLine;
    this.col = step.toCol;
    this.verticalActive = false;
    this.stepIdx++;
    this.landingTicks = this.config.landingPauseDuration;
    this.frame = 0;
    return this.snapshot('land');
  }

  private snapshot(action: CatAction): AnimatorSnapshot {
    return {
      line: this.line,
      col: this.col,
      action,
      direction: this.direction,
      frame: this.frame,
      stepIndex: this.stepIdx,
      stepCount: this.steps.length,
      targetLine: this.steps[this.stepIdx]?.toLine ?? Math.round(this.line),
      targetCol: this.steps[this.stepIdx]?.toCol ?? this.col,
      finished: this.isFinished(),
    };
  }
}
