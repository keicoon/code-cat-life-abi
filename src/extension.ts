import * as vscode from 'vscode';
import * as path from 'path';
import { CatPhysics } from './cat-physics';
import { DecorationRenderer } from './decoration-renderer';
import { SpriteManager } from './sprite-manager';
import { DEFAULT_PHYSICS } from './types';

let physics: CatPhysics;
let renderer: DecorationRenderer;
let sprites: SpriteManager;
let tickInterval: NodeJS.Timeout | null = null;
let idleTimeout: NodeJS.Timeout | null = null;
let catActive = false;
let enabled = true;
let lastFootprintCol = -999;

export async function activate(context: vscode.ExtensionContext) {
  const spritesDir = path.join(context.extensionPath, 'sprites');
  sprites = new SpriteManager(spritesDir);
  await sprites.load();

  renderer = new DecorationRenderer(sprites);
  physics = new CatPhysics(DEFAULT_PHYSICS);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand('codeCat.toggle', () => {
    enabled = !enabled;
    if (!enabled) { despawnCat(); }
    vscode.window.showInformationMessage(`Code Cat: ${enabled ? 'Enabled' : 'Disabled'}`);
  });
  context.subscriptions.push(toggleCmd);

  // Listen for text changes (user is typing)
  const textChangeListener = vscode.workspace.onDidChangeTextDocument(() => {
    if (!enabled) { return; }
    despawnCat();
    resetIdleTimer();
  });
  context.subscriptions.push(textChangeListener);

  // Listen for selection changes (cursor movement)
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    if (!enabled) { return; }
    despawnCat();
    resetIdleTimer();
  });
  context.subscriptions.push(selectionListener);

  // Listen for active editor changes
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
    despawnCat();
    if (enabled) { resetIdleTimer(); }
  });
  context.subscriptions.push(editorChangeListener);

  // Start idle timer
  if (enabled) { resetIdleTimer(); }
}

function getIdleTimeoutMs(): number {
  const config = vscode.workspace.getConfiguration('codeCat');
  return (config.get<number>('idleTimeout') ?? 5) * 1000;
}

function resetIdleTimer(): void {
  if (idleTimeout) { clearTimeout(idleTimeout); }
  idleTimeout = setTimeout(() => spawnCat(), getIdleTimeoutMs());
}

function spawnCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !enabled) { return; }

  const text = editor.document.getText();
  if (text.trim().length === 0) { return; }

  physics.updateTerrain(text);

  // Spawn near cursor position
  const cursorLine = editor.selection.active.line;
  physics.spawn(cursorLine);

  catActive = true;
  lastFootprintCol = -999;

  // Start tick loop
  if (tickInterval) { clearInterval(tickInterval); }
  tickInterval = setInterval(() => tickCat(), DEFAULT_PHYSICS.tickMs);
}

function tickCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !catActive) { despawnCat(); return; }

  const state = physics.tick();
  const fish = physics.getFish();

  // Render cat
  renderer.renderCat(editor, state);

  // Render fish
  renderer.renderFish(editor, fish);

  // Footprints while running
  if (state.action === 'run' || state.action === 'run_then_jump' || state.action === 'run_then_fall') {
    const col = Math.round(state.col);
    if (Math.abs(col - lastFootprintCol) >= 4) {
      renderer.addFootprint(editor, Math.round(state.line), col);
      lastFootprintCol = col;
    }
  }
}

function despawnCat(): void {
  catActive = false;
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  renderer?.clearAll();
  physics?.reset();
}

export function deactivate() {
  despawnCat();
  if (idleTimeout) { clearTimeout(idleTimeout); }
}
