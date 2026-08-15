import { GameEvents, eventBus } from '../events/EventBus';
import { canChargerTarget, canLvUpTarget, canSplitTarget, getProp, isClickSpecialProp } from '../config/PropConfig';
import { getConfigValue } from '../config/TableConfig';
import { IGameState, IPoint } from '../types';
import { findEmptyCell, forEachCell, getItem, setItem } from '../model/Grid';
import { createItemFromConfig, itemIsBubble, itemIsNormal } from '../model/Item';
import { EconomySystem } from './EconomySystem';
import { now } from '../utils/Common';
import { getText } from '../i18n';

/**
 * 特殊道具系统（mdt 1~11）
 *   1  解锁型：点击开始 p1 秒解锁倒计时（全场同时只能解锁一个）
 *   2  无限能量：点击后 p1 秒内点发射器不耗体力
 *   3  充能器：拖到可充能发射器，目标 times += p1
 *   4  拆分器：拖到可拆分物品，目标降一级并在空格复制一个
 *   5  全屏减 cd：点击后全场 cd/cdAuto 减 p1 小时
 *   6~10 升级卡：拖到匹配物品，目标升一级
 *   11 加速装置：点击启动 p1 小时，期间每 tick 减九宫邻居的 cd/cdAuto
 * 另有 clickAwardId > 0 的物品：点击直接领奖消失
 */
export class SpecialItemSystem {
  private economy: EconomySystem;

  constructor(economy: EconomySystem) {
    this.economy = economy;
  }

  /** 该物品是否是「点击触发」的特殊道具（mdt 1/2/5/11 或 clickAward） */
  isClickSpecial(id: number): boolean {
    return isClickSpecialProp(id);
  }

