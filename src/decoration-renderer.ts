import * as vscode from 'vscode';
import { CatState, FishState, Direction } from './types';
import { SpriteManager } from './sprite-manager';

export class DecorationRenderer {
  private catDecoration: vscode.TextEditorDecorationType | null = null;
  private fishDecoration: vscode.TextEditorDecorationType | null = null;
  private footprints: Array<{ decoration: vscode.TextEditorDecorationType; timer: NodeJS.Timeout }> = [];

  constructor(private sprites: SpriteManager) {}

  renderCat(editor: vscode.TextEditor, state: CatState): void {
    this.clearCat();

    const spriteUri = this.sprites.getFrame(state.action, state.direction, state.frame);
    const line = Math.round(state.line);
    const col = Math.round(state.col);

    if (line < 0 || line >= editor.document.lineCount) { return; }

    const opacity = state.action === 'idle' || state.action === 'sleep'
      ? (0.7 + 0.3 * Math.sin(state.ticksInState * 0.12)).toFixed(2)
      : '1';

    this.catDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: '1.6em',
        height: '1em',
        margin: '0 -1.6em 0 0',
        textDecoration: `none;
          background-image: url("${spriteUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          opacity: ${opacity};
          position: relative;
          z-index: 10;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.3));
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

    this.fishDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: '1.2em',
        height: '0.9em',
        margin: '0 -1.2em 0 0',
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

    const decoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: '0.8em',
        height: '0.5em',
        margin: '0 -0.8em 0 0',
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
