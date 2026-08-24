/**
 * 建筑配置表访问层
 * 数值设计见 SURVIVAL_BUILD_DESIGN.md 3.2
 *
 * 建造/升级只消耗金币（costCoin）+ 行动力；
 * 资源建筑每隔 outputInterval 秒产出 1 份产出池内的随机满级材料，发到棋盘（棋盘满进卡片）。
 *
 * 升级规则：最高 3 级；升到 L+1 级消耗 = 基础消耗 × L；
 * 血量/攻击每级 ×1.5（取整）；产出间隔每级 ÷1.5（取整，产量不变）。
 */

import { BaseResource, BuildingKind, IGameState, IResource } from '../types';
import buildingJson from './data/building.json';

/** 材料消耗/产出：道具 id -> 数量（JSON 键为字符串，访问时需 Number 转换） */
export type MaterialCost = Record<number, number>;

/** 基础资源产出：资源类型 -> 数量 */
export type ResourceOutput = Partial<Record<BaseResource, number>>;
export type SupportKind = 'ammo' | 'radar' | 'repair';

/** 建筑产出结果：棋盘合成材料 + 基础资源 */
export type ProductionResult = {
  items: MaterialCost;
  resources: ResourceOutput;
};

export interface IBuildingConfig {
  id: number;
  name: string;
  kind: BuildingKind;
  /** 建造金币（黑市交易货币） */
  costCoin: number;
  /** 废弃字段（材料库已移除），配置里恒为空对象 */
  costMaterials: MaterialCost;
  hp: number;
  attack?: number;
  range?: number;
  /** 攻击速度（次/秒） */
  speed?: number;
  /** 无视目标防御（电磁塔的高甲克制） */
  ignoreDefense?: boolean;
  /** 减速比例（冰冻塔/减速沼泽） */
  slow?: number;
  /**
   * 资源建筑产出池：每次产出随机取其中 1 份满级材料，发到棋盘（棋盘满进卡片）。
   * 用于“收集站”等低级原料来源，不产出高阶合成材料。
   */
  outputPool?: number[];
  /** 产出间隔（秒，1 级） */
  outputInterval?: number;
  /** 资源建筑产出基础资源类型（与 outputPool 二选一，或并存） */
  outputResource?: BaseResource;
  /** 每次产出基础资源数量 */
  outputAmount?: number;
  /** 容量建筑：增加的资源上限字段，逗号分隔多个，如 "medicineMax" */
  capResource?: string;
  /** 容量建筑每级增加的上限数值 */
  capAmount?: number;
  /** 所需电力（核心无需电力；按摆放顺序累计 ≤ 供电容量才运转，见 BaseSystem.getPowerInfo） */
  needPower?: number;
  /** 发电设施提供的电力容量（1 级），升级 ×1.5 取整 */
  providePower?: number;
  /**
   * 坚固等级：僵尸「拆迁等级」(demolish) ≥ 该值才能对其造成伤害（默认 0 = 谁都能拆）。
   * 废墟/木墙=1（坦克起可拆）、石墙=2（精英起）、铁墙=3（仅 Boss）。
   */
  sturdy?: number;
  /** 解锁该建筑所需的最终蓝图道具 id（core/ruin 无此字段，恒解锁） */
  blueprint?: number;
  /** 放置后向周围扩张的占领半径 */
  claimRadius?: number;
  /** 夜战支撑建筑类型。 */
  support?: SupportKind;
  /** 支撑建筑的切比雪夫覆盖半径。 */
  supportRange?: number;
}

/** 建筑最高等级 */
export const BUILDING_MAX_LEVEL = 3;
/** 每级属性倍率 */
export const LEVEL_STAT_MULT = 1.5;

const BUILDING_TABLE = buildingJson as unknown as IBuildingConfig[];
const BUILDING_MAP: Map<number, IBuildingConfig> = new Map(BUILDING_TABLE.map(b => [b.id, b]));

export function getBuildingConfig(id: number): IBuildingConfig | undefined {
  return BUILDING_MAP.get(id);
}

/** 全部建筑配置（包含核心与废墟）。 */
export function getAllBuildingConfigs(): IBuildingConfig[] {
  return BUILDING_TABLE;
}

/**
 * 建筑是否已解锁：无 blueprint 字段（core/ruin）恒 true，
 * 否则需 state.unlockedBuildings 含该 cfgId（使用对应 Lv4 蓝图后永久解锁）。
 * 旧存档无 unlockedBuildings 字段时按未解锁处理（加载路径会兜底补齐）。
 */
