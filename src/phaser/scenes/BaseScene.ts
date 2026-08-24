import * as Phaser from 'phaser';
import { IGameState, IBuilding, BuildingKind } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { StorageSystem } from '../../core/systems/StorageSystem';
import { EconomySystem } from '../../core/systems/EconomySystem';
import { BaseSystem, canDefendFlyingEnemies, formatGains, formatResourceGains, getPowerInfo, isTowerPoweredAtNight } from '../../core/systems/BaseSystem';
import { zoneOf, BaseZone, buildingAt, getShortestEntryPathLength } from '../../core/model/Base';
import {
  getBuildingConfig, getBuildableList, getUpgradeCostCoin, getDemolishRefundCoin, getRepairCostCoin,
  attackAtLevel, outputIntervalAtLevel, outputAmountAtLevel, capResourceKeys, capAmountAtLevel, isBuildingUnlocked,
  BUILDING_MAX_LEVEL, IBuildingConfig, RESOURCE_NAME, formatUpgradeCost
} from '../../core/config/BuildingConfig';
import { getNightPreview, getZombieConfig } from '../../core/config/ZombieConfig';
import { getAttackSides } from '../../core/systems/NightSystem';
import { HeroSystem } from '../../core/systems/HeroSystem';
import { getHeroConfig } from '../../core/config/HeroConfig';
import { IHeroState } from '../../core/types';
import { HUD, HUD_BOTTOM } from '../ui/HUD';
import { StoryDialog } from '../ui/StoryDialog';
import { StorySystem } from '../../core/systems/StorySystem';
import { UI_FILL, UI_GOLD, UI_ORANGE, UI_SLOT_FILL, UI_STROKE, drawUiBox } from '../ui/UiStyle';
import { addFullscreenBg, showSceneToast } from '../ui/UiWidgets';
import { KIND_COLORS, KIND_ICON_KEYS } from '../config/BuildingKindStyle';
import { getBuildingName, getHeroDescription, getHeroName, getLanguage, getPropName, getText, getZombieName } from '../../core/i18n';
import { BLACK_MARKET_ITEMS, buyBlackMarketBlueprint, exchangeDiamondForCoins, getRecommendedMarketItem } from '../../core/systems/BlackMarketSystem';

/** 顶栏（返回/天数/核心/迎接夜晚）中线 Y：压在 HUD 第二行胶囊之下 */
const TOP_BAR_Y = HUD_BOTTOM + 40;
const GRID_TOP = TOP_BAR_Y + 40;
const GRID_LEFT = 24;
const CELL = 74;
const GAP = 6;
const TAB_BAR_TOP = 1294;

/** 建造栏布局：每页 2 列 × 2 行共 4 张大卡片，超出分页（底部页码条） */
const PALETTE_COLS = 2;
const PALETTE_ROWS = 2;
const CARD_W = 500;
const CARD_H = 216;
const CARD_GAP_X = 30;
const CARD_GAP_Y = 12;
const CARDS_TOP = 1380;
const PAGE_BAR_Y = 1896;

/** 建造栏页签：4 个建筑分类 + 英雄（hero 非建筑分类，单独处理） */
type TabKey = Exclude<BuildingKind, 'core' | 'ruin'> | 'hero';

const TABS: { kind: TabKey; labelKey: string }[] = [
  { kind: 'tower', labelKey: 'base.tab.tower' },
  { kind: 'resource', labelKey: 'base.tab.resource' },
  { kind: 'trap', labelKey: 'base.tab.trap' },
  { kind: 'wall', labelKey: 'base.tab.wall' },
  { kind: 'hero', labelKey: 'base.tab.hero' }
];

/**
 * 基地场景：自由摆放防御塔/资源建筑/陷阱/城墙
 * 与 GameScene 共享同一份 state（通过 scene.start data 传递）
 */
export class BaseScene extends Phaser.Scene {
  private state!: IGameState;
  private nightEndStory: { won: boolean; day: number } | null = null;
  private openMarketOnEnter = false;
  private storage!: StorageSystem;
  private economy!: EconomySystem;
  private baseSystem!: BaseSystem;
  private heroSystem!: HeroSystem;
  private storySystem!: StorySystem;
  private storyDialog!: StoryDialog;

  private gridLayer!: Phaser.GameObjects.Container;
  private paletteLayer!: Phaser.GameObjects.Container;
  private dialogLayer!: Phaser.GameObjects.Container;
  private dayText!: Phaser.GameObjects.Text;
  private coreText!: Phaser.GameObjects.Text;
  private nightPreviewWheel?: (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[], dx: number, dy: number) => void;
  private marketScrollWheel?: (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[], dx: number, dy: number) => void;
  private marketScrollHandlers?: {
    down: (pointer: Phaser.Input.Pointer) => void;
    move: (pointer: Phaser.Input.Pointer) => void;
    up: () => void;
  };
  private marketClipShape?: Phaser.GameObjects.Graphics;

