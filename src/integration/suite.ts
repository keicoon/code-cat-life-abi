import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as vscode from 'vscode';
import { DecorationRenderer } from '../decoration-renderer';
import { SpriteManager } from '../sprite-manager';
import { CatState, ExtensionConfig, FishState } from '../types';

export async function run(): Promise<void> {
  const results: string[] = [];

  // 1. Extension activation
  const ext = vscode.extensions.getExtension('keicoon15.code-cat-life-abi');
  assert.ok(ext, 'Extension keicoon15.code-cat-life-abi should be discovered');
  await ext.activate();
  assert.equal(ext.isActive, true, 'Extension should activate cleanly');
  results.push('✔ extension activates cleanly');

  // 2. Registered commands
  const commands = await vscode.commands.getCommands(true);
  for (const cmd of ['codeCatLifeAbi.toggle', 'codeCatLifeAbi.showLogs', 'codeCatLifeAbi.showStatus']) {
    assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
  }
  results.push('✔ all extension commands are registered');

  // 3. Editor decoration rendering in live TextEditor
  const doc = await vscode.workspace.openTextDocument({
    language: 'typescript',
    content: [
      'function hello(name: string): string {',
      '  return `Hello, ${name}`;',
      '}',
    ].join('\n'),
  });
  const editor = await vscode.window.showTextDocument(doc);

  const sprites = new SpriteManager(path.join(ext.extensionPath, 'sprites'));
  await sprites.load();
  sprites.setColor('#ffffff');

  const renderer = new DecorationRenderer(sprites);
  const sampleCat: CatState = {
    line: 1,
    col: 4,
    action: 'run',
    direction: 'right',
    frame: 0,
    ticksInState: 1,
  };
  const sampleFish: FishState = { line: 1, col: 18, active: true };
  const sampleConfig: ExtensionConfig = {
    enabled: true,
    catColor: '#ffffff',
    idleTimeout: 2,
    sleepTime: 8,
    fishSessionCount: 5,
    animationSpeed: 1,
    showFootprints: true,
    debugMovementLogs: false,
  };

  renderer.renderCat(editor, sampleCat, sampleConfig);
  renderer.renderFish(editor, sampleFish);
  renderer.addFootprint(editor, 1, 2);
  renderer.clearAll();
  results.push('✔ DecorationRenderer renders cat, fish, footprints and disposes cleanly');

  // 4. Toggle command updates configuration and restores original state
  const cfg = vscode.workspace.getConfiguration('codeCatLifeAbi');
  const originalEnabled = cfg.get<boolean>('enabled', true);
  await vscode.commands.executeCommand('codeCatLifeAbi.toggle');
  const toggled = vscode.workspace.getConfiguration('codeCatLifeAbi').get<boolean>('enabled');
  assert.equal(toggled, !originalEnabled, 'Toggle command should flip enabled setting');
  await vscode.commands.executeCommand('codeCatLifeAbi.toggle');
  const restored = vscode.workspace.getConfiguration('codeCatLifeAbi').get<boolean>('enabled');
  assert.equal(restored, originalEnabled, 'Second toggle should restore original enabled setting');
  results.push('✔ toggle command flips and restores enabled configuration');

  console.log('\n=== VS Code Integration Test Results ===');
  for (const line of results) {
    console.log(line);
  }
}
