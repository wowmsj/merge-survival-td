/**
 * 批量去背景脚本：处理 AI 生成的「假透明」图标
 *
 * 背景类型自动判定：
 * - 棋盘格（灰白交替）：边框像素按亮度分两簇，两簇都作为背景色泛洪去除
 * - 均匀浅色底（白/米）：单背景色泛洪去除
 * - 全幅深色画面（如整页蓝图，边框主色亮度 < 140）：跳过不动（本身就是全幅美术）
 *
 * 泛洪从四边 BFS，只去与背景色连通的部分；卡通深色描边会挡住侵蚀保护主体。
 * 用法：node scripts/remove-bg-batch.js [容差=42] [key ...]（默认处理全部 icon_p70*.png）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(SRC_DIR, '_backup_bg2');

async function processFile(fp, tol) {
  const { data, info } = await sharp(fp).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = data;
  const at = (x, y) => (y * W + x) * 4;

  // 边框两圈像素，按亮度分两簇
  const ring = [];
  for (let x = 0; x < W; x++) { ring.push(at(x, 1)); ring.push(at(x, H - 2)); }
  for (let y = 0; y < H; y++) { ring.push(at(1, y)); ring.push(at(W - 2, y)); }
  const lumOf = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const satOf = (i) => Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
  // 判定背板 vs 全幅美术：边框 ≥90% 是灰色（r≈g≈b）→ 棋盘格/白底背板，可去；
  // 边框带彩色（如整页蓝图的蓝）→ 全幅美术，跳过
  const grayCount = ring.filter(i => satOf(i) < 20).length;
  if (grayCount < ring.length * 0.9) return { status: 'skip-fullbleed' };

  const sorted = ring.map(i => ({ i, l: lumOf(i) })).sort((a, b) => a.l - b.l);
  const mid = sorted.length >> 1;
  const avg = (arr) => {
    let r = 0, g = 0, b = 0;
    for (const e of arr) { r += px[e.i]; g += px[e.i + 1]; b += px[e.i + 2]; }
    return [r / arr.length, g / arr.length, b / arr.length];
  };
  const dark = avg(sorted.slice(0, mid));
  const light = avg(sorted.slice(mid));
  const sep = Math.hypot(light[0] - dark[0], light[1] - dark[1], light[2] - dark[2]);

  const colors = sep > 25 ? [dark, light] : [light];
  const lim = tol * 3;
  const ok = (i) => px[i + 3] < 10 || colors.some(c =>
    Math.abs(px[i] - c[0]) + Math.abs(px[i + 1] - c[1]) + Math.abs(px[i + 2] - c[2]) <= lim);

  // 四边 BFS 泛洪
  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    const p = y * W + x;
    if (!seen[p] && ok(at(x, y))) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) { px[p * 4 + 3] = 0; removed++; }
  }
  if (removed === 0) return { status: 'skip-nobg' };

  fs.copyFileSync(fp, path.join(BACKUP_DIR, path.basename(fp)));
  const tmp = fp + '.tmp';
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toFile(tmp);
  fs.renameSync(tmp, fp);
  return { status: 'done', removed: (removed / (W * H) * 100).toFixed(1) + '%', colors: colors.length };
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const tol = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 42;
  const keys = args.length
    ? args
    : fs.readdirSync(SRC_DIR).filter(f => /^icon_p70\d+\.png$/.test(f)).map(f => f.replace('.png', ''));
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let done = 0, skipped = 0;
  for (const key of keys) {
    const fp = path.join(SRC_DIR, key + '.png');
    if (!fs.existsSync(fp)) { console.log(`${key}: 文件不存在`); continue; }
    const r = await processFile(fp, tol);
    if (r.status === 'done') { done++; console.log(`${key}: 去底 ${r.removed}（${r.colors} 色）`); }
    else { skipped++; console.log(`${key}: ${r.status}`); }
  }
  console.log(`完成：${done} 去底，${skipped} 跳过，原图备份在 ${BACKUP_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
