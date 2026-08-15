/**
 * 素材缩放脚本
 * 把 assets/generated/ 下的 1024x1024 原图按游戏内实际显示尺寸缩小，
 * 输出到 assets/images/（webpack CopyPlugin 会拷贝到 dist/assets/images/）。
 * 原图保留不动。运行：npm run resize-assets
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'generated');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

// 每级独立图标 key 从运行时纹理清单读取，避免导入图集后与 ItemIconMap 脱节。
const PER_LEVEL_ICON_KEYS = (() => {
  try {
    const mapSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'phaser', 'config', 'ItemIconMap.ts'), 'utf8');
    const match = mapSource.match(/const\s+PER_LEVEL_ICON_PROP_IDS[^=]*=\s*\[([\s\S]*?)\];/);
    return match ? [...match[1].matchAll(/\b(\d+)\b/g)].map((item) => `icon_p${item[1]}`) : [];
  } catch (e) {
    return [];
  }
})();

// 目标尺寸（按游戏内 displaySize 定）：
// - 格子/道具图标类显示约 140x140，给 256
// - lock 显示 44x44 → 128；task-gou 显示 30x30 → 64
// - btn-bg 显示最大 260x80 → 400x144（保持 200:72 比例）
// - panel-bg 显示最大约 620x1632（MaterialPanel 高 0.85 屏）→ 800x600 横向余量
const SQUARE_256 = [
  'cell-bg', 'cell-bg2', 'cell-select', 'cell-hint', 'bubble-mask',
  'carton', 'spider', 'card-bg',
  'icon_a1', 'icon_a2', 'icon_a3', 'icon_a4', 'icon_b1', 'icon_b2', 'icon_b3',
  'icon_c1', 'icon_d1', 'icon_e1', 'icon_f1', 'icon_h1', 'icon_i10',
  'icon_j1', 'icon_k1', 'icon_kk1', 'icon_kkk1', 'icon_kkkk1', 'icon_llll1',
  'icon_m1', 'icon_m2', 'icon_m3', 'icon_mf1', 'icon_mh1', 'icon_md1',
  'icon_me1', 'icon_mc1', 'icon_o1', 'icon_oa1', 'icon_ob1', 'icon_oc1',
  'icon_60001', 'icon_60005', 'icon_60008', 'icon_60011', 'icon_60020', 'icon_60024',
  'prop_coin1', 'prop_energy1', 'prop_bigpingbox', 'prop_bigblackbox', 'prop_blackbox',
  // 第三批：补全无图标链
  'prop_exp', 'prop_dress', 'prop_diamonds1', 'prop_diamonds3', 'prop_exp1', 'prop_exp3',
  'prop_fudai', 'prop_bag', 'prop_ccbox', 'prop_coinbox', 'prop_powerbox',
  'prop_goose1', 'prop_goose3', 'prop_giftbox',
  'prop_toolchest', 'prop_seedbox', 'prop_gymbox', 'prop_coolerbox',
  'prop_supply_plant', 'prop_supply_gym', 'prop_supply_drink', 'prop_supply_course', 'prop_supply_recycle',
  'icon_b15', 'icon_b17',
  'icon_d11', 'icon_d13', 'icon_d15', 'icon_d16', 'icon_d17', 'icon_d19',
  'icon_h8', 'icon_h10', 'icon_h12', 'icon_h14', 'icon_h16',
  'iion_i1', 'iion_i5', 'iion_i9',
  'icon_j12', 'icon_j16', 'icon_l1', 'icon_l4',
  'icon_ll1', 'icon_ll3', 'icon_lll1', 'icon_lll3', 'icon_lll5',
  'icon_ma1', 'icon_ma4',
  'icon_60016', 'icon_60017', 'icon_60018', 'icon_60019', 'icon_60022', 'icon_60023',
  // 剧情角色立绘（显示约 300x300，给 512）
  'char-hero', 'char-laogui', 'char-xiaoman', 'char-beian',
  'char-mancang', 'char-laoqiang', 'char-pangshen', 'char-doctor', 'char-xiaodian',
  'char-douzi', 'char-wensente', 'char-tiezhua', 'char-officer',
  // 第四批：链内等级差异化（icon_p<propId>，清单同 scripts/icon-chain-plan.json，
  // 与 ItemIconMap.ts 的 PER_LEVEL_ICON_PROP_IDS 保持一致）
  ...PER_LEVEL_ICON_KEYS,
  // 第五批：建筑蓝图类（17 发射器 + 17 链 × 4 级，清单同 scripts/blueprint-icon-tasks.js）
  ...require('./blueprint-icon-tasks').BLUEPRINT_ICON_KEYS
];

const SIZES = {
  'task-gou': { width: 64, height: 64 },
  'lock': { width: 128, height: 128 },
  'btn-bg': { width: 400, height: 144 },
  'panel-bg': { width: 800, height: 600 },
  // 第二批 UI 元素
  'bg-main': { width: 540, height: 960 },
  'res-item-bg': { width: 256, height: 96 },
  'res-icon-lv': { width: 128, height: 128 },
  'res-icon-coin': { width: 128, height: 128 },
  'res-icon-diamond': { width: 128, height: 128 },
  'res-icon-power': { width: 128, height: 128 },
  'res-icon-star': { width: 128, height: 128 },
  'task-item-bg': { width: 512, height: 128 },
  'task-item-done-bg': { width: 512, height: 128 },
  'build-card-bg': { width: 256, height: 288 },
  'build-icon-core': { width: 128, height: 128 },
  'build-icon-tower': { width: 128, height: 128 },
  'build-icon-resource': { width: 128, height: 128 },
  'build-icon-trap': { width: 128, height: 128 },
  'build-icon-wall': { width: 128, height: 128 },
  'banner-bg': { width: 512, height: 96 }
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [];
  for (const key of SQUARE_256) jobs.push({ key, width: 256, height: 256 });
  for (const [key, size] of Object.entries(SIZES)) jobs.push({ key, ...size });

  let ok = 0;
  let missing = 0;
  for (const job of jobs) {
    const src = path.join(SRC_DIR, `${job.key}.png`);
    const out = path.join(OUT_DIR, `${job.key}.webp`);
    if (!fs.existsSync(src)) {
      console.warn(`  SKIP ${job.key}.png（原图不存在）`);
      missing++;
      continue;
    }
    // 非方形目标直接拉伸（按钮/面板美术本身铺满画面），方形等比缩放
    const fit = job.width === job.height ? 'cover' : 'fill';
    // webp 有损 + alpha：体积约为 png 的 1/4，肉眼几乎无差
    await sharp(src).resize(job.width, job.height, { fit }).webp({ quality: 82 }).toFile(out);
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  OK ${job.key}.webp ${job.width}x${job.height} ${kb}KB`);
    ok++;
  }
  console.log(`\n完成：${ok} 成功，${missing} 跳过，输出目录 assets/images/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
