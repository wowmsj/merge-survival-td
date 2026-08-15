import { IGameState, IItemData, ItemStatus } from '../types';
import { getProp, PROP_IDS } from '../config/PropConfig';
import { getFreeBagSlotCount } from '../config/TableConfig';
import { now } from '../utils/Common';

/**
 * 创建棋盘物品实例（对应源项目 initRoomData）
 *
 * @param id 物品配置 id
 * @param st 封印状态（蜘蛛网/纸箱），正常物品不传
 * @param clickPropId 指定点击产出队列
 * @param state 传入时会处理「该发射器全存档首次生成」的指定产出注入（propCounts 计数）
 */
export function createItemFromConfig(
  id: number,
  st?: ItemStatus,
  clickPropId?: number[],
  state?: IGameState
): IItemData {
  const propRow = getProp(id);
  if (!propRow) {
    console.error('道具数据找不到，id:' + id);
  }

  const item: IItemData = { id };

  if (clickPropId && clickPropId.length > 0) {
    item.clickPropId = [...clickPropId];
  }

  // 首次生成指定点击产出队列（每个存档每个发射器 id 只注入一次）
  if (propRow && propRow.clickPropId && state) {
    const count = state.propCounts[id] || 0;
    if (count === 0) {
      const preset = propRow.clickPropId as number[];
      item.clickPropId = (item.clickPropId || []).concat(preset);
      state.propCounts[id] = count + 1;
    }
  }

  // 背包不会被蜘蛛网包住
  let realSt = st;
  if (id === PROP_IDS.bag && realSt === ItemStatus.Spider) {
    realSt = undefined;
  }

  if (realSt && realSt > 0) {
    // 被封印的物品不初始化次数/cd
    item.st = realSt;
    return item;
  }

  if (propRow) {
    if (propRow.anc && propRow.times > 0 && propRow.mdt !== 1) {
      // 手动点击次数（mdt=1 解锁型发射器初始锁定，解锁倒计时结束后才恢复次数）
      item.times = propRow.times;
    }

    if (propRow.kishu > 0) {
      // 自动生成次数，首次只生成一个（源项目行为）
      item.timesAuto = 1;
    }

    if (id === PROP_IDS.bag) {
      // 背包，初始化免费格子
      const freeCount = getFreeBagSlotCount();
      item.roomArr = new Array(freeCount).fill(null);
    }

    if (propRow.lock) {
      // 初始即处于 cd 状态
      item.cd = now() + propRow.milo * 1000;
      item.cdSum = propRow.milo * 1000;
    }
  }

  return item;
}

/** 物品是否被气泡罩住 */
export function itemIsBubble(item: IItemData | null, timestamp?: number): boolean {
  if (!item || !item.cdBubble) return false;
  return (timestamp ?? now()) <= item.cdBubble;
}

/** 物品是否被纸箱/蜘蛛网封印 */
export function itemIsSealed(item: IItemData | null): boolean {
  if (!item) return false;
  return item.st === ItemStatus.Carton || item.st === ItemStatus.Spider;
}

/** 物品是否处于点击冷却中（cdSum > 0 表示冷却展示状态） */
export function itemInCd(item: IItemData | null): boolean {
  return !!item && (item.cdSum ?? 0) > 0;
}

/** 物品是否完全正常（无封印、无气泡） */
export function itemIsNormal(item: IItemData | null, timestamp?: number): boolean {
  if (!item) return false;
  if (itemIsSealed(item)) return false;
  if (itemIsBubble(item, timestamp)) return false;
  return true;
}

/** 物品是否可拖动（气泡/纸箱不可拖；蜘蛛网可拖，拖到同 id 可解封合成） */
export function itemCanDrag(item: IItemData | null, timestamp?: number): boolean {
  if (!item) return false;
  if (itemIsBubble(item, timestamp)) return false;
  if (item.st === ItemStatus.Carton) return false; // 纸箱完全封印不可拖
  return true; // 蜘蛛网可拖，作为源拖到同 id 上解封
}
