/**
 * 一次性提取脚本：从源项目 merge 的道具图集中抠出指定帧，输出到 assets/generated/
 * 用法：node scripts/extract-atlas-icons.js
 */
const path = require('path');
const sharp = require('sharp');

const ATLAS_DIR = 'D:/小程序和小游戏/merge/Project_Merge/art_assets/atlas/props';
const mapping = require(path.join(ATLAS_DIR, 'atlas_mapping.json'));

// [图集帧 key, 输出图标 key]
const JOBS = [
  ['ahead1\\prop1\\icon_a3.png', 'icon_a3'], // 10003 空箱子
  ['ahead1\\prop1\\prop_blackbox.png', 'prop_blackbox'], // 1005 黑色手提包
  ['ahead1\\prop1\\prop_bigblackbox.png', 'src_bigblackbox'], // 1006 大号黑色手提包（源美术）
  ['ahead1\\prop1\\prop_pinkbox.png', 'src_pinkbox'], // 1003 蓝色手提包（源美术）
  ['ahead1\\prop1\\prop_bigpingbox.png', 'src_bigpingbox'] // 1004 大号蓝色手提包（源美术）
];

(async () => {
  for (const [frameKey, outKey] of JOBS) {
    const frame = mapping[frameKey];
    if (!frame) {
      console.error('缺帧', frameKey);
      continue;
    }
    const [x, y, w, h] = frame.atlas_rect;
    const out = path.join(__dirname, '..', 'assets', 'generated', `${outKey}.png`);
    await sharp(path.join(ATLAS_DIR, frame.atlas_file))
      .extract({ left: x, top: y, width: w, height: h })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log('OK', out);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
