import { getBuildingConfig } from '../config/BuildingConfig';
import { IGameState } from '../types';
import { EconomySystem } from './EconomySystem';

export interface IBlackMarketItem {
  cfgId: number;
  blueprintId: number;
  star: number;
}

// ponytail: fixed starter stock; add rotating stock only when progression needs it.
export const BLACK_MARKET_ITEMS: IBlackMarketItem[] = [
  [102, 6], [202, 6], [301, 6], [103, 10], [104, 10], [205, 8], [206, 8], [207, 8], [302, 8], [303, 10], [402, 10], [403, 14]
].map(([cfgId, star]) => ({ cfgId, blueprintId: getBuildingConfig(cfgId)?.blueprint ?? 0, star }));

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
