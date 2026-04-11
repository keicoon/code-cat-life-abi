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
  | 'surprise'
  | 'run_then_jump'
  | 'run_then_fall';

export interface CatState {
  line: number;
  col: number;
  action: CatAction;
  direction: Direction;
  frame: number;
  ticksInState: number;
}

export interface FishState {
  line: number;
  col: number;
  active: boolean;
}

export interface TextEdge {
  left: number;
  right: number;
}

export interface RouteStep {
  line: number;
  col: number;
  landingCol: number;
  action: 'jump' | 'fall';
}

export interface PhysicsConfig {
  runSpeed: number;
  jumpSpeed: number;
  fallSpeed: number;
  landingPauseDuration: number;
  maxJumpLines: number;
  tickMs: number;
  quickFishDelay: number;
  sleepDelay: number;
  fishSessionCount: number;
  fishChaseTimeout: number;
  surpriseDuration: number;
  eatDuration: number;
}

export interface ExtensionConfig {
  enabled: boolean;
  catColor: string;
  idleTimeout: number;
  sleepTime: number;
  fishSessionCount: number;
  animationSpeed: number;
  showFootprints: boolean;
  debugMovementLogs: boolean;
}

export interface PhysicsDebugSnapshot {
  targetLine: number;
  targetCol: number;
  plannedLandingCol: number;
  jumpStartLine: number;
  jumpStartCol: number;
  routeIdx: number;
  routeLength: number;
  routeGoalCol: number;
  fishSpawnTimer: number;
  fishChaseTicks: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
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