  private activeTab: TabKey = 'tower';
  /** 建造栏当前页码（每页 2×2 张卡片，切页签时归零） */
  private pageIndex = 0;
  /** 当前待摆放的建筑配置 id；null = 非摆放模式 */
  private placing: number | null = null;
  /** 当前待部署的英雄 key；null = 非部署模式（与 placing 互斥） */
  private placingHero: string | null = null;
  /** 防御塔攻击范围预览（摆放时跟随指针） */
  private rangeHint!: Phaser.GameObjects.Graphics;
  /** 选中建筑后显示的攻击范围（仅防御塔） */
  private selectedRangeHint!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'BaseScene' });
  }

  init(data: { state: IGameState; nightEndStory?: { won: boolean; day: number }; openBlackMarket?: boolean }): void {
    this.state = data.state;
    this.nightEndStory = data.nightEndStory ?? null;
    this.openMarketOnEnter = data.openBlackMarket === true;
  }

  create(): void {
    this.storage = new StorageSystem();
    this.economy = new EconomySystem();
    this.economy.recoverPower(this.state);
    this.baseSystem = new BaseSystem(this.economy);
    this.heroSystem = new HeroSystem();
    this.baseSystem.ensure(this.state);
    // 夜晚中途退出（刷新/切后台被杀）重置为白天，视为未入夜
    if (this.state.phase === 'night') this.state.phase = 'day';

    // 剧情：对话浮层 + 已有建筑补播（老存档首次进基地也能看到对应剧情）
    this.storySystem = new StorySystem();
    this.storyDialog = new StoryDialog(this);
    this.storyDialog.onBeatDone = () => {
      this.storySystem.beatDone(this.state);
      this.save();
    };
    for (const b of this.state.base.buildings) {
      this.storySystem.checkBuilding(this.state, b.cfgId);
    }
    if (this.nightEndStory) {
      this.storySystem.checkNightEnd(this.state, this.nightEndStory.won, this.nightEndStory.day);
    }

    // 全屏主背景（缺失时保持纯色底）
    addFullscreenBg(this);

    // 进场景结算一次产出（含离线收益）
    const gains = this.baseSystem.tickProduction(this.state);

    new HUD(this, this.state);

    // 顶部：返回 + 天数/核心血量 + 迎接夜晚
    const backBtn = this.add.graphics();
    drawUiBox(backBtn, 90, TOP_BAR_Y, 140, 52, { radius: 12 });
    backBtn.setInteractive(new Phaser.Geom.Rectangle(90 - 70, TOP_BAR_Y - 26, 140, 52), Phaser.Geom.Rectangle.Contains);
    this.add.text(90, TOP_BAR_Y, getText('base.back'), { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    backBtn.on('pointerdown', () => backBtn.setAlpha(0.7));
    backBtn.on('pointerup', () => {
      backBtn.setAlpha(1);
      this.save();
      this.scene.start('GameScene', { state: this.state });
    });
    backBtn.on('pointerout', () => backBtn.setAlpha(1));

    const core = this.baseSystem.getCore(this.state);
    this.dayText = this.add.text(380, TOP_BAR_Y, getText('base.day', { day: this.state.day }), {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.coreText = this.add.text(610, TOP_BAR_Y, getText('base.coreHp', { hp: core.hp, maxHp: core.maxHp }), {
      fontSize: '24px', color: '#ffd43b', fontStyle: 'bold'
    }).setOrigin(0.5);

    const nightBtn = this.add.graphics();
    // 保留橙色语义：暗橙底 + 橙描边
    drawUiBox(nightBtn, 940, TOP_BAR_Y, 220, 52, {
      fill: 0x33231a, fillAlpha: 0.92, stroke: UI_ORANGE, strokeAlpha: 0.8, radius: 12
    });
    nightBtn.setInteractive(new Phaser.Geom.Rectangle(940 - 110, TOP_BAR_Y - 26, 220, 52), Phaser.Geom.Rectangle.Contains);
    this.add.text(940, TOP_BAR_Y, getText('base.night'), { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    nightBtn.on('pointerdown', () => nightBtn.setAlpha(0.7));
    nightBtn.on('pointerup', () => {
      nightBtn.setAlpha(1);
      this.openNightConfirm();
    });
    nightBtn.on('pointerout', () => nightBtn.setAlpha(1));

    this.gridLayer = this.add.container(0, 0);
    this.paletteLayer = this.add.container(0, 0);
    this.dialogLayer = this.add.container(0, 0).setDepth(500);

    this.rangeHint = this.add.graphics().setDepth(40).setVisible(false);
    this.selectedRangeHint = this.add.graphics().setDepth(40).setVisible(false);

    this.renderGrid();
    this.renderPalette();

    // 防御塔摆放时显示攻击范围圈
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.updateRangeHint(pointer);
    });

    const onBaseChanged = () => {
      const c = this.baseSystem.getCore(this.state);
      this.dayText.setText(getText('base.day', { day: this.state.day }));
      this.coreText.setText(getText('base.coreHp', { hp: c.hp, maxHp: c.maxHp }));
      this.renderGrid();
      this.renderPalette();
      this.save();
    };
    const onToast = (msg: string) => this.showToast(msg);
    const onHeroJoined = (data: { key: string }) => this.playHeroJoined(data.key);

    eventBus.on(GameEvents.BASE_CHANGED, onBaseChanged);
    eventBus.on(GameEvents.TOAST_SHOW, onToast);
    eventBus.on(GameEvents.HERO_JOINED, onHeroJoined);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      eventBus.off(GameEvents.BASE_CHANGED, onBaseChanged);
      eventBus.off(GameEvents.TOAST_SHOW, onToast);
      eventBus.off(GameEvents.HERO_JOINED, onHeroJoined);
    });

    // 周期产出 + 存档（供电状态随燃料到期变化，刷新网格上的缺电角标）
    this.time.addEvent({
      delay: 5000, loop: true, callback: () => {
        this.baseSystem.tickProduction(this.state);
        this.economy.recoverPower(this.state);
        this.renderGrid();
        this.save();
      }
    });

    const gainText = formatGains(gains.items);
    const resourceGainText = formatResourceGains(gains.resources);
    if (gainText !== getText('base.none')) this.showToast(getText('base.resourceGain', { gain: gainText }));
    if (resourceGainText !== getText('base.none')) this.showToast(getText('base.resourceGain', { gain: resourceGainText }));
    if (this.openMarketOnEnter) this.openBlackMarket();
  }

  private save(): void {
    this.storage.saveState(this.state);
  }

  private showToast(msg: string): void {
    showSceneToast(this, msg, { yRatio: 0.7 });
  }

  /** 英雄加入堡垒：走剧情对话单句模式（立绘 + 隆重提示），与播放中的剧情自动排队 */
  private playHeroJoined(key: string): void {
    const cfg = getHeroConfig(key);
    if (!cfg) return;
    this.storySystem.playAdHoc([
      { who: key, text: getText('base.heroJoined', { hero: getHeroName(key) }) }
    ]);
  }

  // ============ 网格 ============

  private cellXY(row: number, col: number): { x: number; y: number } {
    return {
      x: GRID_LEFT + col * (CELL + GAP) + CELL / 2,
      y: GRID_TOP + row * (CELL + GAP) + CELL / 2
    };
  }

  /** 绘制防御塔攻击范围圆（像素半径 = range × 格子间距） */
  private drawRangeCircle(g: Phaser.GameObjects.Graphics, row: number, col: number, range: number, color = 0x66ff66): void {
    g.clear();
    const { x, y } = this.cellXY(row, col);
    const radius = range * (CELL + GAP);
    g.lineStyle(3, color, 0.8);
    g.strokeCircle(x, y, radius);
    g.fillStyle(color, 0.12);
    g.fillCircle(x, y, radius);
  }

  /** 摆放模式下，跟随指针显示当前悬停格防御塔的攻击范围 */
  private updateRangeHint(pointer: Phaser.Input.Pointer): void {
    if (this.placing === null) {
      this.rangeHint.setVisible(false);
      return;
    }
    const cfg = getBuildingConfig(this.placing);
    if (!cfg || cfg.kind !== 'tower' || !cfg.range) {
      this.rangeHint.setVisible(false);
      return;
    }
    const col = Math.floor((pointer.x - GRID_LEFT) / (CELL + GAP));
    const row = Math.floor((pointer.y - GRID_TOP) / (CELL + GAP));
    const base = this.state.base;
    if (row < 0 || row >= base.rows || col < 0 || col >= base.cols) {
      this.rangeHint.setVisible(false);
      return;
    }
    const check = this.baseSystem.canPlace(this.state, this.placing, row, col);
    if (!check.ok) {
      this.rangeHint.setVisible(false);
      return;
    }
    this.drawRangeCircle(this.rangeHint, row, col, cfg.range, 0x66ff66);
    this.rangeHint.setVisible(true);
  }

  private renderGrid(): void {
    this.gridLayer.removeAll(true);
    const base = this.state.base;

    for (let row = 0; row < base.rows; row++) {
      for (let col = 0; col < base.cols; col++) {
        const { x, y } = this.cellXY(row, col);
        const zone = zoneOf(row, col);

        const cell = this.add.image(x, y, 'cell-bg')
          .setDisplaySize(CELL, CELL);
        // 区域着色：内圈偏绿（资源区），外圈偏红（防御区）
        if (zone === BaseZone.Inner) cell.setTint(0x9fd8a8);
        else if (zone === BaseZone.Outer) cell.setTint(0xd8a89f);
        if (!base.tiles?.[row]?.[col]?.claimed) cell.setTint(0x4b4d55).setAlpha(0.55);
        this.gridLayer.add(cell);

        const building = buildingAt(base, row, col);
        if (building) {
          this.drawBuilding(building, x, y);
        } else {
          // 英雄不占 buildings[]，与建筑互斥（canDeployAt 校验过），画在建筑同一层
          const hero = this.heroSystem.getHeroAt(this.state, row, col);
          if (hero) this.drawHero(hero, x, y);
        }

        cell.setInteractive();
        cell.on('pointerup', () => this.handleCellTap(row, col));

        // 摆放模式：合法格绿框提示
        if (this.placing !== null && !building) {
          const check = this.baseSystem.canPlace(this.state, this.placing, row, col);
          if (check.ok) {
            const hint = this.add.image(x, y, 'cell-hint').setDisplaySize(CELL, CELL);
            this.gridLayer.add(hint);
          }
        }
        // 英雄部署模式：可部署格绿框提示（canDeployAt 已排除有建筑/有英雄的格）
        if (this.placingHero !== null) {
          const check = this.heroSystem.canDeployAt(this.state, row, col);
          if (check.ok) {
            const hint = this.add.image(x, y, 'cell-hint').setDisplaySize(CELL, CELL);
            this.gridLayer.add(hint);
          }
        }
      }
    }
  }

  /** 展示用供电判定：防御塔按夜战口径（夜里塔优先，白天塔不开火，白天缺电不影响战斗） */
  private staffedForDisplay(building: IBuilding, cfg: { kind: string }): boolean {
    if (cfg.kind === 'tower') return isTowerPoweredAtNight(this.state, building);
    return this.baseSystem.isPowered(this.state, building);
  }

  private drawBuilding(building: IBuilding, x: number, y: number): void {
    const cfg = getBuildingConfig(building.cfgId);
    if (!cfg) return;
    const staffed = this.staffedForDisplay(building, cfg);

    // 有图标纹理用建筑图标，缺失回退色块；缺电建筑灰色压暗
    const iconKey = KIND_ICON_KEYS[cfg.kind];
    if (this.textures.exists(iconKey)) {
      const img = this.add.image(x, y, iconKey).setDisplaySize(CELL - 12, CELL - 12);
      if (!staffed) img.setTint(0x9aa0a6).setAlpha(0.55);
      this.gridLayer.add(img);
      if (building.level > 1) {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0xffffff, 0.9);
        ring.strokeRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
        this.gridLayer.add(ring);
      }
    } else {
      const color = staffed ? KIND_COLORS[cfg.kind] : 0x555560;
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
      if (building.level > 1) {
        g.lineStyle(3, 0xffffff, 0.9);
        g.strokeRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
      }
      this.gridLayer.add(g);
    }

    // 有图标时名字/等级贴 cell 上下缘，避免压住图标；缺电时名字变红并移到中央（给角标让位）
    const hasIcon = this.textures.exists(iconKey);
    const isEnglish = getLanguage() === 'en';
    const buildingName = getBuildingName(cfg.id);
    const name = this.add.text(x, isEnglish ? (hasIcon ? (staffed ? y - CELL / 2 + 20 : y + 2) : y - 2) : (hasIcon ? (staffed ? y - CELL / 2 + 12 : y) : y - 8),
      isEnglish ? buildingName : buildingName.substring(0, 3), {
      fontSize: isEnglish ? '13px' : '20px', color: staffed ? '#ffffff' : '#ff6b6b', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      wordWrap: isEnglish ? { width: CELL - 6, useAdvancedWrap: true } : undefined, maxLines: isEnglish ? 2 : undefined
    }).setOrigin(0.5);
    this.gridLayer.add(name);
    const lv = this.add.text(x, hasIcon ? y + CELL / 2 - 26 : y + 16, `Lv.${building.level}`, {
      fontSize: '16px', color: '#ffe066', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    this.gridLayer.add(lv);

    // 缺电角标：右上角红底「缺电」
    if (!staffed) {
      const badge = this.add.graphics();
      badge.fillStyle(0xc92a2a, 0.95);
      badge.fillRoundedRect(x + CELL / 2 - 46, y - CELL / 2 + 2, 44, 22, 6);
      this.gridLayer.add(badge);
      const badgeText = this.add.text(x + CELL / 2 - 24, y - CELL / 2 + 13, getText('base.noPower'), {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.gridLayer.add(badgeText);
    }

    // 血条：防御类建筑（塔/墙/陷阱/核心）常显，其余建筑只在受损时显示
    const combatKind = cfg.kind === 'tower' || cfg.kind === 'wall' || cfg.kind === 'trap' || cfg.kind === 'core';
    if (combatKind || building.hp < building.maxHp) {
      const barW = CELL - 16;
      const ratio = building.hp / building.maxHp;
      const bar = this.add.graphics();
      bar.fillStyle(0x000000, 0.6);
      bar.fillRect(x - barW / 2, y + CELL / 2 - 12, barW, 6);
      bar.fillStyle(ratio > 0.5 ? 0x51cf66 : 0xff6b6b, 1);
      bar.fillRect(x - barW / 2, y + CELL / 2 - 12, barW * ratio, 6);
      this.gridLayer.add(bar);
    }
  }

  /** 格子上的英雄小立绘：char- 纹理适配格子尺寸，底部名字贴边（与建筑图标同款排布） */
  private drawHero(hero: IHeroState, x: number, y: number): void {
    const cfg = getHeroConfig(hero.key);
    const texKey = `char-${hero.key}`;
    if (this.textures.exists(texKey)) {
      const img = this.add.image(x, y, texKey).setDisplaySize(CELL - 10, CELL - 10);
      this.gridLayer.add(img);
    } else {
      const g = this.add.graphics();
      g.fillStyle(cfg?.fxColor ?? 0x4caf50, 1);
      g.fillRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
      this.gridLayer.add(g);
    }
    const isEnglish = getLanguage() === 'en';
    const heroName = cfg ? getHeroName(cfg.key) : hero.key;
    const name = this.add.text(x, isEnglish ? y + CELL / 2 - 18 : y + CELL / 2 - 12, isEnglish ? heroName : heroName.substring(0, 3), {
      fontSize: isEnglish ? '13px' : '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      wordWrap: isEnglish ? { width: CELL - 6, useAdvancedWrap: true } : undefined, maxLines: isEnglish ? 2 : undefined
    }).setOrigin(0.5);
    this.gridLayer.add(name);
    const maxHp = hero.maxHp ?? cfg?.hp ?? 100;
    const hp = hero.hp ?? maxHp;
    const bar = this.add.graphics();
    bar.fillStyle(0x241f28, 0.9).fillRect(x - 27, y + CELL / 2 - 5, 54, 6);
    bar.fillStyle(0x60d394, 1).fillRect(x - 27, y + CELL / 2 - 5, 54 * Math.max(0, hp / maxHp), 6);
    this.gridLayer.add(bar);
  }

  private handleCellTap(row: number, col: number): void {
    if (this.placingHero !== null) {
      // 部署英雄：非法格由 core 弹 reason toast，成功才退出部署模式
      const ok = this.heroSystem.deploy(this.state, this.placingHero, row, col);
      if (ok) this.placingHero = null;
      this.renderGrid();
      this.renderPalette();
      return;
    }
    if (this.placing !== null) {
      const placingId = this.placing;
      const ok = this.baseSystem.place(this.state, placingId, row, col);
      if (ok) {
        this.placing = null;
        this.storySystem.checkBuilding(this.state, placingId);
      }
      this.renderGrid();
      this.renderPalette();
      return;
    }
    const building = buildingAt(this.state.base, row, col);
    if (building) {
      this.openBuildingDialog(building);
      return;
    }
    const hero = this.heroSystem.getHeroAt(this.state, row, col);
    if (hero) this.openHeroDialog(hero);
  }

  // ============ 建造栏 ============

  private renderPalette(): void {
    this.paletteLayer.removeAll(true);
    const { width } = this.scale;

    // 分类页签（5 个：190×72，字号 28，总宽 998 不溢出竖屏）
    const tabW = 190;
    const tabGap = 12;
    const tabTotal = TABS.length * tabW + (TABS.length - 1) * tabGap;
    TABS.forEach((tab, i) => {
      const x = (width - tabTotal) / 2 + tabW / 2 + i * (tabW + tabGap);
      const active = this.activeTab === tab.kind;
      // Graphics 页签：激活态金描边，非激活态压暗
      const g = this.add.graphics();
      if (active) {
        drawUiBox(g, x, TAB_BAR_TOP + 36, tabW, 72, {
          fill: UI_SLOT_FILL, fillAlpha: 0.92, stroke: UI_GOLD, strokeAlpha: 0.6, radius: 14
        });
      } else {
        drawUiBox(g, x, TAB_BAR_TOP + 36, tabW, 72, {
          fill: UI_FILL, fillAlpha: 0.6, stroke: UI_STROKE, strokeAlpha: 0.4, radius: 14
        });
      }
      g.setInteractive(new Phaser.Geom.Rectangle(x - tabW / 2, TAB_BAR_TOP, tabW, 72), Phaser.Geom.Rectangle.Contains);
      g.on('pointerup', () => {
        this.activeTab = tab.kind;
        this.pageIndex = 0;
        this.placing = null;
        this.placingHero = null;
        this.renderGrid();
        this.renderPalette();
      });
      this.paletteLayer.add(g);
      const text = this.add.text(x, TAB_BAR_TOP + 36, getText(tab.labelKey), {
        fontSize: '28px', color: active ? '#ffffff' : '#9999bb', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.paletteLayer.add(text);
    });

    // 英雄页：已加入英雄卡片列表（非建筑，走独立渲染）
    if (this.activeTab === 'hero') {
      this.renderHeroCards();
      return;
    }

    // 建筑卡片：每页 2 列 × 2 行，超出分页
    const list = getBuildableList(this.activeTab as Exclude<BuildingKind, 'core' | 'ruin'>);
    const perPage = PALETTE_COLS * PALETTE_ROWS;
    const pageCount = Math.max(1, Math.ceil(list.length / perPage));
    this.pageIndex = Math.min(this.pageIndex, pageCount - 1);
    const pageList = list.slice(this.pageIndex * perPage, this.pageIndex * perPage + perPage);

    const gridW = PALETTE_COLS * CARD_W + (PALETTE_COLS - 1) * CARD_GAP_X;
    const startX = (width - gridW) / 2 + CARD_W / 2;

    pageList.forEach((cfg, i) => {
      const col = i % PALETTE_COLS;
      const row = Math.floor(i / PALETTE_COLS);
      const x = startX + col * (CARD_W + CARD_GAP_X);
      const y = CARDS_TOP + row * (CARD_H + CARD_GAP_Y) + CARD_H / 2;
      this.drawBuildCard(cfg, x, y);
    });

    // 底部：多页时页码条，单页时操作提示
    if (pageCount > 1) {
      this.addPageButton(width / 2 - 200, PAGE_BAR_Y, getText('page.previous'), this.pageIndex > 0, () => {
        this.pageIndex--;
        this.renderPalette();
      });
      const pageText = this.add.text(width / 2, PAGE_BAR_Y, `${this.pageIndex + 1}/${pageCount}`, {
        fontSize: '26px', color: '#ccccdd', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.paletteLayer.add(pageText);
      this.addPageButton(width / 2 + 200, PAGE_BAR_Y, getText('page.next'), this.pageIndex < pageCount - 1, () => {
        this.pageIndex++;
        this.renderPalette();
      });
    } else {
      const tipText = this.placing !== null
        ? getText('base.buildCancel')
        : getText('base.buildHint');
      const tip = this.add.text(width / 2, PAGE_BAR_Y, tipText, {
        fontSize: '22px', color: '#8888aa'
      }).setOrigin(0.5);
      this.paletteLayer.add(tip);
    }
  }

  // ============ 英雄页（建造栏第 5 个页签） ============

  /** 英雄卡片列表：已加入的英雄 2 列 × 2 行分页；一个都没加入时显示引导文案 */
  private renderHeroCards(): void {
    const { width } = this.scale;
    const joined = this.heroSystem.getJoined(this.state);

    if (joined.length === 0) {
      const guide = this.add.text(width / 2, CARDS_TOP + 120, getText('base.heroGuide'), {
        fontSize: '26px', color: '#8888aa'
      }).setOrigin(0.5);
      this.paletteLayer.add(guide);
      return;
    }

    const perPage = PALETTE_COLS * PALETTE_ROWS;
    const pageCount = Math.max(1, Math.ceil(joined.length / perPage));
    this.pageIndex = Math.min(this.pageIndex, pageCount - 1);
    const pageList = joined.slice(this.pageIndex * perPage, this.pageIndex * perPage + perPage);

    const gridW = PALETTE_COLS * CARD_W + (PALETTE_COLS - 1) * CARD_GAP_X;
    const startX = (width - gridW) / 2 + CARD_W / 2;

    pageList.forEach((hero, i) => {
      const col = i % PALETTE_COLS;
      const row = Math.floor(i / PALETTE_COLS);
      const x = startX + col * (CARD_W + CARD_GAP_X);
      const y = CARDS_TOP + row * (CARD_H + CARD_GAP_Y) + CARD_H / 2;
      this.drawHeroCard(hero, x, y);
    });

    // 底部：多页时页码条，单页时操作提示（与建筑页一致）
    if (pageCount > 1) {
      this.addPageButton(width / 2 - 200, PAGE_BAR_Y, getText('page.previous'), this.pageIndex > 0, () => {
        this.pageIndex--;
        this.renderPalette();
      });
      const pageText = this.add.text(width / 2, PAGE_BAR_Y, `${this.pageIndex + 1}/${pageCount}`, {
        fontSize: '26px', color: '#ccccdd', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.paletteLayer.add(pageText);
      this.addPageButton(width / 2 + 200, PAGE_BAR_Y, getText('page.next'), this.pageIndex < pageCount - 1, () => {
        this.pageIndex++;
        this.renderPalette();
      });
    } else {
      const tipText = this.placingHero !== null
        ? getText('base.heroDeployCancel')
        : getText('base.heroDeployHint');
      const tip = this.add.text(width / 2, PAGE_BAR_Y, tipText, {
        fontSize: '22px', color: '#8888aa'
      }).setOrigin(0.5);
      this.paletteLayer.add(tip);
    }
  }

  /** 单张英雄卡片：立绘头像 + 名字 + 攻/程/速 + 简介；已部署整卡压暗不可点 */
  private drawHeroCard(hero: IHeroState, x: number, y: number): void {
    const cfg = getHeroConfig(hero.key);
    if (!cfg) return;
    const deployed = hero.row >= 0;
    const critical = (hero.hp ?? cfg.hp) <= 0 || !!hero.recoveryDays;
    const selected = this.placingHero === hero.key;

    // 卡片底：与建筑卡片同款；部署模式选中金描边
    const g = this.add.graphics();
    drawUiBox(g, x, y, CARD_W, CARD_H, {
      stroke: selected ? UI_GOLD : UI_STROKE,
      strokeAlpha: selected ? 1 : 0.6,
      strokeWidth: selected ? 4 : 2,
      radius: 14
    });
    if (deployed || critical) g.setAlpha(0.55);
    this.paletteLayer.add(g);

    // 左侧：立绘头像 110×110（char- 纹理），缺失回退色块
    const texKey = `char-${hero.key}`;
    if (this.textures.exists(texKey)) {
      const icon = this.add.image(x - 175, y, texKey).setDisplaySize(110, 110);
      if (deployed) icon.setAlpha(0.6);
      this.paletteLayer.add(icon);
    } else {
      const iconG = this.add.graphics();
      iconG.fillStyle(cfg.fxColor, 1);
      iconG.fillRoundedRect(x - 230, y - 55, 110, 110, 14);
      this.paletteLayer.add(iconG);
    }

    const name = this.add.text(x - 104, y - 74, getHeroName(cfg.key), {
      fontSize: '34px', color: deployed ? '#9999aa' : '#ffffff', fontStyle: 'bold', padding: { x: 2, y: 8 }
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(name);

    const stats = this.add.text(x - 104, y - 32, getText('base.heroStats', { attack: cfg.attack, range: cfg.range, speed: cfg.speed }), {
      fontSize: '24px', color: '#8899aa'
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(stats);

    const health = critical
      ? getText('base.heroCritical', { days: hero.recoveryDays ?? 0 })
      : getText('base.heroHealth', { hp: hero.hp ?? cfg.hp, maxHp: hero.maxHp ?? cfg.hp });
    this.paletteLayer.add(this.add.text(x - 104, y - 2, health, { fontSize: '22px', color: critical ? '#ff8f8f' : '#60d394' }).setOrigin(0, 0.5));

    const desc = this.add.text(x - 104, y + 22, getHeroDescription(cfg.key), {
      fontSize: '22px', color: '#9fa4b8', wordWrap: { width: CARD_W - 150 }
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(desc);

    if (deployed) {
      // 已部署态：金色徽章，整卡不可再点（撤回/移动走格子上的详情弹窗）
      const badge = this.add.graphics();
      drawUiBox(badge, x + CARD_W / 2 - 90, y - CARD_H / 2 + 34, 140, 44, {
        fill: UI_SLOT_FILL, fillAlpha: 0.95, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 10
      });
      this.paletteLayer.add(badge);
      const badgeText = this.add.text(x + CARD_W / 2 - 90, y - CARD_H / 2 + 34, getText('base.deployed'), {
        fontSize: '24px', color: '#ffe066', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.paletteLayer.add(badgeText);
      return;
    }

    if (critical) return;
    g.setInteractive(new Phaser.Geom.Rectangle(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
    g.on('pointerup', () => {
      // 再点一次取消部署模式（与建筑摆放一致）
      this.placingHero = selected ? null : hero.key;
      this.placing = null;
      this.renderGrid();
      this.renderPalette();
    });
  }

  // ============ 英雄详情弹窗 ============

  /** 点格子上的英雄：立绘 + 属性 + 撤回 / 移动（撤回后立即进入部署模式）/ 关闭 */
  private openHeroDialog(hero: IHeroState): void {
    this.dialogLayer.removeAll(true);
    this.selectedRangeHint.setVisible(false);
    const cfg = getHeroConfig(hero.key);
    if (!cfg) return;

    // 选中英雄时高亮其射程圈（与防御塔一致）
    this.drawRangeCircle(this.selectedRangeHint, hero.row, hero.col, cfg.range, 0x66ff66);
    this.selectedRangeHint.setVisible(true);

    const { width, height } = this.scale;

    const mask = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
    this.dialogLayer.add(mask);

    const panelW = 620;
    const panelH = 560;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const panel = this.add.graphics();
    drawUiBox(panel, px + panelW / 2, py + panelH / 2, panelW, panelH, {
      fill: UI_FILL, fillAlpha: 0.96, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 16
    });
    this.dialogLayer.add(panel);

    // ---- 顶部：立绘 + 名称 ----
    const texKey = `char-${hero.key}`;
    if (this.textures.exists(texKey)) {
      const img = this.add.image(px + 72, py + 64, texKey).setDisplaySize(72, 72);
      this.dialogLayer.add(img);
    }
    const nameText = this.add.text(px + 124, py + 64, getHeroName(cfg.key), {
      fontSize: '36px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.dialogLayer.add(nameText);

    // 分隔线
    const divider = this.add.graphics();
    divider.lineStyle(2, UI_STROKE, 0.5);
    divider.lineBetween(px + 40, py + 116, px + panelW - 40, py + 116);
    this.dialogLayer.add(divider);

    // ---- 属性区 ----
    const rows: { label: string; value: string }[] = [
      { label: getText('base.attackRange'), value: getText('base.heroRangeValue', { attack: cfg.attack, range: cfg.range }) },
      { label: getText('base.attackSpeed'), value: getText('base.heroSpeedValue', { speed: cfg.speed }) },
      { label: getText('base.description'), value: getHeroDescription(cfg.key) }
    ];
    rows.forEach((row, i) => {
      const ry = py + 156 + i * 52;
      const labelText = this.add.text(px + 56, ry, row.label, {
        fontSize: '28px', color: '#8899aa'
      }).setOrigin(0, 0.5);
      this.dialogLayer.add(labelText);
      const valueText = this.add.text(px + 240, ry, row.value, {
        fontSize: '28px', color: '#ffffff', wordWrap: { width: panelW - 300 }
      }).setOrigin(0, 0.5);
      this.dialogLayer.add(valueText);
    });

    // ---- 底部按钮：撤回 / 移动 / 关闭（与建筑详情同款布局） ----
    const btnY = py + panelH - 64;
    const btnW = 164;
    const btnGap = 24;
    const btnLeft = px + 40;
    this.addDialogButton(btnLeft + btnW / 2, btnY, getText('base.recall'), true, () => {
      this.heroSystem.undeploy(this.state, hero.key);
      this.closeDialog();
    }, btnW, 64);
    this.addDialogButton(btnLeft + btnW + btnGap + btnW / 2, btnY, getText('base.move'), true, () => {
      this.heroSystem.undeploy(this.state, hero.key);
      this.placingHero = hero.key;
      this.placing = null;
      this.activeTab = 'hero';
      this.closeDialog();
      this.renderGrid();
      this.renderPalette();
    }, btnW, 64);
    this.addDialogButton(btnLeft + 2 * (btnW + btnGap) + btnW / 2, btnY, getText('base.close'), true, () => this.closeDialog(), btnW, 64);
  }

  /** 单张建筑卡片：图标 + 名称 + 金币造价，不足标红压暗；未解锁蓝图建筑压暗加锁 */
  private drawBuildCard(cfg: IBuildingConfig, x: number, y: number): void {
    const selected = this.placing === cfg.id;
    const unlocked = isBuildingUnlocked(this.state, cfg.id);
    const afford = this.state.resources.coin >= cfg.costCoin;

    // 卡片底：代码绘制（AI 底图内部边距不可控，弃用）；选中金描边；金币不足/未解锁压暗
    const g = this.add.graphics();
    drawUiBox(g, x, y, CARD_W, CARD_H, {
      stroke: selected ? UI_GOLD : UI_STROKE,
      strokeAlpha: selected ? 1 : 0.6,
      strokeWidth: selected ? 4 : 2,
      radius: 14
    });
    if (!afford || !unlocked) g.setAlpha(0.55);
    g.setInteractive(new Phaser.Geom.Rectangle(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
    g.on('pointerup', () => this.handlePaletteTap(cfg));
    this.paletteLayer.add(g);
    const buildingTitleFontSize = getLanguage() === 'en' ? '28px' : '34px';
    const description = getText(`base.buildingDesc.${cfg.id}`);

    // 未解锁：整卡压暗 + 锁图标 + 解锁途径文字，不再绘制消耗明细
    if (!unlocked) {
      const bpName = cfg.blueprint ? getPropName(cfg.blueprint) : getText('base.blueprint');
      const veil = this.add.graphics();
      veil.fillStyle(0x000000, 0.55);
      veil.fillRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 14);
      this.paletteLayer.add(veil);
      if (this.textures.exists('lock')) {
        const lockIcon = this.add.image(x - 175, y, 'lock').setDisplaySize(72, 72);
        this.paletteLayer.add(lockIcon);
      }
      const lockName = this.add.text(x - 104, y - 80, getBuildingName(cfg.id), {
        fontSize: buildingTitleFontSize, color: '#9999aa', fontStyle: 'bold', padding: { x: 2, y: 8 }
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockName);
      const lockDesc = this.add.text(x - 104, y - 10, description, {
        fontSize: getLanguage() === 'en' ? '18px' : '20px', color: '#aeb3c5', wordWrap: { width: CARD_W - 150, useAdvancedWrap: true }, maxLines: 2
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockDesc);
      const lockTip = this.add.text(x - 104, y + 40, getText('base.needBlueprint', { blueprint: bpName }), {
        fontSize: getLanguage() === 'en' ? '20px' : '26px', color: '#ffd43b', fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockTip);
      return;
    }

    // 左侧：建筑图标 110×110，垂直居中，距卡片左缘 20px；缺失回退色块
    const iconKey = KIND_ICON_KEYS[cfg.kind];
    if (this.textures.exists(iconKey)) {
      const icon = this.add.image(x - 175, y, iconKey).setDisplaySize(110, 110);
      this.paletteLayer.add(icon);
    } else {
      const iconG = this.add.graphics();
      iconG.fillStyle(KIND_COLORS[cfg.kind], 1);
      iconG.fillRoundedRect(x - 230, y - 55, 110, 110, 14);
      this.paletteLayer.add(iconG);
    }

    // 右上：建筑名（34px 左对齐）+ 一行小字简介（选中时替换为放置提示）
    const name = this.add.text(x - 104, y - 80, getBuildingName(cfg.id), {
      fontSize: buildingTitleFontSize, color: '#ffffff', fontStyle: 'bold', padding: { x: 2, y: 8 }
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(name);

    const sub = this.add.text(x - 104, y - 10, selected ? getText('base.placeHint') : description, {
      fontSize: getLanguage() === 'en' ? '18px' : '20px', color: selected ? '#ffe066' : '#8899aa',
      wordWrap: { width: CARD_W - 150, useAdvancedWrap: true }, maxLines: 2
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(sub);

    // 右下：金币造价，不足标红
    const rows: { icon?: string | null; color: number; name: string; have: number; need: number }[] = [];
    if (cfg.costCoin > 0) {
      rows.push({ icon: 'res-icon-coin', color: 0xffd700, name: getText('resource.coin'), have: this.state.resources.coin, need: cfg.costCoin });
    }

    rows.forEach((row, j) => {
      const rowY = y + 56 + j * 44;
      const enough = row.have >= row.need;
      if (row.icon && this.textures.exists(row.icon)) {
        const mIcon = this.add.image(x - 82, rowY, row.icon).setDisplaySize(44, 44);
        this.paletteLayer.add(mIcon);
      } else {
        const mIconG = this.add.graphics();
        mIconG.fillStyle(row.color ?? 0x888888, 1);
        mIconG.fillRoundedRect(x - 104, rowY - 22, 44, 44, 8);
        this.paletteLayer.add(mIconG);
      }
      const matName = this.add.text(x - 48, rowY, row.name, {
        fontSize: '28px', color: '#ccccdd'
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(matName);
      const matCount = this.add.text(x + 226, rowY, `${row.have}/${row.need}`, {
        fontSize: '28px', color: enough ? '#8bce6a' : '#ff6b6b', fontStyle: 'bold'
      }).setOrigin(1, 0.5);
      this.paletteLayer.add(matCount);
    });
  }

  /** 页码条小按钮（禁用态压暗不可点） */
  private addPageButton(x: number, y: number, label: string, enabled: boolean, onTap: () => void): void {
    const w = 170;
    const h = 40;
    const g = this.add.graphics();
    if (enabled) {
      drawUiBox(g, x, y, w, h, { radius: 10 });
    } else {
      drawUiBox(g, x, y, w, h, {
        fill: UI_FILL, fillAlpha: 0.5, stroke: UI_STROKE, strokeAlpha: 0.3, radius: 10
      });
    }
    if (enabled) {
      g.setInteractive(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      g.on('pointerup', () => onTap());
    }
    this.paletteLayer.add(g);
    const text = this.add.text(x, y, label, {
      fontSize: '24px', color: enabled ? '#ffffff' : '#777788', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.paletteLayer.add(text);
  }

  private handlePaletteTap(cfg: IBuildingConfig): void {
    if (!isBuildingUnlocked(this.state, cfg.id)) {
      const bpName = cfg.blueprint ? getPropName(cfg.blueprint) : getText('base.blueprint');
      this.showToast(getText('base.buildingLocked', { building: getBuildingName(cfg.id), blueprint: bpName }));
      return;
    }
    if (this.placing === cfg.id) {
      this.placing = null;
    } else {
      if (this.state.resources.coin < cfg.costCoin) {
        this.showToast(getText('base.notEnoughCoins', { coins: cfg.costCoin }));
        return;
      }
      this.placing = cfg.id;
    }
    this.renderGrid();
    this.renderPalette();
  }

  // ============ 建筑详情弹窗 ============

  private openBuildingDialog(building: IBuilding): void {
    this.dialogLayer.removeAll(true);
    this.selectedRangeHint.setVisible(false);
    const cfg = getBuildingConfig(building.cfgId);
    if (!cfg) return;

    // 选中防御塔时高亮显示其攻击范围
    if (cfg.kind === 'tower' && cfg.range) {
      this.drawRangeCircle(this.selectedRangeHint, building.row, building.col, cfg.range, 0x66ff66);
      this.selectedRangeHint.setVisible(true);
    }

    const { width, height } = this.scale;

    const mask = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
    this.dialogLayer.add(mask);

    const panelW = 620;
    const panelH = 680;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const panel = this.add.graphics();
    drawUiBox(panel, px + panelW / 2, py + panelH / 2, panelW, panelH, {
      fill: UI_FILL, fillAlpha: 0.96, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 16
    });
    this.dialogLayer.add(panel);

    // ---- 顶部：图标 + 名称 + Lv 徽章 ----
    const iconKey = KIND_ICON_KEYS[cfg.kind];
    if (this.textures.exists(iconKey)) {
      const img = this.add.image(px + 72, py + 64, iconKey).setDisplaySize(64, 64);
      this.dialogLayer.add(img);
    } else {
      const iconG = this.add.graphics();
      iconG.fillStyle(KIND_COLORS[cfg.kind], 1);
      iconG.fillRoundedRect(px + 40, py + 32, 64, 64, 12);
      this.dialogLayer.add(iconG);
    }
    const nameText = this.add.text(px + 124, py + 64, getBuildingName(cfg.id), {
      fontSize: '36px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.dialogLayer.add(nameText);

    // Lv 徽章：金色描边小圆角块（面板右上）
    const lvBadge = this.add.graphics();
    drawUiBox(lvBadge, px + panelW - 84, py + 64, 104, 48, {
      fill: UI_SLOT_FILL, fillAlpha: 0.9, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 10
    });
    this.dialogLayer.add(lvBadge);
    const lvText = this.add.text(px + panelW - 84, py + 64,
      `Lv.${building.level}${cfg.kind !== 'core' ? `/${BUILDING_MAX_LEVEL}` : ''}`, {
        fontSize: '26px', color: '#ffe066', fontStyle: 'bold'
      }).setOrigin(0.5);
    this.dialogLayer.add(lvText);

    // 分隔线
    const divider = this.add.graphics();
    divider.lineStyle(2, UI_STROKE, 0.5);
    divider.lineBetween(px + 40, py + 116, px + panelW - 40, py + 116);
    this.dialogLayer.add(divider);

    // ---- 中部属性区：标签: 值 行 ----
    const staffed = this.staffedForDisplay(building, cfg);
    const rows: { label: string; value: string; red?: boolean }[] = [
      { label: getText('base.health'), value: `${building.hp} / ${building.maxHp}` }
    ];
    if (cfg.attack) rows.push({ label: getText('base.attackRange'), value: getText('base.buildingRangeValue', { attack: attackAtLevel(cfg, building.level), range: cfg.range ?? '-' }) });
    if (cfg.slow) rows.push({ label: getText('base.slow'), value: `${Math.round(cfg.slow * 100)}%` });
    if (cfg.outputResource && cfg.outputAmount && cfg.outputInterval) {
      const resName = RESOURCE_NAME[cfg.outputResource] ?? cfg.outputResource;
      rows.push({ label: getText('base.output'), value: getText('base.resourceOutputSpaced', { interval: outputIntervalAtLevel(cfg, building.level), resource: resName, amount: outputAmountAtLevel(cfg, building.level) }) });
    }
    if (cfg.outputPool && cfg.outputPool.length > 0 && cfg.outputInterval) {
      rows.push({ label: getText('base.output'), value: getText('base.lowResourceOutputSpaced', { interval: outputIntervalAtLevel(cfg, building.level) }) });
    }
    if (cfg.capResource && cfg.capAmount) {
      const capNames = capResourceKeys(cfg).map(k => RESOURCE_NAME[k.replace('Max', '') as keyof typeof RESOURCE_NAME] ?? k).join('/');
      rows.push({ label: getText('base.capBonus'), value: `${capNames} +${capAmountAtLevel(cfg, building.level)}` });
    }
    if (cfg.needPower && !cfg.providePower) {
      const powerInfo = getPowerInfo(this.state);
      rows.push({
        label: getText('base.powerNeeded'),
        value: getText('base.powerUse', { need: cfg.needPower, used: powerInfo.used, cap: powerInfo.cap }),
        red: !staffed
      });
    }
    if (!staffed) {
      // 缺电原因：塔按夜战口径（夜里塔优先）；发电机需要燃料池有燃料才供电
      const hint = cfg.kind === 'tower'
        ? getText('base.noPowerAtNight')
        : getText('base.noPowerHint');
      rows.push({ label: getText('base.status'), value: hint, red: true });
    }

    // ---- 下部成本区 ----
    let upCostCoin = 0;
    if (cfg.kind !== 'core') {
      upCostCoin = getUpgradeCostCoin(building.cfgId, building.level);
      const maxed = upCostCoin <= 0;
      const stock = this.state.blueprintStock?.[building.cfgId] ?? 0;
      rows.push({
        label: getText('base.upgradeCost'),
        value: maxed ? getText('base.maxLevel') : getText('base.upgradeCostValue', { cost: formatUpgradeCost(upCostCoin, {}), stock }),
        red: !maxed && (this.state.resources.coin < upCostCoin || stock < 1)
      });
      rows.push({
        label: getText('base.demolishRefund'),
        value: formatUpgradeCost(getDemolishRefundCoin(building.cfgId), {})
      });
    }

    rows.forEach((row, i) => {
      const ry = py + 146 + i * 44;
      const labelText = this.add.text(px + 56, ry, row.label, {
        fontSize: '28px', color: '#8899aa'
      }).setOrigin(0, 0.5);
      this.dialogLayer.add(labelText);
      const valueText = this.add.text(px + 240, ry, row.value, {
        fontSize: '28px', color: row.red ? '#ff6b6b' : '#ffffff'
      }).setOrigin(0, 0.5);
      this.dialogLayer.add(valueText);
    });

    // ---- 底部按钮：升级 / 拆除 / 关闭，等宽均匀分布（均在面板内部） ----
    const btnY = py + panelH - 64;
    if (cfg.kind === 'core') {
      if (building.hp < building.maxHp) {
        const repairCost = getRepairCostCoin(building.cfgId, building.hp, building.maxHp);
        this.addDialogButton(px + panelW / 2, py + panelH - 140, getText('base.repair', { coins: repairCost }),
          this.state.resources.coin >= repairCost, () => {
            this.baseSystem.repair(this.state, building.row, building.col);
            this.closeDialog();
          }, panelW - 80, 56);
      }
      this.addDialogButton(px + panelW / 2, btnY, getText('base.close'), true, () => this.closeDialog(), 200, 64);
      return;
    }

    // 受损时按钮区上方加一行全宽修复按钮（金币不足时置灰）
    if (building.hp < building.maxHp) {
      const repairCost = getRepairCostCoin(building.cfgId, building.hp, building.maxHp);
      this.addDialogButton(px + panelW / 2, py + panelH - 140, getText('base.repair', { coins: repairCost }),
        this.state.resources.coin >= repairCost, () => {
          this.baseSystem.repair(this.state, building.row, building.col);
          this.closeDialog();
        }, panelW - 80, 56);
    }

    const maxed = upCostCoin <= 0;
    const blueprintStock = this.state.blueprintStock?.[building.cfgId] ?? 0;
    const canUpgrade = !maxed && this.state.resources.coin >= upCostCoin && blueprintStock >= 1;
    const btnW = 164;
    const btnGap = 24;
    const btnLeft = px + 40;
    this.addDialogButton(btnLeft + btnW / 2, btnY, maxed ? getText('base.maxLevel') : getText('base.upgrade'), canUpgrade, () => {
      this.baseSystem.upgrade(this.state, building.row, building.col);
      this.closeDialog();
    }, btnW, 64);
    this.addDialogButton(btnLeft + btnW + btnGap + btnW / 2, btnY, getText('base.demolish'), true, () => {
      this.baseSystem.demolish(this.state, building.row, building.col);
      this.closeDialog();
    }, btnW, 64);
    this.addDialogButton(btnLeft + 2 * (btnW + btnGap) + btnW / 2, btnY, getText('base.close'), true, () => this.closeDialog(), btnW, 64);
  }

  // ============ 入夜确认 ============

  private openBlackMarket(): void {
    this.closeDialog();
    const { width, height } = this.scale;
    const panelW = 860;
    const panelH = 900;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const mask = this.add.graphics();
    mask.fillStyle(0x000000, 0.65);
    mask.fillRect(0, 0, width, height);
    mask.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    this.dialogLayer.add(mask);
    const panel = this.add.graphics();
    panel.fillStyle(UI_FILL, 0.98);
    panel.fillRoundedRect(px, py, panelW, panelH, 22);
    panel.lineStyle(3, UI_GOLD, 0.85);
    panel.strokeRoundedRect(px, py, panelW, panelH, 22);
    this.dialogLayer.add(panel);
    this.dialogLayer.add(this.add.text(width / 2, py + 52, getText('base.blackMarket'), { fontSize: '36px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0.5));
    const walletY = py + 96;
    const starCount = this.add.text(px + 82, walletY, `${this.state.resources.star}`, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const diamondCount = this.add.text(px + 180, walletY, `${this.state.resources.diamond}`, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.dialogLayer.add([
      this.add.image(px + 58, walletY, 'res-icon-star').setDisplaySize(26, 26), starCount,
      this.add.image(px + 156, walletY, 'res-icon-diamond').setDisplaySize(26, 26), diamondCount
    ]);
    const refreshWallet = () => {
      starCount.setText(`${this.state.resources.star}`);
      diamondCount.setText(`${this.state.resources.diamond}`);
    };
    const exchangeX = px + panelW - 150;
    const exchange = this.add.graphics();
    drawUiBox(exchange, exchangeX, walletY, 250, 48, { radius: 10 });
    exchange.setInteractive(new Phaser.Geom.Rectangle(exchangeX - 125, walletY - 24, 250, 48), Phaser.Geom.Rectangle.Contains);
    exchange.on('pointerdown', () => exchange.setAlpha(0.7));
    exchange.on('pointerup', () => {
      exchange.setAlpha(1);
      if (!exchangeDiamondForCoins(this.state)) return;
      this.save();
      refreshWallet();
      this.showToast(getText('base.marketExchanged'));
    });
    exchange.on('pointerout', () => exchange.setAlpha(1));
    this.dialogLayer.add([
      exchange,
      this.add.image(exchangeX - 92, walletY, 'res-icon-diamond').setDisplaySize(28, 28),
      this.add.text(exchangeX - 70, walletY, '1', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5),
      this.add.text(exchangeX - 34, walletY, '->', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5),
      this.add.image(exchangeX + 12, walletY, 'prop_coin1').setDisplaySize(28, 28),
      this.add.text(exchangeX + 34, walletY, '100', { fontSize: '22px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5)
    ]);
    const cols = 2;
    const cardW = 370;
    const cardH = 102;
    const cardGap = 16;
    const listTop = py + 138;
    const listBottom = py + panelH - 132;
    const listHeight = listBottom - listTop;
    const marketList = this.add.container(0, 0);
    this.marketClipShape = this.make.graphics();
    this.marketClipShape.fillRect(px + 24, listTop, panelW - 48, listHeight);
    marketList.setMask(this.marketClipShape.createGeometryMask());
    this.dialogLayer.add(marketList);
    let didDrag = false;
    const marketItems: { y: number; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const recommended = getRecommendedMarketItem(this.state.day);
    const marketCatalog = [...BLACK_MARKET_ITEMS].sort((a, b) => Number(b.cfgId === recommended?.cfgId) - Number(a.cfgId === recommended?.cfgId));
    marketCatalog.forEach((item, index) => {
      const cfg = getBuildingConfig(item.cfgId)!;
      const x = px + 38 + (index % cols) * (cardW + 42);
      const y = listTop + Math.floor(index / cols) * (cardH + cardGap);
      const card = this.add.graphics();
      drawUiBox(card, x + cardW / 2, y + cardH / 2, cardW, cardH, { fill: 0x202435, fillAlpha: 0.95, stroke: UI_STROKE, strokeAlpha: 0.75, radius: 10 });
      card.setInteractive(new Phaser.Geom.Rectangle(x, y, cardW, cardH), Phaser.Geom.Rectangle.Contains);
      card.on('pointerup', () => {
        if (didDrag) return;
        const result = buyBlackMarketBlueprint(this.state, item.cfgId);
        if (!result.ok) return;
        this.save();
        refreshWallet();
        this.showToast(getText('base.marketBought', { building: getBuildingName(item.cfgId) }));
      });
      const iconKey = cfg.kind === 'tower' ? KIND_ICON_KEYS.tower : cfg.kind === 'resource' ? KIND_ICON_KEYS.resource : cfg.kind === 'trap' ? KIND_ICON_KEYS.trap : KIND_ICON_KEYS.wall;
      const icon = this.add.image(x + 52, y + cardH / 2, iconKey).setDisplaySize(64, 64);
      const name = this.add.text(x + 100, y + 32, getBuildingName(item.cfgId), { fontSize: '23px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 175 }, maxLines: 1 }).setOrigin(0, 0.5);
      const price = this.add.text(x + 100, y + 64, `${getText('base.marketPrice', { star: item.star })} · ${getText('base.marketFragments', { count: item.fragmentCount })}`, { fontSize: '19px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5);
      marketList.add([card, icon, name, price]);
      marketItems.push({ y, objects: [card, icon, name, price] });
    });
    const rows = Math.ceil(marketCatalog.length / cols);
    const contentHeight = rows * cardH + Math.max(0, rows - 1) * cardGap;
    const maxScroll = Math.max(0, contentHeight - listHeight);
    const updateMarketItems = () => {
      for (const entry of marketItems) {
        const top = entry.y + (marketList.y || 0);
        const visible = top + cardH >= listTop && top <= listBottom;
        for (const object of entry.objects) (object as Phaser.GameObjects.GameObject & { setVisible: (value: boolean) => void }).setVisible(visible);
      }
    };
    updateMarketItems();
    if (maxScroll > 0) {
      let scrollY = 0;
      const trackX = px + panelW - 28;
      const trackY = listTop + 8;
      const trackH = listHeight - 16;
      const thumbH = Math.max(72, trackH * listHeight / contentHeight);
      const scrollbar = this.add.graphics();
      const drawScrollbar = () => {
        scrollbar.clear();
        scrollbar.fillStyle(0x111827, 0.7);
        scrollbar.fillRoundedRect(trackX - 5, trackY, 10, trackH, 5);
        scrollbar.fillStyle(UI_GOLD, 0.9);
        scrollbar.fillRoundedRect(trackX - 5, trackY + (trackH - thumbH) * scrollY / maxScroll, 10, thumbH, 5);
      };
      const setScroll = (value: number) => {
        scrollY = Phaser.Math.Clamp(value, 0, maxScroll);
        marketList.y = -scrollY;
        updateMarketItems();
        drawScrollbar();
      };
      drawScrollbar();
      this.dialogLayer.add(scrollbar);
      this.marketScrollWheel = (_pointer, _objects, _dx, dy) => setScroll(scrollY + dy * 0.6);
      this.input.on('wheel', this.marketScrollWheel);
      let dragStartY = 0;
      let dragStartScroll = 0;
      this.marketScrollHandlers = {
        down: (pointer) => {
          didDrag = false;
          if (pointer.x >= px + 24 && pointer.x <= px + panelW - 24 && pointer.y >= listTop && pointer.y <= listBottom) {
            dragStartY = pointer.y;
            dragStartScroll = scrollY;
          } else {
            dragStartY = 0;
          }
        },
        move: (pointer) => {
          if (!dragStartY || !pointer.isDown) return;
          const deltaY = pointer.y - dragStartY;
          if (Math.abs(deltaY) > 8) didDrag = true;
          setScroll(dragStartScroll - deltaY);
        },
        up: () => { dragStartY = 0; }
      };
      this.input.on('pointerdown', this.marketScrollHandlers.down);
      this.input.on('pointermove', this.marketScrollHandlers.move);
      this.input.on('pointerup', this.marketScrollHandlers.up);
    }
    this.addDialogButton(width / 2, py + panelH - 52, getText('base.close'), true, () => this.closeDialog(), 240, 64);
  }

  private openNightConfirm(): void {
    if (this.nightPreviewWheel) this.input.off('wheel', this.nightPreviewWheel);
    this.dialogLayer.removeAll(true);
    const { width, height } = this.scale;
    const core = this.baseSystem.getCore(this.state);
    const preview = getNightPreview(this.state.day);
    const sides = getAttackSides(this.state.base);
    const routeLength = getShortestEntryPathLength(this.state.base);

    const mask = this.add.rectangle(0, 0, width, height, 0x000000, 0.65).setOrigin(0).setInteractive();
    this.dialogLayer.add(mask);

    // 自绘面板（panel-bg 贴图自带透明边距，会导致内容溢出可视框）
    const panelW = 660;
    const rowH = 44;
    const panelH = Math.min(height - 72, 930);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const panel = this.add.graphics();
    panel.fillStyle(UI_FILL, 0.97);
    panel.fillRoundedRect(px, py, panelW, panelH, 22);
    panel.lineStyle(3, UI_GOLD, 0.85);
    panel.strokeRoundedRect(px, py, panelW, panelH, 22);
    this.dialogLayer.add(panel);

    const weak = core.hp < core.maxHp / 2;
    const lx = px + 56; // 标签左边距
    const bx = px + 88; // 内容左边距（缩进）

    // 标题 + 副标题（核心血量）
    const title = this.add.text(width / 2, py + 56, getText('base.hordePreview', { day: this.state.day }), {
      fontSize: '34px', color: '#ffd75e', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.dialogLayer.add(title);
    const coreLine = this.add.text(width / 2, py + 106,
      weak ? getText('base.coreDamaged', { hp: core.hp, maxHp: core.maxHp }) : getText('base.coreHealth', { hp: core.hp, maxHp: core.maxHp }), {
        fontSize: '24px', color: weak ? '#ff8787' : '#9fa4b8'
      }).setOrigin(0.5);
    this.dialogLayer.add(coreLine);

    // 标题下分隔线
    const div = this.add.graphics();
    div.lineStyle(1, UI_GOLD, 0.35);
    div.lineBetween(px + 40, py + 140, px + panelW - 40, py + 140);
    this.dialogLayer.add(div);

    const addSection = (label: string, body: string, y: number, bodyColor = '#ffffff'): number => {
      const l = this.add.text(lx, y, label, { fontSize: '22px', color: '#8f94a8', fontStyle: 'bold' });
      const b = this.add.text(bx, y + 32, body, {
        fontSize: '24px', color: bodyColor, fontStyle: 'bold', wordWrap: { width: panelW - 150, useAdvancedWrap: true }
      });
      this.dialogLayer.add([l, b]);
      return y + 32 + b.height + 22;
    };

    // 进攻方向
    const dirText = sides.length > 0
      ? sides.map(s => getText('base.attackSide', { side: getText(`side.${s.side}`), count: s.count })).join(getText('base.listSeparator'))
      : getText('base.allSidesBlocked');
    let y = addSection(getText('base.attackDirection'), dirText, py + 168);

    y = addSection(getText('base.routeLengthLabel'), routeLength === null
      ? getText('base.routeLengthBlocked')
      : getText('base.routeLength', { cells: routeLength - 1 }), y);

    // 波次规模 + 僵尸等级
    const waveText = getText('base.waveScale', { waves: preview.waves, total: preview.total, level: preview.level })
      + (preview.bossLast ? getText('base.bossLast') : preview.eliteLast ? getText('base.eliteLast') : '');
    y = addSection(getText('base.waveScaleLabel'), waveText, y, preview.bossLast ? '#ff8787' : '#ffffff');

    if (preview.types.some(type => getZombieConfig(type.id)?.moveType === 'fly') && !canDefendFlyingEnemies(this.state)) {
      y = addSection(getText('base.defenseWarning'), getText('base.noAntiAirWarning'), y, '#ff8787');
    }

    const recommended = getRecommendedMarketItem(this.state.day);
    if (recommended) {
      y = addSection(getText('base.recommendedCounter'), getText('base.recommendedCounterBody', {
        building: getBuildingName(recommended.cfgId)
      }), y, '#ffd43b');
    }

    // 敌人类型：可滚动，避免长名单挤压底部操作。
    const typeLabel = this.add.text(lx, y, getText('base.enemyType'), { fontSize: '22px', color: '#8f94a8', fontStyle: 'bold' });
    this.dialogLayer.add(typeLabel);
    const listTop = y + 32;
    const listBottom = py + panelH - 126;
    const listHeight = Math.max(rowH, listBottom - listTop);
    const enemyList = this.add.container(0, 0);
    const maskShape = this.make.graphics();
    maskShape.fillRect(px + 40, listTop, panelW - 80, listHeight);
    const listMask = maskShape.createGeometryMask();
    enemyList.setMask(listMask);
    this.dialogLayer.add(enemyList);
    let scrollY = 0;
    const maxScrollY = Math.max(0, preview.types.length * rowH - listHeight);
    preview.types.forEach((t, i) => {
      const cy = listTop + rowH / 2 + i * rowH;
      const dot = this.add.graphics();
      dot.fillStyle(t.color, 1);
      dot.fillCircle(bx + 12, cy, 11);
      dot.lineStyle(2, 0xffffff, 0.35);
      dot.strokeCircle(bx + 12, cy, 11);
      const name = this.add.text(bx + 40, cy, getZombieName(t.id), {
        fontSize: '24px', color: t.guaranteed ? '#ffb35e' : '#ffffff', fontStyle: 'bold',
        wordWrap: { width: 255 }, maxLines: 1
      }).setOrigin(0, 0.5);
      const tag = this.add.text(px + panelW - 56, cy, getText(`zombie.tag.${t.id}`), {
        fontSize: '20px', color: '#8f94a8', wordWrap: { width: 210 }, maxLines: 1
      }).setOrigin(1, 0.5);
      const guaranteed = t.guaranteed ? this.add.text(px + panelW - 56, cy + 18, getText('base.guaranteedLast'), {
        fontSize: '16px', color: '#ffb35e'
      }).setOrigin(1, 0.5) : null;
      enemyList.add(guaranteed ? [dot, name, tag, guaranteed] : [dot, name, tag]);
    });

    if (maxScrollY > 0) {
      const onWheel = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScrollY);
        enemyList.y = -scrollY;
      };
      this.nightPreviewWheel = onWheel;
      this.input.on('wheel', onWheel);
      const thumbH = Math.max(34, listHeight * listHeight / (preview.types.length * rowH));
      const track = this.add.graphics();
      track.fillStyle(0xffffff, 0.12);
      track.fillRoundedRect(px + panelW - 32, listTop, 6, listHeight, 3);
      const thumb = this.add.graphics();
      thumb.fillStyle(UI_GOLD, 0.8);
      thumb.fillRoundedRect(px + panelW - 32, listTop, 6, thumbH, 3);
      this.dialogLayer.add([track, thumb]);
      this.input.on('wheel', () => thumb.y = (listHeight - thumbH) * (scrollY / maxScrollY));
    }

    this.addDialogButton(width / 2 - 150, py + panelH - 66, getText('base.fight'), true, () => {
      this.save();
      this.scene.start('NightScene', { state: this.state });
    });
    this.addDialogButton(width / 2 + 150, py + panelH - 66, getText('base.prepareMore'), true, () => this.closeDialog());
  }

  private addDialogButton(x: number, y: number, label: string, enabled: boolean, onTap: () => void, w: number = 250, h: number = 72): void {
    // Graphics 按钮：正常态金描边，禁用态压暗
    const g = this.add.graphics();
    if (enabled) {
      drawUiBox(g, x, y, w, h, { radius: 12 });
    } else {
      drawUiBox(g, x, y, w, h, {
        fill: UI_FILL, fillAlpha: 0.5, stroke: UI_STROKE, strokeAlpha: 0.3, radius: 12
      });
    }
    if (enabled) {
      g.setInteractive(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => g.setAlpha(0.7));
      g.on('pointerup', () => {
        g.setAlpha(1);
        onTap();
      });
      g.on('pointerout', () => g.setAlpha(1));
    }
    this.dialogLayer.add(g);
    const text = this.add.text(x, y, label, {
      fontSize: '26px', color: enabled ? '#ffffff' : '#777788', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.dialogLayer.add(text);
  }

  private closeDialog(): void {
    if (this.nightPreviewWheel) {
      this.input.off('wheel', this.nightPreviewWheel);
      this.nightPreviewWheel = undefined;
    }
    if (this.marketScrollWheel) {
      this.input.off('wheel', this.marketScrollWheel);
      this.marketScrollWheel = undefined;
    }
    if (this.marketScrollHandlers) {
      this.input.off('pointerdown', this.marketScrollHandlers.down);
      this.input.off('pointermove', this.marketScrollHandlers.move);
      this.input.off('pointerup', this.marketScrollHandlers.up);
      this.marketScrollHandlers = undefined;
    }
    this.marketClipShape?.destroy();
    this.marketClipShape = undefined;
    this.dialogLayer.removeAll(true);
    this.selectedRangeHint.setVisible(false);
  }
}
