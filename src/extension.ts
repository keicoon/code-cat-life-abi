import * as vscode from 'vscode';
import * as path from 'path';
import { CatPhysics } from './cat-physics';
import { DecorationRenderer } from './decoration-renderer';
import { SpriteManager } from './sprite-manager';
import { CatState, DEFAULT_PHYSICS, ExtensionConfig, PhysicsDebugSnapshot } from './types';
import { formatVisibleRanges, selectActiveVisibleRange, VisibleLineRange } from './visible-range';

let physics: CatPhysics;
let renderer: DecorationRenderer;
let sprites: SpriteManager;
let tickInterval: NodeJS.Timeout | null = null;
let idleTimeout: NodeJS.Timeout | null = null;
let catActive = false;
let isRendering = false;
let lastFootprintCol = -999;
let currentConfig: ExtensionConfig;
let log: vscode.LogOutputChannel;
let statusBarItem: vscode.StatusBarItem | null = null;
let statusState = 'sleep';
let lastTickAt = 0;

function getTickMs(): number {
  return Math.round(DEFAULT_PHYSICS.tickMs / currentConfig.animationSpeed);
}

function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('codeCatLifeAbi');
  const sleepTime = cfg.get<number>('sleepTime');
  return {
    enabled: cfg.get<boolean>('enabled', true),
    catColor: cfg.get<string>('catColor', '#ffffff'),
    idleTimeout: cfg.get<number>('idleTimeout', 2),
    sleepTime: sleepTime ?? cfg.get<number>('fishInterval', 8),
    fishSessionCount: cfg.get<number>('fishSessionCount', 5),
    animationSpeed: cfg.get<number>('animationSpeed', 1.0),
    showFootprints: cfg.get<boolean>('showFootprints', true),
    debugMovementLogs: cfg.get<boolean>('debugMovementLogs', false),
  };
}

function applyConfig(): void {
  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);

  // Update physics config from user settings
  const tickMs = getTickMs();
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
  statusState = currentConfig.enabled ? 'sleep' : 'disabled';
  updateStatusBar();
  if (currentConfig.debugMovementLogs) {
    log.info('movement diagnostics enabled');
    showLogs(true);
  }
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'run_then_jump':
      return 'run then jump';
    case 'run_then_fall':
      return 'run then fall';
    case 'post_eat':
      return 'post-eat';
    case 'eat':
      return 'eating';
    case 'sleep':
      return 'sleeping';
    case 'land':
      return 'landing pause';
    case 'surprise':
      return 'surprised';
    default:
      return action;
  }
}

function debugEnabled(): boolean {
  return !!currentConfig?.debugMovementLogs;
}

function debugLog(message: string): void {
  if (!debugEnabled()) { return; }
  log.info(`[debug] ${message}`);
}

function showLogs(preserveFocus = true): void {
  log.show(preserveFocus);
}

function formatState(state: CatState): string {
  return `${state.action} line=${state.line.toFixed(2)} col=${state.col.toFixed(2)} dir=${state.direction} ticks=${state.ticksInState}`;
}

function formatSnapshot(snapshot: PhysicsDebugSnapshot | null): string {
  if (!snapshot) { return 'snapshot=n/a'; }
  return [
    `target=(${snapshot.targetLine},${snapshot.targetCol.toFixed(2)})`,
    `jumpStart=(${snapshot.jumpStartLine},${snapshot.jumpStartCol.toFixed(2)})`,
    `plannedLanding=${snapshot.plannedLandingCol.toFixed(2)}`,
    `route=${snapshot.routeIdx}/${snapshot.routeLength}`,
    `goalCol=${snapshot.routeGoalCol}`,
    `timers=spawn:${snapshot.fishSpawnTimer},chase:${snapshot.fishChaseTicks}`,
  ].join(' ');
}

function getPhysicsSnapshot(): PhysicsDebugSnapshot | null {
  try {
    return physics?.getDebugSnapshot() ?? null;
  } catch {
    return null;
  }
}

