/**
 * 核心类型定义
 * 注意：本文件及 @core 目录下所有代码不依赖 Phaser，可移植到任何平台
 *
 * 玩法逻辑移植自 Cocos 项目 composeModel.ts（二合玩法）
 */

/** 二维坐标 */
export interface IPoint {
  row: number;
  col: number;
}

/** 格子封印状态（气泡不是 st，而是 cdBubble 时间戳判定） */
export enum ItemStatus {
  Normal = 0,
  Spider = 1,    // 蜘蛛网包裹（不可交换，可与相同物品合成解开）
  Carton = 2,    // 纸箱包裹（不可交换，被合成时的十字邻居戳破变蜘蛛网）
}

/**
 * 棋盘物品实例（对应源项目 roomData）
 * 所有 cd 字段存「到期时间戳（毫秒）」，离线/跨设备天然兼容
 */
export interface IItemData {
  /** 配置表 id（等级编码在 id 链条里：blessId = 合成结果） */
  id: number;
  /** 封印状态：1 蜘蛛网 / 2 纸箱；正常时无此字段 */
  st?: ItemStatus;
  /** 发射器剩余点击次数 */
  times?: number;
  /** 有限蓝图发射器已成功放入棋盘的碎片数 */
  spawnedCount?: number;
  /** 点击冷却到期时间戳 */
  cd?: number;
  /** 冷却总时长（ms），UI 进度条分母；>0 表示处于冷却展示状态 */
  cdSum?: number;
  /** 自动生成剩余次数（首次生成为 1，cd 恢复后为配表 kishu） */
  timesAuto?: number;
  /** 自动生成冷却到期时间戳 */
  cdAuto?: number;
  /** 气泡到期时间戳；存在且未到期即被气泡罩住 */
  cdBubble?: number;
  /** 指定的点击产出队列（优先于权重随机，shift 消费） */
  clickPropId?: number[];
  /** 背包内部格子（仅 id=401 的背包物品） */
  roomArr?: (IItemData | null)[];
  /** 放入背包的时间戳（背包内 cd 暂停） */
  putTime?: number;
  /** 解锁型道具（mdt=1）：1 = 已开始解锁倒计时 */
  unlock?: number;
  /** 加速装置（mdt=11）上次 tick 时间戳 */
  startTime?: number;
  /** 不受「减 cd 道具」影响 */
  notSubCd?: boolean;
}

/** 单个格子 */
export interface ICell {
  item: IItemData | null;
}

/** 棋盘（9 行 × 7 列） */
export interface IGrid {
  rowNum: number;
  colNum: number;
  cells: ICell[][];
}

/** 资源/货币 + 生存基础资源（电力不落资源字段，由发电机实时计算，见 BaseSystem.getPowerInfo） */
export interface IResource {
  coin: number;
  diamond: number;
  power: number;   // 棋盘行动体力
  exp: number;     // 玩家等级经验
  star: number;    // 任务/剧情奖励，用于外层建造解锁
  medicine: number;// 药品（修复/治疗消耗）
  scrap: number;   // 废料（工坊修复、合成低级原料）
  fuel: number;    // 燃料（全局燃料池：电池转化获得，每台发电机每小时消耗 1）
  medicineMax: number;
}

/** 建筑产出资源类型（与 IResource 中基础资源对应，不含货币/体力） */
export type BaseResource = 'medicine' | 'scrap';

/** 建筑大类 */
export type BuildingKind = 'core' | 'tower' | 'resource' | 'trap' | 'wall' | 'ruin';

/** 基地建筑实例 */
export interface IBuilding {
  /** building.json 配置 id */
  cfgId: number;
  /** 等级 1~3 */
  level: number;
  hp: number;
  maxHp: number;
  row: number;
  col: number;
  /** 资源建筑上次产出结算时间戳（离线产出兼容） */
  lastProduceAt?: number;
}

