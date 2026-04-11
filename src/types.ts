export type Direction = 'left' | 'right';

export type CatAction =
  | 'idle'
  | 'sleep'
  | 'run'
  | 'jump'
  | 'fall'
  | 'crouch'
  | 'eat'
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

export interface TerrainInfo {
  lines: string[];
  lineCount: number;
}

export interface TextEdge {
  left: number;
  right: number;
}

export interface RouteStep {
  line: number;
  col: number;
  action: 'run' | 'jump' | 'fall';
}

export interface PhysicsConfig {
  runSpeed: number;
  jumpSpeed: number;
  fallSpeed: number;
  maxJumpLines: number;
  tickMs: number;
  fishSpawnInterval: number;
  fishPostEatDelay: number;
  fishChaseTimeout: number;
  idleDuration: number;
}

export interface ExtensionConfig {
  enabled: boolean;
  catColor: string;
  idleTimeout: number;
  fishInterval: number;
  animationSpeed: number;
  showFootprints: boolean;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  runSpeed: 0.4,
  jumpSpeed: 0.3,
  fallSpeed: 0.5,
  maxJumpLines: 3,
  tickMs: 80,
  fishSpawnInterval: 80,
  fishPostEatDelay: 60,
  fishChaseTimeout: 500,
  idleDuration: 50,
};