function describeRenderAnchor(editor: vscode.TextEditor, state: CatState): string {
  const editorCfg = vscode.workspace.getConfiguration('editor');
  const fontSize = editorCfg.get<number>('fontSize') ?? 14;
  const lineHeight = editorCfg.get<number>('lineHeight') ?? 0;
  const lineHeightPx = lineHeight > 0 ? lineHeight : Math.round(fontSize * 1.5);
  const charWidthPx = Math.round(fontSize * 0.6);
  const baseLine = Math.floor(state.line);
  const baseCol = Math.round(state.col);
  const lineLength = baseLine >= 0 && baseLine < editor.document.lineCount
    ? editor.document.lineAt(baseLine).text.length
    : 0;
  const safeCol = Math.min(baseCol, Math.max(0, lineLength));
  const colDrift = baseCol - safeCol;
  const fracLine = state.line - baseLine;
  const fracCol = state.col - baseCol;
  const offsetY = Math.round(fracLine * lineHeightPx);
  const offsetX = Math.round((fracCol + colDrift) * charWidthPx);
  return `anchor=(${baseLine},${safeCol}) rawBaseCol=${baseCol} offset=(${offsetX},${offsetY})`;
}

function maybeLogTickAnomaly(prev: CatState, state: CatState): void {
  if (!debugEnabled()) { return; }

  const runSpeed = DEFAULT_PHYSICS.runSpeed * currentConfig.animationSpeed;
  const jumpSpeed = DEFAULT_PHYSICS.jumpSpeed * currentConfig.animationSpeed;
  const fallSpeed = DEFAULT_PHYSICS.fallSpeed * currentConfig.animationSpeed;
  const deltaCol = Math.abs(state.col - prev.col);
  const deltaLine = Math.abs(state.line - prev.line);
  const inVertical = (
    prev.action === 'jump' ||
    prev.action === 'fall' ||
    state.action === 'jump' ||
    state.action === 'fall'
  );

  if (!inVertical) { return; }

  if (deltaCol > (runSpeed * 2.2) || deltaLine > (Math.max(jumpSpeed, fallSpeed) * 1.2)) {
    debugLog(
      `movement anomaly dLine=${deltaLine.toFixed(2)} dCol=${deltaCol.toFixed(2)} ` +
      `prev={${formatState(prev)}} next={${formatState(state)}} ${formatSnapshot(getPhysicsSnapshot())}`,
    );
  }
}

function updateStatusBar(): void {
  if (!statusBarItem) { return; }

  if (!currentConfig.enabled) {
    statusBarItem.hide();
    return;
  }

  if (catActive) {
    statusBarItem.text = 'out';
    statusBarItem.tooltip = new vscode.MarkdownString(
      `**Code Cat Life Abi**\n\nCurrent state: \`${statusState}\`\n\nClick to show details.`,
      true,
    );
  } else {
    statusBarItem.text = '$(code-cat-life-abi-sleep) sleep';
    statusBarItem.tooltip = new vscode.MarkdownString(
      `**Code Cat Life Abi**\n\nCurrent state: \`${statusState}\`\n\nClick to show details.`,
      true,
    );
  }

  statusBarItem.show();
}

