import * as vscode from 'vscode';
import { CatState, FishState, ExtensionConfig } from './types';
import { SpriteManager } from './sprite-manager';

/** Get pixel sizes proportional to editor fontSize (returns numbers) */
function getSizes(): { catW: number; catH: number; fishW: number; fishH: number; pawW: number; pawH: number } {
  const fontSize = vscode.workspace.getConfiguration('editor').get<number>('fontSize') ?? 14;
  const catW = Math.round(fontSize * 2);
  const catH = Math.round(fontSize * 1.4);
  return {
    catW, catH,
    fishW: Math.round(catW * 0.7),
    fishH: Math.round(catH * 0.65),
    pawW: Math.round(fontSize * 0.8),
    pawH: Math.round(fontSize * 0.5),
  };
}

export class DecorationRenderer {
  private catDecoration: vscode.TextEditorDecorationType | null = null;
  private fishDecoration: vscode.TextEditorDecorationType | null = null;
  private footprints: Array<{ decoration: vscode.TextEditorDecorationType; timer: NodeJS.Timeout }> = [];

  constructor(private sprites: SpriteManager) {}

  /**
   * Render cat above the text line (negative top margin = zero layout space + float above).
   * New decoration is set BEFORE disposing old one to eliminate flicker.
   */
  renderCat(editor: vscode.TextEditor, state: CatState, config: ExtensionConfig): void {
    const spriteUri = this.sprites.getFrame(state.action, state.direction, state.frame);
    const line = Math.round(state.line);
    const col = Math.round(state.col);

    if (line < 0 || line >= editor.document.lineCount) { this.clearCat(); return; }

    const opacity = state.action === 'idle' || state.action === 'sleep'
      ? (0.7 + 0.3 * Math.sin(state.ticksInState * 0.12)).toFixed(2)
      : '1';

    const { catW, catH } = getSizes();

    const newDeco = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: `${catW}px`,
        height: `${catH}px`,
        // negative top margin: takes 0 layout space + shifts cat above text
        // negative right margin: prevents pushing text to the right
        margin: `-${catH}px -${catW}px 0 0`,
        textDecoration: `none;
          background-image: url("${spriteUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          opacity: ${opacity};
          z-index: 10;
          filter: drop-shadow(0 0 3px ${config.catColor}44);
          pointer-events: none;`,
      },
    });

    const lineLength = editor.document.lineAt(line).text.length;
    const safeCol = Math.min(col, Math.max(0, lineLength));
    const range = new vscode.Range(line, safeCol, line, safeCol);

    // Set new first, then dispose old → no visual gap between frames
    editor.setDecorations(newDeco, [range]);
    this.catDecoration?.dispose();
    this.catDecoration = newDeco;
  }

  renderFish(editor: vscode.TextEditor, fish: FishState): void {
    if (!fish.active) { this.clearFish(); return; }

    const fishUri = this.sprites.getSpecial('fish');
    const { line, col } = fish;

    if (line < 0 || line >= editor.document.lineCount) { this.clearFish(); return; }

    const { fishW, fishH } = getSizes();

    const newDeco = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: `${fishW}px`,
        height: `${fishH}px`,
        margin: `-${fishH}px -${fishW}px 0 0`,
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

    editor.setDecorations(newDeco, [range]);
    this.fishDecoration?.dispose();
    this.fishDecoration = newDeco;
  }

  addFootprint(editor: vscode.TextEditor, line: number, col: number): void {
    const pawUri = this.sprites.getSpecial('paw');

    if (line < 0 || line >= editor.document.lineCount) { return; }

    const { pawW, pawH } = getSizes();

    const decoration = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: `${pawW}px`,
        height: `${pawH}px`,
        // Paw prints also zero-layout-space, floating above the text
        margin: `-${pawH}px -${pawW}px 0 0`,
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
