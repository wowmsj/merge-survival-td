import { getBuildingConfig } from '../config/BuildingConfig';
import { getMergeChain } from '../config/PropConfig';
import { IGameState } from '../types';
import { EconomySystem } from './EconomySystem';

export interface IBlackMarketItem {
  cfgId: number;
  /** 直接出售的完整蓝图（建筑 blueprint 字段，合成链满级） */
  blueprintId: number;
  star: number;
}

/** 合成一张完整蓝图所需的一级碎片数（链长 4 → 8 枚） */
function blueprintFragmentNeed(blueprintId: number): number {
  return 2 ** Math.max(0, getMergeChain(blueprintId).length - 1);
}

// ponytail: fixed stock; recommendation only changes the existing card order.
// 改卖完整蓝图：按「1 星 = 1 枚一级碎片」定价（8 枚碎片 = 原 2 星碎片包 × 8），现货免合成含溢价
// 减速沼泽例外：一次性陷阱、白天下金币修复即可补充，按玩家要求特价 5 星
export const BLACK_MARKET_ITEMS: IBlackMarketItem[] = [
  [209, 3], [208, 3], [102, 3], [202, 3], [301, 2], [103, 3], [104, 3], [205, 3], [206, 3], [207, 3], [302, 3], [303, 2], [402, 3], [403, 4], [210, 4]
].map(([cfgId, star]) => {
  const blueprintId = getBuildingConfig(cfgId)?.blueprint ?? 0;
  return { cfgId, blueprintId, star: cfgId === 303 ? 5 : Math.max(1, star * blueprintFragmentNeed(blueprintId)) };
});

const MARKET_RECOMMENDATIONS: { day: number; cfgId: number }[] = [
  { day: 4, cfgId: 303 },
  { day: 8, cfgId: 209 },
  { day: 12, cfgId: 103 },
  { day: 16, cfgId: 302 },
  { day: 20, cfgId: 209 },
  { day: 24, cfgId: 402 },
  { day: 28, cfgId: 403 }
];

export function getRecommendedMarketItem(day: number): IBlackMarketItem | undefined {
  const available = MARKET_RECOMMENDATIONS.filter(entry => entry.day <= day);
  const recommendation = available[available.length - 1];
  return BLACK_MARKET_ITEMS.find(item => item.cfgId === recommendation?.cfgId);
}

const economy = new EconomySystem();
export const DIAMOND_TO_COIN_RATE = 100;

export function buyBlackMarketBlueprint(state: IGameState, cfgId: number): { ok: boolean; item?: IBlackMarketItem } {
  const item = BLACK_MARKET_ITEMS.find(entry => entry.cfgId === cfgId);
  if (!item || !item.blueprintId || !economy.subResource(state, 'star', item.star)) return { ok: false };
  economy.giveItemToBoardOrCard(state, item.blueprintId);
  return { ok: true, item };
}

export function exchangeDiamondForCoins(state: IGameState): boolean {
  if (!economy.subResource(state, 'diamond', 1)) return false;
  economy.addResource(state, 'coin', DIAMOND_TO_COIN_RATE);
  return true;
}

/** 黑市直购的订单急缺材料 */
export interface INeededMaterial {
  id: number;
  /** 进行中订单总共需要的件数 */
  need: number;
  /** 星星单价（每件） */
  star: number;
}

/**
 * 当前进行中订单的目标材料（按 id 去重、数量累加），供黑市「星星直购」。
 * 定价沿用蓝图惯例「1 星 = 1 个一级材料的合成工作量」：L 级物品 = 2^(L-1) 星。
 * 订单星星奖励 ~log2(工作量)，远低于直购价，不会形成「买材料交订单刷星星」的循环。
 * 贵的（瓶颈）排前面。
 */
export function getNeededMaterials(state: IGameState): INeededMaterial[] {
  const map = new Map<number, number>();
  for (const task of state.tasks) {
    for (const need of task.propArr) {
      map.set(need.id, (map.get(need.id) ?? 0) + need.num);
    }
  }
  const list: INeededMaterial[] = [];
  for (const [id, need] of map) {
    const chain = getMergeChain(id);
    const levelIndex = chain.indexOf(id);
    if (levelIndex < 0) continue; // 不在合成链里的（货币/孤品）不卖
    list.push({ id, need, star: Math.max(1, 2 ** levelIndex) });
  }
  return list.sort((a, b) => b.star - a.star);
}

/** 星星直购 1 件急缺材料：扣星成功后物品进棋盘（满则进卡片列表） */
export function buyNeededMaterial(state: IGameState, id: number): boolean {
  const entry = getNeededMaterials(state).find(e => e.id === id);
  if (!entry) return false;
  if (!economy.subResource(state, 'star', entry.star)) return false;
  economy.giveItemToBoardOrCard(state, id);
  return true;
}