export async function activate(context: vscode.ExtensionContext) {
  log = vscode.window.createOutputChannel('Code Cat Life Abi', { log: true });
  log.info('Code Cat Life Abi activating...');

  const spritesDir = path.join(context.extensionPath, 'sprites');
  sprites = new SpriteManager(spritesDir);
  try {
    await sprites.load();
    log.info(`Sprites loaded from ${spritesDir}`);
  } catch (e: any) {
    log.error(`ERROR loading sprites: ${e.message}`);
    vscode.window.showErrorMessage(`Code Cat Life Abi: Failed to load sprites — ${e.message}`);
    return;
  }

  currentConfig = readConfig();
  sprites.setColor(currentConfig.catColor);
  renderer = new DecorationRenderer(sprites);
  statusBarItem = vscode.window.createStatusBarItem('codeCatLifeAbi.status', vscode.StatusBarAlignment.Right, -50);
  statusBarItem.name = 'Code Cat Life Abi';
  statusBarItem.command = 'codeCatLifeAbi.showStatus';
  context.subscriptions.push(statusBarItem);
  applyConfig();
  log.info(`Config: ${JSON.stringify(currentConfig)}`);

  const showLogsCmd = vscode.commands.registerCommand('codeCatLifeAbi.showLogs', () => {
    showLogs(false);
  });
  context.subscriptions.push(showLogsCmd);

  const showStatusCmd = vscode.commands.registerCommand('codeCatLifeAbi.showStatus', () => {
    if (!currentConfig.enabled) {
      vscode.window.showInformationMessage('Code Cat Life Abi is disabled.');
      return;
    }
    vscode.window.showInformationMessage(`Code Cat Life Abi: ${statusState}`);
  });
  context.subscriptions.push(showStatusCmd);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand('codeCatLifeAbi.toggle', () => {
    const cfg = vscode.workspace.getConfiguration('codeCatLifeAbi');
    const next = !cfg.get<boolean>('enabled', true);
    cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
  });
  context.subscriptions.push(toggleCmd);

  // React to config changes — despawn first to avoid stale physics state
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('codeCatLifeAbi')) {
      despawnCat('config-change');
      applyConfig();
      if (currentConfig.enabled) { resetIdleTimer(); }
    }
  });
  context.subscriptions.push(configListener);

  // Listen for text changes (user is typing)
  const textChangeListener = vscode.workspace.onDidChangeTextDocument(() => {
    if (!currentConfig.enabled) { return; }
    despawnCat('text-change');
    resetIdleTimer();
  });
  context.subscriptions.push(textChangeListener);

  // Listen for selection changes (cursor movement)
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    if (!currentConfig.enabled || !catActive) { return; }
    despawnCat('selection-change');
    resetIdleTimer();
  });
  context.subscriptions.push(selectionListener);

  // Listen for active editor changes
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
    if (!catActive) {
      if (currentConfig.enabled) { resetIdleTimer(); }
      return;
    }
    despawnCat('active-editor-change');
    if (currentConfig.enabled) { resetIdleTimer(); }
  });
  context.subscriptions.push(editorChangeListener);

  // Listen for scroll — despawn cat + reset idle timer
  // Guard against feedback loop: decoration updates can trigger visible-range changes
  const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(() => {
    if (!currentConfig.enabled || !catActive || isRendering) { return; }
    despawnCat('visible-range-change');
    resetIdleTimer();
  });
  context.subscriptions.push(scrollListener);

  // Start idle timer
  if (currentConfig.enabled) { resetIdleTimer(); }
  updateStatusBar();
}

function resetIdleTimer(): void {
  if (idleTimeout) { clearTimeout(idleTimeout); }
  idleTimeout = setTimeout(() => {
    idleTimeout = null;
    spawnCat();
  }, currentConfig.idleTimeout * 1000);
}

function getVisibleRanges(editor: vscode.TextEditor): VisibleLineRange[] {
  const ranges = editor.visibleRanges;
  if (ranges.length === 0) {
    return [{ start: 0, end: editor.document.lineCount - 1 }];
  }
  return ranges.map(range => ({ start: range.start.line, end: range.end.line }));
}

function spawnCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !currentConfig.enabled) { return; }

  const text = editor.document.getText();
  const visibleRanges = getVisibleRanges(editor);
  const cursorLine = editor.selection.active.line;
  const activeVisibleRange = selectActiveVisibleRange(visibleRanges, cursorLine, editor.document.lineCount);
  physics.updateTerrain(text, activeVisibleRange.start, activeVisibleRange.end);
  const visibleLabel = formatVisibleRanges(visibleRanges);

  // Spawn near cursor if visible, otherwise top-left of visible area
  const spawnLine = cursorLine >= activeVisibleRange.start && cursorLine <= activeVisibleRange.end
    ? cursorLine
    : activeVisibleRange.start;
  physics.spawn(spawnLine);
  const state = physics.getState();

  if (!physics.canSpawnFishFromCurrentPosition()) {
    statusState = 'sleep';
    updateStatusBar();
    log.info(`Cat spawn skipped at line ${state.line}: no reachable fish targets`);
    debugLog(
      `spawn skipped visible=${visibleLabel} cursor=${cursorLine} state={${formatState(state)}} ` +
      `${formatSnapshot(getPhysicsSnapshot())} ${describeRenderAnchor(editor, state)}`,
    );
    return;
  }

  catActive = true;
  lastFootprintCol = -999;
  lastTickAt = 0;
  statusState = formatActionLabel(state.action);
  updateStatusBar();

  log.info(`Cat spawned at line ${state.line}, col ${state.col} (cursor was at line ${cursorLine})`);
  debugLog(
    `spawn visible=${visibleLabel} cursor=${cursorLine} state={${formatState(state)}} ` +
    `${formatSnapshot(getPhysicsSnapshot())} ${describeRenderAnchor(editor, state)}`,
  );

  // Start tick loop (speed-adjusted tick interval)
  const tickMs = getTickMs();
  if (tickInterval) { clearInterval(tickInterval); }
  tickInterval = setInterval(() => tickCat(), tickMs);
}

function tickCat(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !catActive) { despawnCat('tick:no-active-editor'); return; }

  try {
    const prev = physics.getState();
    const tickMs = getTickMs();
    const now = Date.now();
    if (debugEnabled() && lastTickAt > 0) {
      const elapsed = now - lastTickAt;
      if (elapsed > tickMs * 1.75) {
        debugLog(`tick delayed ${elapsed}ms while {${formatState(prev)}}`);
      } else if (elapsed < tickMs * 0.5) {
        debugLog(`tick bunched ${elapsed}ms after previous tick while {${formatState(prev)}}`);
      }
    }
    lastTickAt = now;

    const state = physics.tick();
    const fish = physics.getFish();
    maybeLogTickAnomaly(prev, state);

    if ((state.action === 'jump' || state.action === 'fall') && prev.action !== state.action) {
      debugLog(
        `vertical start prev={${formatState(prev)}} next={${formatState(state)}} ` +
        `${formatSnapshot(getPhysicsSnapshot())} ${describeRenderAnchor(editor, state)}`,
      );
    }
    if ((prev.action === 'jump' || prev.action === 'fall') && state.action !== prev.action) {
      debugLog(
        `vertical end prev={${formatState(prev)}} next={${formatState(state)}} ` +
        `${formatSnapshot(getPhysicsSnapshot())} ${describeRenderAnchor(editor, state)}`,
      );
    }

    const nextStatusState = formatActionLabel(state.action);
    if (nextStatusState !== statusState) {
      statusState = nextStatusState;
      updateStatusBar();
    }

    // Render cat with config (suppress scroll listener during decoration updates)
    isRendering = true;
    renderer.renderCat(editor, state, currentConfig);

    // Render fish
    renderer.renderFish(editor, fish);
    isRendering = false;

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
    isRendering = false;
    log.error(`ERROR in tick: ${e.message}\n${e.stack}`);
    debugLog(`tick error state={${formatState(physics.getState())}} ${formatSnapshot(getPhysicsSnapshot())}`);
    despawnCat('tick:error');
    resetIdleTimer();
  }
}

function despawnCat(reason = 'unknown'): void {
  if (catActive) {
    const state = physics.getState();
    debugLog(
      `despawn reason=${reason} state={${formatState(state)}} ` +
      `${formatSnapshot(getPhysicsSnapshot())}` +
      (vscode.window.activeTextEditor ? ` ${describeRenderAnchor(vscode.window.activeTextEditor, state)}` : ''),
    );
  }
  catActive = false;
  isRendering = false;
  lastTickAt = 0;
  statusState = currentConfig.enabled ? 'sleep' : 'disabled';
  updateStatusBar();
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  try {
    renderer?.clearAll();
    physics?.reset();
  } catch (e: any) {
    log?.error(`ERROR in despawn: ${e.message}`);
  }
}

export function deactivate() {
  despawnCat('deactivate');
  if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; }
  log?.info('Code Cat Life Abi deactivated');
  log?.dispose();
}
