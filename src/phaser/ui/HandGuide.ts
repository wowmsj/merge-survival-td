import * as Phaser from 'phaser';
import { IGameState, IPoint } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { getItem } from '../../core/model/Grid';
import { getBuildingConfig } from '../../core/config/BuildingConfig';
import { HAND_DONE_INDEX } from '../../core/systems/MergeSystem';
import { UI_FILL, UI_GOLD } from './UiStyle';
import { getText } from '../../core/i18n';

/** 发电机已解锁、待建造阶段：横幅常驻提示赚金币/去基地盖发电机 */
const FARM_PENDING = HAND_DONE_INDEX + 1;
/** 新手引导完成（发电机建成）。与 core 的 HAND_DONE_INDEX 是同一条边界：
 *  handIndex <= HAND_DONE_INDEX(24) 时 core 侧（MergeSystem）仍视为引导期；
 *  +1 = 发电机已解锁待建造，+2 = 引导彻底结束 */
const HAND_DONE = HAND_DONE_INDEX + 2;

/** 蓝图引导阶段：先箭塔，箭塔缺电后再引导电站。 */
const TOWER_EMITTER = 70001;
const TOWER_CHAIN_MIN = 70101;
const TOWER_CHAIN_MAX = 70104;
const TOWER_BUILDING = 101;
const TOWER_PENDING = 14;
const FARM_EMITTER = 70007;
const FARM_CHAIN_MIN = 70125; // 电站蓝图碎片 Lv1
const FARM_CHAIN_MAX = 70128; // 电站蓝图 Lv4（链尾）
const FARM_BUILDING = 203;
const FARM_EMITTER_STAGE = 15;
const FARM_MERGE_STAGE = 16;
const FARM_UNLOCK_STAGE = 17;

/** 横幅中心 y：棋盘（222..1546）之下、卡片栏（1674）之上的空档 */
const BANNER_Y = 1596;
const BANNER_H = 64;

/**
 * 简版新手引导：顶部横幅文案 + 按关键事件推进 handIndex
 * 1~5 合成教学 / 6~7 点击发射器 / 8~9 继续合成 / 10 提交任务
 * 11 点箭塔蓝图箱 / 12 合成箭塔蓝图 / 13 使用箭塔蓝图 / 14 建造箭塔
 * 15 点电站蓝图箱 / 16 合成电站蓝图 / 17 使用电站蓝图 / 25 建造发电机
 * 横幅为任务提示风格：金色「引导」标签 + 深色圆角条 + 金色光晕，
 * 文案切换时弹入（Back 缓动），常驻呼吸缩放 + 光晕明暗交替
 */
