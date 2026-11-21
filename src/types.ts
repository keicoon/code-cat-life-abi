export type Direction = 'left' | 'right';

export type CatAction =
  | 'idle'
  | 'sleep'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'eat'
  | 'post_eat'
  | 'surprise';

export interface GridPoint {
  readonly line: number;
  readonly col: number;
}

export interface CatState {
  line: number;
  col: number;
  action: CatAction;
  direction: Direction;
  frame: number;
  ticksInState: number;
}

export interface FishState {
  readonly line: number;
  readonly col: number;
  readonly active: boolean;
}

export interface TextSpan {
  readonly left: number;
  readonly right: number;
}

export interface WalkStep {
  readonly type: 'walk';
  readonly fromLine: number;
  readonly fromCol: number;
  readonly toLine: number;
  toCol: number;
}

export interface VerticalStep {
  readonly type: 'jump' | 'fall';
  readonly fromLine: number;
  readonly fromCol: number;
  readonly toLine: number;
  readonly toCol: number;
}

export type MoveStep = WalkStep | VerticalStep;

export interface EngineConfig {
  readonly runSpeed: number;
  readonly jumpSpeed: number;
  readonly fallSpeed: number;
  readonly landingPauseDuration: number;
  readonly maxJumpLines: number;
  readonly tickMs: number;
  readonly quickFishDelay: number;
  readonly sleepDelay: number;
  readonly fishSessionCount: number;
  readonly fishChaseTimeout: number;
  readonly surpriseDuration: number;
  readonly eatDuration: number;
}

export interface ExtensionConfig {
  readonly enabled: boolean;
  readonly catColor: string;
  readonly idleTimeout: number;
  readonly sleepTime: number;
  readonly fishSessionCount: number;
  readonly animationSpeed: number;
  readonly showFootprints: boolean;
  readonly debugMovementLogs: boolean;
}

export interface EngineDebugSnapshot {
  readonly machineState: string;
  readonly targetLine: number;
  readonly targetCol: number;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly fishSpawnTimer: number;
  readonly fishChaseTicks: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  runSpeed: 0.4,
  jumpSpeed: 0.2,
  fallSpeed: 0.2,
  landingPauseDuration: 3,
  maxJumpLines: 3,
  tickMs: 80,
  quickFishDelay: 10,
  sleepDelay: 100,
  fishSessionCount: 5,
  fishChaseTimeout: 800,
  surpriseDuration: 15,
  eatDuration: 20,
};