/** 基地单格状态；claimed=false 的区域只可探索，不能直接建造。 */
export interface IBaseTile {
  claimed: boolean;
}

/**
 * 英雄状态（剧情加入堡垒的 NPC，可部署到内圈空格协防）
 * 独立列表，不占 buildings[]、不耗电、不会死、不挡僵尸路
 */
export interface IHeroState {
  /** 英雄配置 key（hero.json） */
  key: string;
  /** 部署行；row=-1 表示未部署（已加入但未上场） */
  row: number;
  /** 部署列 */
  col: number;
  /** 当前生命；旧存档缺失时加载或首次使用会按英雄配置补齐 */
  hp?: number;
  /** 最大生命；旧存档缺失时加载或首次使用会按英雄配置补齐 */
  maxHp?: number;
  /** 重伤剩余白天数；存在时不能部署 */
  recoveryDays?: number;
}

/** 基地状态 */
export interface IBaseState {
  rows: number;
  cols: number;
  tiles: IBaseTile[][];
  buildings: IBuilding[];
}

/** 任务（订单） */
export interface ITask {
  id: number;
  /** 需要的物品 */
  propArr: { id: number; num: number }[];
  /** 奖励星星数 */
  starNum: number;
  /** 奖励金币数（旧存档无此字段，领奖时按 calcTaskGold 兜底） */
  goldNum?: number;
  /** 1 = 新手引导任务（完成后链式生成下一条） */
  hand?: number;
  /** 额外物品奖励（货币直接入账，其余进卡片列表） */
  rewardPropArr?: { id: number; num: number }[];
}

/** 全局游戏状态 */
export interface IGameState {
  language: Language;
  grid: IGrid;
  resources: IResource;
  tasks: ITask[];
  /** 卡片列表（道具 id 数组） */
  cardArr: number[];
  roleLv: number;
  /** 新手引导步骤，从 1 开始；超出 handData 长度即引导完成 */
  handIndex: number;
  /** 无限能量到期时间戳 */
  powerFreeUntil: number;
  /** 各发射器已生成次数（用于首次指定产出 clickPropId 注入） */
  propCounts: Record<number, number>;
  /** 基地（生存建造） */
  base: IBaseState;
  /** 天数（生存建造），从 1 开始 */
  day: number;
  /** 昼夜阶段：白天建造合成 / 夜晚防守（夜晚为瞬态战斗，中途退出重置为白天） */
  phase: 'day' | 'night';
  /** 已播放的剧情 beat id */
  storySeen: number[];
  /** 已领取过道具奖励的剧情 beat id，防止剧情回顾和旧档补发重复投放 */
  storyRewardClaims: number[];
  /** 已解锁的建筑 cfgId 列表（合成出对应 Lv4 蓝图即永久解锁） */
  unlockedBuildings: number[];
  /** 重复蓝图库存（建筑 cfgId → 张数）：已解锁建筑再用蓝图时入库，升级建筑消耗 1 张 */
  blueprintStock: Record<number, number>;
  /** 已加入堡垒的英雄（剧情 beat 播完入队；row=-1 未部署） */
  heroes: IHeroState[];
  /** 行动力上次恢复结算的时间戳；旧存档缺失时回退 timestamp。 */
  powerRecoverAt?: number;
  timestamp: number;
}

/** 移动/合成结果 */
export interface IMergeResult {
  success: boolean;
  /** 结果类型 */
  kind: 'none' | 'move' | 'swap' | 'merge' | 'bag' | 'charger' | 'split' | 'lvup' | 'bounce';
  src: IPoint;
  target: IPoint;
  /** 合成后的新物品 */
  newItem: IItemData | null;
  /** 被十字戳破的纸箱列表 */
  cartonBreaks: IPoint[];
}

/** 出售结果（用于撤销） */
export interface ISellResult {
  item: IItemData;
  coin: number;
  pos: IPoint;
}
import type { Language } from './i18n/types';
