/**
 * 道具图标统一去底（泛洪 flood fill）
 * 对 assets/generated/ 下非透明底的道具图标（普查 light/panel 类）：
 * 从四周边缘向内 flood fill，把与边缘主色 RGB 距离 <= 容差的连通像素 alpha 置 0。
 *
 * - 处理前把原图备份到 assets/generated/_backup_bg/（只备份被修改的）
 * - SKIP_LIST：主体颜色接近背景色的特例（去底会把主体抠坏）
 *     prop_goose3 白鹅：身体 RGB≈白 靠白底衬托，是特意 flatten 到白底的
 * - 已透明底的图标自动跳过
 *
 * 运行：node scripts/fix-icon-backgrounds.js [容差=36] [key ...]
 *   不带 key 处理普查出的全部非透明底图标；带 key 只处理指定的（--force 处理已透明的）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'generated');
const BACKUP_DIR = path.join(SRC_DIR, '_backup_bg');

/** 主体≈背景色的特例，去底会抠坏主体 */
const SKIP_LIST = new Set(['prop_goose3']);

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const FORCE = process.argv.includes('--force');
const TOL = /^\d+$/.test(args[0] || '') ? Number(args.shift()) : 36;
const ONLY = new Set(args);

function rgbDist(data, i, r, g, b) {
  const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 对单张图做泛洪去底；返回 { changed, removed, refColor } */
async function stripBackground(file) {
  const src = path.join(SRC_DIR, file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const n = w * h;

  // 边缘主色（不透明边缘像素均值；全透明边缘则无需处理）
  let bn = 0, br = 0, bg = 0, bb = 0;
  const isBorder = (x, y) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBorder(x, y)) continue;
      const a = data[(y * w + x) * ch + 3];
      if (a > 250) {
        const i = (y * w + x) * ch;
        bn++; br += data[i]; bg += data[i + 1]; bb += data[i + 2];
      }
    }
  }
  // 边缘几乎全不透明才是"有底"；全透明边缘则探测内圈是否有背板
  const borderTotal = 2 * w + 2 * h - 4;
  let refR, refG, refB;
  if (bn / borderTotal > 0.9) {
    refR = br / bn; refG = bg / bn; refB = bb / bn;
  } else {
    // 背板/部分透明：内圈环带不透明像素均色做参考
    let sn = 0, sr = 0, sg = 0, sb = 0;
    const inset = Math.max(2, Math.round(Math.min(w, h) * 0.06));
    for (let y = inset; y < h - inset; y += 3) {
      for (let x = inset; x < w - inset; x += 3) {
        const i = (y * w + x) * ch;
        if (data[i + 3] > 250 && isRingish(x, y, w, h, inset * 2)) {
          sn++; sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
        }
      }
    }
    // 内圈几乎没有不透明像素 → 真透明底；边缘有少量不透明但内圈也空 → 主体贴边，不动
    const ringTotal = Math.ceil((w - 2 * inset) / 3) * 2 + Math.ceil((h - 2 * inset) / 3) * 2;
    if (sn / ringTotal < 0.5) return { changed: false, reason: '边缘已全透明（内圈无背板）' };
    refR = sr / sn; refG = sg / sn; refB = sb / sn;
  }

  // BFS 泛洪：从全部边缘像素出发，透明像素可直接穿过，同色像素置透明
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isBorder(x, y)) {
        const p = y * w + x;
        if (!visited[p]) { visited[p] = 1; queue[qt++] = p; }
      }
    }
  }
  let removed = 0;
  while (qh < qt) {
    const p = queue[qh++];
    const i = p * ch;
    const a = data[i + 3];
    if (a === 0) {
      // 已透明：直接穿过（背板图的外圈透明区）
    } else if (rgbDist(data, i, refR, refG, refB) <= TOL) {
      data[i + 3] = 0;
      removed++;
    } else {
      continue; // 主体：不穿过
    }
    const x = p % w, y = (p / w) | 0;
    if (x > 0 && !visited[p - 1]) { visited[p - 1] = 1; queue[qt++] = p - 1; }
    if (x < w - 1 && !visited[p + 1]) { visited[p + 1] = 1; queue[qt++] = p + 1; }
    if (y > 0 && !visited[p - w]) { visited[p - w] = 1; queue[qt++] = p - w; }
    if (y < h - 1 && !visited[p + w]) { visited[p + w] = 1; queue[qt++] = p + w; }
  }

  if (removed < n * 0.01) return { changed: false, reason: `去底像素过少（${removed}），疑似已是透明底` };
  if (removed > n * 0.95) return { changed: false, reason: `去底像素过多（${(removed / n * 100).toFixed(1)}%），疑似主体被误抠，跳过` };

  // 不在这里写盘：调用方先备份原图，再写 buffer
  return {
    changed: true, removed,
    data, w, h, ch,
    refColor: `rgb(${refR.toFixed(0)},${refG.toFixed(0)},${refB.toFixed(0)})`,
    pct: (removed / n * 100).toFixed(1)
  };
}

/** 距边缘 dist 像素内的环带（背板参考色采样用） */
function isRingish(x, y, w, h, dist) {
  return x < dist || y < dist || x >= w - dist || y >= h - dist;
}

async function main() {
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => /\.png$/.test(f))
    .filter(f => /^(icon_|prop_|iion_)/.test(f) || ONLY.has(f.replace(/\.png$/, '')))
    .filter(f => ONLY.size === 0 || ONLY.has(f.replace(/\.png$/, '')))
    .sort();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let done = 0, skipped = 0, alreadyOk = 0;
  for (const f of files) {
    const key = f.replace(/\.png$/, '');
    if (SKIP_LIST.has(key)) {
      console.log(`  SKIP ${f}（特例：主体≈背景色，去底会抠坏主体）`);
      skipped++;
      continue;
    }
    const r = await stripBackground(f);
    if (r.changed) {
      // 先备份原图，再覆盖写盘
      const backup = path.join(BACKUP_DIR, f);
      if (!fs.existsSync(backup)) fs.copyFileSync(path.join(SRC_DIR, f), backup);
      const out = await sharp(r.data, { raw: { width: r.w, height: r.h, channels: r.ch } }).png().toBuffer();
      fs.writeFileSync(path.join(SRC_DIR, f), out);
      done++;
      console.log(`  OK ${f} 去底 ${r.pct}% 像素，参考色 ${r.refColor}（已备份）`);
    } else {
      alreadyOk++;
      console.log(`  -- ${f} 跳过：${r.reason}`);
    }
  }
  console.log(`\n完成：${done} 张去底，${skipped} 张特例跳过，${alreadyOk} 张无需处理`);
}

main().catch(e => { console.error(e); process.exit(1); });
