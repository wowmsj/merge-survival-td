import * as Phaser from 'phaser';
import { IGameState, IBuilding, IItemData, IPoint, ITask, BuildingKind, TerrainKind, ItemStatus } from '../../core/types';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { GameInitializer } from '../../core/init/GameInitializer';
import { StorageSystem } from '../../core/systems/StorageSystem';
import { EconomySystem } from '../../core/systems/EconomySystem';
import { MergeSystem } from '../../core/systems/MergeSystem';
import { SpawnSystem } from '../../core/systems/SpawnSystem';
import { BagSystem } from '../../core/systems/BagSystem';
import { SpecialItemSystem } from '../../core/systems/SpecialItemSystem';
import { LevelSystem } from '../../core/systems/LevelSystem';
import { TaskSystem } from '../../core/systems/TaskSystem';
import { BaseSystem, canDefendFlyingEnemies, formatGains, formatResourceGains, getPowerInfo, hasSupportCoverage, isTowerPoweredAtNight } from '../../core/systems/BaseSystem';
import { CoreSystem } from '../../core/systems/CoreSystem';
import { computeRoutePreview, IRoutePreview } from '../../core/systems/RoutePreview';
import { zoneOf, BaseZone, buildingAt, findCoreBuilding, getShortestEntryPathLength, BASE_COLS } from '../../core/model/Base';
import { getItem } from '../../core/model/Grid';
import { itemInCd, itemIsBubble } from '../../core/model/Item';
import { getProp, isClickSpawner, PROP_IDS } from '../../core/config/PropConfig';
import { TERRAIN_CLEAR_COST, terrainAt } from '../../core/config/TerrainConfig';
import {
  getBuildingConfig, getBuildableList, getUpgradeCostCoin, getDemolishRefundCoin, getRepairCostCoin,
  attackAtLevel, outputIntervalAtLevel, outputAmountAtLevel, capResourceKeys, capAmountAtLevel, isBuildingUnlocked,
  getBlueprintBuilding,
  BUILDING_MAX_LEVEL, IBuildingConfig, RESOURCE_NAME, formatUpgradeCost
} from '../../core/config/BuildingConfig';
import { getNightPreview, getZombieConfig } from '../../core/config/ZombieConfig';
import { getAttackSides } from '../../core/systems/NightSystem';
import { HeroSystem } from '../../core/systems/HeroSystem';
import { getHeroConfig } from '../../core/config/HeroConfig';
import { IHeroState } from '../../core/types';
import { useBlueprint } from '../../core/systems/UnlockSystem';
import { hasTaskStoryBeat } from '../../core/config/StoryConfig';
import { HUD, HUD_BOTTOM } from '../ui/HUD';
import { TaskBar } from '../ui/TaskBar';
import { TaskChainPanel } from '../ui/TaskChainPanel';
import { CardBar } from '../ui/CardBar';
import { InfoBar, buildInfoActions, ICoreCardInfo, IInfoAction } from '../ui/InfoBar';
import { BagPanel } from '../ui/BagPanel';
import { SpawnerProductsPanel } from '../ui/SpawnerProductsPanel';
import { CoreIntroPanel } from '../ui/CoreIntroPanel';
import { getCoreAuraChance } from '../../core/config/MergeCoreConfig';
import { getCorePropId, getCoreTimesAt } from '../../core/config/CoreConfig';
import { HandGuide } from '../ui/HandGuide';
import { StoryArchivePanel } from '../ui/StoryArchivePanel';
import { CharacterPanel } from '../ui/CharacterPanel';
import { MonsterPanel } from '../ui/MonsterPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StoryDialog } from '../ui/StoryDialog';
import { StorySystem } from '../../core/systems/StorySystem';
import { UI_FILL, UI_GOLD, UI_ORANGE, UI_SLOT_FILL, UI_STROKE, drawUiBox } from '../ui/UiStyle';
import { drawTerrainTile, terrainHasOverlayIcon } from '../ui/TerrainTiles';
import { addFullscreenBg, showSceneToast, makeUiButton } from '../ui/UiWidgets';
import { KIND_COLORS, KIND_ICON_KEYS, buildingIconKey } from '../config/BuildingKindStyle';
import { getBuildingName, getHeroDescription, getHeroName, getLanguage, getPropName, getText, getZombieName, setLanguage, type Language } from '../../core/i18n';
import { BLACK_MARKET_ITEMS, buyBlackMarketBlueprint, buyNeededMaterial, exchangeDiamondForCoins, getNeededMaterials, getRecommendedMarketItem } from '../../core/systems/BlackMarketSystem';
import { getItemIconKey, colorFromId } from '../config/ItemIconMap';
import { Base3DRenderer } from '../../three/Base3DRenderer';

/** webpack DefinePlugin 注入：开发专用功能开关（夜战测试、2D/3D 切换、e2e 调试钩子） */
declare const __DEV_FEATURES__: boolean;

/** 顶栏（天数/核心/迎接夜晚）中线 Y：压在任务条（HUD 下 98px）之下 */
const TOP_BAR_Y = HUD_BOTTOM + 140;
/** 顶栏「路线」开关中心 x（夹在天数/核心血量与「迎接夜晚」之间） */
const ROUTE_BTN_X = 730;
const GRID_TOP = TOP_BAR_Y + 40;
const GRID_LEFT = 24;
const CELL = 66;
const GAP = 6;
const TAB_BAR_TOP = 1450;
/** 右侧竖排菜单（剧情/角色/怪物/商店/设置）中心 x 与起始 y：网格矩形右侧竖条 */
const MENU_X = 1020;
const MENU_TOP = 402;
const MENU_GAP = 104;

/** 13×13 网格矩形（设计像素）；3D 渲染器画布对齐此矩形 */
export const BASE_GRID_RECT = {
  left: GRID_LEFT,
  top: GRID_TOP,
  size: BASE_COLS * (CELL + GAP) - GAP
};

const BASE_3D_STORAGE_KEY = 'merge_survival_td_base_3d';

/** 核心格长按判定时长（ms）：短按=选中/发射，长按=打开核心面板 */
const CORE_HOLD_MS = 480;

/** 路线箭头显示开关的存档 key */
const ROUTE_STORAGE_KEY = 'merge_survival_td_route';
/** 路线箭头纹理边长（设计像素；格子 66，留边避免相邻格箭头挤在一起） */
const ROUTE_TEX_SIZE = 96;

/** 主流向 → 2D 精灵角度（Phaser 角度为顺时针，0 = 朝上=北） */
function routeAngle(dr: number, dc: number): number {
  if (dr === -1) return 0;
  if (dc === 1) return 90;
  if (dr === 1) return 180;
  return 270;
}

/** 冷却剩余毫秒 → m:ss（核心信息卡/格子角标共用） */
function formatCdRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 建造栏布局：每页 2 列 × 2 行共 4 张大卡片，超出分页（底部页码条） */
const PALETTE_COLS = 2;
const PALETTE_ROWS = 2;
const CARD_W = 500;
const CARD_H = 172;
const CARD_GAP_X = 30;
const CARD_GAP_Y = 8;
const CARDS_TOP = 1532;
const PAGE_BAR_Y = 1900;

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
 * 基地场景（唯一主场景）：自由摆放防御塔/资源建筑/陷阱/城墙 + 基地格上直接合成
 * 启动流程：BootScene → BaseScene（无传入 state 时读档或新开局；剧情前置流程保留）
 */
