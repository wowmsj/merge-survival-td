/**
 * 僵尸配置表访问层 + 夜晚波次生成
 * 数值设计见 SURVIVAL_BUILD_DESIGN.md 6.5
 *
 * 波次规则：第 N 天 = 3 + floor((N-1)/4) 波；每波数量 2 + N + 波序；每 5 天最后一波出 Boss。
 * 等级规则：僵尸等级每 2 天 +1（1~2 天 Lv1，3~4 Lv2 ……封顶 Lv8），
 * 血量 ×(1+0.4×(Lv-1))、攻击 ×(1+0.2×(Lv-1))。第一夜全是 Lv1 僵尸，一座箭塔即可守住。
 */

import { MaterialCost } from './BuildingConfig';
import zombieJson from './data/zombie.json';
import { getRandomByWeight } from '../utils/Common';

/** 怪物移动方式：走路（地面）/ 飞行 / 钻地 */
export type ZombieMoveType = 'ground' | 'fly' | 'burrow';

export interface IZombieConfig {
  id: number;
  name: string;
  hp: number;
  /** 移动速度（格/秒） */
  speed: number;
  /** 对建筑每次攻击伤害 */
  attack: number;
  /** 防御：每次受击减免的伤害（最低掉 1 血） */
  defense: number;
  /** 攻击间隔（毫秒） */
  attackInterval: number;
  /**
   * 移动方式：
   *   ground 走路——被建筑阻挡、触发陷阱（默认）
   *   fly    飞行——无视非核心建筑与陷阱，直扑核心；塔可正常攻击
   *   burrow 钻地——潜行时不可被塔索敌、无视建筑与陷阱，距核心 ≤2 格钻出地面
   */
  moveType: ZombieMoveType;
  /** 显示色 */
  color: number;
  /** 出现起始天数 */
  minDay: number;
  /** 抽取权重（0 = 不随机出现，如 Boss） */
  weight: number;
  /**
   * 拆迁等级：只能拆「坚固等级 sturdy ≤ 该值」的建筑（默认 0）。
   * 初级僵尸(0)拆不动废墟/木墙，坦克/自爆/钻地(1)拆废墟+木墙，精英(2)拆石墙，Boss(3)拆铁墙。
   * 被拆不动的建筑卡住 15 秒会狂暴（无视坚固等级），防止夜战死锁。
   */
  demolish?: number;
  /** 死亡时自爆伤害（波及 1 格范围建筑） */
  explode?: number;
  /** 掉落池：低级材料 id 列表（合成链 1~2 级，留给玩家往上合），死亡时随机取 dropMin~dropMax 份；重复 id = 提高权重（如普通僵尸的旧保温箱×2） */
  dropPool: number[];
  dropMin: number;
  dropMax: number;
}

const ZOMBIE_TABLE = zombieJson as unknown as IZombieConfig[];
const ZOMBIE_MAP: Map<number, IZombieConfig> = new Map(ZOMBIE_TABLE.map(z => [z.id, z]));

export const ZOMBIE_IDS = { normal: 1, fast: 2, tank: 3, bomber: 4, elite: 5, boss: 6, fly: 7, burrow: 8 } as const;

interface IThreatStage {
  day: number;
  ids: number[];
  debut?: number;
}

// ponytail: one table drives both preview and spawning; add route-specific pools only when routes need distinct enemies.
const THREAT_STAGES: IThreatStage[] = [
  { day: 1, ids: [ZOMBIE_IDS.normal] },
  { day: 4, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast], debut: ZOMBIE_IDS.fast },
  { day: 8, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly], debut: ZOMBIE_IDS.fly },
  { day: 12, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly, ZOMBIE_IDS.tank], debut: ZOMBIE_IDS.tank },
  { day: 16, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly, ZOMBIE_IDS.tank, ZOMBIE_IDS.bomber], debut: ZOMBIE_IDS.bomber },
  { day: 20, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly, ZOMBIE_IDS.tank, ZOMBIE_IDS.bomber, ZOMBIE_IDS.burrow], debut: ZOMBIE_IDS.burrow },
  { day: 24, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly, ZOMBIE_IDS.tank, ZOMBIE_IDS.bomber, ZOMBIE_IDS.burrow, ZOMBIE_IDS.elite], debut: ZOMBIE_IDS.elite },
  { day: 28, ids: [ZOMBIE_IDS.normal, ZOMBIE_IDS.fast, ZOMBIE_IDS.fly, ZOMBIE_IDS.tank, ZOMBIE_IDS.bomber, ZOMBIE_IDS.burrow, ZOMBIE_IDS.elite] }
];

function getThreatStage(day: number): IThreatStage {
  const available = THREAT_STAGES.filter(stage => stage.day <= day);
  return available[available.length - 1] ?? THREAT_STAGES[0];
}

function isBossNight(day: number): boolean {
  return day >= 28 && (day - 28) % 7 === 0;
}

export function getZombieConfig(id: number): IZombieConfig | undefined {
  return ZOMBIE_MAP.get(id);
}

/** 全部僵尸配置。 */
export function getAllZombieConfigs(): IZombieConfig[] {
  return ZOMBIE_TABLE;
}

/** 第 N 天总波次：每 4 天 +1 波，压力更持续 */
export function getTotalWaves(day: number): number {
  return 3 + Math.floor((day - 1) / 4);
}

