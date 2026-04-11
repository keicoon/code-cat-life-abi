import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const SRC = '/Users/keicoon15/Repo/code-cat/reference-sprites';
const OUT = '/Users/keicoon15/Repo/code-cat/sprites';

// Clean & recreate
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function parseSvg(filename) {
  const content = readFileSync(join(SRC, filename), 'utf-8');
  const vbMatch = content.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch ? vbMatch[1] : '0 0 388.066 250';
  const parts = viewBox.split(' ').map(Number);
  const vbW = parts[2];
  const vbH = parts[3];
  const paths = [...content.matchAll(/<path[^>]*d="([^"]*)"[^>]*\/?>/g)].map(m => m[1]);
  return { viewBox, vbW, vbH, paths };
}

function buildSvg(opts) {
  const vb = opts.newViewBox || opts.viewBox;
  const pathEls = opts.paths.map(d => '  <path d="' + d + '" fill="white"/>').join('\n');
  if (opts.transform) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">\n<g transform="' + opts.transform + '">\n' + pathEls + '\n</g>\n</svg>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">\n' + pathEls + '\n</svg>';
}

// ============================================================
// 1. Running frames (0-4): right & left
// ============================================================
const runFrames = ['cat_0.svg', 'cat_1.svg', 'cat_2.svg', 'cat_3.svg', 'cat_4.svg'];

for (const file of runFrames) {
  const data = parseSvg(file);
  const baseName = file.replace('.svg', '');
  writeFileSync(join(OUT, baseName + '_right.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths
  }));
  writeFileSync(join(OUT, baseName + '_left.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'translate(' + data.vbW + ', 0) scale(-1, 1)'
  }));
}

// ============================================================
// 2. Sleep frame (idle)
// ============================================================
{
  const data = parseSvg('cat_sleep.svg');
  writeFileSync(join(OUT, 'cat_sleep.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths
  }));
  writeFileSync(join(OUT, 'cat_sleep_left.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'translate(' + data.vbW + ', 0) scale(-1, 1)'
  }));
}

// ============================================================
// 3. Jump & Fall (using frame 2 - body nicely extended)
// ============================================================
{
  const data = parseSvg('cat_2.svg');
  const cx = data.vbW / 2;
  const cy = data.vbH / 2;

  writeFileSync(join(OUT, 'cat_jump_right.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'rotate(-25, ' + cx + ', ' + cy + ')'
  }));
  writeFileSync(join(OUT, 'cat_jump_left.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'translate(' + data.vbW + ', 0) scale(-1, 1) rotate(-25, ' + cx + ', ' + cy + ')'
  }));
  writeFileSync(join(OUT, 'cat_fall_right.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'rotate(25, ' + cx + ', ' + cy + ')'
  }));
  writeFileSync(join(OUT, 'cat_fall_left.svg'), buildSvg({
    viewBox: data.viewBox, paths: data.paths,
    transform: 'translate(' + data.vbW + ', 0) scale(-1, 1) rotate(25, ' + cx + ', ' + cy + ')'
  }));
}

// ============================================================
// 4. Climb - Creative multi-frame animations!
//    - Use different running frames for leg variety
//    - Rotate -80° (slight lean into wall, not exactly vertical)
//    - Alternate frames 1 & 3 (most different leg positions)
//    - Climb down: head-first descent (flipped vertically)
// ============================================================
{
  // Climb uses frames with the most distinct leg positions
  const climbSources = [
    { file: 'cat_1.svg', suffix: '0' },
    { file: 'cat_3.svg', suffix: '1' },
  ];

  for (const src of climbSources) {
    const data = parseSvg(src.file);
    const cx = data.vbW / 2;
    const cy = data.vbH / 2;

    // For vertical orientation, we use a taller viewBox
    // Pad generously to prevent clipping during rotation
    const pad = 40;
    const longSide = Math.max(data.vbW, data.vbH) + pad * 2;
    const shortSide = Math.min(data.vbW, data.vbH) + pad;
    const climbVb = '0 0 ' + shortSide + ' ' + longSide;

    // Translate center to the new viewBox center, then rotate
    const newCx = shortSide / 2;
    const newCy = longSide / 2;
    const tx = newCx - cx;
    const ty = newCy - cy;

    // --- Climb Up (right wall): cat facing up, body vertical ---
    // Rotate -80° (slight lean into wall feels natural, not rigid -90°)
    writeFileSync(join(OUT, 'cat_climb_up_' + src.suffix + '.svg'), buildSvg({
      viewBox: data.viewBox, paths: data.paths,
      transform: 'translate(' + tx + ', ' + ty + ') rotate(-80, ' + cx + ', ' + cy + ')',
      newViewBox: climbVb
    }));

    // --- Climb Up (left wall): mirror of right wall climb ---
    writeFileSync(join(OUT, 'cat_climb_up_left_' + src.suffix + '.svg'), buildSvg({
      viewBox: data.viewBox, paths: data.paths,
      transform: 'translate(' + (shortSide - tx) + ', ' + ty + ') scale(-1,1) rotate(-80, ' + cx + ', ' + cy + ')',
      newViewBox: climbVb
    }));

    // --- Climb Down (right wall): head-first, cat diving down ---
    // Flip Y then rotate, so the cat faces downward
    writeFileSync(join(OUT, 'cat_climb_down_' + src.suffix + '.svg'), buildSvg({
      viewBox: data.viewBox, paths: data.paths,
      transform: 'translate(' + tx + ', ' + ty + ') rotate(80, ' + cx + ', ' + cy + ')',
      newViewBox: climbVb
    }));

    // --- Climb Down (left wall) ---
    writeFileSync(join(OUT, 'cat_climb_down_left_' + src.suffix + '.svg'), buildSvg({
      viewBox: data.viewBox, paths: data.paths,
      transform: 'translate(' + (shortSide - tx) + ', ' + ty + ') scale(-1,1) rotate(80, ' + cx + ', ' + cy + ')',
      newViewBox: climbVb
    }));
  }
}

// ============================================================
// Summary
// ============================================================
console.log('Sprite processing complete!');
const files = readdirSync(OUT).filter(f => f.endsWith('.svg')).sort();
console.log('Generated ' + files.length + ' SVGs:');
for (const f of files) {
  console.log('  ' + f);
}
