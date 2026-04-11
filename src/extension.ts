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
let log: vscode.OutputChannel;

function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('codeCat');
  const sleepTime = cfg.get<number>('sleepTime');
  return {
    enabled: cfg.get<boolean>('enabled', true),
    catColor: cfg.get<string>('catColor', '#ffffff'),
    idleTimeout: cfg.get<number>('idleTimeout', 2),
    sleepTime: sleepTime ?? cfg.get<number>('fishInterval', 8),
    fishSessionCount: cfg.get<number>('fishSessionCount', 5),
    animationSpeed: cfg.get<number>('animationSpeed', 1.0),
    showFootprints: cfg.get<boolean>('showFootprints', true),
  };
}

function applyConfig(): void {
  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);

  // Update physics config from user settings
  const tickMs = Math.round(DEFAULT_PHYSICS.tickMs / currentConfig.animationSpeed);
  const quickFishDelay = Math.max(
    1,
    Math.round((DEFAULT_PHYSICS.quickFishDelay * DEFAULT_PHYSICS.tickMs) / tickMs),
  );
  const sleepDelay = Math.max(quickFishDelay, Math.round((currentConfig.sleepTime * 1000) / tickMs));
  physics = new CatPhysics({
    ...DEFAULT_PHYSICS,
    tickMs,
    quickFishDelay,
    sleepDelay,
    fishSessionCount: currentConfig.fishSessionCount,
    runSpeed: DEFAULT_PHYSICS.runSpeed * currentConfig.animationSpeed,
    jumpSpeed: DEFAULT_PHYSICS.jumpSpeed * currentConfig.animationSpeed,
    fallSpeed: DEFAULT_PHYSICS.fallSpeed * currentConfig.animationSpeed,
  });
}

export async function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel('Code Cat');
  log.appendLine('Code Cat activating...');

  const spritesDir = path.join(context.extensionPath, 'sprites');
  sprites = new SpriteManager(spritesDir);
  try {
    await sprites.load();
    log.appendLine(`Sprites loaded from ${spritesDir}`);
  } catch (e: any) {
    log.appendLine(`ERROR loading sprites: ${e.message}`);
    vscode.window.showErrorMessage(`Code Cat: Failed to load sprites — ${e.message}`);
    return;
  }

  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);
  renderer = new DecorationRenderer(sprites);
  applyConfig();
  log.appendLine(`Config: ${JSON.stringify(currentConfig)}`);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand('codeCat.toggle', () => {
    const cfg = vscode.workspace.getConfiguration('codeCat');
    const next = !cfg.get<boolean>('enabled', true);
    cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
  });
  context.subscriptions.push(toggleCmd);

  // React to config changes — despawn first to avoid stale physics state
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('codeCat')) {
      despawnCat();
      applyConfig();
      if (currentConfig.enabled) { resetIdleTimer(); }
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

  // Listen for scroll — despawn cat + reset idle timer
  const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(() => {
    if (!currentConfig.enabled) { return; }
    despawnCat();
    resetIdleTimer();
  });
  context.subscriptions.push(scrollListener);

  // Start idle timer
  if (currentConfig.enabled) { resetIdleTimer(); }
}

function resetIdleTimer(): void {
  if (idleTimeout) { clearTimeout(idleTimeout); }
  idleTimeout = setTimeout(() => spawnCat(), currentConfig.idleTimeout * 1000);
}

function getVisibleRange(editor: vscode.TextEditor): { start: number; end: number } {
  const ranges = editor.visibleRanges;
  if (ranges.length === 0) { return { start: 0, end: editor.document.lineCount - 1 }; }
  return { start: ranges[0].start.line, end: ranges[ranges.length - 1].end.line };
}

function spawnCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !currentConfig.enabled) { return; }

  const text = editor.document.getText();
  const { start, end } = getVisibleRange(editor);
  physics.updateTerrain(text, start, end);

  // Spawn near cursor if visible, otherwise top-left of visible area
  const cursorLine = editor.selection.active.line;
  const spawnLine = (cursorLine >= start && cursorLine <= end) ? cursorLine : start;
  physics.spawn(spawnLine);

  catActive = true;
  lastFootprintCol = -999;

  const state = physics.getState();
  log.appendLine(`Cat spawned at line ${state.line}, col ${state.col} (cursor was at line ${cursorLine})`);

  // Start tick loop (speed-adjusted tick interval)
  const tickMs = Math.round(DEFAULT_PHYSICS.tickMs / currentConfig.animationSpeed);
  if (tickInterval) { clearInterval(tickInterval); }
  tickInterval = setInterval(() => tickCat(), tickMs);
}

function tickCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !catActive) { despawnCat(); return; }

  try {
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
  } catch (e: any) {
    log.appendLine(`ERROR in tick: ${e.message}\n${e.stack}`);
    despawnCat();
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
  log?.appendLine('Code Cat deactivated');
  log?.dispose();
}
