/**
 * 其余配置表访问层（初始棋盘 / 任务 / 合成奖励 / 背包格 / 全局常量）
 * 数据均来自 merge 项目 assets/ahead1/json/
 */

import boardInitJson from './data/prop_new.json';
import taskOrderTypeJson from './data/task_orderType.json';
import safeTaskJson from './data/task_SafeTask.json';
import handTaskJson from './data/task_newTask.json';
import composeAwardJson from './data/prop_composeAward.json';
import bagGridJson from './data/prop_bagGrid.json';
import configTableJson from './data/config_table.json';
import heroLevelJson from './data/herolevel_table.json';

/** 初始棋盘行（row/col 从 1 开始） */
export interface IBoardInitRow {
  id: number;
  row: number;
  col: number;
  /** 0 正常 / 1 蜘蛛网 / 2 纸箱 */
  status: number;
  propId: number;
  clickPropId: number[] | 0;
}

/** 随机订单生成表行 */
export interface ITaskOrderTypeRow {
  id: number;
  /** 候选物品来源类型：2 棋盘上已拥有 / 3,4,5,6 产出链可达（原项目依赖图鉴，本项目用产出链近似） */
  res1: number;
  /** 需要的物品种类数 */
  djzl: number;
  /** 等级增加值 */
  djsj: number;
  /** 需求数量 1/2/3 的权重串，如 "100,10,5" */
  num: string;
  weight: number;
  levelMin: number;
  levelMax: number;
  /** 品质上限（物品 lunc ≤ quality） */
  quality: number;
  /** 星星奖励候选数组，随机取一个 */
  taskReward: number[];
}

/** 保底/新手任务表行 */
export interface ISimpleTaskRow {
  id: number;
  name: string;
  prop: number;
  num: number;
  taskReward: number;
  /** 可选：完成时额外奖励的道具 id（发射器件等），配合 rewardNum */
  rewardProp?: number;
  rewardNum?: number;
}

/** 合成额外奖励表行（propId: -1 同级气泡 / 0 不出 / >0 指定物品） */
export interface IComposeAwardRow {
  id: number;
  propId: number;
  weight: number;
}

/** 背包格价格表行 */
export interface IBagGridRow {
  id: number;
  coin: number;
}

/** 玩家等级表行：lv 级时累积 exp 满即升到 lv+1，并获得升到 lv+1 级对应行的 reward */
export interface IHeroLevelRow {
  id: number;
  lv: number;
  /** 从 lv 升到 lv+1 所需经验（约 5×lv+15 线性，Lv1=5 为新手特例） */
  exp: number;
  /** 升到该级发放的奖励 [道具id, 数量][]（宝箱/手提包组合） */
  reward: [number, number][];
}

export const BOARD_INIT = boardInitJson as unknown as IBoardInitRow[];
export const TASK_ORDER_TYPES = taskOrderTypeJson as unknown as ITaskOrderTypeRow[];
export const SAFE_TASKS = safeTaskJson as unknown as ISimpleTaskRow[];
export const HAND_TASKS = handTaskJson as unknown as ISimpleTaskRow[];
export const COMPOSE_AWARDS = composeAwardJson as unknown as IComposeAwardRow[];
export const BAG_GRIDS = bagGridJson as unknown as IBagGridRow[];
export const HERO_LEVELS = heroLevelJson as unknown as IHeroLevelRow[];

/** 全局常量表（key → value） */
const CONFIG_MAP: Record<string, any> = {};
for (const row of configTableJson as unknown as { key: string; value: any }[]) {
  CONFIG_MAP[row.key] = row.value;
}

export function getConfigValue<T = any>(key: string, defaultValue?: T): T {
  const v = CONFIG_MAP[key];
  return v === undefined ? (defaultValue as T) : (v as T);
}

/** 按 id 取新手任务（id 从 1 开始） */
export function getHandTask(id: number): ISimpleTaskRow | undefined {
  return HAND_TASKS.find(r => r.id === id);
}

/** 取 lv 级的等级表行（exp 为升到 lv+1 所需经验；满级返回 undefined） */
export function getHeroLevel(lv: number): IHeroLevelRow | undefined {
  return HERO_LEVELS.find(r => r.lv === lv);
}

/**
 * 行动力上限：基础 energyMax（100）+ 玩家等级加成（每升 1 级 +1，Lv1 无加成）。
 * 行动力每 5 分钟恢复 1 点；守夜胜利保留余量，并固定奖励 100 点。
 */
export function getPowerMax(state: { roleLv: number }): number {
  return getConfigValue('energyMax', 100) + Math.max(0, state.roleLv - 1);
}

/** 背包第 slotIndex+1 格的开格价格（coin=0 为免费格） */
export function getBagGridPrice(slotIndex: number): number {
  const row = BAG_GRIDS.find(r => r.id === slotIndex + 1);
  return row ? row.coin : 0;
}

/** 背包免费格数量 */
export function getFreeBagSlotCount(): number {
  let count = 0;
  for (const row of BAG_GRIDS) {
    if (row.coin !== 0) break;
    count++;
  }
  return count;
}
