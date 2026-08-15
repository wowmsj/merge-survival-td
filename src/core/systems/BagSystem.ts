import { GameEvents, eventBus } from '../events/EventBus';
import { IGameState, IItemData, IPoint } from '../types';
import { findEmptyCell, forEachCell, getItem, setItem } from '../model/Grid';
import { itemIsBubble } from '../model/Item';
import { PROP_IDS } from '../config/PropConfig';
import { getBagGridPrice } from '../config/TableConfig';
import { now } from '../utils/Common';
import { getText } from '../i18n';

/**
 * 背包系统
 * 背包是棋盘上的特殊物品（id=401），内部 roomArr 存物品
 * 背包内 cd 暂停（入包记 putTime，取出时补偿）
 */
export class BagSystem {

  /** 找棋盘上的背包位置 */
  findBag(state: IGameState): IPoint | null {
    let found: IPoint | null = null;
    forEachCell(state.grid, (item, row, col) => {
      if (!found && item && item.id === PROP_IDS.bag) {
        found = { row, col };
      }
    });
    return found;
  }

  /** 取背包物品 */
  getBagItem(state: IGameState): IItemData | null {
    const pos = this.findBag(state);
    return pos ? getItem(state.grid, pos.row, pos.col) : null;
  }

  /**
   * 把棋盘物品放入背包
   * @returns true 成功；false 失败（背包满/背包未解锁/气泡）
   */
  putInBag(state: IGameState, src: IPoint, bagPos?: IPoint): boolean {
    const srcItem = getItem(state.grid, src.row, src.col);
    if (!srcItem) return false;

    if (itemIsBubble(srcItem, state.timestamp)) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.bagBubble'));
      return false;
    }

    const bp = bagPos || this.findBag(state);
    if (!bp) return false;
    const bagItem = getItem(state.grid, bp.row, bp.col);
    if (!bagItem || bagItem.id !== PROP_IDS.bag || !bagItem.roomArr) return false;
    if (bagItem.st) {
      // 背包还被封着
      return false;
    }

    // 从尾部找第一个空槽
    let index = -1;
    for (let i = bagItem.roomArr.length - 1; i >= 0; i--) {
      if (!bagItem.roomArr[i]) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.bagFull'));
      return false;
    }

    setItem(state.grid, src.row, src.col, null);
    srcItem.putTime = now();
    bagItem.roomArr[index] = srcItem;
    this.sortBag(bagItem);

    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: src, item: null });
    eventBus.emit(GameEvents.BAG_UPDATED, { pos: bp });
    return true;
  }

  /**
   * 从背包取出物品到棋盘首个空格
   * @returns 放置位置；失败返回 null（棋盘无空格）
   */
  takeOut(state: IGameState, index: number): IPoint | null {
    const bp = this.findBag(state);
    if (!bp) return null;
    const bagItem = getItem(state.grid, bp.row, bp.col);
    if (!bagItem || !bagItem.roomArr) return null;

    const item = bagItem.roomArr[index];
    if (!item) return null;

    const emptyPos = findEmptyCell(state.grid);
    if (!emptyPos) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.boardFull'));
      return null;
    }

    // 背包内 cd 暂停：取出时补偿
    const dt = now() - (item.putTime || now());
    if (item.cd && item.cd > 0) {
      item.cd += dt;
    }
    if (item.cdAuto && item.cdAuto > 0) {
      item.cdAuto += dt;
    }
    delete item.putTime;

    setItem(state.grid, emptyPos.row, emptyPos.col, item);
    bagItem.roomArr[index] = null;
    this.sortBag(bagItem);

    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: emptyPos, item });
    eventBus.emit(GameEvents.BAG_UPDATED, { pos: bp });
    return emptyPos;
  }

  /**
   * 背包扩容
   * @param payCoin 扣金币的回调（由 EconomySystem 提供，避免循环依赖）
   */
  addSlot(state: IGameState, payCoin: (amount: number) => boolean): boolean {
    const bagItem = this.getBagItem(state);
    if (!bagItem || !bagItem.roomArr) return false;

    const price = getBagGridPrice(bagItem.roomArr.length);
    if (price > 0 && !payCoin(price)) {
      return false;
    }
    bagItem.roomArr.push(null);
    const bp = this.findBag(state);
    eventBus.emit(GameEvents.BAG_UPDATED, { pos: bp });
    return true;
  }

  /** 背包内排序：物品按 id 升序，空槽沉底 */
  sortBag(bagItem: IItemData): void {
    if (!bagItem.roomArr) return;
    const items: IItemData[] = [];
    let emptyCount = 0;
    for (const it of bagItem.roomArr) {
      if (it && it.id) {
        items.push(it);
      } else {
        emptyCount++;
      }
    }
    items.sort((a, b) => a.id - b.id);
    bagItem.roomArr = [...items, ...new Array(emptyCount).fill(null)];
  }
}