export class HandGuide {
  private scene: Phaser.Scene;
  private state: IGameState;
  private banner: Phaser.GameObjects.Text;
  private bannerG: Phaser.GameObjects.Graphics;
  private tagG: Phaser.GameObjects.Graphics;
  private tagText: Phaser.GameObjects.Text;
  private container: Phaser.GameObjects.Container;
  private glowG: Phaser.GameObjects.Graphics;
  private popTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, state: IGameState) {
    this.scene = scene;
    this.state = state;

    // 容器承载整条横幅（底 + 光晕 + 标签 + 文案），方便整体做弹入/呼吸动效
    this.container = scene.add.container(scene.scale.width / 2, BANNER_Y).setDepth(299).setVisible(false);
    this.glowG = scene.add.graphics();
    this.bannerG = scene.add.graphics();
    this.tagG = scene.add.graphics();
    this.tagText = scene.add.text(0, 0, getText('guide.tag'), {
      fontSize: '22px',
      color: '#1a1f2e',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.banner = scene.add.text(0, 0, '', {
      fontSize: '30px',
      color: '#ffe066',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.container.add([this.glowG, this.bannerG, this.tagG, this.tagText, this.banner]);

    // 合成 → 推进到 6 / 10 / 13
    const onMerged = (data: { newItem?: { id: number } }) => {
      if (this.state.handIndex <= 5) {
        this.setHandIndex(6);
      } else if (this.state.handIndex >= 8 && this.state.handIndex <= 9) {
        this.setHandIndex(10);
      } else if (this.state.handIndex === 12 && data.newItem && this.isTowerChain(data.newItem.id)) {
        this.enterTowerBlueprintStage();
      } else if (this.state.handIndex === FARM_MERGE_STAGE && data.newItem && this.isFarmChain(data.newItem.id)) {
        this.enterPowerBlueprintStage();
      }
    };
    eventBus.on(GameEvents.GRID_ITEM_MERGED, onMerged);

    // 手动产出 → 推进到 8 / 12
    const onSpawned = (data: { isAuto: boolean; source?: IPoint | null }) => {
      if (!data.isAuto && this.state.handIndex >= 6 && this.state.handIndex <= 7) {
        this.setHandIndex(8);
      } else if (this.state.handIndex === 11 && data.source) {
        const srcItem = getItem(this.state.grid, data.source.row, data.source.col);
        if (srcItem?.id === TOWER_EMITTER) this.enterTowerBlueprintStage();
      } else if (this.state.handIndex === FARM_EMITTER_STAGE && data.source) {
        const srcItem = getItem(this.state.grid, data.source.row, data.source.col);
        if (srcItem?.id === FARM_EMITTER) this.enterPowerBlueprintStage();
      }
    };
    eventBus.on(GameEvents.GRID_ITEM_SPAWNED, onSpawned);

    // 提交任务 → 进入蓝图引导阶段（11~13，按棋盘现状自动跳步）
    const onTaskDone = () => {
      if (this.state.handIndex >= 10 && this.state.handIndex < 11) {
        this.enterTowerBlueprintStage();
      }
    };
    eventBus.on(GameEvents.TASK_DONE, onTaskDone);

    // 使用蓝图解锁发电机（unlockedBuildings 写入）→ 进入待建造阶段
    const onChanged = () => {
      if (this.state.handIndex >= 11 && this.state.handIndex <= 13 && this.towerUnlocked()) {
        this.setHandIndex(TOWER_PENDING);
      } else if (this.state.handIndex >= FARM_EMITTER_STAGE && this.state.handIndex < FARM_PENDING && this.farmUnlocked()) {
        this.setHandIndex(FARM_PENDING);
      }
    };
    eventBus.on(GameEvents.GRID_ITEM_CHANGED, onChanged);

    // 发电机建成 → 引导完成
    const onBaseChanged = () => {
      if (this.state.handIndex >= FARM_PENDING && this.state.handIndex < HAND_DONE && this.farmPlaced()) {
        this.setHandIndex(HAND_DONE);
      }
    };
    eventBus.on(GameEvents.BASE_CHANGED, onBaseChanged);

    // 金币变化 → 待建造阶段刷新横幅（箭塔/发电机：「赚金币」↔「去基地盖」）
    const onResource = (data: { type: string }) => {
      if (data.type === 'coin' && (this.state.handIndex === TOWER_PENDING || this.state.handIndex === FARM_PENDING)) this.refresh();
    };
    eventBus.on(GameEvents.RESOURCE_CHANGED, onResource);

    // 场景销毁时解绑，避免僵尸监听器操作已销毁的 banner
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvents.GRID_ITEM_MERGED, onMerged);
      eventBus.off(GameEvents.GRID_ITEM_SPAWNED, onSpawned);
      eventBus.off(GameEvents.TASK_DONE, onTaskDone);
      eventBus.off(GameEvents.GRID_ITEM_CHANGED, onChanged);
      eventBus.off(GameEvents.BASE_CHANGED, onBaseChanged);
      eventBus.off(GameEvents.RESOURCE_CHANGED, onResource);
    });

    // 兜底：存档里引导卡在蓝图阶段但发电机已解锁（旧版事件时序问题），跳到待建造；
    // 卡在待建造阶段但发电机已建成（跨场景建造时本场景未监听），直接收尾
    if (this.state.handIndex >= 11 && this.state.handIndex <= 13 && this.towerUnlocked()) {
      this.state.handIndex = TOWER_PENDING;
    } else if (this.state.handIndex >= FARM_EMITTER_STAGE && this.state.handIndex < FARM_PENDING && this.farmUnlocked()) {
      this.state.handIndex = FARM_PENDING;
    }
    if (this.state.handIndex >= FARM_PENDING && this.state.handIndex < HAND_DONE && this.farmPlaced()) {
      this.state.handIndex = HAND_DONE;
    }

    this.refresh();
  }

  private isFarmChain(id: number): boolean {
    return id >= FARM_CHAIN_MIN && id <= FARM_CHAIN_MAX;
  }

  private isTowerChain(id: number): boolean {
    return id >= TOWER_CHAIN_MIN && id <= TOWER_CHAIN_MAX;
  }

  private towerUnlocked(): boolean {
    return Array.isArray(this.state.unlockedBuildings) && this.state.unlockedBuildings.includes(TOWER_BUILDING);
  }

  private farmUnlocked(): boolean {
    return Array.isArray(this.state.unlockedBuildings) && this.state.unlockedBuildings.includes(FARM_BUILDING);
  }

  /** 发电机是否已在基地建成 */
  private farmPlaced(): boolean {
    return !!this.state.base?.buildings?.some(b => b.cfgId === FARM_BUILDING);
  }

  /** 棋盘上是否存在某电站链物品（返回最高级的那个 id，无则 0） */
  private bestFarmChainOnBoard(): number {
    let best = 0;
    for (const row of this.state.grid.cells) {
      for (const cell of row) {
        if (cell.item && this.isFarmChain(cell.item.id) && cell.item.id > best) best = cell.item.id;
      }
    }
    return best;
  }

  private bestTowerChainOnBoard(): number {
    let best = 0;
    for (const row of this.state.grid.cells) {
      for (const cell of row) {
        if (cell.item && this.isTowerChain(cell.item.id) && cell.item.id > best) best = cell.item.id;
      }
    }
    return best;
  }

  private enterTowerBlueprintStage(): void {
    if (this.towerUnlocked()) {
      this.setHandIndex(TOWER_PENDING);
      return;
    }
    const best = this.bestTowerChainOnBoard();
    if (best >= TOWER_CHAIN_MAX) this.setHandIndex(13);
    else if (best > 0) this.setHandIndex(12);
    else this.setHandIndex(11);
  }

  /** 进入电站蓝图引导阶段：已解锁→待建造；已有完整蓝图→17；已有碎片→16；否则→15 */
  private enterPowerBlueprintStage(): void {
    if (this.farmUnlocked()) {
      this.setHandIndex(FARM_PENDING);
      return;
    }
    const best = this.bestFarmChainOnBoard();
    if (best >= FARM_CHAIN_MAX) this.setHandIndex(FARM_UNLOCK_STAGE);
    else if (best > 0) this.setHandIndex(FARM_MERGE_STAGE);
    else this.setHandIndex(FARM_EMITTER_STAGE);
  }

  private setHandIndex(index: number): void {
    this.state.handIndex = index;
    this.refresh();
  }

  refresh(): void {
    const idx = this.state.handIndex;
    let text = '';
    if (idx <= 5) {
      text = getText('guide.merge');
    } else if (idx <= 7) {
      text = getText('guide.spawn');
    } else if (idx <= 9) {
      text = getText('guide.collect');
    } else if (idx <= 10) {
      text = getText('guide.submit');
    } else if (idx === 11) {
      text = getText('guide.emitter');
    } else if (idx === 12) {
      text = getText('guide.blueprintMerge');
    } else if (idx === 13) {
      text = getText('guide.unlockTower');
    } else if (idx === TOWER_PENDING) {
      const cost = getBuildingConfig(TOWER_BUILDING)?.costCoin ?? 200;
      text = this.state.resources.coin >= cost
        ? getText('guide.buildTower')
        : getText('guide.towerCost', { cost });
    } else if (idx === FARM_EMITTER_STAGE) {
      text = getText('guide.powerEmitter');
    } else if (idx === FARM_MERGE_STAGE) {
      text = getText('guide.powerBlueprintMerge');
    } else if (idx === FARM_UNLOCK_STAGE) {
      text = getText('guide.unlockGenerator');
    } else if (idx === FARM_PENDING) {
      // 发电机已解锁待建成：金币不够 → 提示做任务赚钱；够了 → 提示去基地盖，并带一句电池转化燃料通电
      const cost = getBuildingConfig(FARM_BUILDING)?.costCoin ?? 300;
      text = this.state.resources.coin >= cost
        ? getText('guide.buildGenerator')
        : getText('guide.generatorCost', { cost });
    }

    this.bannerG.clear();
    this.glowG.clear();
    this.tagG.clear();
    if (text) {
      this.banner.setText(text);
      // 布局：「引导」标签 + 文案，整体在容器内水平居中
      const tagW = this.tagText.width + 28;
      const gap = 14;
      const padX = 28;
      const contentW = tagW + gap + this.banner.width;
      const w = contentW + padX * 2;
      const left = -w / 2;

      // 外层金色光晕（呼吸动效作用在这一层）
      this.glowG.fillStyle(UI_GOLD, 0.35);
      this.glowG.fillRoundedRect(left - 5, -BANNER_H / 2 - 5, w + 10, BANNER_H + 10, BANNER_H / 2 + 5);
      // 深色圆角主体 + 金边
      this.bannerG.fillStyle(UI_FILL, 0.95);
      this.bannerG.fillRoundedRect(left, -BANNER_H / 2, w, BANNER_H, BANNER_H / 2);
      this.bannerG.lineStyle(3, UI_GOLD, 0.9);
      this.bannerG.strokeRoundedRect(left, -BANNER_H / 2, w, BANNER_H, BANNER_H / 2);
      // 左侧「引导」标签（金色实底 + 深色字）
      const tagCx = left + padX + tagW / 2;
      this.tagG.fillStyle(0xffd75e, 1);
      this.tagG.fillRoundedRect(left + padX, -18, tagW, 36, 18);
      this.tagText.setPosition(tagCx, 0);
      this.banner.setPosition(left + padX + tagW + gap, 0);

      this.container.setVisible(true);
      this.playPop();
    } else {
      this.container.setVisible(false);
      this.popTween?.stop();
      this.scene.tweens.killTweensOf([this.container, this.glowG]);
    }
  }

  /** 弹入动效 + 常驻呼吸（整体轻微缩放 + 光晕明暗） */
  private playPop(): void {
    this.popTween?.stop();
    this.scene.tweens.killTweensOf([this.container, this.glowG]);
    this.container.setScale(0.5).setAlpha(0);
    this.glowG.setAlpha(0.35);
    // 弹入：带回弹的放大 + 淡入
    this.popTween = this.scene.tweens.add({
      targets: this.container,
      scale: 1,
      alpha: 1,
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        // 呼吸：整体 1↔1.05 缓慢起伏
        this.scene.tweens.add({
          targets: this.container,
          scale: 1.05,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        // 光晕明暗交替，吸引注意
        this.scene.tweens.add({
          targets: this.glowG,
          alpha: 0.9,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }
}
