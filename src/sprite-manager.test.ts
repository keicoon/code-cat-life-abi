import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { SpriteManager } from './sprite-manager';

const SPRITES_DIR = path.resolve(__dirname, '..', 'sprites');

test('loads all SVG sprites and recolors cat sprites while preserving fish gold', async () => {
  const sprites = new SpriteManager(SPRITES_DIR);
  await sprites.load();

  sprites.setColor('#ff9900');

  const runUri = sprites.getFrame('run', 'right', 0);
  assert.ok(runUri.startsWith('data:image/svg+xml;base64,'));
  const runSvg = Buffer.from(runUri.split(',')[1], 'base64').toString('utf-8');
  assert.ok(runSvg.includes('fill="#ff9900"'));

  const landUri = sprites.getFrame('land', 'left', 0);
  assert.ok(landUri.startsWith('data:image/svg+xml;base64,'));

  const fishUri = sprites.getSpecial('fish');
  const fishSvg = Buffer.from(fishUri.split(',')[1], 'base64').toString('utf-8');
  assert.equal(fishSvg.includes('fill="#ff9900"'), false);

  const pawUri = sprites.getSpecial('paw');
  assert.ok(pawUri.startsWith('data:image/svg+xml;base64,'));
});
