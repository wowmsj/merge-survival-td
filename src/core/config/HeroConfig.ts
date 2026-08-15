/**
 * 英雄配置表访问层
 * 英雄 = 剧情中加入堡垒的 NPC，可部署到基地内圈空格协防（夜战自动攻击）
 *
 * 注意：本表是「英雄（NPC）」数值表，与玩家等级表 herolevel_table（TableConfig）无关，
 * 命名上刻意用 hero 而非 role/level，避免混淆。
 *
 * 数值设计见 SURVIVAL_BUILD_DESIGN.md / 英雄系统方案：
 * 英雄 DPS 略低于同级箭塔（箭塔 14 攻 × 1/秒），定位是核心前最后一道补漏防线，
 * 不挡僵尸路、不被僵尸攻击、不耗电、不会死亡。
 */

import heroJson from './data/hero.json';

export interface IHeroConfig {
  /** 角色 key（对应 StoryConfig.STORY_CHARACTERS 与立绘纹理 char-<key>） */
  key: string;
  name: string;
  /** 每次攻击伤害（夜战 dmg = max(1, attack - 僵尸防御)） */
  attack: number;
  /** 射程（切比雪夫距离，格） */
  range: number;
  /** 攻速（次/秒），攻击冷却 = 1000/speed 毫秒 */
  speed: number;
  /** 弹道特效颜色（十六进制数，表现层画弹道用） */
  fxColor: number;
  /** 一句简介 */
  desc: string;
}

const HERO_TABLE = heroJson as unknown as IHeroConfig[];
const HERO_MAP: Map<string, IHeroConfig> = new Map(HERO_TABLE.map(h => [h.key, h]));

export function getHeroConfig(key: string): IHeroConfig | undefined {
  return HERO_MAP.get(key);
}

/** 全部英雄配置（建造栏「英雄」页列表用） */
export function getAllHeroConfigs(): IHeroConfig[] {
  return HERO_TABLE;
}
