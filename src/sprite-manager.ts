import * as fs from 'fs';
import * as path from 'path';
import { CatAction, Direction } from './types';

interface SpriteEntry {
  frames: string[];  // raw SVG strings per frame
}

export class SpriteManager {
  private rawSprites: Map<string, SpriteEntry> = new Map();
  private cachedColor = '';
  private coloredCache: Map<string, string[]> = new Map();

  constructor(private spritesDir: string) {}

  async load(): Promise<void> {
    const entries: Array<{ action: string; files: string[] }> = [
      { action: 'run_right', files: [0,1,2,3,4].map(i => `cat_${i}_right.svg`) },
      { action: 'run_left', files: [0,1,2,3,4].map(i => `cat_${i}_left.svg`) },
      { action: 'sleep_right', files: ['cat_sleep.svg'] },
      { action: 'sleep_left', files: ['cat_sleep_left.svg'] },
      { action: 'jump_right', files: ['cat_jump_right.svg'] },
      { action: 'jump_left', files: ['cat_jump_left.svg'] },
      { action: 'fall_right', files: ['cat_fall_right.svg'] },
      { action: 'fall_left', files: ['cat_fall_left.svg'] },
      { action: 'crouch_right', files: ['cat_crouch_right.svg'] },
      { action: 'crouch_left', files: ['cat_crouch_left.svg'] },
      { action: 'eat_right', files: ['cat_eat_0_right.svg', 'cat_eat_1_right.svg'] },
      { action: 'eat_left', files: ['cat_eat_0_left.svg', 'cat_eat_1_left.svg'] },
      { action: 'surprise_right', files: ['cat_surprise_right.svg'] },
      { action: 'surprise_left', files: ['cat_surprise_left.svg'] },
      { action: 'fish', files: ['fish.svg'] },
      { action: 'paw', files: ['paw.svg'] },
    ];

    for (const entry of entries) {
      const frames: string[] = [];
      for (const filename of entry.files) {
        const filepath = path.join(this.spritesDir, filename);
        const svg = fs.readFileSync(filepath, 'utf-8');
        frames.push(svg);
      }
      this.rawSprites.set(entry.action, { frames });
    }
  }

  /** Apply color to SVG by replacing fill="white" with the target color */
  setColor(hexColor: string): void {
    if (hexColor === this.cachedColor) { return; }
    this.cachedColor = hexColor;
    this.coloredCache.clear();

    for (const [key, entry] of this.rawSprites) {
      const colored = entry.frames.map(svg => {
        // Replace fill="white" with the user's color (skip fish which is gold)
        if (key === 'fish') { return this.toDataUri(svg); }
        const recolored = svg.replace(/fill="white"/g, `fill="${hexColor}"`);
        return this.toDataUri(recolored);
      });
      this.coloredCache.set(key, colored);
    }
  }

  getFrame(action: CatAction, direction: Direction, frame: number): string {
    const mapped = this.mapAction(action);
    const key = `${mapped}_${direction}`;
    const frames = this.coloredCache.get(key);
    if (!frames) {
      return this.coloredCache.get('sleep_right')![0];
    }
    return frames[frame % frames.length];
  }

  getSpecial(name: 'fish' | 'paw'): string {
    return this.coloredCache.get(name)![0];
  }

  getFrameCount(action: CatAction): number {
    const mapped = this.mapAction(action);
    const entry = this.rawSprites.get(`${mapped}_right`);
    return entry ? entry.frames.length : 1;
  }

  private toDataUri(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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
      case 'land':
        return 'crouch';
      case 'post_eat':
        return 'eat';
      default:
        return action;
    }
  }
}
