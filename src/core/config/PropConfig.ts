/**
 * 物品配置表访问层
 * 数据来自 merge 项目 prop_prop.json（365 行）
 * 原表字段为拼音乱命名，所有语义映射集中在这一处：
 *
 *   luna       → 等级（id 链条编码等级，blessId 指向合成结果）
 *   blessId    → 合成结果 id（0 = 满级/不可合成）
 *   lunc       → 品质
 *   type/typeson → 大类/子类（同一子类为一条合成链）
 *   anc/times/milo → 可点击发射 / 点击次数 / 点击 cd 秒
 *   lock       → 初始即处于 cd
 *   wsb        → 点击耗尽后消失
 *   doge       → 点击耗尽后变身成的 id
 *   atom/matic → 点击产出 id 串 / 权重串（逗号分隔）
 *   clickPropId → 首次生成该发射器时的指定产出队列
 *   kishu/fair/faircd → 自动产出次数 / 产出 id / cd 秒
 *   levelGold  → 出售所得金币
 *   she        → 是否可出售
 *   bubble     → 主动戳破气泡所需钻石
 *   mdt/p1     → 特殊道具类型 / 参数
 *                  1 解锁型(p1 秒) 2 无限能量(p1 秒) 3 充能器(p1 次数)
 *                  4 拆分器(p1 可拆最高级) 5 全屏减 cd(p1 小时)
 *                  6~10 升级卡  11 加速装置(p1 小时)
 *   clickAwardId/clickAwardNum → 点击直接领取的货币
 *   noPower    → 点击不耗体力
 *   chongneng  → 可被充能器充能
 *   jiandao    → 可被拆分器拆分
 *   putong1/2/3, nochaoji, quanneng → 升级卡匹配标记
 */

import propTableJson from './data/prop_prop.json';

/** 物品表行（全字段，与原表一致） */
export interface IPropRow {
  id: number;
  type: number;
  typename: string;
  typeson: number;
  sonname: string;
  cc: string;
  reward: string;
  icon: string;
  chongneng: number;
  fudai: number;
  tan: number;
  noPower: number;
  xian: number;
  clickPropId: number[] | 0;
  luna: number;
  lunc: number;
  bubble: number;
  she: number;
  levelGold: number;
  name: string;
  clickAwardId: number;
  clickAwardNum: number;
  blessId: number;
  lock: number;
  anc: number;
  times: number;
  fair: number;
  faircd: number;
  kishu: number;
  wsb: number;
  shib: number;
  doge: number;
  atom: string | number;
  matic: string | number;
  milo: number;
  mask: string;
  mdt: number;
  p1: number;
  mask1: string;
  mask2: string;
  jiandao: number;
  putong1: number;
  putong2: number;
  putong3: number;
  nochaoji: number;
  quanneng: number;
  abao1: number;
  abao2: number;
}

/** 特殊道具 id 常量（源项目 propIds） */
export const PROP_IDS = {
  coin: 101,
  diamond: 102,
  power: 103,
  exp: 104,
  star: 105,
  bag: 401,
} as const;

/** 全局设计常量（源项目 designConfig） */
export const DESIGN_CONFIG = {
  /** 气泡自爆时间（ms） */
  bubbleTime: 60 * 1000,
  /** 气泡爆后变成的物品 id */
  bubbleBombPropId: 203,
} as const;

const RAW_PROP_TABLE = propTableJson as unknown as IPropRow[];

// Support buildings were added after the original spreadsheet's fragment rows.
// Keep their fragment chain beside the source data so market purchases still use normal merge behavior.
const EXTRA_BLUEPRINT_CHAINS = [
  { finalId: 70169, firstId: 70201, typeson: 18, name: '弹药库蓝图' },
  { finalId: 70170, firstId: 70205, typeson: 19, name: '雷达站蓝图' },
  { finalId: 70171, firstId: 70209, typeson: 20, name: '维修站蓝图' }
];
const FRAGMENT_TEMPLATE = RAW_PROP_TABLE.find(row => row.id === 70145)!;
const EXTRA_BLUEPRINT_FRAGMENTS: IPropRow[] = EXTRA_BLUEPRINT_CHAINS.flatMap(chain =>
  Array.from({ length: 3 }, (_, index) => ({
    ...FRAGMENT_TEMPLATE,
    id: chain.firstId + index,
    typeson: chain.typeson,
    sonname: chain.name,
    cc: chain.name,
    name: index === 0 ? `${chain.name}碎片` : chain.name,
    luna: index + 1,
    blessId: index === 2 ? chain.finalId : chain.firstId + index + 1
  }))
);
const PROP_TABLE = [...RAW_PROP_TABLE, ...EXTRA_BLUEPRINT_FRAGMENTS];
const PROP_MAP: Map<number, IPropRow> = new Map(PROP_TABLE.map(r => [r.id, r]));

/** 取物品配置行 */
export function getProp(id: number): IPropRow | undefined {
  return PROP_MAP.get(id);
}

