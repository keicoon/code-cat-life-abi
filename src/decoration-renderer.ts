import * as vscode from 'vscode';
import { CatState, FishState, ExtensionConfig } from './types';
import { SpriteManager } from './sprite-manager';

/** Get pixel sizes proportional to editor fontSize (returns numbers) */
function getSizes(): {
  catW: number; catH: number; liftGap: number;
  fishW: number; fishH: number;
  pawW: number; pawH: number;
  lineHeightPx: number; charWidthPx: number;
} {
  const editorCfg = vscode.workspace.getConfiguration('editor');
  const fontSize = editorCfg.get<number>('fontSize') ?? 14;
  const lineHeight = editorCfg.get<number>('lineHeight') ?? 0;
  const lineHeightPx = lineHeight > 0 ? lineHeight : Math.round(fontSize * 1.5);
  const charWidthPx = Math.round(fontSize * 0.6);
  const catW = Math.round(fontSize * 2);
  const catH = Math.round(fontSize * 1.4);
  const liftGap = Math.round(fontSize * 0.4);
  return {
    catW, catH, liftGap,
    fishW: Math.round(catW * 0.7),
    fishH: Math.round(catH * 0.65),
    pawW: Math.round(fontSize * 0.8),
    pawH: Math.round(fontSize * 0.5),
    lineHeightPx,
    charWidthPx,
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

    // Integer anchor for decoration placement
    const baseLine = Math.floor(state.line);
    const baseCol = Math.round(state.col);

    if (baseLine < 0 || baseLine >= editor.document.lineCount) { this.clearCat(); return; }

    const { catW, catH, liftGap, lineHeightPx, charWidthPx } = getSizes();

    // Anchor col clamped to actual line length (empty/short lines can't host baseCol)
    const lineLength = editor.document.lineAt(baseLine).text.length;
    const safeCol = Math.min(baseCol, Math.max(0, lineLength));
    const colDrift = baseCol - safeCol; // cols lost to short/empty anchor line

    // Smooth sub-pixel offset via CSS transform (includes colDrift compensation)
    const fracLine = state.line - baseLine;
    const fracCol = state.col - baseCol;
    const offsetY = Math.round(fracLine * lineHeightPx);
    const offsetX = Math.round((fracCol + colDrift) * charWidthPx);

    const newDeco = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: `${catW}px`,
        height: `${catH}px`,
        margin: `-${catH + liftGap}px -${catW}px 0 0`,
        textDecoration: `none;
          display: inline-block;
          background-image: url("${spriteUri}");
          background-size: contain;
          background-repeat: no-repeat;
          background-position: bottom center;
          z-index: 10;
          filter: drop-shadow(0 0 3px ${config.catColor}44);
          pointer-events: none;
          transform: translate(${offsetX}px, ${offsetY}px);`,
      },
    });

    const range = new vscode.Range(baseLine, safeCol, baseLine, safeCol);

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

    const { fishW, fishH, liftGap } = getSizes();

    const newDeco = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '',
        width: `${fishW}px`,
        height: `${fishH}px`,
        margin: `-${fishH + liftGap}px -${fishW}px 0 0`,
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
        // Paw prints stay at ground level (on text), only cancel width
        margin: `0 -${pawW}px 0 0`,
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
