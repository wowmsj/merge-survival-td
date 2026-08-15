/**
 * 道具图标背景普查
 * 扫描 assets/generated/ 下道具图标类 png（icon_* / prop_* / iion_*，
 * 不含 cell-bg/bg-main/btn/panel 等底板与 UI 类），按四角/边缘像素分类：
 *   transparent  透明底（边缘 alpha 均值 < 250 且边缘不透明像素很少）
 *   panel        圆角背板（四角透明但边缘中部不透明）
 *   light        浅色不透明底（边缘亮度 >= 128）
 *   dark         深色不透明底（边缘亮度 < 128）
 * 运行：node scripts/survey-icon-backgrounds.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'generated');

async function analyze(file) {
  const { data, info } = await sharp(path.join(SRC_DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const px = (x, y) => {
    const i = (y * w + x) * ch;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  // 边缘一整圈 + 四角 8x8 补丁
  let edgeN = 0, edgeA = 0, edgeR = 0, edgeG = 0, edgeB = 0, edgeOpaque = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const p = px(x, y);
      edgeN++; edgeA += p.a; edgeR += p.r; edgeG += p.g; edgeB += p.b;
      if (p.a > 250) edgeOpaque++;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const p = px(x, y);
      edgeN++; edgeA += p.a; edgeR += p.r; edgeG += p.g; edgeB += p.b;
      if (p.a > 250) edgeOpaque++;
    }
  }
  let cornerN = 0, cornerA = 0;
  for (const [cx, cy] of [[0, 0], [w - 9, 0], [0, h - 9], [w - 9, h - 9]]) {
    for (let y = cy; y < cy + 8; y++) {
      for (let x = cx; x < cx + 8; x++) {
        cornerN++; cornerA += px(x, y).a;
      }
    }
  }

  const edgeAlphaMean = edgeA / edgeN;
  const cornerAlphaMean = cornerA / cornerN;
  const opaqueRatio = edgeOpaque / edgeN;
  const lum = (0.299 * edgeR + 0.587 * edgeG + 0.114 * edgeB) / edgeN;

  // 内圈采样（约 6% 内缩）：检测"外圈透明但内部大面积不透明"的圆角背板
  const inset = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  let inN = 0, inOpaque = 0, inR = 0, inG = 0, inB = 0;
  const inXs = [];
  for (let x = inset; x < w - inset; x += 4) inXs.push(x);
  for (const x of inXs) {
    for (const y of [inset, h - 1 - inset]) {
      const p = px(x, y);
      inN++; if (p.a > 250) { inOpaque++; inR += p.r; inG += p.g; inB += p.b; }
    }
  }
  for (let y = inset; y < h - inset; y += 4) {
    for (const x of [inset, w - 1 - inset]) {
      const p = px(x, y);
      inN++; if (p.a > 250) { inOpaque++; inR += p.r; inG += p.g; inB += p.b; }
    }
  }
  const inOpaqueRatio = inOpaque / inN;
  const inLum = inOpaque > 0 ? (0.299 * inR + 0.587 * inG + 0.114 * inB) / inOpaque : 0;

  let kind;
  if (opaqueRatio > 0.95) {
    kind = lum >= 128 ? 'light' : 'dark';
  } else if (edgeAlphaMean < 240 && inOpaqueRatio > 0.85) {
    kind = 'panel'; // 外圈透明、内圈几乎全不透明 → 圆角背板
  } else {
    kind = 'transparent';
  }
  return { kind, edgeAlphaMean, cornerAlphaMean, opaqueRatio, lum, inOpaqueRatio, inLum };
}

async function main() {
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => /^(icon_|prop_|iion_).+\.png$/.test(f))
    .sort();
  const groups = { transparent: [], panel: [], light: [], dark: [] };
  for (const f of files) {
    const r = await analyze(f);
    groups[r.kind].push(`${f}  (边缘alpha ${r.edgeAlphaMean.toFixed(0)}, 内圈不透明 ${(r.inOpaqueRatio * 100).toFixed(0)}%, 亮度 ${r.lum.toFixed(0)}/${r.inLum.toFixed(0)})`);
  }
  console.log(`共 ${files.length} 张道具图标\n`);
  for (const k of ['transparent', 'panel', 'light', 'dark']) {
    console.log(`== ${k}: ${groups[k].length} 张 ==`);
    for (const line of groups[k]) console.log('  ' + line);
    console.log('');
  }}

main().catch(e => { console.error(e); process.exit(1); });
