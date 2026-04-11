import * as vscode from 'vscode';
import { CatState, FishState, ExtensionConfig } from './types';
import { SpriteManager } from './sprite-manager';

/** Get cat pixel size proportional to editor fontSize */
function getCatSize(): { width: string; height: string; pawW: string; pawH: string } {
  const fontSize = vscode.workspace.getConfiguration('editor').get<number>('fontSize') ?? 14;
  // Cat is roughly 2x font width, 1.4x line height
  const w = Math.round(fontSize * 2);
  const h = Math.round(fontSize * 1.4);
  const pw = Math.round(fontSize * 0.8);
  const ph = Math.round(fontSize * 0.5);
  return {
    width: `${w}px`, height: `${h}px`,
    pawW: `${pw}px`, pawH: `${ph}px`,
  };
}

export class DecorationRenderer {
  private catDecoration: vscode.TextEditorDecorationType | null = null;
  private fishDecoration: vscode.TextEditorDecorationType | null = null;
  private footprints: Array<{ decoration: vscode.TextEditorDecorationType; timer: NodeJS.Timeout }> = [];

  constructor(private sprites: SpriteManager) {}

  renderCat(editor: vscode.TextEditor, state: CatState, config: ExtensionConfig): void {
    this.clearCat();

    const spriteUri = this.sprites.getFrame(state.action, state.direction, state.frame);
    const line = Math.round(state.line);
    const col = Math.round(state.col);

    if (line < 0 || line >= editor.document.lineCount) { return; }

    const opacity = state.action === 'idle' || state.action === 'sleep'
      ? (0.7 + 0.3 * Math.sin(state.ticksInState * 0.12)).toFixed(2)
      : '1';

    const size = getCatSize();

    this.catDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: size.width,
        height: size.height,
        margin: `0 -${size.width} 0 0`,
        textDecoration: `none;
          background-image: url("${spriteUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          opacity: ${opacity};
          position: relative;
          z-index: 10;
          filter: drop-shadow(0 0 3px ${config.catColor}44);
          pointer-events: none;`,
      },
    });

    const lineLength = editor.document.lineAt(line).text.length;
    const safeCol = Math.min(col, Math.max(0, lineLength));
    const range = new vscode.Range(line, safeCol, line, safeCol);
    editor.setDecorations(this.catDecoration, [range]);
  }

  renderFish(editor: vscode.TextEditor, fish: FishState): void {
    this.clearFish();
    if (!fish.active) { return; }

    const fishUri = this.sprites.getSpecial('fish');
    const line = fish.line;
    const col = fish.col;

    if (line < 0 || line >= editor.document.lineCount) { return; }

    const size = getCatSize();
    const fishW = Math.round(parseInt(size.width) * 0.7) + 'px';
    const fishH = Math.round(parseInt(size.height) * 0.65) + 'px';

    this.fishDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: fishW,
        height: fishH,
        margin: `0 -${fishW} 0 0`,
        textDecoration: `none;
          background-image: url("${fishUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          filter: drop-shadow(0 0 6px rgba(255,215,0,0.6));
          pointer-events: none;`,
      },
    });

    const lineLength = editor.document.lineAt(line).text.length;
    const safeCol = Math.min(col, Math.max(0, lineLength));
    const range = new vscode.Range(line, safeCol, line, safeCol);
    editor.setDecorations(this.fishDecoration, [range]);
  }

  addFootprint(editor: vscode.TextEditor, line: number, col: number): void {
    const pawUri = this.sprites.getSpecial('paw');

    if (line < 0 || line >= editor.document.lineCount) { return; }

    const size = getCatSize();

    const decoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: size.pawW,
        height: size.pawH,
        margin: `0 -${size.pawW} 0 0`,
        textDecoration: `none;
          background-image: url("${pawUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          opacity: 0.3;
          pointer-events: none;`,
      },
    });

    const lineLength = editor.document.lineAt(line).text.length;
    const safeCol = Math.min(col, Math.max(0, lineLength));
    const range = new vscode.Range(line, safeCol, line, safeCol);
    editor.setDecorations(decoration, [range]);

    const timer = setTimeout(() => {
      decoration.dispose();
      this.footprints = this.footprints.filter(f => f.decoration !== decoration);
    }, 2500);

    this.footprints.push({ decoration, timer });
  }

  clearCat(): void {
    this.catDecoration?.dispose();
    this.catDecoration = null;
  }

  clearFish(): void {
    this.fishDecoration?.dispose();
    this.fishDecoration = null;
  }

  clearAll(): void {
    this.clearCat();
    this.clearFish();
    for (const fp of this.footprints) {
      clearTimeout(fp.timer);
      fp.decoration.dispose();
    }
    this.footprints = [];
  }
}