export function getAllProps(): IPropRow[] {
  return PROP_TABLE;
}

/** 等级 */
export function getPropLevel(id: number): number {
  return getProp(id)?.luna ?? 1;
}

/** 电池链首 id（电池 50001 → 加强电池 50002 → …，发电机燃料来源） */
export const BATTERY_CHAIN_HEAD = 50001;

/** 是否电池链道具（50001 链：同 type/typeson 且 id 不早于链首） */
export function isBatteryItem(id: number): boolean {
  const row = getProp(id);
  const head = getProp(BATTERY_CHAIN_HEAD);
  return !!row && !!head && row.type === head.type && row.typeson === head.typeson && id >= BATTERY_CHAIN_HEAD;
}

/** 电池等级（链内 luna；非电池返回 0） */
export function getBatteryLevel(id: number): number {
  return isBatteryItem(id) ? getPropLevel(id) : 0;
}

/** 工具箱链 id 范围（工具箱把手 10001 → … → 维修工作台 10011，主力材料发射器） */
export const TOOLBOX_CHAIN_MIN = 10001;
export const TOOLBOX_CHAIN_MAX = 10011;

/** 是否工具箱链发射器 */
export function isToolboxSpawner(id: number): boolean {
  return id >= TOOLBOX_CHAIN_MIN && id <= TOOLBOX_CHAIN_MAX;
}

/** 合成结果 id（0 = 不可合成/满级） */
export function getMergeNextId(id: number): number {
  return getProp(id)?.blessId ?? 0;
}

/** 返回包含目标在内的完整合成链，首项是最低级材料。 */
export function getMergeChain(id: number): number[] {
  if (!getProp(id)) return [];
  let start = id;
  while (true) {
    const previous = PROP_TABLE.find(row => row.blessId === start);
    if (!previous) break;
    start = previous.id;
  }
  const chain: number[] = [];
  const seen = new Set<number>();
  for (let current = start; current > 0 && !seen.has(current); current = getMergeNextId(current)) {
    chain.push(current);
    seen.add(current);
    if (current === id) return chain;
  }
  return [id];
}

/** 返回能直接产出该合成链首级材料的最低级发射器。 */
export function getMergeChainSpawner(id: number): number | undefined {
  const chain = getMergeChain(id);
  const sourceId = chain[0];
  if (!sourceId) return undefined;
  return PROP_TABLE.find(row => getClickProducts(row.id).some(product => product.id === sourceId))?.id;
}

/** 所有作为合成结果的 id 集合（ blessId 反向索引） */
const MERGE_TARGET_SET = new Set<number>(PROP_TABLE.map(r => r.blessId).filter(id => id > 0));

/**
 * 是否合成链顶端（可合成获得、且自身不能再合成）→ 等级角标显示 MAX。
 * 非链物品（宝箱、货币等 blessId=0 但无上游）不算
 */
export function isMergeChainTop(id: number): boolean {
  const row = getProp(id);
  return !!row && row.blessId === 0 && MERGE_TARGET_SET.has(id);
}

/**
 * 等级角标是否显示 MAX：
 * - 合成链尾（blessId=0 且有上游合成进来）一律显示 MAX——包括点击发射器链尾
 *   （满级冰箱/维修工作台/大号手提包等），链尾就是满级，显示「N级」会让玩家以为还能合；
 * - 带等级（luna>1）但完全不可合成的孤品（金币/能量宝箱、钻石瓶、经验瓶等）也显示 MAX。
 */
export function isMaxBadgeItem(id: number): boolean {
  const row = getProp(id);
  if (!row || row.blessId !== 0) return false;
  if (MERGE_TARGET_SET.has(id)) return true;
  return row.luna > 1;
}

/** 是否满级（按 id+1 链条判定，升级卡用） */
export function isMaxLevelByChain(id: number): boolean {
  const row = getProp(id);
  if (!row) return true;
  const next = getProp(id + 1);
  return !next || next.type !== row.type || next.typeson !== row.typeson;
}

/** 等级 +lvAdd，溢出取链尾（lvAdd=0 返回自身） */
export function getIdByLvUp(id: number, lvAdd: number): number {
  if (!lvAdd) return id;
  let row = getProp(id);
  if (!row) return id;
  let cur = id;
  for (let i = 0; i < lvAdd; i++) {
    const next = getProp(cur + 1);
    if (!next || next.type !== row.type || next.typeson !== row.typeson) break;
    cur++;
    row = next;
  }
  return cur;
}

/** 解析 atom/matic 为 {id, weight} 列表 */
export function getClickProducts(id: number): { id: number; weight: number }[] {
  const row = getProp(id);
  if (!row || !row.atom) return [];
  const valArr = String(row.atom).split(',');
  const weightArr = String(row.matic ?? '').split(',');
  const res: { id: number; weight: number }[] = [];
  for (let i = 0; i < valArr.length; i++) {
    const pid = parseInt(valArr[i]);
    const w = parseInt(weightArr[i]);
    if (pid > 0) {
      res.push({ id: pid, weight: isNaN(w) ? 1 : w });
    }
  }
  return res;
}