export class BaseScene extends Phaser.Scene {
  private state!: IGameState;
  private nightEndStory: { won: boolean; day: number } | null = null;
  private openMarketOnEnter = false;
  /** 其他场景（夜战/夜战测试）带入的已有状态；为空时读档或新开局 */
  private passedState: IGameState | null = null;
  private storage!: StorageSystem;
  private economy!: EconomySystem;
  private baseSystem!: BaseSystem;
  private heroSystem!: HeroSystem;
  private taskSystem!: TaskSystem;
  private storySystem!: StorySystem;
  private storyDialog!: StoryDialog;
  // 基地即合成场：物品层移动/合成/发射
  private mergeSystem!: MergeSystem;
  private spawnSystem!: SpawnSystem;
  private bagSystem!: BagSystem;
  private specialSystem!: SpecialItemSystem;
  /** 基地核心（= 合成核心 = 发射器）：库存/CD/升级 */
  private coreSystem!: CoreSystem;
  /** 当前选中的物品格（3D 高亮 + 发射器二次点击判定） */
  private selectedItem: IPoint | null = null;
  /** 核心格长按计时（长按 = 打开核心面板，短按 = 发射） */
  private coreHoldTimer: number | null = null;
  private coreHoldFired = false;

  // ============ 僵尸路线预览 ============
  /** 路线箭头层（2D 网格用；3D 由 Base3DRenderer 画贴地 quad） */
  private routeLayer!: Phaser.GameObjects.Container;
  /** 是否显示路线箭头（持久化在 localStorage） */
  private routeVisible = true;
  /** 摆放模式下指针悬停格：作为「将建建筑」参与路线重算（改道预览） */
  private hoverCell: IPoint | null = null;
  private routeToggleBg?: Phaser.GameObjects.Graphics;
  private routeToggleText?: Phaser.GameObjects.Text;
  private lastPreview: IRoutePreview | null = null;

  /** 最近一次算出的僵尸路线（调试与 e2e 断言用） */
  get routePreview(): IRoutePreview | null {
    return this.lastPreview;
  }
  /** 已就"通路封死"提示过一次（通路恢复后重置，避免刷屏） */
  private sealedRouteAnnounced = false;

  private hud!: HUD;
  private taskBar!: TaskBar;
  private taskChainPanel: TaskChainPanel | null = null;
  private cardBar!: CardBar;
  private infoBar!: InfoBar;
  private bagPanel!: BagPanel;
  private spawnerPanel!: SpawnerProductsPanel;
  private coreIntroPanel!: CoreIntroPanel;
  /** 剧情回顾面板（每次打开新建实例，关闭后 isOpen 为 false） */
  private storyPanel: StoryArchivePanel | null = null;
  /** 角色图鉴面板（同上，用完即弃） */
  private characterPanel: CharacterPanel | null = null;
  private monsterPanel: MonsterPanel | null = null;
  private settingsPanel: SettingsPanel | null = null;

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
  /** 3D 网格渲染器（默认开启；localStorage 显式 '0' 时回退 2D 调试网格，无物品层） */
  private renderer3d: Base3DRenderer | null = null;

  constructor() {
    super({ key: 'BaseScene' });
  }

  init(data?: { state?: IGameState; nightEndStory?: { won: boolean; day: number }; openBlackMarket?: boolean }): void {
    this.passedState = data?.state ?? null;
    this.nightEndStory = data?.nightEndStory ?? null;
    this.openMarketOnEnter = data?.openBlackMarket === true;
  }