  /**
   * 点击特殊道具
   * @returns true 已处理（UI 不再走发射器逻辑）
   */
  clickSpecial(state: IGameState, pos: IPoint): boolean {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return false;
    const prop = getProp(item.id);
    if (!prop) return false;

    // 点击直接领奖
    if (prop.clickAwardId > 0) {
      this.economy.addPropNum(state, prop.clickAwardId, prop.clickAwardNum || 1);
      setItem(state.grid, pos.row, pos.col, null);
      eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });
      return true;
    }

    switch (prop.mdt) {
      case 1:
        return this.clickUnlock(state, pos);
      case 2: {
        // 无限能量
        state.powerFreeUntil = now() + prop.p1 * 1000;
        setItem(state.grid, pos.row, pos.col, null);
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });
        eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.unlimitedEnergy', { seconds: prop.p1 }));
        return true;
      }
      case 5:
        return this.clickReduceCd(state, pos);
      case 11: {
        // 加速装置：启动计时（已在计时则忽略）
        if (!item.cd) {
          const duration = prop.p1 * 60 * 60 * 1000;
          item.startTime = now();
          item.cd = now() + duration;
          item.cdSum = duration;
          item.notSubCd = true;
          eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
          eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.acceleratorStarted'));
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** mdt=1 解锁型：开始解锁倒计时（全场同时只能一个） */
  private clickUnlock(state: IGameState, pos: IPoint): boolean {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return false;
    const prop = getProp(item.id);
    if (!prop) return false;

    if (item.unlock) {
      // 已经在解锁中
      return true;
    }
    // 已解锁（倒计时结束后次数已恢复）→ 不再重复解锁，按发射器处理
    if ((item.times ?? 0) > 0) return false;

    // 检查全场是否有其他正在解锁的
    let blocked = false;
    forEachCell(state.grid, (other) => {
      if (blocked) return;
      if (!other || itemIsBubble(other, state.timestamp)) return;
      const otherProp = getProp(other.id);
      if (otherProp && otherProp.mdt === 1 && other.unlock && (other.cdSum ?? 0) > 0) {
        blocked = true;
      }
    });
    if (blocked) {
      eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.oneUnlockOnly'));
      return true;
    }

    item.unlock = 1;
    item.cd = now() + prop.p1 * 1000;
    item.cdSum = prop.p1 * 1000;
    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
    return true;
  }

  /** mdt=5 全屏减 cd（p1 小时） */
  private clickReduceCd(state: IGameState, pos: IPoint): boolean {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return false;
    const prop = getProp(item.id);
    if (!prop) return false;

    const subCd = prop.p1 * 60 * 60 * 1000;
    const timestamp = now();

    forEachCell(state.grid, (cellItem, row, col) => {
      if (!cellItem) return;
      if (itemIsBubble(cellItem, timestamp)) return;
      if (!itemIsNormal(cellItem, timestamp)) return;
      if (cellItem.notSubCd) return;

      const cellProp = getProp(cellItem.id);
      if (!cellProp) return;

      let changed = false;
      if (cellItem.cd) {
        cellItem.cd -= subCd;
        if (cellItem.cd <= timestamp) {
          delete cellItem.cd;
          delete cellItem.cdSum;
          // cd 清零折算回点击次数（用该物品自己的 milo/times）
          if (cellProp.milo > 0) {
            let num = Math.floor(subCd / (cellProp.milo * 1000));
            if (num > 0) {
              cellItem.times = (cellItem.times ?? 0) + num;
            }
            if ((cellItem.times ?? 0) > cellProp.times) {
              cellItem.times = cellProp.times;
            }
          }
        }
        changed = true;
      }
      if (cellItem.cdAuto) {
        cellItem.cdAuto -= subCd;
        changed = true;
      }
      if (changed) {
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: { row, col }, item: cellItem });
      }
    });

    setItem(state.grid, pos.row, pos.col, null);
    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item: null });
    return true;
  }

  /**
   * 拖拽特殊道具到目标格（充能器/拆分器/升级卡）
   * @returns true 生效
   */
  applyDragSpecial(state: IGameState, src: IPoint, target: IPoint): boolean {
    const srcItem = getItem(state.grid, src.row, src.col);
    const targetItem = getItem(state.grid, target.row, target.col);
    if (!srcItem || !targetItem) return false;
    const srcProp = getProp(srcItem.id);
    if (!srcProp) return false;

    switch (srcProp.mdt) {
      case 3: {
        // 充能器
        if (!canChargerTarget(targetItem.id)) return false;
        setItem(state.grid, src.row, src.col, null);
        delete targetItem.cdSum;
        targetItem.times = (targetItem.times ?? 0) + srcProp.p1;
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: src, item: null });
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: target, item: targetItem });
        return true;
      }
      case 4: {
        // 拆分器
        if (!canSplitTarget(srcItem.id, targetItem.id)) return false;
        setItem(state.grid, src.row, src.col, null);
        const splitItem = createItemFromConfig(targetItem.id - 1, undefined, undefined, state);
        setItem(state.grid, target.row, target.col, splitItem);
        const emptyPos = findEmptyCell(state.grid);
        if (emptyPos) {
          setItem(state.grid, emptyPos.row, emptyPos.col, createItemFromConfig(targetItem.id - 1, undefined, undefined, state));
          eventBus.emit(GameEvents.GRID_ITEM_SPAWNED, { source: target, newPositions: [emptyPos], isAuto: false });
        }
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: src, item: null });
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: target, item: splitItem });
        return true;
      }
      case 6:
      case 7:
      case 8:
      case 9:
      case 10: {
        // 升级卡
        if (!canLvUpTarget(srcItem.id, targetItem.id)) return false;
        setItem(state.grid, src.row, src.col, null);
        const upItem = createItemFromConfig(targetItem.id + 1, undefined, undefined, state);
        setItem(state.grid, target.row, target.col, upItem);
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: src, item: null });
        eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos: target, item: upItem });
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * 钻石跳过 cd
   * @param cdType 1 点击 cd / 2 自动 cd
   */
  skipCd(state: IGameState, pos: IPoint, cdType: 1 | 2): boolean {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item) return false;

    const cdEnd = cdType === 1 ? item.cd : item.cdAuto;
    if (!cdEnd) return false;

    const dt = cdEnd - now();
    if (dt <= 0) return false;

    const minuteCost = getConfigValue('minuteCost', 24);
    const cost = Math.ceil(dt / 1000 / 60 / minuteCost);
    if (!this.economy.subResource(state, 'diamond', cost)) {
      return false;
    }

    if (cdType === 1) {
      item.cd = now();
    } else {
      item.cdAuto = now();
    }
    // 到期处理交给 SpawnSystem 的 tick
    return true;
  }

  /** 钻石戳破气泡 */
  popBubble(state: IGameState, pos: IPoint): boolean {
    const item = getItem(state.grid, pos.row, pos.col);
    if (!item || !item.cdBubble) return false;

    const prop = getProp(item.id);
    const cost = prop?.bubble ?? 0;
    if (!this.economy.subResource(state, 'diamond', cost)) {
      return false;
    }
    delete item.cdBubble;
    eventBus.emit(GameEvents.GRID_ITEM_CHANGED, { pos, item });
    return true;
  }

  /** 无限能量剩余毫秒 */
  getPowerFreeRemain(state: IGameState): number {
    const dt = state.powerFreeUntil - now();
    return dt > 0 ? dt : 0;
  }
}
