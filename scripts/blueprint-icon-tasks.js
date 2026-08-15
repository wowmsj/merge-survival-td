/**
 * 建筑蓝图类道具图标任务清单（85 张：17 发射器 + 17 链 × 4 级）
 *
 * 被 scripts/generate-assets.js（ALL_TASKS）和 scripts/resize-assets.js（SQUARE_256）共用。
 * key 统一为 icon_p<propId>，与 prop_prop.json 的 7xxxx 行一一对应：
 *   发射器 70001~70017（顺序 = building.json 非 core/ruin 行序）
 *   蓝图链 70101 起每建筑 4 个连续 id（Lv1 碎片 → Lv2 图纸 → Lv3 设计图 → Lv4 蓝图）
 */

/** 17 个建筑的英文主题（顺序必须与 gen-blueprint-props.js / building.json 行序一致） */
const BUILDING_THEMES = [
  'arrow tower',        // 101 箭塔
  'cannon turret',      // 102 炮塔
  'magic tower',        // 103 魔法塔
  'ice tower',          // 104 冰冻塔
  'farm',               // 201 农场
  'medical station',    // 202 医疗站
  'power station',      // 203 电站
  'residential house',  // 204 住房
  'warehouse',          // 205 仓库
  'workshop',           // 206 工坊
  'collection station', // 207 收集站
  'ground spikes trap', // 301 地刺
  'landmine trap',      // 302 地雷
  'slowing swamp trap', // 303 减速沼泽
  'wooden wall',        // 401 木墙
  'stone wall',         // 402 石墙
  'iron wall'           // 403 铁墙
];

/** 链内 4 级的图纸形态描述（等级越高越完整华丽） */
const LEVEL_STYLES = [
  'A small torn scrap of blueprint paper with a rough pencil sketch of a %s, curled edges, worn and basic',
  'A half-finished blueprint sheet with a clean line drawing of a %s, a few measurement marks, improved standard version',
  'A detailed blueprint page of a %s with precise measurement lines and small gears in the corner, advanced version',
  'A complete blueprint scroll of a %s, fully detailed, golden ornate border with a soft magical glow, masterpiece version'
];

const COMMON = ', mobile game item icon, cartoon style, 128x128, isolated object on transparent background, no text, no letters, no watermark';

const tasks = [];

BUILDING_THEMES.forEach((theme, i) => {
  // 发射器：图纸箱
  tasks.push({
    key: `icon_p${70001 + i}`,
    prompt: `A cartoon wooden supply crate with rolled blueprint scrolls sticking out, a small ${theme} emblem painted on the front${COMMON}`,
    ext: 'png',
    transparent: true
  });
  // 链内 4 级
  for (let lv = 0; lv < 4; lv++) {
    tasks.push({
      key: `icon_p${70101 + i * 4 + lv}`,
      prompt: `${LEVEL_STYLES[lv].replace('%s', theme)}${COMMON}`,
      ext: 'png',
      transparent: true
    });
  }
});

module.exports = {
  BLUEPRINT_ICON_TASKS: tasks,
  BLUEPRINT_ICON_KEYS: tasks.map(t => t.key)
};
