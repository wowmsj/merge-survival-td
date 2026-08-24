import { getBuildingConfig } from '../config/BuildingConfig';
import { getMergeChain } from '../config/PropConfig';
import { IGameState } from '../types';
import { EconomySystem } from './EconomySystem';

export interface IBlackMarketItem {
  cfgId: number;
  fragmentId: number;
  fragmentCount: 2;
  star: number;
}

// ponytail: fixed stock; recommendation only changes the existing card order.
export const BLACK_MARKET_ITEMS: IBlackMarketItem[] = [
  [209, 3], [208, 3], [102, 3], [202, 3], [301, 2], [103, 3], [104, 3], [205, 3], [206, 3], [207, 3], [302, 3], [303, 2], [402, 3], [403, 4], [210, 4]
].map(([cfgId, star]) => {
  const blueprintId = getBuildingConfig(cfgId)?.blueprint ?? 0;
  return { cfgId, fragmentId: getMergeChain(blueprintId)[0] ?? 0, fragmentCount: 2, star };
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
  if (!item || !item.fragmentId || !economy.subResource(state, 'star', item.star)) return { ok: false };
  for (let i = 0; i < item.fragmentCount; i++) economy.giveItemToBoardOrCard(state, item.fragmentId);
  return { ok: true, item };
}

export function exchangeDiamondForCoins(state: IGameState): boolean {
  if (!economy.subResource(state, 'diamond', 1)) return false;
  economy.addResource(state, 'coin', DIAMOND_TO_COIN_RATE);
  return true;
}