  create(): void {
    try {
      // 创建系统（装配顺序有依赖：背包/特殊道具/升级经验）
      this.storage = new StorageSystem();
      this.economy = new EconomySystem();
      this.bagSystem = new BagSystem();
      this.specialSystem = new SpecialItemSystem(this.economy);
      this.baseSystem = new BaseSystem(this.economy);
      const levelSystem = new LevelSystem(this.economy);
      this.mergeSystem = new MergeSystem(this.bagSystem, this.specialSystem, levelSystem);
      this.spawnSystem = new SpawnSystem();
      this.coreSystem = new CoreSystem(this.economy);
      this.taskSystem = new TaskSystem(this.bagSystem, this.economy);
      this.heroSystem = new HeroSystem();
      this.storySystem = new StorySystem();

      // 夜战/夜战测试带回已有状态；否则读档或新开局
      const saved = this.passedState ? null : this.storage.loadState();
      const pendingMode = localStorage.getItem('merge_survival_td_pending_mode');
      if (pendingMode === 'merge' || pendingMode === 'build') {
        localStorage.removeItem('merge_survival_td_pending_mode');
      }
      const newGameMode = pendingMode === 'build' ? 'build' : 'merge';
      this.state = this.passedState ?? ((saved && this.gridHasItem(saved)) ? saved : GameInitializer.initNewGame(this.taskSystem, newGameMode));
      this.economy.recoverPower(this.state);
      const isNewGame = !this.passedState && !(saved && this.gridHasItem(saved));
      // 发布面向海外（itch.io）：新开局默认英文，不看浏览器语言；玩家可在设置里切中文
      if (isNewGame) this.state.language = 'en';
      setLanguage(this.state.language);
      // 清理存档里按旧规则生成、当前不可能完成的任务（仅读档时跑一次）
      if (saved && this.state === saved) {
        this.taskSystem.pruneImpossibleTasks(this.state);
      }
      this.taskSystem.refreshTaskRewards(this.state);
      this.baseSystem.ensure(this.state);
      // 夜晚中途退出（刷新/切后台被杀）重置为白天，视为未入夜
      if (this.state.phase === 'night') this.state.phase = 'day';

      // 剧情：对话浮层 + 触发（新开局播第一章，读档补播未看过的等级/物品剧情；
      // 已有建筑补播——老存档首次进基地也能看到对应剧情）
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
      if (isNewGame) {
        this.storySystem.onNewGame(this.state);
      }
      this.storySystem.onGameReady(this.state);
      // 已有存档的核心等级也补播 coreLevel 类剧情（旧档折算成高等级时不会漏）
      this.storySystem.checkCoreLevel(this.state, this.coreSystem.getLevel(this.state));

      // 全屏主背景（缺失时保持纯色底）
      addFullscreenBg(this);

      // 进场景结算一次产出（含离线收益）
      const gains = this.baseSystem.tickProduction(this.state);

      this.hud = new HUD(this, this.state);
      this.hud.getPowerFreeRemain = () => this.specialSystem.getPowerFreeRemain(this.state);

      // 任务条 / 卡片栏 / 物品详情条（原 GameScene 迁移，复用组件）
      this.taskBar = new TaskBar(this, this.state);
      this.taskBar.countItem = (id) => this.taskSystem.countItem(this.state, id);
      this.taskBar.canComplete = (task) => this.taskSystem.canCompleteTask(this.state, task);
      this.taskBar.onSubmit = (task) => this.handleTaskSubmit(task);
      this.taskBar.onViewChain = (task) => {
        this.taskChainPanel = new TaskChainPanel(this);
        this.taskChainPanel.onDiamondComplete = (t) => this.handleTaskDiamondComplete(t);
        this.taskChainPanel.open(task);
      };

      this.cardBar = new CardBar(this, this.state);
      this.cardBar.onUseCard = (index) => this.economy.useCard(this.state, index);

      this.infoBar = new InfoBar(this, this.state);

      this.bagPanel = new BagPanel(this);
      this.bagPanel.getBagSlots = () => {
        const bagItem = this.bagSystem.getBagItem(this.state);
        return bagItem?.roomArr ?? [];
      };
      this.bagPanel.onTakeOut = (index) => this.bagSystem.takeOut(this.state, index);
      this.bagPanel.onAddSlot = () => {
        this.bagSystem.addSlot(this.state, (amount) => this.economy.subResource(this.state, 'coin', amount));
      };

      this.spawnerPanel = new SpawnerProductsPanel(this);
      this.coreIntroPanel = new CoreIntroPanel(this, this.state, {
        onUpgrade: () => {
          const ok = this.coreSystem.upgrade(this.state);
          if (ok) {
            const level = this.coreSystem.getLevel(this.state);
            this.storySystem.checkCoreLevel(this.state, level);
            this.save();
            this.renderGrid();
            this.setItemSelection(this.selectedItem);
          }
          return ok;
        },
        onViewProducts: () => this.openCoreProducts(),
        onRepair: () => {
          const core = findCoreBuilding(this.state.base);
          if (!core) return false;
          const ok = this.baseSystem.repair(this.state, core.row, core.col);
          if (ok) this.save();
          return ok;
        },
        onSkipCd: () => {
          const ok = this.coreSystem.skipCd(this.state);
          if (ok) {
            this.save();
            this.renderGrid();
            this.setItemSelection(this.selectedItem);
          }
          return ok;
        }
      }, this.coreSystem);

      // 右侧竖排菜单：剧情 / 角色 / 怪物 / 商店 / 设置
      const menuButtons: { label: string; onTap: () => void }[] = [
        // 剧情回顾：主线章节列表（已解锁可重播，未解锁显示条件）
        { label: getText('menu.story'), onTap: () => {
          const panel = new StoryArchivePanel(this, this.state);
          this.storyPanel = panel;
          panel.onReplay = (beat) => {
            panel.close();
            this.storySystem.replay(beat);
          };
          panel.open();
        } },
        // 角色图鉴：已遇到 NPC 的立绘与背景故事（含玩家自己）
        { label: getText('menu.characters'), onTap: () => {
          this.characterPanel = new CharacterPanel(this, this.state);
          this.characterPanel.open();
        } },
        { label: getText('menu.monsters'), onTap: () => {
          this.monsterPanel = new MonsterPanel(this);
          this.monsterPanel.open();
        } },
        { label: getText('menu.shop'), onTap: () => this.openBlackMarket() },
        { label: getText('menu.settings'), onTap: () => {
          this.settingsPanel = new SettingsPanel(
            this,
            (language: Language) => this.changeLanguage(language),
            () => this.resetGame(),
            this.state.playMode ?? 'merge',
            (mode) => this.changePlayMode(mode),
            () => this.save(),
            {
              save: () => this.save(),
              adoptCloudState: (state) => this.storage.adoptState(state),
              reload: () => location.reload(),
              toast: (msg) => this.showToast(msg)
            }
          );
          this.settingsPanel.open();
        } }
      ];
      menuButtons.forEach((m, i) => {
        makeUiButton(this, null, MENU_X, MENU_TOP + i * MENU_GAP, 116, 80, m.label, { box: { radius: 14 }, fontSize: '22px', depth: 100 }, m.onTap);
      });

      new HandGuide(this, this.state);

      // 顶部：天数/核心血量 + 迎接夜晚
      const core = this.baseSystem.getCore(this.state);
      this.dayText = this.add.text(380, TOP_BAR_Y, getText('base.day', { day: this.state.day }), {
        fontSize: '26px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.coreText = this.add.text(610, TOP_BAR_Y, getText('base.coreHp', { hp: core.hp, maxHp: core.maxHp }), {
        fontSize: '24px', color: '#ffd43b', fontStyle: 'bold'
      }).setOrigin(0.5);

      // 僵尸路线显示开关（默认开；箭头随布局实时重算）
      this.ensureRouteToggle();

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
      // 僵尸路线箭头层：压在格子/建筑之上、弹窗(500)与范围圈(40)之下
      this.routeLayer = this.add.container(0, 0).setDepth(20);
      this.dialogLayer = this.add.container(0, 0).setDepth(500);

      this.rangeHint = this.add.graphics().setDepth(40).setVisible(false);
      this.selectedRangeHint = this.add.graphics().setDepth(40).setVisible(false);

      // 路线箭头纹理（2D 用精灵、3D 用贴格 quad 材质，同一套纹理保证两套渲染一致）
      this.routeVisible = localStorage.getItem(ROUTE_STORAGE_KEY) !== '0';
      this.ensureRouteTextures();

      // 3D 网格（暖土 GLB）：画布只覆盖 13×13 网格矩形，默认开启（唯一主场景，物品层只存在于 3D）；
      // localStorage 显式设 '0' 时回退 2D 调试网格（无物品层，仅排查用）
      const use3d = localStorage.getItem(BASE_3D_STORAGE_KEY) !== '0';
      if (use3d) {
        this.renderer3d = new Base3DRenderer(this, this.state, {
          // 弹层（剧情对话/回顾/图鉴/设置/背包等全屏 UI）打开时屏蔽棋盘输入并隐藏画布，防止点穿
          inputBlocked: () =>
            this.dialogLayer.list.length > 0 || this.storyDialog.isOpen ||
            (this.storyPanel?.isOpen ?? false) || (this.characterPanel?.isOpen ?? false) || (this.monsterPanel?.isOpen ?? false) || (this.settingsPanel?.isOpen ?? false) || (this.taskChainPanel?.isOpen ?? false) || (this.cardBar?.isOpen ?? false) || (this.bagPanel?.isVisible() ?? false) || (this.spawnerPanel?.isVisible() ?? false) || (this.coreIntroPanel?.isOpen ?? false),
          onCellTap: (row, col) => this.handleCellTap(row, col),
          onCellLongPress: (row, col) => {
            const core = findCoreBuilding(this.state.base);
            if (core && core.row === row && core.col === col) this.openCorePanel();
          },
          onCellHover: (row, col) => this.handleCellHover(row, col),
          onItemDrop: (src, target) => this.handleItemDrop(src, target),
          taskNeeded: (id) => this.taskSystem.isTaskNeedWithId(this.state, id),
          placingCfg: () => (this.placing !== null ? getBuildingConfig(this.placing) ?? null : null),
          placingHero: () => this.placingHero !== null,
          canPlaceAt: (row, col) => {
            if (this.placingHero !== null) return this.heroSystem.canDeployAt(this.state, row, col).ok;
            if (this.placing !== null) return this.baseSystem.canPlace(this.state, this.placing, row, col).ok;
            return false;
          },
          decorate: (b) => {
            const cfg = getBuildingConfig(b.cfgId);
            const powered = cfg ? this.staffedForDisplay(b, cfg) : true;
            return {
              powered,
              antiAir: b.cfgId === 101 && powered && hasSupportCoverage(this.state, 'radar', b.row, b.col, true)
            };
          }
        }, BASE_GRID_RECT);
        this.gridLayer.setVisible(false);
        const onResize = () => this.renderer3d?.layoutRect(BASE_GRID_RECT);
        window.addEventListener('resize', onResize);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          window.removeEventListener('resize', onResize);
        });
      }

      this.renderGrid();
      this.renderPalette();

      // 开发调试钩子（e2e 验收用），生产包不注入；2D 网格模式没有 Base3DRenderer 的 __base3d
      if (__DEV_FEATURES__) {
        (window as unknown as Record<string, unknown>).__basescene = this;
      }

