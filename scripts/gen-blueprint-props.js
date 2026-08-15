/**
 * 一次性生成脚本：建筑蓝图解锁系统的 prop_prop.json 行 + building.json blueprint 字段
 *
 * - 17 个非 core/ruin 建筑（按 building.json 行顺序）：
 *   发射器 70001~70017，蓝图链 70101 起每建筑 4 个连续 id
 *   链命名：Lv1「XX蓝图碎片」→ Lv2「XX图纸」→ Lv3「XX设计图」→ Lv4「XX蓝图」（链尾 blessId=0）
 * - 发射器：anc=1 times=10 milo=10 noPower=1 wsb=1 blessId=0 atom=Lv1碎片
 * - 幂等：先删除 prop_prop.json 已有 7xxxx 行再追加；building.json 的 blueprint 字段按映射重写
 *
 * 用法：node scripts/gen-blueprint-props.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'core', 'config', 'data');
const PROP_FILE = path.join(DATA_DIR, 'prop_prop.json');
const BUILDING_FILE = path.join(DATA_DIR, 'building.json');

const CHAIN_NAMES = ['蓝图碎片', '图纸', '设计图', '蓝图'];
const CHAIN_GOLD = [2, 5, 10, 30];

const props = JSON.parse(fs.readFileSync(PROP_FILE, 'utf8'));
const buildings = JSON.parse(fs.readFileSync(BUILDING_FILE, 'utf8'));

// 非 core/ruin 建筑，按文件行顺序
const targets = buildings.filter(b => b.kind !== 'core' && b.kind !== 'ruin');
if (targets.length === 0) throw new Error('building.json 中没有可建造建筑');

/** 发射器行（参考 10003 空箱子行，覆盖蓝图语义） */
function makeSpawner(id, typeson, buildingName, fragId) {
  return {
    id,
    type: 7,
    typename: '建筑蓝图',
    typeson,
    sonname: `${buildingName}蓝图`,
    cc: `${buildingName}蓝图`,
    reward: '',
    icon: '',
    chongneng: 0,
    fudai: 0,
    tan: 0,
    noPower: 1,
    xian: 0,
    clickPropId: 0,
    luna: 1,
    lunc: 100,
    bubble: 50,
    she: 0,
    levelGold: 0,
    name: `${buildingName}蓝图发射器`,
    clickAwardId: 0,
    clickAwardNum: 0,
    blessId: 0,
    lock: 0,
    anc: 1,
    times: 8,
    fair: 0,
    faircd: 0,
    kishu: 0,
    wsb: 1,
    shib: 0,
    doge: 0,
    atom: String(fragId),
    matic: '100',
    milo: 10,
    mask: `点击获得${buildingName}蓝图碎片，集齐 8 个可逐级合成${buildingName}蓝图（发射 8 次后发射器消失）。`,
    mdt: 0,
    p1: 0,
    mask1: '',
    mask2: '',
    jiandao: 0,
    putong1: 0,
    putong2: 0,
    putong3: 0,
    nochaoji: 1,
    quanneng: 0,
    abao1: 0,
    abao2: 0
  };
}

/** 链行（参考 10012 螺丝刀行，覆盖蓝图语义） */
function makeChainRow(id, typeson, buildingName, level, nextId) {
  const label = CHAIN_NAMES[level - 1];
  const isTop = nextId === 0;
  return {
    id,
    type: 7,
    typename: '建筑蓝图',
    typeson,
    sonname: `${buildingName}蓝图`,
    cc: `${buildingName}蓝图`,
    reward: '',
    icon: '',
    chongneng: 0,
    fudai: 0,
    tan: 0,
    noPower: 0,
    xian: 1,
    clickPropId: 0,
    luna: level,
    lunc: 100,
    bubble: level,
    she: 1,
    levelGold: CHAIN_GOLD[level - 1],
    name: `${buildingName}${label}`,
    clickAwardId: 0,
    clickAwardNum: 0,
    blessId: nextId,
    lock: 0,
    anc: 0,
    times: 12,
    fair: 0,
    faircd: 0,
    kishu: 0,
    wsb: 0,
    shib: 0,
    doge: 0,
    atom: '',
    matic: '',
    milo: 1,
    mask: isTop
      ? `${buildingName}的完整蓝图。合成出即永久解锁建筑「${buildingName}」。`
      : `${buildingName}蓝图的${label}，两个相同可合成更高级的${CHAIN_NAMES[level]}。`,
    mdt: 0,
    p1: 0,
    mask1: '',
    mask2: '',
    jiandao: 0,
    putong1: 0,
    putong2: 0,
    putong3: 0,
    nochaoji: 1,
    quanneng: 0,
    abao1: 0,
    abao2: 0
  };
}

// 幂等：删除已有 7xxxx 行
const kept = props.filter(r => r.id < 70000 || r.id > 79999);
const removed = props.length - kept.length;

const newRows = [];
targets.forEach((b, i) => {
  const typeson = i + 1;
  const spawnerId = 70001 + i;
  const chainBase = 70101 + i * 4;
  newRows.push(makeSpawner(spawnerId, typeson, b.name, chainBase));
  for (let lv = 1; lv <= 4; lv++) {
    const id = chainBase + lv - 1;
    newRows.push(makeChainRow(id, typeson, b.name, lv, lv < 4 ? id + 1 : 0));
  }
  // building.json：链尾 Lv4 蓝图 propId
  b.blueprint = chainBase + 3;
});

fs.writeFileSync(PROP_FILE, JSON.stringify([...kept, ...newRows], null, 2) + '\n');
fs.writeFileSync(BUILDING_FILE, JSON.stringify(buildings, null, 2) + '\n');

console.log(`删除旧 7xxxx 行 ${removed} 条，新增 ${newRows.length} 条（${targets.length} 发射器 + ${targets.length * 4} 链行）`);
console.log('映射表：');
targets.forEach((b, i) => {
  console.log(`  ${70001 + i} -> 建筑 ${b.id} ${b.name}，链 ${70101 + i * 4}~${70101 + i * 4 + 3}，blueprint=${b.blueprint}`);
});