/** 发射器产出视图项（产出一览弹窗用） */
export interface ISpawnerProductView {
  /** 产物 id */
  id: number;
  /** 当前等级产出权重（当前不可产出为 0） */
  weight: number;
  /** 解锁该产物所需的发射器等级 */
  unlockLevel: number;
  /** 当前等级是否可产出 */
  unlocked: boolean;
}

/**
 * 发射器全链产出一览：
 * 沿 id+1 链（同 type/typeson）收集每个发射器等级的产出表，
 * 标记当前等级可产出（已解锁）与更高等级才可产出（未解锁 + 解锁等级）。
 * 排序：已解锁按权重降序在前，未解锁按解锁等级升序在后。
 */
export function getSpawnerProductView(spawnerId: number): ISpawnerProductView[] {
  const row = getProp(spawnerId);
  if (!row) return [];

  // 找链首（id-1 同 type/typeson 一直往前）
  let start = spawnerId;
  while (true) {
    const prev = getProp(start - 1);
    if (!prev || prev.type !== row.type || prev.typeson !== row.typeson) break;
    start--;
  }

  const currentList = getClickProducts(spawnerId);
  const currentWeights = new Map(currentList.map(p => [p.id, p.weight]));

  const map = new Map<number, ISpawnerProductView>();
  for (let id = start; ; id++) {
    const r = getProp(id);
    if (!r || r.type !== row.type || r.typeson !== row.typeson) break;
    if (!isClickSpawner(id)) continue;
    for (const p of getClickProducts(id)) {
      const exist = map.get(p.id);
      if (!exist) {
        map.set(p.id, { id: p.id, weight: 0, unlockLevel: r.luna, unlocked: false });
      } else if (r.luna < exist.unlockLevel) {
        exist.unlockLevel = r.luna;
      }
    }
  }

  for (const view of map.values()) {
    const w = currentWeights.get(view.id);
    if (w !== undefined) {
      view.weight = w;
      view.unlocked = true;
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) return b.weight - a.weight;
    return a.unlockLevel - b.unlockLevel;
  });
}

/** 是否可点击发射 */
export function isClickSpawner(id: number): boolean {
  const row = getProp(id);
  return !!row && !!row.anc && row.times > 0;
}

/** 是否「点击触发」的特殊道具（mdt 1/2/5/11 或有点击奖励） */
export function isClickSpecialProp(id: number): boolean {
  const row = getProp(id);
  if (!row) return false;
  if (row.clickAwardId > 0) return true;
  return row.mdt === 1 || row.mdt === 2 || row.mdt === 5 || row.mdt === 11;
}

/** 是否自动生成器 */
export function isAutoSpawner(id: number): boolean {
  const row = getProp(id);
  return !!row && row.fair > 0;
}

/** 是否进卡片列表（type 100~199 或 27 为直接入账的货币/资源类） */
export function propGoesToCardList(id: number): boolean {
  const row = getProp(id);
  if (!row) return true;
  if ((row.type >= 100 && row.type < 200) || row.type === 27) return false;
  return true;
}

/** 能否被加速装置加速 */
export function propCanSpeedUp(id: number): boolean {
  const row = getProp(id);
  if (!row) return false;
  return !!((row.anc && row.milo) || row.faircd);
}

/** 充能器目标判定 */
export function canChargerTarget(id: number): boolean {
  const row = getProp(id);
  return !!row && !!row.chongneng && !!row.anc;
}

/** 拆分器目标判定（srcId 为拆分器） */
export function canSplitTarget(srcId: number, targetId: number): boolean {
  const src = getProp(srcId);
  const target = getProp(targetId);
  return !!src && !!target && !!target.jiandao && target.luna > 1 && target.luna <= src.p1;
}

/** 升级卡目标判定（srcId 为升级卡，mdt 6~10） */
export function canLvUpTarget(srcId: number, targetId: number): boolean {
  const src = getProp(srcId);
  const target = getProp(targetId);
  if (!src || !target || isMaxLevelByChain(targetId)) return false;
  switch (src.mdt) {
    case 6: return !!target.putong1;
    case 7: return !!target.putong2;
    case 8: return !!target.putong3;
    case 9: return !target.nochaoji;
    case 10: return !!target.quanneng;
    default: return false;
  }
}

/** 货币类道具 id → 资源字段名（101 金币 102 钻石 103 体力 104 经验 105 星星） */
export function propIdToResourceKey(id: number): 'coin' | 'diamond' | 'power' | 'exp' | 'star' | null {
  switch (id) {
    case PROP_IDS.coin: return 'coin';
    case PROP_IDS.diamond: return 'diamond';
    case PROP_IDS.power: return 'power';
    case PROP_IDS.exp: return 'exp';
    case PROP_IDS.star: return 'star';
    default: return null;
  }
}