      // 防御塔摆放时显示攻击范围圈
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.updateRangeHint(pointer);
        this.updateRouteHoverFromPointer(pointer);
      });

      const onBaseChanged = () => {
        const c = this.baseSystem.getCore(this.state);
        this.dayText.setText(getText('base.day', { day: this.state.day }));
        this.coreText.setText(getText('base.coreHp', { hp: c.hp, maxHp: c.maxHp }));
        this.renderGrid();
        this.renderPalette();
        // 核心被选中时刷新信息卡（库存/冷却随时间变化）
        if (this.selectedItem && this.selectedItem.row === c.row && this.selectedItem.col === c.col) {
          this.infoBar.showCore(this.buildCoreCard());
        }
        this.save();
      };
      const onToast = (msg: string) => this.showToast(msg);
      const onHeroJoined = (data: { key: string }) => this.playHeroJoined(data.key);

      // 物品层事件 → 3D 棋子层局部刷新（摆放/部署模式下顺带全量同步，刷新合法格提示）
      const afterItemChange = () => {
        // 棋子与建筑一样挡路：棋子变化后重算路线箭头
        this.renderRoutePreview();
        if (this.placing !== null || this.placingHero !== null) this.renderGrid();
      };
      const onItemChanged = (data: { pos: IPoint }) => {
        this.renderer3d?.refreshCell(data.pos.row, data.pos.col);
        this.taskBar.refresh();
        afterItemChange();
      };
      const onItemMoved = (data: { src: IPoint; target: IPoint }) => {
        this.renderer3d?.refreshCell(data.src.row, data.src.col);
        this.renderer3d?.refreshCell(data.target.row, data.target.col);
        afterItemChange();
      };
      const onItemMerged = (data: { src: IPoint; target: IPoint; cartonBreaks: IPoint[] }) => {
        this.renderer3d?.refreshCell(data.src.row, data.src.col);
        this.renderer3d?.refreshCell(data.target.row, data.target.col);
        this.renderer3d?.playMergeEffect(data.target);
        for (const pos of data.cartonBreaks || []) {
          this.renderer3d?.refreshCell(pos.row, pos.col);
        }
        this.taskBar.refresh();
        this.storySystem.checkMerge(this.state);
        afterItemChange();
      };
      const onItemSpawned = (data: { newPositions: IPoint[] }) => {
        const spawnedIds: number[] = [];
        for (const pos of data.newPositions) {
          this.renderer3d?.refreshCell(pos.row, pos.col);
          this.renderer3d?.playSpawnEffect(pos);
          const it = getItem(this.state.grid, pos.row, pos.col);
          if (it) spawnedIds.push(it.id);
        }
        this.taskBar.refresh();
        this.storySystem.checkItems(this.state, spawnedIds);
        afterItemChange();
      };
      const onBubbleBomb = (data: { pos: IPoint }) => {
        this.renderer3d?.refreshCell(data.pos.row, data.pos.col);
        this.showToast(getText('game.bubblePopped'));
      };
      const onResourceChanged = (data: { type?: string; value?: number }) => {
        if (data?.type === 'coin' && typeof data.value === 'number') {
          this.storySystem.checkCoin(this.state, data.value);
        }
      };
      const onLevelUp = (data: { level: number }) => {
        this.showToast(getText('game.levelUp', { level: data.level }));
        this.storySystem.checkLevel(this.state, data.level);
      };
      const onTaskUpdated = () => this.taskBar.refresh();
      const onTaskDone = (data: { task: ITask }) => {
        this.taskBar.refresh();
        this.renderer3d?.refreshItems(); // 任务需求标记（棋子角标勾）随任务完成重算
        this.storySystem.checkTaskDone(this.state, data?.task?.id);
      };
      const onCardUpdated = () => this.cardBar.refresh();
      const onBagUpdated = () => this.bagPanel.refresh();
      const onSpeedUpEnd = () => this.showToast(getText('game.acceleratorStopped'));

      eventBus.on(GameEvents.BASE_CHANGED, onBaseChanged);
      eventBus.on(GameEvents.TOAST_SHOW, onToast);
      eventBus.on(GameEvents.HERO_JOINED, onHeroJoined);
      eventBus.on(GameEvents.GRID_ITEM_CHANGED, onItemChanged);
      eventBus.on(GameEvents.GRID_ITEM_MOVED, onItemMoved);
      eventBus.on(GameEvents.GRID_ITEM_MERGED, onItemMerged);
      eventBus.on(GameEvents.GRID_ITEM_SPAWNED, onItemSpawned);
      eventBus.on(GameEvents.GRID_BUBBLE_BOMB, onBubbleBomb);
      eventBus.on(GameEvents.RESOURCE_CHANGED, onResourceChanged);
      eventBus.on(GameEvents.ROLE_LEVEL_UP, onLevelUp);
      eventBus.on(GameEvents.TASK_UPDATED, onTaskUpdated);
      eventBus.on(GameEvents.TASK_DONE, onTaskDone);
      eventBus.on(GameEvents.CARD_UPDATED, onCardUpdated);
      eventBus.on(GameEvents.BAG_UPDATED, onBagUpdated);
      eventBus.on(GameEvents.SPEED_UP_END, onSpeedUpEnd);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        eventBus.off(GameEvents.BASE_CHANGED, onBaseChanged);
        eventBus.off(GameEvents.TOAST_SHOW, onToast);
        eventBus.off(GameEvents.HERO_JOINED, onHeroJoined);
        eventBus.off(GameEvents.GRID_ITEM_CHANGED, onItemChanged);
        eventBus.off(GameEvents.GRID_ITEM_MOVED, onItemMoved);
        eventBus.off(GameEvents.GRID_ITEM_MERGED, onItemMerged);
        eventBus.off(GameEvents.GRID_ITEM_SPAWNED, onItemSpawned);
        eventBus.off(GameEvents.GRID_BUBBLE_BOMB, onBubbleBomb);
        eventBus.off(GameEvents.RESOURCE_CHANGED, onResourceChanged);
        eventBus.off(GameEvents.ROLE_LEVEL_UP, onLevelUp);
        eventBus.off(GameEvents.TASK_UPDATED, onTaskUpdated);
        eventBus.off(GameEvents.TASK_DONE, onTaskDone);
        eventBus.off(GameEvents.CARD_UPDATED, onCardUpdated);
        eventBus.off(GameEvents.BAG_UPDATED, onBagUpdated);
        eventBus.off(GameEvents.SPEED_UP_END, onSpeedUpEnd);
        this.renderer3d?.dispose();
        this.renderer3d = null;
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
      });

      // 物品层 tick：发射器 cd 恢复/气泡到期/自动生成（500ms）
      this.time.addEvent({ delay: 500, loop: true, callback: () => this.spawnSystem.update(this.state, 500) });

      // 周期产出 + 存档（供电状态随燃料到期变化，刷新网格上的缺电角标）
      this.time.addEvent({
        delay: 5000, loop: true, callback: () => {
          this.baseSystem.tickProduction(this.state);
          this.economy.recoverPower(this.state);
          this.renderGrid();
          this.save();
        }
      });
      document.addEventListener('visibilitychange', this.onVisibilityChange);

      const gainText = formatGains(gains.items);
      const resourceGainText = formatResourceGains(gains.resources);
      if (gainText !== getText('base.none')) this.showToast(getText('base.resourceGain', { gain: gainText }));
      if (resourceGainText !== getText('base.none')) this.showToast(getText('base.resourceGain', { gain: resourceGainText }));
      if (this.openMarketOnEnter) this.openBlackMarket();
    } catch (e) {
      console.error('[BaseScene] create error:', e);
      this.add.text(this.scale.width / 2, this.scale.height / 2, getText('game.loadFailed', { error: String(e) }), {
        fontSize: '20px',
        color: '#ff0000',
        align: 'center'
      }).setOrigin(0.5);
    }
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
    this.scene.restart();
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

  private showToast(msg: string): void {
    showSceneToast(this, msg, { yRatio: 0.7 });
  }

  update(): void {
    this.renderer3d?.update();
    this.hud?.update();
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
    if (this.renderer3d) {
      this.rangeHint.setVisible(false); // 3D 下范围圈由 Base3DRenderer 悬停绘制
      return;
    }
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
    if (this.renderer3d) {
      this.renderer3d.syncAll(); // 3D 网格：地形/建筑/英雄/摆放提示全量同步
      this.renderRoutePreview();
      return;
    }
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
          // 地形与建筑互斥（地形格不可摆放），画在地格层之上
          const terrain = terrainAt(base, row, col);
          if (terrain) this.drawTerrain(terrain, row, col, x, y);
          // 英雄不占 buildings[]，与建筑互斥（canDeployAt 校验过），画在建筑同一层
          const hero = this.heroSystem.getHeroAt(this.state, row, col);
          if (hero) this.drawHero(hero, x, y);
        }

        cell.setInteractive();
        const core = findCoreBuilding(base);
        if (core && core.row === row && core.col === col) {
          // 基地核心 = 发射器：短按选中/发射，长按打开核心面板
          cell.on('pointerdown', () => this.beginCoreHold());
          cell.on('pointerup', () => this.endCoreHold(row, col));
          cell.on('pointerout', () => this.cancelCoreHold());
        } else {
          cell.on('pointerup', () => this.handleCellTap(row, col));
        }

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
    // 铺完格子再画路线箭头（棋盘/地形/建筑/棋子都会影响寻路）
    this.renderRoutePreview();
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

    // 优先建筑专属贴图（bldg-<id>），缺失回退大类图标，再缺失回退色块；缺电建筑灰色压暗
    const perKey = buildingIconKey(cfg.id);
    const iconKey = this.textures.exists(perKey) ? perKey : KIND_ICON_KEYS[cfg.kind];
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

    // 名字不显示：靠图标识别建筑；等级贴 cell 下缘，缺电靠压暗 + 红角标表达
    const hasIcon = this.textures.exists(iconKey);
    const lv = this.add.text(x, hasIcon ? y + CELL / 2 - 26 : y + 16, `Lv.${building.level}`, {
      fontSize: '16px', color: '#ffe066', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    this.gridLayer.add(lv);

    // 核心 = 发射器：左下角显示剩余库存，冷却中改为倒计时
    if (cfg.kind === 'core') {
      const remain = this.coreSystem.cdRemainMs(this.state);
      const cooling = (building.cdSum ?? 0) > 0 || remain > 0;
      const stockText = cooling
        ? formatCdRemain(remain)
        : `x${building.times ?? 0}`;
      const badge = this.add.graphics();
      badge.fillStyle(cooling ? 0x8a5a00 : 0x14532d, 0.92);
      badge.fillRoundedRect(x - CELL / 2 + 2, y + CELL / 2 - 24, cooling ? 52 : 40, 22, 6);
      this.gridLayer.add(badge);
      this.gridLayer.add(this.add.text(x - CELL / 2 + (cooling ? 28 : 22), y + CELL / 2 - 13, stockText, {
        fontSize: '15px', color: cooling ? '#ffd75e' : '#8ce99a', fontStyle: 'bold'
      }).setOrigin(0.5));
    }

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

    // 对空角标：通电箭塔处于通电雷达覆盖内，左上角亮蓝「对空/AA」
    if (building.cfgId === 101 && staffed && hasSupportCoverage(this.state, 'radar', building.row, building.col, true)) {
      const badge = this.add.graphics();
      badge.fillStyle(0x1971c2, 0.95);
      badge.fillRoundedRect(x - CELL / 2 + 2, y - CELL / 2 + 2, 44, 22, 6);
      this.gridLayer.add(badge);
      const badgeText = this.add.text(x - CELL / 2 + 24, y - CELL / 2 + 13, getText('base.antiAir'), {
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

  /** 地形瓦片：地面连成一片（瓦片地图式），树林/破楼/瓦砾叠加小一号主体图标保持辨识度 */
  private drawTerrain(terrain: TerrainKind, row: number, col: number, x: number, y: number): void {
    drawTerrainTile(this, this.gridLayer, this.state.base, row, col, x, y, CELL, GAP);
    if (!terrainHasOverlayIcon(terrain)) return;
    const texKey = `terrain-${terrain}`;
    if (this.textures.exists(texKey)) {
      const img = this.add.image(x, y, texKey).setDisplaySize((CELL - 8) * 0.72, (CELL - 8) * 0.72);
      this.gridLayer.add(img);
    }
  }

  // ============ 基地核心（= 合成核心 = 发射器） ============

  /** 长按核心格：到点只记标记，抬手才开面板（避免同一次手势的抬手被面板遮罩当成「点空白关闭」） */
  private beginCoreHold(): void {
    this.cancelCoreHold();
    this.coreHoldFired = false;
    // 用真实时间计时（与 3D 渲染器同一套），不依赖场景时钟：2D/3D 手感一致，也不受暂停影响
    this.coreHoldTimer = window.setTimeout(() => {
      this.coreHoldTimer = null;
      this.coreHoldFired = true;
    }, CORE_HOLD_MS);
  }

  private cancelCoreHold(): void {
    if (this.coreHoldTimer !== null) {
      window.clearTimeout(this.coreHoldTimer);
      this.coreHoldTimer = null;
    }
  }

  private endCoreHold(row: number, col: number): void {
    const wasHold = this.coreHoldFired;
    this.coreHoldFired = false;
    this.cancelCoreHold();
    if (wasHold) {
      const core = findCoreBuilding(this.state.base);
      if (core && core.row === row && core.col === col) this.openCorePanel();
      return;
    }
    this.handleCoreTap();
  }

  /** 核心短按：首次选中，选中后再点发射（与其它发射器手感一致，可连点连发） */
  private handleCoreTap(): void {
    if (this.coreIntroPanel?.isOpen) return;
    const core = findCoreBuilding(this.state.base);
    if (!core) return;
    const wasSelected = this.selectedItem?.row === core.row && this.selectedItem?.col === core.col;
    if (wasSelected) {
      this.coreSystem.clickSpawn(this.state);
      this.save();
    }
    this.setItemSelection({ row: core.row, col: core.col });
    this.renderGrid();
  }

  /** 核心面板（长按核心格 / 信息卡「核心」按钮） */
  private openCorePanel(): void {
    this.setItemSelection(null);
    this.coreIntroPanel.open();
  }

  /** 核心产出一览（等级链式展示：当前可产出 + 升级后解锁） */
  private openCoreProducts(): void {
    this.spawnerPanel.openCore(this.coreSystem.getLevel(this.state));
  }

  /** 选中核心时的信息卡内容（库存/冷却/光环随状态刷新） */
  private buildCoreCard(): ICoreCardInfo {
    const level = this.coreSystem.getLevel(this.state);
    const propId = getCorePropId(level);
    const core = this.coreSystem.ensure(this.state);
    const maxTimes = getCoreTimesAt(level);
    const remain = this.coreSystem.cdRemainMs(this.state);
    const cooling = this.coreSystem.inCd(this.state) || remain > 0;
    const status = cooling
      ? getText('core.card.cooling', { time: formatCdRemain(remain) })
      : getText('core.card.ready', {
        times: core?.times ?? 0,
        max: maxTimes,
        aura: Math.round(getCoreAuraChance(this.state) * 100)
      });
    const actions: IInfoAction[] = [
      { label: getText('core.card.panel'), onClick: () => this.openCorePanel() },
      { label: getText('action.view'), onClick: () => this.openCoreProducts() }
    ];
    return {
      level,
      iconPropId: propId,
      title: getText('core.card.title', { name: getPropName(propId), level }),
      status,
      actions
    };
  }

  // ============ 僵尸路线预览 ============

  /** 生成两张朝上的箭头纹理：普通路线（金）与刷怪入口（红）。2D/3D 共用 */
  private ensureRouteTextures(): void {
    this.makeRouteTexture('route-arrow', 0xffd166);
    this.makeRouteTexture('route-entry', 0xff6b6b);
  }

  private makeRouteTexture(key: string, color: number): void {
    if (this.textures.exists(key)) return;
    const S = ROUTE_TEX_SIZE;
    const g = this.add.graphics();
    // 朝上的粗箭头：大三角头 + 短杆；先画深色描边再画本体，保证在 3D 地表上也看得清
    const draw = (fill: number, k: number): void => {
      const tip = S * 0.07 * k;
      const headW = S * 0.66 * k;
      const headY = S * 0.5 * k;
      const shaftW = S * 0.22 * k;
      const shaftH = S * 0.4 * k;
      g.fillStyle(fill, 1);
      g.fillTriangle(S / 2, tip, S / 2 - headW / 2, headY, S / 2 + headW / 2, headY);
      g.fillRect(S / 2 - shaftW / 2, headY - 1, shaftW, shaftH);
    };
    draw(0x10121c, 1.26);
    draw(color, 1);
    g.generateTexture(key, S, S);
    g.destroy();
  }

  /** 顶栏「路线」开关（默认开，状态持久化） */
  private ensureRouteToggle(): void {
    const x = ROUTE_BTN_X;
    const y = TOP_BAR_Y;
    const w = 150;
    const h = 52;
    this.routeToggleBg = this.add.graphics().setDepth(100);
    this.routeToggleBg.setInteractive(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    this.routeToggleBg.on('pointerdown', () => this.routeToggleBg?.setAlpha(0.7));
    this.routeToggleBg.on('pointerup', () => {
      this.routeToggleBg?.setAlpha(1);
      this.toggleRoute();
    });
    this.routeToggleBg.on('pointerout', () => this.routeToggleBg?.setAlpha(1));
    this.routeToggleText = this.add.text(x, y, '', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);
    this.paintRouteToggle();
  }

  private paintRouteToggle(): void {
    if (!this.routeToggleBg || !this.routeToggleText) return;
    drawUiBox(this.routeToggleBg, ROUTE_BTN_X, TOP_BAR_Y, 150, 52, {
      fill: this.routeVisible ? 0x1c3a2a : 0x33231a,
      fillAlpha: 0.92,
      stroke: this.routeVisible ? 0x51cf66 : UI_ORANGE,
      strokeAlpha: 0.8,
      radius: 12
    });
    this.routeToggleText.setText(getText(this.routeVisible ? 'base.routeOn' : 'base.routeOff'));
  }

  private toggleRoute(): void {
    this.routeVisible = !this.routeVisible;
    localStorage.setItem(ROUTE_STORAGE_KEY, this.routeVisible ? '1' : '0');
    this.paintRouteToggle();
    this.renderRoutePreview();
  }

  /** 摆放模式悬停格变化（2D 由 pointermove、3D 由渲染器回调）→ 重算「放这里之后」的路线 */
  private handleCellHover(row: number | null, col: number | null): void {
    let next = row === null || col === null ? null : { row, col };
    // 放不下去的格子不改道，预览按当前布局显示
    if (next && this.placing !== null && !this.baseSystem.canPlace(this.state, this.placing, next.row, next.col).ok) {
      next = null;
    }
    const same = (this.hoverCell?.row ?? -1) === (next?.row ?? -1) && (this.hoverCell?.col ?? -1) === (next?.col ?? -1);
    if (same) return;
    this.hoverCell = next;
    this.renderRoutePreview();
  }

  /** 2D 网格：把指针位置换算成格子并上报（3D 走渲染器的 onCellHover 回调） */
  private updateRouteHoverFromPointer(pointer: Phaser.Input.Pointer): void {
    if (this.renderer3d) return;
    if (this.placing === null) {
      this.handleCellHover(null, null);
      return;
    }
    const col = Math.floor((pointer.x - GRID_LEFT) / (CELL + GAP));
    const row = Math.floor((pointer.y - GRID_TOP) / (CELL + GAP));
    const base = this.state.base;
    if (row < 0 || row >= base.rows || col < 0 || col >= base.cols) {
      this.handleCellHover(null, null);
      return;
    }
    this.handleCellHover(row, col);
  }

  /**
   * 重算并绘制僵尸路线箭头。
   * 摆放模式下把悬停格当作「将建建筑」算，玩家能直接看到放下去之后僵尸会改走哪条路。
   */
  private renderRoutePreview(): void {
    const extraBlocked = this.placing !== null ? this.hoverCell : null;
    const preview = computeRoutePreview(this.state, extraBlocked);
    this.lastPreview = preview;
    if (!this.routeVisible) {
      this.routeLayer.removeAll(true);
      this.renderer3d?.setRoutePreview(null);
      return;
    }
    if (this.renderer3d) {
      this.routeLayer.removeAll(true);
      this.renderer3d.setRoutePreview(preview.cells);
      this.announceSealedRoute(preview.hasRoute);
      return;
    }
    this.routeLayer.removeAll(true);
    for (const cell of preview.cells) {
      const { x, y } = this.cellXY(cell.row, cell.col);
      const img = this.add.image(x, y, cell.spawn ? 'route-entry' : 'route-arrow')
        .setDisplaySize(CELL * 0.82, CELL * 0.82)
        .setAngle(routeAngle(cell.dr, cell.dc))
        .setAlpha(cell.spawn ? 0.95 : 0.85);
      this.routeLayer.add(img);
    }
    this.announceSealedRoute(preview.hasRoute);
  }

  /** 通路被封死时提示一次后果（僵尸会改拆墙／踩碎挡路棋子），不刷屏 */
  private announceSealedRoute(hasRoute: boolean): void {
    if (hasRoute) {
      this.sealedRouteAnnounced = false;
      return;
    }
    if (this.sealedRouteAnnounced) return;
    this.sealedRouteAnnounced = true;
    this.showToast(getText('toast.corridorSealed'));
  }

  private handleCellTap(row: number, col: number): void {
    // 背包/发射器产物面板打开时，点任意格先关面板
    if (this.bagPanel.isVisible()) {
      this.bagPanel.close();
      return;
    }
    if (this.spawnerPanel.isVisible()) {
      this.spawnerPanel.close();
      return;
    }
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
    // 基地核心（= 发射器）：短按选中/发射（3D 与 2D 共用这条判定树）
    const coreBuilding = findCoreBuilding(this.state.base);
    if (coreBuilding && coreBuilding.row === row && coreBuilding.col === col) {
      this.handleCoreTap();
      return;
    }
    const building = buildingAt(this.state.base, row, col);
    if (building) {
      this.openBuildingDialog(building);
      return;
    }
    const terrain = terrainAt(this.state.base, row, col);
    if (terrain) {
      this.openTerrainDialog(row, col, terrain);
      return;
    }
    const hero = this.heroSystem.getHeroAt(this.state, row, col);
    if (hero) {
      this.openHeroDialog(hero);
      return;
    }
    // 物品格（基地即合成场）：选中/二次点击触发
    const item = getItem(this.state.grid, row, col);
    if (item) {
      this.handleItemTap(row, col, item);
      return;
    }
    // 空地：取消物品选中
    this.setItemSelection(null);
  }

  /** 物品格点击判定树：首次点击 = 仅选中；已选中再点 = 触发效果（发射/使用/开背包） */
  private handleItemTap(row: number, col: number, item: IItemData): void {
    const pos = { row, col };
    const wasSelected = this.selectedItem?.row === row && this.selectedItem?.col === col;

    // 已解锁的 mdt=1 发射器（手提包解锁完、次数已恢复）按普通发射器处理
    const tapProp = getProp(item.id);
    const unlockedSpawner = !!tapProp && tapProp.mdt === 1 && !item.unlock && (item.times ?? 0) > 0;

    // 1. 纸箱点击提示
    if (item.st === ItemStatus.Carton) {
      this.showToast(getText('game.cartonHint'));
      return;
    }

    // 2. 背包 → 首次选中，再次点击打开/关闭背包面板
    if (item.id === PROP_IDS.bag && !item.st) {
      if (wasSelected) this.bagPanel.toggle();
      else this.setItemSelection(pos);
      return;
    }

    // 3. 气泡 → 选中（InfoBar 提供戳破），并 toast 说明机制（气泡不可合成/拖动）
    if (itemIsBubble(item, this.state.timestamp)) {
      this.setItemSelection(pos);
      const secs = Math.max(1, Math.ceil(((item.cdBubble ?? 0) - Date.now()) / 1000));
      this.showToast(getText('game.bubbleHint', { seconds: secs, diamonds: tapProp?.bubble ?? 5 }));
      return;
    }

    // 4. 点击型特殊道具（体力、金币链、无限能量等）：首次选中，再次点击使用
    //    已解锁的 mdt=1 发射器（手提包解锁完、次数已恢复）除外，走下面的发射器分支
    if (this.specialSystem.isClickSpecial(item.id) && !unlockedSpawner) {
      if (wasSelected) {
        this.specialSystem.clickSpecial(this.state, pos);
        this.setItemSelection(null);
      } else {
        this.setItemSelection(pos);
      }
      return;
    }

    // 5. 冷却中 → 选中（InfoBar 提供跳过 CD）
    if (itemInCd(item)) {
      this.setItemSelection(pos);
      return;
    }

    // 6. 发射器 → 首次选中，选中状态下再次点击才产出（产出后保持选中，可连点连发）
    if (isClickSpawner(item.id)) {
      if (wasSelected) this.spawnSystem.clickSpawn(this.state, pos);
      this.setItemSelection(pos);
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
          this.setItemSelection(null);
          this.save();
        }
      } else {
        this.setItemSelection(pos);
      }
      return;
    }

    // 8. 其他 → 选中
    this.setItemSelection(pos);
  }

  /** 物品拖拽落点 → 移动/合成/入包/特殊道具（弹回无需处理：业务层不改状态，棋子视觉已复位） */
  private handleItemDrop(src: IPoint, target: IPoint): void {
    this.mergeSystem.moveOrMerge(this.state, src, target);
    this.setItemSelection(null);
    this.save();
  }

  /** 物品/核心选中（3D 高亮 + InfoBar 详情/出售/戳泡/跳 CD/使用蓝图/查看发射器/核心信息） */
  private setItemSelection(pos: IPoint | null): void {
    this.selectedItem = pos;
    this.renderer3d?.setSelection(pos);

    const core = findCoreBuilding(this.state.base);
    if (pos && core && pos.row === core.row && pos.col === core.col) {
      this.infoBar.showCore(this.buildCoreCard());
      return;
    }

    const item = pos ? getItem(this.state.grid, pos.row, pos.col) : null;
    const actions = (pos && item) ? buildInfoActions(this.state, pos, item, {
      onSell: (p) => {
        this.economy.sellItem(this.state, p);
        this.setItemSelection(null);
      },
      onPopBubble: (p) => {
        this.specialSystem.popBubble(this.state, p);
        this.setItemSelection(null);
      },
      onSkipCd: (p, cdType) => {
        this.specialSystem.skipCd(this.state, p, cdType);
        this.setItemSelection(null);
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
        this.setItemSelection(null);
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

  /** 钻石直接完成任务（合成路径弹窗的按钮回调） */
  private handleTaskDiamondComplete(task: ITask): void {
    if (!this.taskSystem.completeTaskWithDiamond(this.state, task)) return;
    this.taskChainPanel?.close();
    this.save();
  }

  /** 地形清理确认弹窗：图标 + 名称 + 说明 + 金币清理按钮 */
  private openTerrainDialog(row: number, col: number, terrain: TerrainKind): void {
    this.closeDialog();
    this.selectedRangeHint.setVisible(false);
    this.renderer3d?.setSelectedRange(0, 0, null);
    const { width, height } = this.scale;
    const panelW = 620;
    const panelH = 560;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const mask = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
    mask.on('pointerup', () => this.closeDialog());
    this.dialogLayer.add(mask);
    const panel = this.add.graphics();
    drawUiBox(panel, px + panelW / 2, py + panelH / 2, panelW, panelH, {
      fill: UI_FILL, fillAlpha: 0.96, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 16
    });
    this.dialogLayer.add(panel);

    // 图标 + 名称
    const texKey = `terrain-${terrain}`;
    if (this.textures.exists(texKey)) {
      this.dialogLayer.add(this.add.image(width / 2, py + 110, texKey).setDisplaySize(140, 140));
    }
    this.dialogLayer.add(this.add.text(width / 2, py + 210, getText(`terrain.${terrain}`), {
      fontSize: '36px', color: '#ffd75e', fontStyle: 'bold'
    }).setOrigin(0.5));
    this.dialogLayer.add(this.add.text(width / 2, py + 290, getText(`terrain.hint.${terrain}`), {
      fontSize: '24px', color: '#bfc5d8', wordWrap: { width: panelW - 100 }, align: 'center'
    }).setOrigin(0.5));

    const cost = TERRAIN_CLEAR_COST[terrain];
    const canAfford = this.state.resources.coin >= cost;
    this.addDialogButton(px + panelW / 2 - 140, py + panelH - 80, getText('terrain.clearAction', { coins: cost }), canAfford, () => {
      if (this.baseSystem.clearTerrain(this.state, row, col)) {
        this.closeDialog();
        this.renderGrid();
      }
    }, 240, 64);
    this.addDialogButton(px + panelW / 2 + 140, py + panelH - 80, getText('base.close'), true, () => this.closeDialog(), 200, 64);
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

    // 左侧：立绘头像 96×96（char- 纹理），缺失回退色块
    const texKey = `char-${hero.key}`;
    if (this.textures.exists(texKey)) {
      const icon = this.add.image(x - 175, y, texKey).setDisplaySize(96, 96);
      if (deployed) icon.setAlpha(0.6);
      this.paletteLayer.add(icon);
    } else {
      const iconG = this.add.graphics();
      iconG.fillStyle(cfg.fxColor, 1);
      iconG.fillRoundedRect(x - 223, y - 48, 96, 96, 14);
      this.paletteLayer.add(iconG);
    }

    const name = this.add.text(x - 104, y - 58, getHeroName(cfg.key), {
      fontSize: '30px', color: deployed ? '#9999aa' : '#ffffff', fontStyle: 'bold', padding: { x: 2, y: 8 }
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(name);

    const stats = this.add.text(x - 104, y - 20, getText('base.heroStats', { attack: cfg.attack, range: cfg.range, speed: cfg.speed }), {
      fontSize: '22px', color: '#8899aa'
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(stats);

    const health = critical
      ? getText('base.heroCritical', { days: hero.recoveryDays ?? 0 })
      : getText('base.heroHealth', { hp: hero.hp ?? cfg.hp, maxHp: hero.maxHp ?? cfg.hp });
    this.paletteLayer.add(this.add.text(x - 104, y + 10, health, { fontSize: '20px', color: critical ? '#ff8f8f' : '#60d394' }).setOrigin(0, 0.5));

    const desc = this.add.text(x - 104, y + 42, getHeroDescription(cfg.key), {
      fontSize: '20px', color: '#9fa4b8', wordWrap: { width: CARD_W - 150, useAdvancedWrap: true }, maxLines: 2
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(desc);

    if (deployed) {
      // 已部署态：金色徽章，整卡不可再点（撤回/移动走格子上的详情弹窗）
      const badge = this.add.graphics();
      drawUiBox(badge, x + CARD_W / 2 - 90, y - CARD_H / 2 + 28, 140, 40, {
        fill: UI_SLOT_FILL, fillAlpha: 0.95, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 10
      });
      this.paletteLayer.add(badge);
      const badgeText = this.add.text(x + CARD_W / 2 - 90, y - CARD_H / 2 + 28, getText('base.deployed'), {
        fontSize: '22px', color: '#ffe066', fontStyle: 'bold'
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
      const lockName = this.add.text(x - 104, y - 58, getBuildingName(cfg.id), {
        fontSize: buildingTitleFontSize, color: '#9999aa', fontStyle: 'bold', padding: { x: 2, y: 8 }
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockName);
      const lockDesc = this.add.text(x - 104, y - 8, description, {
        fontSize: getLanguage() === 'en' ? '18px' : '20px', color: '#aeb3c5', wordWrap: { width: CARD_W - 150, useAdvancedWrap: true }, maxLines: 2
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockDesc);
      const lockTip = this.add.text(x - 104, y + 46, getText('base.needBlueprint', { blueprint: bpName }), {
        fontSize: getLanguage() === 'en' ? '20px' : '26px', color: '#ffd43b', fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      this.paletteLayer.add(lockTip);
      return;
    }

    // 左侧：建筑图标 96×96，垂直居中，距卡片左缘 20px；优先专属贴图，缺失回退大类图标/色块
    const perKey = buildingIconKey(cfg.id);
    const iconKey = this.textures.exists(perKey) ? perKey : KIND_ICON_KEYS[cfg.kind];
    if (this.textures.exists(iconKey)) {
      const icon = this.add.image(x - 175, y, iconKey).setDisplaySize(96, 96);
      this.paletteLayer.add(icon);
    } else {
      const iconG = this.add.graphics();
      iconG.fillStyle(KIND_COLORS[cfg.kind], 1);
      iconG.fillRoundedRect(x - 223, y - 48, 96, 96, 14);
      this.paletteLayer.add(iconG);
    }

    // 右上：建筑名（34px 左对齐）+ 一行小字简介（选中时替换为放置提示）
    const name = this.add.text(x - 104, y - 58, getBuildingName(cfg.id), {
      fontSize: buildingTitleFontSize, color: '#ffffff', fontStyle: 'bold', padding: { x: 2, y: 8 }
    }).setOrigin(0, 0.5);
    this.paletteLayer.add(name);

    const sub = this.add.text(x - 104, y - 8, selected ? getText('base.placeHint') : description, {
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
      const rowY = y + 48 + j * 44;
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
        this.showToast(getText('base.notEnoughCoins', { coins: cfg.costCoin, have: this.state.resources.coin }));
        return;
      }
      this.placing = cfg.id;
    }
    this.hoverCell = null; // 切换摆放模式后旧的悬停格作废
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
      if (this.renderer3d) {
        this.renderer3d.setSelectedRange(building.row, building.col, cfg.range);
      } else {
        this.drawRangeCircle(this.selectedRangeHint, building.row, building.col, cfg.range, 0x66ff66);
        this.selectedRangeHint.setVisible(true);
      }
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

    // ---- 顶部：图标 + 名称 + Lv 徽章 ----（优先专属贴图，缺失回退大类图标/色块）
    const perKey = buildingIconKey(cfg.id);
    const iconKey = this.textures.exists(perKey) ? perKey : KIND_ICON_KEYS[cfg.kind];
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
    if (cfg.attack && cfg.speed) rows.push({ label: getText('base.attackSpeed'), value: getText('base.heroSpeedValue', { speed: cfg.speed }) });
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
    const marketItems: { y: number; h: number; objects: Phaser.GameObjects.GameObject[] }[] = [];
    let cursorY = listTop;
    const addSectionLabel = (key: string) => {
      const label = this.add.text(px + 38, cursorY + 16, getText(key), { fontSize: '22px', color: '#8ecafc', fontStyle: 'bold' }).setOrigin(0, 0.5);
      marketList.add(label);
      marketItems.push({ y: cursorY, h: 34, objects: [label] });
      cursorY += 44;
    };

    // 急缺材料：进行中订单的目标物品，星星直购（每次 1 件；订单不变即可重复购买）
    const neededMaterials = getNeededMaterials(this.state);
    if (neededMaterials.length > 0) {
      addSectionLabel('base.marketMaterials');
      const matW = panelW - 76 - 32; // 右侧给滚动条留位
      for (const mat of neededMaterials) {
        const x = px + 38;
        const y = cursorY;
        const card = this.add.graphics();
        drawUiBox(card, x + matW / 2, y + 32, matW, 64, { fill: 0x202435, fillAlpha: 0.95, stroke: UI_STROKE, strokeAlpha: 0.75, radius: 10 });
        card.setInteractive(new Phaser.Geom.Rectangle(x, y, matW, 64), Phaser.Geom.Rectangle.Contains);
        card.on('pointerup', () => {
          if (didDrag) return;
          if (!buyNeededMaterial(this.state, mat.id)) return;
          this.save();
          refreshWallet();
          this.showToast(getText('base.marketMaterialBought', { item: getPropName(mat.id) }));
        });
        const objects: Phaser.GameObjects.GameObject[] = [card];
        const iconKey = getItemIconKey(mat.id, this.textures);
        if (iconKey && this.textures.exists(iconKey)) {
          objects.push(this.add.image(x + 40, y + 32, iconKey).setDisplaySize(48, 48));
        } else {
          const fallback = this.add.graphics();
          fallback.fillStyle(colorFromId(mat.id), 1);
          fallback.fillRoundedRect(x + 16, y + 8, 48, 48, 8);
          objects.push(fallback);
        }
        objects.push(this.add.text(x + 76, y + 18, getPropName(mat.id), { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5));
        objects.push(this.add.text(x + 76, y + 46, getText('base.marketNeedQty', { num: mat.need }), { fontSize: '17px', color: '#9fa4b8' }).setOrigin(0, 0.5));
        objects.push(this.add.text(x + matW - 24, y + 32, getText('base.marketPrice', { star: mat.star }), { fontSize: '20px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(1, 0.5));
        marketList.add(objects);
        marketItems.push({ y, h: 64, objects });
        cursorY += 64 + 12;
      }
    }

    addSectionLabel('base.marketBlueprints');
    const recommended = getRecommendedMarketItem(this.state.day);
    const marketCatalog = [...BLACK_MARKET_ITEMS].sort((a, b) => Number(b.cfgId === recommended?.cfgId) - Number(a.cfgId === recommended?.cfgId));
    marketCatalog.forEach((item, index) => {
      const cfg = getBuildingConfig(item.cfgId)!;
      const x = px + 38 + (index % cols) * (cardW + 42);
      const y = cursorY + Math.floor(index / cols) * (cardH + cardGap);
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
      const perKey = buildingIconKey(cfg.id);
      const iconKey = this.textures.exists(perKey) ? perKey : (cfg.kind === 'tower' ? KIND_ICON_KEYS.tower : cfg.kind === 'resource' ? KIND_ICON_KEYS.resource : cfg.kind === 'trap' ? KIND_ICON_KEYS.trap : KIND_ICON_KEYS.wall);
      const icon = this.add.image(x + 52, y + cardH / 2, iconKey).setDisplaySize(64, 64);
      const name = this.add.text(x + 100, y + 32, getBuildingName(item.cfgId), { fontSize: '23px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 175 }, maxLines: 1 }).setOrigin(0, 0.5);
      const price = this.add.text(x + 100, y + 64, `${getText('base.marketPrice', { star: item.star })} · ${getText('base.marketComplete')}`, { fontSize: '19px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5);
      marketList.add([card, icon, name, price]);
      marketItems.push({ y, h: cardH, objects: [card, icon, name, price] });
    });
    const rows = Math.ceil(marketCatalog.length / cols);
    const contentHeight = cursorY - listTop + rows * cardH + Math.max(0, rows - 1) * cardGap;
    const maxScroll = Math.max(0, contentHeight - listHeight);
    const updateMarketItems = () => {
      for (const entry of marketItems) {
        const top = entry.y + (marketList.y || 0);
        const visible = top + entry.h >= listTop && top <= listBottom;
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
    const routeLength = getShortestEntryPathLength(this.state.base, (r, c) => !!getItem(this.state.grid, r, c));

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
      const renderMode = localStorage.getItem('merge_survival_td_render_mode');
      this.scene.start(renderMode === '3d' ? 'Night3DScene' : 'NightScene', { state: this.state });
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
    this.renderer3d?.setSelectedRange(0, 0, null);
  }
}
