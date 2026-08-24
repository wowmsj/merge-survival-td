import { GameEvents, eventBus } from '../events/EventBus';
import { getProp, isMergeChainTop, propGoesToCardList, propIdToResourceKey } from '../config/PropConfig';
import { IGameState, IPoint, IResource, ISellResult } from '../types';
import { findEmptyCell, getItem, setItem } from '../model/Grid';
import { createItemFromConfig, itemIsNormal } from '../model/Item';
import { getText } from '../i18n';
import { getPowerMax } from '../config/TableConfig';

/**
 * 经济系统
 * 资源增减、addPropNum 分发（货币类直接入账，其余进卡片列表）、出售/撤销、卡片使用
 */
/** 存在上限的资源（基础生存资源），新增时不可超过对应的 Max 上限 */
const CAPPED_RESOURCES: (keyof IResource)[] = ['medicine'];

/** 扣减资源 toast 用的中文名（未列出的资源回退显示 key） */
/*
  coin: '金币',
  diamond: '钻石',
  power: '行动力'
*/

export class EconomySystem {

  /** 每完整五分钟自然恢复一点行动力，满体时不积攒恢复时间。 */
  recoverPower(state: IGameState, currentTime: number = Date.now()): void {
    const last = state.powerRecoverAt ?? state.timestamp ?? currentTime;
    if (currentTime <= last) return;

    const max = getPowerMax(state);
    if (state.resources.power >= max) {
      state.powerRecoverAt = currentTime;
      return;
    }

    const recovered = Math.floor((currentTime - last) / (5 * 60 * 1000));
    if (recovered <= 0) return;

    const amount = Math.min(recovered, max - state.resources.power);
    state.resources.power += amount;
    state.powerRecoverAt = amount < recovered ? currentTime : last + recovered * 5 * 60 * 1000;
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power, delta: amount });
  }

  /** 增加资源（基础资源受上限限制） */
  addResource(state: IGameState, type: keyof IResource, amount: number): void {
    state.resources[type] += amount;
    if (CAPPED_RESOURCES.includes(type)) {
      const maxKey = `${type}Max` as keyof IResource;
      const max = (state.resources[maxKey] || 0) as number;
      if (state.resources[type] > max) state.resources[type] = max;
    }
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type, value: state.resources[type], delta: amount });
  }

  /** 扣减资源（不足时 toast 并返回 false） */
  subResource(state: IGameState, type: keyof IResource, amount: number): boolean {
    if (state.resources[type] < amount) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.resourceShort', { resource: getText(`resource.${type}`) }));
      return false;
    }
    state.resources[type] -= amount;
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type, value: state.resources[type], delta: -amount });
    return true;
  }

  /** 消耗行动力（原体力，建造/升级/修复等操作用；不足时 toast 并返回 false） */
  usePower(state: IGameState, amount: number): boolean {
    if (state.resources.power < amount) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.powerShort'));
      return false;
    }
    state.resources.power -= amount;
    eventBus.emit(GameEvents.RESOURCE_CHANGED, { type: 'power', value: state.resources.power, delta: -amount });
    return true;
  }

  /**
   * 获得道具（对应源项目 addPropNum）
   * 货币/资源类（type 100~199 或 27）直接入账；其余进卡片列表
   */
  addPropNum(state: IGameState, propId: number, num: number = 1): void {
    if (propGoesToCardList(propId)) {
      for (let i = 0; i < num; i++) {
        state.cardArr.push(propId);
      }
      eventBus.emit(GameEvents.CARD_UPDATED, { cards: state.cardArr });
      return;
    }
    const resKey = propIdToResourceKey(propId);
    if (resKey) {
      this.addResource(state, resKey, num);
    } else {
      // 既不进卡片列表也拿不到资源 key（配表 type 异常）→ 防静默丢物
      console.warn(`addPropNum: 道具 ${propId} 无入账渠道，已忽略 x${num}`);
    }
  }

  /** 查询道具数量（货币类查资源，其余查卡片列表） */
  getPropNum(state: IGameState, propId: number): number {
    const resKey = propIdToResourceKey(propId);
    if (resKey) return state.resources[resKey];
    let count = 0;
    for (const id of state.cardArr) {
      if (id === propId) count++;
    }
    return count;
  }

  /** 出售格子上的物品，返回撤销数据 */
  sellItem(state: IGameState, pos: IPoint): ISellResult | null {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return null;
    if (!itemIsNormal(item, state.timestamp)) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.cannotSell'));
      return null;
    }

    const prop = getProp(item.id);
    const coin = prop?.levelGold || 0;
    if ((!prop?.she && !isMergeChainTop(item.id)) || coin <= 0) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.cannotSell'));
      return null;
    }

    setItem(state.grid, pos.row, pos.col, null);
    this.addPropNum(state, 101, coin);
    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });

    return { item, coin, pos };
  }

  /** 撤销出售 */
  sellBack(state: IGameState, sellData: ISellResult): IPoint | null {
    if (!this.subResource(state, 'coin', sellData.coin)) {
      return null;
    }

    // 优先放回原位，其次首个空格，最后进卡片列表
    const originItem = getItem(state.grid, sellData.pos.row, sellData.pos.col);
    if (!originItem) {
      setItem(state.grid, sellData.pos.row, sellData.pos.col, sellData.item);
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: sellData.pos, item: sellData.item });
      return sellData.pos;
    }
    const emptyPos = findEmptyCell(state.grid);
    if (emptyPos) {
      setItem(state.grid, emptyPos.row, emptyPos.col, sellData.item);
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: emptyPos, item: sellData.item });
      return emptyPos;
    }
    this.addPropNum(state, sellData.item.id, 1);
    return null;
  }

  /**
   * 发放道具：放到棋盘首个空格；棋盘满则进卡片列表（卡片无上限）
   * 用于夜晚战利品、资源建筑产出等系统发放入口
   */
  giveItemToBoardOrCard(state: IGameState, propId: number): void {
    const emptyPos = findEmptyCell(state.grid);
    if (!emptyPos) {
      state.cardArr.push(propId);
      eventBus.emit(GameEvents.CARD_UPDATED, { cards: state.cardArr });
      return;
    }
    const item = createItemFromConfig(propId, undefined, undefined, state);
    setItem(state.grid, emptyPos.row, emptyPos.col, item);
    eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: null, newPositions: [emptyPos], isAuto: true });
  }

  /**
   * 从卡片列表取出一张卡放到棋盘首个空格（取列表末尾的，对应源项目 UI 行为）
   */
  useCard(state: IGameState, index: number = 0): IPoint | null {
    if (state.cardArr.length <= 0) return null;

    const emptyPos = findEmptyCell(state.grid);
    if (!emptyPos) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.boardFull'));
      return null;
    }

    if (index < 0 || index >= state.cardArr.length) return null;
    const id = state.cardArr.splice(index, 1)[0];
    const item = createItemFromConfig(id, undefined, undefined, state);
    setItem(state.grid, emptyPos.row, emptyPos.col, item);

    eventBus.emit(GameEvents.CARD_UPDATED, { cards: state.cardArr });
    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: emptyPos, item });
    return emptyPos;
  }
}