export function isBuildingUnlocked(state: IGameState, cfgId: number): boolean {
  const cfg = getBuildingConfig(cfgId);
  if (!cfg || !cfg.blueprint) return true;
  return Array.isArray(state.unlockedBuildings) && state.unlockedBuildings.includes(cfgId);
}

/** 最终蓝图 propId → 建筑配置（由 blueprint 字段反向生成） */
const BLUEPRINT_TO_BUILDING: Map<number, IBuildingConfig> = new Map(
  BUILDING_TABLE.filter(b => b.blueprint).map(b => [b.blueprint!, b])
);

/** propId 是否是某建筑的最终蓝图（Lv4 链尾），是则返回建筑配置，否则 undefined */
export function getBlueprintBuilding(propId: number): IBuildingConfig | undefined {
  return BLUEPRINT_TO_BUILDING.get(propId);
}

/** 废墟配置 id（新开局围住基地三边的中性障碍，不可建造） */
export const RUIN_ID = 901;

/** 可建造的建筑列表（不含核心/废墟），按大类过滤 */
export function getBuildableList(kind?: Exclude<BuildingKind, 'core' | 'ruin'>): IBuildingConfig[] {
  return BUILDING_TABLE.filter(b => b.kind !== 'core' && b.kind !== 'ruin' && (!kind || b.kind === kind));
}

/** 升级到下一级的金币消耗（当前 level → level+1）；满级返回 0 */
export function getUpgradeCostCoin(cfgId: number, level: number): number {
  const cfg = getBuildingConfig(cfgId);
  if (!cfg || level >= BUILDING_MAX_LEVEL) return 0;
  return cfg.costCoin * level;
}

/** 某级的属性倍率 */
export function levelMult(level: number): number {
  return Math.pow(LEVEL_STAT_MULT, level - 1);
}

/** 某级血量（取整） */
export function hpAtLevel(cfg: IBuildingConfig, level: number): number {
  return Math.round(cfg.hp * levelMult(level));
}

/** 某级攻击（取整） */
export function attackAtLevel(cfg: IBuildingConfig, level: number): number {
  return Math.round((cfg.attack ?? 0) * levelMult(level));
}

/** 发电机某级提供的电力容量（取整，升级 ×1.5） */
export function providePowerAtLevel(cfg: IBuildingConfig, level: number): number {
  return Math.round((cfg.providePower ?? 0) * levelMult(level));
}

/** 某级产出间隔（秒，取整；升级加速产量不变） */
export function outputIntervalAtLevel(cfg: IBuildingConfig, level: number): number {
  return Math.round((cfg.outputInterval ?? 0) / levelMult(level));
}

/** 资源建筑每级产出数量（容量类建筑无产出，返回 0） */
export function outputAmountAtLevel(cfg: IBuildingConfig, level: number): number {
  if (!cfg.outputResource || !cfg.outputAmount) return 0;
  return Math.round(cfg.outputAmount * levelMult(level));
}

/** 容量建筑每级增加的上限字段列表 */
export function capResourceKeys(cfg: IBuildingConfig): (keyof IResource)[] {
  if (!cfg.capResource || !cfg.capAmount) return [];
  return cfg.capResource.split(',').map(s => s.trim() as keyof IResource).filter(Boolean);
}

/** 容量建筑每级增加的上限数值 */
export function capAmountAtLevel(cfg: IBuildingConfig, level: number): number {
  if (!cfg.capResource || !cfg.capAmount) return 0;
  return Math.round(cfg.capAmount * levelMult(level));
}

/** 基础资源中文名（用于 UI 文案） */
export const RESOURCE_NAME: Record<BaseResource, string> = {
  medicine: '药品',
  scrap: '废料'
};

/** 拆除返还金币 */
export function getDemolishRefundCoin(cfgId: number): number {
  const cfg = getBuildingConfig(cfgId);
  if (!cfg) return 0;
  return Math.floor(cfg.costCoin * DEMOLISH_REFUND);
}

/** 修复金币消耗：造价的一半 × 损坏比例（向上取整，至少 1）；满血返回 0 */
export function getRepairCostCoin(cfgId: number, hp: number, maxHp: number): number {
  const cfg = getBuildingConfig(cfgId);
  if (!cfg || hp >= maxHp) return 0;
  if (cfg.kind === 'core') return maxHp - hp;
  return Math.max(1, Math.ceil(cfg.costCoin * 0.5 * (maxHp - hp) / maxHp));
}

/** 拆除返还比例 */
export const DEMOLISH_REFUND = 0.5;

/** 格式化升级/拆除消耗（只有金币） */
export function formatUpgradeCost(costCoin: number, _costMaterials?: MaterialCost): string {
  return costCoin > 0 ? `${costCoin} 金币` : '无';
}
