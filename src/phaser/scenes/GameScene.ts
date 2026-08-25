import * as Phaser from 'phaser';
import { GameInitializer } from '../../core/init/GameInitializer';
import { StorageSystem } from '../../core/systems/StorageSystem';
import { MergeSystem } from '../../core/systems/MergeSystem';
import { SpawnSystem } from '../../core/systems/SpawnSystem';
import { EconomySystem } from '../../core/systems/EconomySystem';
import { TaskSystem } from '../../core/systems/TaskSystem';
import { LevelSystem } from '../../core/systems/LevelSystem';
import { BagSystem } from '../../core/systems/BagSystem';
import { SpecialItemSystem } from '../../core/systems/SpecialItemSystem';

import { BaseSystem } from '../../core/systems/BaseSystem';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { IGameState, IItemData, IPoint, ITask, ItemStatus } from '../../core/types';
import { getProp, isClickSpawner, PROP_IDS } from '../../core/config/PropConfig';
import { getItem } from '../../core/model/Grid';
import { itemInCd, itemIsBubble } from '../../core/model/Item';
import { GridRenderer } from '../objects/GridRenderer';
import { HUD } from '../ui/HUD';
import { TaskBar } from '../ui/TaskBar';
import { TaskChainPanel } from '../ui/TaskChainPanel';
import { CardBar } from '../ui/CardBar';
import { InfoBar, buildInfoActions } from '../ui/InfoBar';
import { BagPanel } from '../ui/BagPanel';
import { SpawnerProductsPanel } from '../ui/SpawnerProductsPanel';
import { HandGuide } from '../ui/HandGuide';
import { StoryArchivePanel } from '../ui/StoryArchivePanel';
import { CharacterPanel } from '../ui/CharacterPanel';
import { MonsterPanel } from '../ui/MonsterPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StoryDialog } from '../ui/StoryDialog';
import { StorySystem } from '../../core/systems/StorySystem';
import { useBlueprint } from '../../core/systems/UnlockSystem';
import { getBlueprintBuilding } from '../../core/config/BuildingConfig';
import { getHeroConfig } from '../../core/config/HeroConfig';
import { hasTaskStoryBeat } from '../../core/config/StoryConfig';
import { addFullscreenBg, showSceneToast, makeUiButton } from '../ui/UiWidgets';
import { getBuildingName, getHeroName, getPropName, getText, resolveLanguage, setLanguage, type Language } from '../../core/i18n';

/**
 * 主游戏场景：系统装配 + 事件接线 + 输入判定
 */
export class GameScene extends Phaser.Scene {
  private storage!: StorageSystem;
  private mergeSystem!: MergeSystem;
  private spawnSystem!: SpawnSystem;
  private economySystem!: EconomySystem;
  private taskSystem!: TaskSystem;
  private bagSystem!: BagSystem;
  private specialSystem!: SpecialItemSystem;
  private baseSystem!: BaseSystem;
  private storySystem!: StorySystem;
  private state!: IGameState;

  private gridRenderer!: GridRenderer;
  private hud!: HUD;
  private taskBar!: TaskBar;
  private taskChainPanel: TaskChainPanel | null = null;
  private cardBar!: CardBar;
  private infoBar!: InfoBar;
  private bagPanel!: BagPanel;
  private spawnerPanel!: SpawnerProductsPanel;
  private storyDialog!: StoryDialog;
  /** 剧情回顾面板（每次打开新建实例，关闭后 isOpen 为 false） */
  private storyPanel: StoryArchivePanel | null = null;
  /** 角色图鉴面板（同上，用完即弃） */
  private characterPanel: CharacterPanel | null = null;
  private monsterPanel: MonsterPanel | null = null;
  private settingsPanel: SettingsPanel | null = null;

