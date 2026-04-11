import * as vscode from 'vscode';
import * as path from 'path';
import { CatPhysics } from './cat-physics';
import { DecorationRenderer } from './decoration-renderer';
import { SpriteManager } from './sprite-manager';
import { DEFAULT_PHYSICS, ExtensionConfig } from './types';

let physics: CatPhysics;
let renderer: DecorationRenderer;
let sprites: SpriteManager;
let tickInterval: NodeJS.Timeout | null = null;
let idleTimeout: NodeJS.Timeout | null = null;
let catActive = false;
let lastFootprintCol = -999;
let currentConfig: ExtensionConfig;

function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('codeCat');
  return {
    enabled: cfg.get<boolean>('enabled', true),
    catColor: cfg.get<string>('catColor', '#ffffff'),
    idleTimeout: cfg.get<number>('idleTimeout', 5),
    fishInterval: cfg.get<number>('fishInterval', 8),
    animationSpeed: cfg.get<number>('animationSpeed', 1.0),
    showFootprints: cfg.get<boolean>('showFootprints', true),
  };
}

function applyConfig(): void {
  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);

  // Update physics config from user settings
  const tickMs = Math.round(DEFAULT_PHYSICS.tickMs / currentConfig.animationSpeed);
  const fishTicks = Math.round((currentConfig.fishInterval * 1000) / tickMs);
  physics = new CatPhysics({
    ...DEFAULT_PHYSICS,
    tickMs,
    fishSpawnInterval: fishTicks,
    runSpeed: DEFAULT_PHYSICS.runSpeed * currentConfig.animationSpeed,
    jumpSpeed: DEFAULT_PHYSICS.jumpSpeed * currentConfig.animationSpeed,
    fallSpeed: DEFAULT_PHYSICS.fallSpeed * currentConfig.animationSpeed,
  });
}

export async function activate(context: vscode.ExtensionContext) {
  const spritesDir = path.join(context.extensionPath, 'sprites');
  sprites = new SpriteManager(spritesDir);
  await sprites.load();

  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);
  renderer = new DecorationRenderer(sprites);
  applyConfig();

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand('codeCat.toggle', () => {
    const cfg = vscode.workspace.getConfiguration('codeCat');
    const next = !cfg.get<boolean>('enabled', true);
    cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
  });
  context.subscriptions.push(toggleCmd);

  // React to config changes
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('codeCat')) {
      const wasEnabled = currentConfig.enabled;
      applyConfig();
      if (!currentConfig.enabled) { despawnCat(); }
      else if (!wasEnabled && currentConfig.enabled) { resetIdleTimer(); }
    }
  });
  context.subscriptions.push(configListener);

  // Listen for text changes (user is typing)
  const textChangeListener = vscode.workspace.onDidChangeTextDocument(() => {
    if (!currentConfig.enabled) { return; }
    despawnCat();
    resetIdleTimer();
  });
  context.subscriptions.push(textChangeListener);

  // Listen for selection changes (cursor movement)
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    if (!currentConfig.enabled) { return; }
    despawnCat();
    resetIdleTimer();
  });
  context.subscriptions.push(selectionListener);

  // Listen for active editor changes
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
    despawnCat();
    if (currentConfig.enabled) { resetIdleTimer(); }
  });
  context.subscriptions.push(editorChangeListener);

  // Start idle timer
  if (currentConfig.enabled) { resetIdleTimer(); }
}

function resetIdleTimer(): void {
  if (idleTimeout) { clearTimeout(idleTimeout); }
  idleTimeout = setTimeout(() => spawnCat(), currentConfig.idleTimeout * 1000);
}

function spawnCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !currentConfig.enabled) { return; }

  const text = editor.document.getText();
  if (text.trim().length === 0) { return; }

  physics.updateTerrain(text);

  // Spawn near cursor position
  const cursorLine = editor.selection.active.line;
  physics.spawn(cursorLine);

  catActive = true;
  lastFootprintCol = -999;

  // Start tick loop (speed-adjusted tick interval)
  const tickMs = Math.round(DEFAULT_PHYSICS.tickMs / currentConfig.animationSpeed);
  if (tickInterval) { clearInterval(tickInterval); }
  tickInterval = setInterval(() => tickCat(), tickMs);
}

function tickCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !catActive) { despawnCat(); return; }

  const state = physics.tick();
  const fish = physics.getFish();

  // Render cat with config
  renderer.renderCat(editor, state, currentConfig);

  // Render fish
  renderer.renderFish(editor, fish);

  // Footprints while running (if enabled)
  if (currentConfig.showFootprints) {
    if (state.action === 'run' || state.action === 'run_then_jump' || state.action === 'run_then_fall') {
      const col = Math.round(state.col);
      if (Math.abs(col - lastFootprintCol) >= 4) {
        renderer.addFootprint(editor, Math.round(state.line), col);
        lastFootprintCol = col;
      }
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