/** 第 N 天僵尸等级：每 2 天 +1（1~2 天 Lv1，3~4 Lv2，5~6 Lv3 ……封顶 Lv8） */
export function getZombieLevel(day: number): number {
  return Math.min(8, 1 + Math.floor((day - 1) / 4));
}

/** 僵尸血量等级系数：×(1 + 0.4×(Lv-1)) */
export function getLevelHpScale(level: number): number {
  return 1 + 0.25 * (level - 1);
}

/** 僵尸攻击等级系数：×(1 + 0.2×(Lv-1)) */
export function getLevelAttackScale(level: number): number {
  return 1 + 0.12 * (level - 1);
}

/**
 * 生成某一波的僵尸 id 队列
 * @param wave 从 1 开始
 */
export function genWaveZombies(day: number, wave: number, totalWaves: number): number[] {
  const stage = getThreatStage(day);
  const debutNight = stage.day === day && !!stage.debut;
  const scale = day >= 4 ? 2 : 1;
  const count = Math.max(2, Math.floor((2 + Math.ceil(day * 0.6) + wave) * scale * (debutNight ? 0.8 : 1)));
  const pool = stage.ids.map(id => ZOMBIE_MAP.get(id)).filter((z): z is IZombieConfig => !!z);

  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(getRandomByWeight(pool)?.id ?? ZOMBIE_IDS.normal);
  }

  // 最后一波保底一个精英（第 3 天起）；每 5 天最后一波出 Boss
  if (stage.debut && stage.day === day) result[result.length - 1] = stage.debut;
  if (wave === totalWaves && isBossNight(day)) result.push(ZOMBIE_IDS.boss);
  return result;
}

/** 按掉落池随机一份掉落（材料 id -> 数量） */
export function rollDrops(cfg: IZombieConfig): MaterialCost {
  const out: MaterialCost = {};
  if (cfg.id === ZOMBIE_IDS.elite) out[1003] = 1;
  if (cfg.id === ZOMBIE_IDS.boss) out[1005] = 1;
  if (!cfg.dropPool || cfg.dropPool.length === 0) return out;
  const n = cfg.dropMin + Math.floor(Math.random() * (cfg.dropMax - cfg.dropMin + 1));
  for (let i = 0; i < n; i++) {
    const id = cfg.dropPool[Math.floor(Math.random() * cfg.dropPool.length)];
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

/** 夜战预告里的单个敌人类型 */
export interface INightPreviewType {
  id: number;
  name: string;
  color: number;
  /** 特性标签，如「飞行」「自爆」「拆铁墙」 */
  tag: string;
  /** 末波保底出现（精英/Boss），区别于随机池 */
  guaranteed?: boolean;
}

/** 夜战预告（「迎接夜晚」确认弹窗用） */
export interface INightPreview {
  /** 总波次 */
  waves: number;
  /** 僵尸总数（含末波保底精英/Boss） */
  total: number;
  /** 今晚僵尸等级（随天数提升，血量/攻击按等级加成） */
  level: number;
  /** 今晚可能出现的类型（随机池 + 末波保底） */
  types: INightPreviewType[];
  /** 末波保底精英（第 3 天起、非 Boss 夜） */
  eliteLast: boolean;
  /** 末波出 Boss（每 5 天） */
  bossLast: boolean;
}

/** 僵尸特性标签 */
function zombieTag(z: IZombieConfig): string {
  const tags: string[] = [];
  if (z.moveType === 'fly') tags.push('飞行');
  if (z.moveType === 'burrow') tags.push('钻地');
  if (z.explode) tags.push('自爆');
  const d = z.demolish ?? 0;
  if (d >= 3) tags.push('拆铁墙');
  else if (d === 2) tags.push('拆石墙');
  else if (d === 1) tags.push('拆木墙');
  if (z.defense >= 5) tags.push('高防');
  return tags.join('·');
}

/** 第 N 天夜战预告：波次/总数/类型（类型为随机池，实际每波按权重抽取） */
export function getNightPreview(day: number): INightPreview {
  const waves = getTotalWaves(day);
  const stage = getThreatStage(day);
  let total = 0;
  for (let w = 1; w <= waves; w++) total += genWaveZombies(day, w, waves).length;
  const bossLast = isBossNight(day);
  const eliteLast = false;
  const types: INightPreviewType[] = stage.ids
    .map(id => ZOMBIE_MAP.get(id))
    .filter((z): z is IZombieConfig => !!z)
    .map(z => ({ id: z.id, name: z.name, color: z.color, tag: zombieTag(z) }));
  if (bossLast) {
    const boss = ZOMBIE_MAP.get(ZOMBIE_IDS.boss);
    if (boss && !types.some(t => t.id === boss.id)) {
      types.push({ id: boss.id, name: boss.name, color: boss.color, tag: zombieTag(boss), guaranteed: true });
    }
  } else if (eliteLast) {
    const elite = ZOMBIE_MAP.get(ZOMBIE_IDS.elite);
    if (elite && !types.some(t => t.id === elite.id)) {
      types.push({ id: elite.id, name: elite.name, color: elite.color, tag: zombieTag(elite), guaranteed: true });
    } else {
      const t = types.find(t => t.id === ZOMBIE_IDS.elite);
      if (t) t.guaranteed = true;
    }
  }
  return { waves, total, level: getZombieLevel(day), types, eliteLast, bossLast };
}