  private selected: IPoint | null = null;
  /** 从 BaseScene 返回时带入的已有状态（跳过读档） */
  private passedState: IGameState | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { state?: IGameState }): void {
    this.passedState = data?.state ?? null;
  }

  create(): void {
    try {
      // 全屏主背景（缺失时保持 main.ts 纯色底）
      addFullscreenBg(this);

      // 创建系统
      this.storage = new StorageSystem();
      this.economySystem = new EconomySystem();
      this.bagSystem = new BagSystem();
      this.specialSystem = new SpecialItemSystem(this.economySystem);
      this.baseSystem = new BaseSystem(this.economySystem);
      const levelSystem = new LevelSystem(this.economySystem);
      this.mergeSystem = new MergeSystem(this.bagSystem, this.specialSystem, levelSystem);
      this.spawnSystem = new SpawnSystem();
      this.taskSystem = new TaskSystem(this.bagSystem, this.economySystem);
      this.storySystem = new StorySystem();

      // 从基地场景返回用已有状态；否则读档或新开局
      const saved = this.passedState ? null : this.storage.loadState();
      const pendingMode = localStorage.getItem('merge_survival_td_pending_mode');
      if (pendingMode === 'merge' || pendingMode === 'build') {
        localStorage.removeItem('merge_survival_td_pending_mode');
      }
      const newGameMode = pendingMode === 'build' ? 'build' : 'merge';
      this.state = this.passedState ?? ((saved && this.gridHasItem(saved)) ? saved : GameInitializer.initNewGame(this.taskSystem, newGameMode));
      this.economySystem.recoverPower(this.state);
      const isNewGame = !this.passedState && !(saved && this.gridHasItem(saved));
      const browserLanguage = typeof navigator === 'undefined' ? undefined : navigator.language;
      if (isNewGame) this.state.language = browserLanguage?.toLowerCase().startsWith('zh') ? 'zh-CN' : browserLanguage ? 'en' : resolveLanguage();
      setLanguage(this.state.language);
      // 清理存档里按旧规则生成、当前不可能完成的任务（仅读档时跑一次）
      if (saved && this.state === saved) {
        this.taskSystem.pruneImpossibleTasks(this.state);
      }
      this.taskSystem.refreshTaskRewards(this.state);

      // 表现层
      this.gridRenderer = new GridRenderer(this, this.state);
      this.gridRenderer.onCellClick = (pos) => this.handleCellClick(pos);
      this.gridRenderer.onDropItem = (src, target) => this.handleDrop(src, target);
      this.gridRenderer.isTaskNeeded = (id) => this.taskSystem.isTaskNeedWithId(this.state, id);
      // 剧情对话/剧情回顾/角色图鉴面板打开时屏蔽棋盘输入（遮罩挡不住场景级 pointer 监听，会点穿到棋盘）
      this.gridRenderer.inputBlocked = () =>
        (this.storyDialog?.isOpen ?? false) || (this.storyPanel?.isOpen ?? false) || (this.characterPanel?.isOpen ?? false) || (this.monsterPanel?.isOpen ?? false) || (this.settingsPanel?.isOpen ?? false) || (this.taskChainPanel?.isOpen ?? false) || (this.cardBar?.isOpen ?? false) || (this.bagPanel?.isVisible() ?? false) || (this.spawnerPanel?.isVisible() ?? false);

      this.hud = new HUD(this, this.state);
      this.hud.getPowerFreeRemain = () => this.specialSystem.getPowerFreeRemain(this.state);

      this.taskBar = new TaskBar(this, this.state);
      this.taskBar.countItem = (id) => this.taskSystem.countItem(this.state, id);
      this.taskBar.canComplete = (task) => this.taskSystem.canCompleteTask(this.state, task);
      this.taskBar.onSubmit = (task) => this.handleTaskSubmit(task);
      this.taskBar.onViewChain = (task) => {
        this.taskChainPanel = new TaskChainPanel(this);
        this.taskChainPanel.open(task);
      };

      this.cardBar = new CardBar(this, this.state);
      this.cardBar.onUseCard = (index) => this.economySystem.useCard(this.state, index);

      this.infoBar = new InfoBar(this, this.state);

      this.bagPanel = new BagPanel(this);
      this.bagPanel.getBagSlots = () => {
        const bagItem = this.bagSystem.getBagItem(this.state);
        return bagItem?.roomArr ?? [];
      };
      this.bagPanel.onTakeOut = (index) => this.bagSystem.takeOut(this.state, index);
      this.bagPanel.onAddSlot = () => {
        this.bagSystem.addSlot(this.state, (amount) => this.economySystem.subResource(this.state, 'coin', amount));
      };

      this.spawnerPanel = new SpawnerProductsPanel(this);

      // 底部菜单行：剧情 / 角色 / 怪物 / 基地 / 商店 / 设置
      const MENU_Y = 1852;
      const menuButtons: {
        x: number;
        label: string;
        onTap: () => void;
      }[] = [
        // 剧情回顾：主线章节列表（已解锁可重播，未解锁显示条件）
        { x: 90, label: getText('menu.story'), onTap: () => {
          const panel = new StoryArchivePanel(this, this.state);
          this.storyPanel = panel;
          panel.onReplay = (beat) => {
            panel.close();
            this.storySystem.replay(beat);
          };
          panel.open();
        } },
        // 角色图鉴：已遇到 NPC 的立绘与背景故事（含玩家自己）
        { x: 260, label: getText('menu.characters'), onTap: () => {
          this.characterPanel = new CharacterPanel(this, this.state);
          this.characterPanel.open();
        } },
        { x: 430, label: getText('menu.monsters'), onTap: () => {
          this.monsterPanel = new MonsterPanel(this);
          this.monsterPanel.open();
        } },
        { x: 600, label: getText('menu.base'), onTap: () => {
          this.save();
          this.scene.start('BaseScene', { state: this.state });
        } },
        { x: 770, label: getText('menu.shop'), onTap: () => {
          this.save();
          this.scene.start('BaseScene', { state: this.state, openBlackMarket: true });
        } },
        { x: 940, label: getText('menu.settings'), onTap: () => {
          this.settingsPanel = new SettingsPanel(
            this,
            (language: Language) => this.changeLanguage(language),
            () => this.resetGame(),
            this.state.playMode ?? 'merge',
            (mode) => this.changePlayMode(mode)
          );
          this.settingsPanel.open();
        } }
      ];
      for (const m of menuButtons) {
        makeUiButton(this, null, m.x, MENU_Y, 150, 64, m.label, { box: { radius: 14 }, fontSize: '24px', depth: 100 }, m.onTap);
      }

      new HandGuide(this, this.state);

      // 剧情：对话浮层 + 触发（新开局播第一章，读档补播未看过的等级/物品剧情）
      this.storyDialog = new StoryDialog(this);
      this.storyDialog.onBeatDone = () => {
        this.storySystem.beatDone(this.state);
        this.save();
      };
      if (isNewGame) {
        this.storySystem.onNewGame(this.state);
      }
      this.storySystem.onGameReady(this.state);

      this.bindEvents();

      // 进场景结算一次基地产出（含离线收益），随后随存档心跳每 5 秒结算一次
      // tickProduction 走 economy.addResource → RESOURCE_CHANGED → HUD 自动刷新
      this.baseSystem.tickProduction(this.state);

      // 定时存档 + 基地产出结算 + 页面隐藏存档
      this.time.addEvent({ delay: 5000, loop: true, callback: () => {
        this.baseSystem.tickProduction(this.state);
        this.economySystem.recoverPower(this.state);
        this.save();
      } });
      this.time.addEvent({ delay: 500, loop: true, callback: () => this.spawnSystem.update(this.state, 500) });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    } catch (e) {
      console.error('[GameScene] create error:', e);
      this.add.text(this.scale.width / 2, this.scale.height / 2, getText('game.loadFailed', { error: String(e) }), {
        fontSize: '20px',
        color: '#ff0000',
        align: 'center'
      }).setOrigin(0.5);
    }
  }

  update(): void {
    this.gridRenderer.update();
    this.hud.update();
  }

  /** 格子点击判定树 */
  private handleCellClick(pos: IPoint): void {
    if (this.bagPanel.isVisible()) {
      this.bagPanel.close();
      return;
    }
    if (this.spawnerPanel.isVisible()) {
      this.spawnerPanel.close();
      return;
    }

    const item = getItem(this.state.grid, pos.row, pos.col);

    // 已解锁的 mdt=1 发射器（手提包解锁完、次数已恢复）按普通发射器处理
    const tapProp = item ? getProp(item.id) : undefined;
    const unlockedSpawner = !!item && tapProp?.mdt === 1 && !item.unlock && (item.times ?? 0) > 0;

    // 统一次击规则：第一次点击任何物品 = 仅选中；已选中的格子再次被点 = 触发效果
    const wasSelected = !!this.selected && this.selected.row === pos.row && this.selected.col === pos.col;

    // 1. 纸箱点击提示
    if (item && item.st === ItemStatus.Carton) {
      this.showToast(getText('game.cartonHint'));
      return;
    }

    // 2. 空格 → 取消选中
    if (!item) {
      this.setSelection(null);
      return;
    }

    // 2. 背包 → 首次选中，再次点击打开/关闭背包面板
    if (item.id === PROP_IDS.bag && !item.st) {
      if (wasSelected) this.bagPanel.toggle();
      else this.setSelection(pos);
      return;
    }

    // 3. 气泡 → 选中（InfoBar 提供戳破），并 toast 说明机制（气泡不可合成/拖动）
    if (itemIsBubble(item, this.state.timestamp)) {
      this.setSelection(pos);
      const secs = Math.max(1, Math.ceil(((item.cdBubble ?? 0) - Date.now()) / 1000));
      this.showToast(getText('game.bubbleHint', { seconds: secs, diamonds: tapProp?.bubble ?? 5 }));
      return;
    }

    // 4. 点击型特殊道具（体力、金币链、无限能量等）：首次选中，再次点击使用
    //    已解锁的 mdt=1 发射器（手提包解锁完、次数已恢复）除外，走下面的发射器分支
    if (this.specialSystem.isClickSpecial(item.id) && !unlockedSpawner) {
      if (wasSelected) {
        this.specialSystem.clickSpecial(this.state, pos);
        this.setSelection(null);
      } else {
        this.setSelection(pos);
      }
      return;
    }

    // 5. 冷却中 → 选中（InfoBar 提供跳过 CD）
    if (itemInCd(item)) {
      this.setSelection(pos);
      return;
    }

    // 6. 发射器 → 首次选中，选中状态下再次点击才产出（产出后保持选中，可连点连发）
    if (isClickSpawner(item.id)) {
      if (wasSelected) this.spawnSystem.clickSpawn(this.state, pos);
      this.setSelection(pos);
      return;
    }

    // 7. 最终蓝图 → 首次选中，选中状态下再次点击使用（解锁对应建筑并消耗蓝图）
    const bpBuilding = getBlueprintBuilding(item.id);
    if (bpBuilding) {
      if (wasSelected) {
        const r = useBlueprint(this.state, pos);
        if (r) {
          this.showToast(r.fresh ? getText('game.blueprintUnlocked', { building: getBuildingName(r.cfg.id) }) : getText('game.duplicateBlueprint', { building: getBuildingName(r.cfg.id) }));
          if (r.fresh) this.storySystem.checkBlueprint(this.state, r.cfg.id);
          this.setSelection(null);
          this.save();
        }
      } else {
        this.setSelection(pos);
      }
      return;
    }

    // 8. 其他 → 选中
    this.setSelection(pos);
  }

  /** 拖拽落点 → 移动/合成/入包/特殊道具 */
  private handleDrop(src: IPoint, target: IPoint): void {
    this.mergeSystem.moveOrMerge(this.state, src, target);
    this.setSelection(null);
  }

  /** 提交任务；有额外物品奖励时由满仓用对话发放（有专属任务剧情的除外——剧情里老鬼已代为打赏，不重复说） */
  private handleTaskSubmit(task: ITask): void {
    const rewards = task.rewardPropArr ? task.rewardPropArr.map(r => ({ ...r })) : [];
    const ok = this.taskSystem.completeTask(this.state, task);
    if (!ok || rewards.length === 0 || hasTaskStoryBeat(task.id)) return;
    const names = rewards
      .map(r => getText('game.rewardItem', { item: getPropName(r.id), count: r.num > 1 ? r.num : '' }))
      .join(getText('game.listSeparator'));
    this.storySystem.playAdHoc([
      { who: 'mancang', text: getText('game.taskRewardIntro') },
      { who: 'mancang', text: getText('game.taskRewardStored', { names }) }
    ]);
  }

  /** 选中物品并刷新 InfoBar */
  private setSelection(pos: IPoint | null): void {
    this.selected = pos;
    this.gridRenderer.setSelection(pos);

    const item = pos ? getItem(this.state.grid, pos.row, pos.col) : null;
    const actions = (pos && item) ? buildInfoActions(this.state, pos, item, {
      onSell: (p) => {
        this.economySystem.sellItem(this.state, p);
        this.setSelection(null);
      },
      onPopBubble: (p) => {
        this.specialSystem.popBubble(this.state, p);
        this.setSelection(null);
      },
      onSkipCd: (p, cdType) => {
        this.specialSystem.skipCd(this.state, p, cdType);
        this.setSelection(null);
      },
      onUse: (p) => {
        const it = getItem(this.state.grid, p.row, p.col);
        if (it && getBlueprintBuilding(it.id)) {
          const r = useBlueprint(this.state, p);
          if (r) {
            this.showToast(r.fresh ? getText('game.blueprintUnlocked', { building: getBuildingName(r.cfg.id) }) : getText('game.duplicateBlueprint', { building: getBuildingName(r.cfg.id) }));
            if (r.fresh) this.storySystem.checkBlueprint(this.state, r.cfg.id);
            this.save();
          }
        } else {
          this.specialSystem.clickSpecial(this.state, p);
        }
        this.setSelection(null);
      },
      onViewSpawner: (p) => {
        const it = getItem(this.state.grid, p.row, p.col);
        if (it) this.spawnerPanel.open(this.getHighestSpawnerId(it.id));
      }
    }) : [];
    this.infoBar.showSelection(pos, item, actions);
  }

  private getHighestSpawnerId(spawnerId: number): number {
    const selected = getProp(spawnerId);
    if (!selected) return spawnerId;

    let highestId = spawnerId;
    let highestLevel = selected.luna;
    for (const row of this.state.grid.cells) {
      for (const cell of row) {
        const item = cell.item;
        const prop = item ? getProp(item.id) : undefined;
        if (prop && item && isClickSpawner(item.id) && prop.type === selected.type && prop.typeson === selected.typeson && prop.luna > highestLevel) {
          highestId = item.id;
          highestLevel = prop.luna;
        }
      }
    }
    return highestId;
  }

  private bindEvents(): void {
    // 场景 scene.start 切换后旧实例会被销毁，必须解绑全局事件，否则僵尸监听器操作已销毁对象
    const offs: Array<() => void> = [];
    const listen = (event: string, fn: (data?: any) => void): void => {
      eventBus.on(event, fn);
      offs.push(() => eventBus.off(event, fn));
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of offs) off();
      // DOM 监听器同样要解绑：scene.start 重建场景时旧实例销毁，否则监听器累积且闭包持有僵尸 Scene
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });

    listen(GameEvents.GRID_ITEM_CHANGED, (data: { pos: IPoint; item: IItemData | null }) => {
      this.gridRenderer.refreshCell(data.pos.row, data.pos.col);
      // 物品被移除（发射器/箱子耗尽消失、出售等）→ 烟雾遮挡消失瞬间
      if (!data.item) {
        this.gridRenderer.playVanishEffect(data.pos);
      }
      this.taskBar.refresh();
    });

    listen(GameEvents.GRID_ITEM_MOVED, (data: { src: IPoint; target: IPoint }) => {
      this.gridRenderer.refreshCell(data.src.row, data.src.col);
      this.gridRenderer.refreshCell(data.target.row, data.target.col);
    });

    listen(GameEvents.GRID_ITEM_MERGED, (data: { src: IPoint; target: IPoint; newItem: IItemData | null; cartonBreaks: IPoint[] }) => {
      this.gridRenderer.refreshCell(data.src.row, data.src.col);
      this.gridRenderer.refreshCell(data.target.row, data.target.col);
      this.gridRenderer.playMergeEffect(data.target);
      for (const pos of data.cartonBreaks || []) {
        this.gridRenderer.refreshCell(pos.row, pos.col);
        this.gridRenderer.playVanishEffect(pos);
      }
      this.taskBar.refresh();
      this.storySystem.checkMerge(this.state);
    });

    listen(GameEvents.GRID_ITEM_SPAWNED, (data: { newPositions: IPoint[] }) => {
      const spawnedIds: number[] = [];
      for (const pos of data.newPositions) {
        this.gridRenderer.refreshCell(pos.row, pos.col);
        this.gridRenderer.playSpawnEffect(pos);
        const it = getItem(this.state.grid, pos.row, pos.col);
        if (it) spawnedIds.push(it.id);
      }
      this.taskBar.refresh();
      this.storySystem.checkItems(this.state, spawnedIds);
    });

    listen(GameEvents.GRID_BUBBLE_BOMB, (data: { pos: IPoint }) => {
      this.gridRenderer.refreshCell(data.pos.row, data.pos.col);
      this.showToast(getText('game.bubblePopped'));
    });

    listen(GameEvents.RESOURCE_CHANGED, (data: { type?: string; value?: number }) => {
      this.hud.refresh();
      if (data?.type === 'coin' && typeof data.value === 'number') {
        this.storySystem.checkCoin(this.state, data.value);
      }
    });

    listen(GameEvents.ROLE_LEVEL_UP, (data: { level: number; rewards: [number, number][] }) => {
      this.hud.refresh();
      this.showToast(getText('game.levelUp', { level: data.level }));
      this.storySystem.checkLevel(this.state, data.level);
    });

    listen(GameEvents.TASK_UPDATED, () => {
      this.taskBar.refresh();
    });

    listen(GameEvents.TASK_DONE, (data: { task: ITask }) => {
      this.taskBar.refresh();
      this.gridRenderer.refreshAll();
      this.storySystem.checkTaskDone(this.state, data?.task?.id);
    });

    listen(GameEvents.CARD_UPDATED, () => {
      this.cardBar.refresh();
    });

    listen(GameEvents.BAG_UPDATED, () => {
      this.bagPanel.refresh();
    });

    listen(GameEvents.TOAST_SHOW, (msg: string) => {
      this.showToast(msg);
    });

    listen(GameEvents.SPEED_UP_END, () => {
      this.showToast(getText('game.acceleratorStopped'));
    });

    // 英雄加入堡垒：剧情对话单句隆重提示（立绘 + 部署引导），走播放队列自动排队
    listen(GameEvents.HERO_JOINED, (data: { key: string }) => {
      const cfg = getHeroConfig(data.key);
      if (!cfg) return;
      this.storySystem.playAdHoc([
        { who: data.key, text: getText('base.heroJoined', { hero: getHeroName(cfg.key) }) }
      ]);
    });
  }

  private showToast(msg: string): void {
    showSceneToast(this, msg, { rise: true });
  }

  private gridHasItem(state: IGameState): boolean {
    for (const row of state.grid.cells) {
      for (const cell of row) {
        if (cell.item) return true;
      }
    }
    return false;
  }

  private save(): void {
    if (this.saveDisabled) return;
    this.storage.saveState(this.state);
  }

  private changeLanguage(language: Language): void {
    this.state.language = language;
    setLanguage(language);
    this.save();
    this.scene.restart({ state: this.state });
  }

  private resetGame(): void {
    this.saveDisabled = true;
    this.storage.clearState();
    location.reload();
  }

  /** 切换玩法模式：清空存档并按新模式重开 */
  private changePlayMode(mode: 'merge' | 'build'): void {
    if ((this.state.playMode ?? 'merge') === mode) return;
    this.saveDisabled = true;
    this.storage.clearState();
    // 新开局时 createInitialGameState 会带上目标模式
    localStorage.setItem('merge_survival_td_pending_mode', mode);
    location.reload();
  }

  /** 重开确认后禁用一切自动存档，防止重载前 visibilitychange 把旧档写回 */
  private saveDisabled = false;

  /** 页面隐藏时存档；类字段持有引用，shutdown 时可精确 removeEventListener */
  private onVisibilityChange = (): void => {
    if (document.hidden) this.save();
  };
}
