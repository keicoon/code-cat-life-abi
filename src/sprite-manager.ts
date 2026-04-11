import * as fs from 'fs';
import * as path from 'path';
import { CatAction, Direction } from './types';

interface SpriteEntry {
  frames: string[];  // data-uri strings per frame
}

export class SpriteManager {
  private sprites: Map<string, SpriteEntry> = new Map();

  constructor(private spritesDir: string) {}

  async load(): Promise<void> {
    const entries: Array<{ action: string; pattern: string; frameCount: number }> = [
      { action: 'run_right', pattern: 'cat_{i}_right.svg', frameCount: 5 },
      { action: 'run_left', pattern: 'cat_{i}_left.svg', frameCount: 5 },
      { action: 'sleep_right', pattern: 'cat_sleep.svg', frameCount: 1 },
      { action: 'sleep_left', pattern: 'cat_sleep_left.svg', frameCount: 1 },
      { action: 'jump_right', pattern: 'cat_jump_right.svg', frameCount: 1 },
      { action: 'jump_left', pattern: 'cat_jump_left.svg', frameCount: 1 },
      { action: 'fall_right', pattern: 'cat_fall_right.svg', frameCount: 1 },
      { action: 'fall_left', pattern: 'cat_fall_left.svg', frameCount: 1 },
      { action: 'crouch_right', pattern: 'cat_crouch_right.svg', frameCount: 1 },
      { action: 'crouch_left', pattern: 'cat_crouch_left.svg', frameCount: 1 },
      { action: 'eat_right', pattern: 'cat_eat_{i}_right.svg', frameCount: 2 },
      { action: 'eat_left', pattern: 'cat_eat_{i}_left.svg', frameCount: 2 },
      { action: 'surprise_right', pattern: 'cat_surprise_right.svg', frameCount: 1 },
      { action: 'surprise_left', pattern: 'cat_surprise_left.svg', frameCount: 1 },
      { action: 'fish', pattern: 'fish.svg', frameCount: 1 },
      { action: 'paw', pattern: 'paw.svg', frameCount: 1 },
    ];

    for (const entry of entries) {
      const frames: string[] = [];
      for (let i = 0; i < entry.frameCount; i++) {
        const filename = entry.pattern.replace('{i}', String(i));
        const filepath = path.join(this.spritesDir, filename);
        const svg = fs.readFileSync(filepath, 'utf-8');
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        frames.push(dataUri);
      }
      this.sprites.set(entry.action, { frames });
    }
  }

  getFrame(action: CatAction, direction: Direction, frame: number): string {
    const mapped = this.mapAction(action);
    const key = `${mapped}_${direction}`;
    const entry = this.sprites.get(key);
    if (!entry) {
      return this.sprites.get('sleep_right')!.frames[0];
    }
    return entry.frames[frame % entry.frames.length];
  }

  getSpecial(name: 'fish' | 'paw'): string {
    return this.sprites.get(name)!.frames[0];
  }

  getFrameCount(action: CatAction): number {
    const mapped = this.mapAction(action);
    const entry = this.sprites.get(`${mapped}_right`);
    return entry ? entry.frames.length : 1;
  }

  private mapAction(action: CatAction): string {
    switch (action) {
      case 'run_then_jump':
      case 'run_then_fall':
      case 'run':
        return 'run';
      case 'idle':
      case 'sleep':
        return 'sleep';
      default:
        return action;
    }
  }
}
