import * as Phaser from 'phaser';
import { IBuilding, IGameState } from '../../core/types';
import { createInitialGameState } from '../../core/model/GameState';
import { BASE_CENTER, BASE_COLS, BASE_ROWS, buildingAt } from '../../core/model/Base';
import { getAllBuildingConfigs, getBuildingConfig, RUIN_ID } from '../../core/config/BuildingConfig';
import { getBuildingName, getText } from '../../core/i18n';
import { addFullscreenBg, makeUiButton, showSceneToast } from '../ui/UiWidgets';
import { KIND_COLORS, KIND_ICON_KEYS } from '../config/BuildingKindStyle';
import { UI_FILL, UI_GOLD, UI_ORANGE, UI_SLOT_FILL, UI_STROKE } from '../ui/UiStyle';
import { GameEvents, eventBus } from '../../core/events/EventBus';

const DESIGN_WIDTH = 1080;
const GRID_TOP = 220;
const GRID_LEFT = 24;
const CELL = 74;
const GAP = 6;

/**
 * 夜战测试场景：
 * - 从设置进入，可自由选择第 N 天。
 * - 在基地网格上随意摆放/拆除建筑（忽略金币、蓝图、摆放规则）。
 * - 摆好后点击「开始夜战」直接进入 NightScene。
 * - 战斗结束后返回本场景，可反复调试。
 */
export class NightTestScene extends Phaser.Scene {
  private state!: IGameState;
  /** 进入测试模式前的原始存档状态，返回主场景时传回，避免测试资源泄漏 */
  private originalState: IGameState | null = null;
  private selectedId = 101; // 默认选中箭塔
  private dayText!: Phaser.GameObjects.Text;
  private gridLayer!: Phaser.GameObjects.Container;
  private buildingLayer!: Phaser.GameObjects.Container;
  private selectionHint!: Phaser.GameObjects.Graphics;
  private palettePage = 0;
  private paletteContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'NightTestScene' });
  }

  init(data: { state?: IGameState }): void {
    this.originalState = data?.state ? JSON.parse(JSON.stringify(data.state)) as IGameState : null;
    this.state = data?.state ? this.cloneTestState(data.state) : this.makeTestState(7);
  }

  create(): void {
    this.add.container(0, 0); // 确保场景有根容器
    addFullscreenBg(this);

    this.gridLayer = this.add.container(0, 0);
    this.buildingLayer = this.add.container(0, 0);
    this.paletteContainer = this.add.container(0, 0).setDepth(20);
    this.selectionHint = this.add.graphics().setDepth(10);

    // 标题 + 返回（第一行）
    this.add.text(DESIGN_WIDTH / 2, 56, getText('nightTest.title'), {
      fontSize: '38px', color: '#ffe066', fontStyle: 'bold'
    }).setOrigin(0.5);
    makeUiButton(this, null, 96, 56, 140, 56, getText('nightTest.back'), {
      box: { radius: 12 }
    }, () => this.scene.start('GameScene', this.originalState ? { state: this.originalState } : undefined));

    // 天数调节（第二行，居中）
    this.dayText = this.add.text(DESIGN_WIDTH / 2, 132, getText('nightTest.day', { day: this.state.day }), {
      fontSize: '32px', color: '#ffd43b', fontStyle: 'bold'
    }).setOrigin(0.5);
    makeUiButton(this, null, DESIGN_WIDTH / 2 - 150, 132, 64, 64, '<', {
      box: { radius: 10, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
    }, () => this.changeDay(-1));
    makeUiButton(this, null, DESIGN_WIDTH / 2 + 150, 132, 64, 64, '>', {
      box: { radius: 10, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
    }, () => this.changeDay(1));

    // 清空 / 开始（第二行右侧）
    makeUiButton(this, null, DESIGN_WIDTH - 200, 132, 170, 64, getText('nightTest.clear'), {
      box: { stroke: UI_ORANGE, strokeAlpha: 0.8, radius: 12 }
    }, () => this.clearDefense());
    makeUiButton(this, null, DESIGN_WIDTH - 390, 132, 170, 64, getText('nightTest.start'), {
      box: { fill: 0x2b4a2b, stroke: 0x51cf66, strokeAlpha: 0.9, radius: 12 }
    }, () => this.startNight());

    this.renderGrid();
    this.renderPalette();
    this.refreshBuildings();

    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer) => {
      // 点击事件由具体格子处理，这里只负责把选中提示归零
      this.selectionHint.clear();
    });

    // toast 监听
    const onToast = (msg: string) => showSceneToast(this, msg);
    eventBus.on(GameEvents.TOAST_SHOW, onToast);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => eventBus.off(GameEvents.TOAST_SHOW, onToast));
  }

  private changeDay(delta: number): void {
    const next = Math.max(1, Math.min(99, this.state.day + delta));
    this.state.day = next;
    this.dayText.setText(getText('nightTest.day', { day: next }));
  }

  /** 深拷贝一份 state 并开启测试模式：金币/行动力拉满、解锁全部建筑 */
  private cloneTestState(source: IGameState): IGameState {
    const cloned = JSON.parse(JSON.stringify(source)) as IGameState;
    cloned.resources.coin = 999999;
    cloned.resources.diamond = 999999;
    cloned.resources.power = 9999;
    cloned.resources.medicine = 9999;
    cloned.resources.scrap = 9999;
    cloned.resources.fuel = 9999;
    cloned.unlockedBuildings = getAllBuildingConfigs().map(c => c.id);
    return cloned;
  }

  /** 基于初始存档生成测试 state，并预放核心 + 4 座发电机（确保电力充足） */
  private makeTestState(day: number): IGameState {
    const state = createInitialGameState();
    state.day = day;
    state.resources.coin = 999999;
    state.resources.diamond = 999999;
    state.resources.power = 9999;
    state.resources.medicine = 9999;
    state.resources.scrap = 9999;
    state.resources.fuel = 9999;
    state.unlockedBuildings = getAllBuildingConfigs().map(c => c.id);
    // 预放 4 座风力发电站，给测试充足电力
    const offsets = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of offsets) {
      state.base.buildings.push({
        cfgId: 203,
        level: 1,
        hp: 150,
        maxHp: 150,
        row: BASE_CENTER + dr,
        col: BASE_CENTER + dc
      });
    }
    return state;
  }

  /** 清空所有非核心、非废墟建筑 */
  private clearDefense(): void {
    this.state.base.buildings = this.state.base.buildings.filter(b => {
      const cfg = getBuildingConfig(b.cfgId);
      return cfg?.kind === 'core' || b.cfgId === RUIN_ID;
    });
    this.refreshBuildings();
    showSceneToast(this, getText('nightTest.cleared'));
  }

  private startNight(): void {
    this.scene.start('NightScene', { state: this.state, testMode: true });
  }

  private cellXY(row: number, col: number): { x: number; y: number } {
    return {
      x: GRID_LEFT + col * (CELL + GAP) + CELL / 2,
      y: GRID_TOP + row * (CELL + GAP) + CELL / 2
    };
  }

  private renderGrid(): void {
    this.gridLayer.removeAll(true);
    for (let row = 0; row < BASE_ROWS; row++) {
      for (let col = 0; col < BASE_COLS; col++) {
        const { x, y } = this.cellXY(row, col);
        const cell = this.add.image(x, y, 'cell-bg')
          .setDisplaySize(CELL, CELL)
          .setTint(0x555566);
        cell.setInteractive({ useHandCursor: true });
        cell.on('pointerdown', () => this.onCellClick(row, col));
        this.gridLayer.add(cell);
      }
    }
  }

  private refreshBuildings(): void {
    this.buildingLayer.removeAll(true);
    this.selectionHint.clear();
    for (const b of this.state.base.buildings) {
      const cfg = getBuildingConfig(b.cfgId);
      if (!cfg) continue;
      const { x, y } = this.cellXY(b.row, b.col);
      const iconKey = KIND_ICON_KEYS[cfg.kind];
      if (this.textures.exists(iconKey)) {
        const img = this.add.image(x, y, iconKey).setDisplaySize(CELL - 12, CELL - 12);
        this.buildingLayer.add(img);
      } else {
        const g = this.add.graphics();
        g.fillStyle(KIND_COLORS[cfg.kind], 1);
        g.fillRoundedRect(x - CELL / 2 + 4, y - CELL / 2 + 4, CELL - 8, CELL - 8, 10);
        this.buildingLayer.add(g);
      }
      const name = this.add.text(x, y + 2, getBuildingName(cfg.id).substring(0, 3), {
        fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5);
      this.buildingLayer.add(name);
      if (b.level > 1) {
        const lv = this.add.text(x, y + CELL / 2 - 22, `Lv.${b.level}`, {
          fontSize: '16px', color: '#ffe066', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5);
        this.buildingLayer.add(lv);
      }
    }
  }

  private onCellClick(row: number, col: number): void {
    const existing = buildingAt(this.state.base, row, col);
    if (existing) {
      const cfg = getBuildingConfig(existing.cfgId);
      if (cfg?.kind === 'core' || existing.cfgId === RUIN_ID) {
        showSceneToast(this, getText('nightTest.cannotRemove'));
        return;
      }
      // 有选中建筑时直接替换，否则拆除
      if (this.selectedId <= 0) {
        this.state.base.buildings = this.state.base.buildings.filter(b => b !== existing);
        this.refreshBuildings();
        return;
      }
    }
    if (this.selectedId <= 0) return;
    // 放置：移除同格旧建筑（非核心）后添加新建筑
    this.state.base.buildings = this.state.base.buildings.filter(b => !(b.row === row && b.col === col && getBuildingConfig(b.cfgId)?.kind !== 'core'));
    const cfg = getBuildingConfig(this.selectedId)!;
    const hp = cfg.hp;
    const building: IBuilding = {
      cfgId: this.selectedId,
      level: 1,
      hp,
      maxHp: hp,
      row,
      col
    };
    if (cfg.kind === 'resource') {
      (building as any).lastProduceAt = Date.now();
    }
    this.state.base.buildings.push(building);
    this.refreshBuildings();
  }

  /** 底部建筑快捷栏：点击图标选中，再点击网格放置；支持翻页 */
  private renderPalette(): void {
    this.paletteContainer.removeAll(true);
    const configs = getAllBuildingConfigs()
      .filter(c => c.kind !== 'core' && c.id !== RUIN_ID)
      .sort((a, b) => (a.kind === 'tower' ? 0 : 1) - (b.kind === 'tower' ? 0 : 1) || a.id - b.id);

    const perPage = 7;
    const totalPages = Math.max(1, Math.ceil(configs.length / perPage));
    this.palettePage = Math.max(0, Math.min(this.palettePage, totalPages - 1));
    const pageConfigs = configs.slice(this.palettePage * perPage, (this.palettePage + 1) * perPage);

    const size = 92;
    const gap = 14;
    const totalW = perPage * size + (perPage - 1) * gap;
    const startX = (DESIGN_WIDTH - totalW) / 2 + size / 2;
    const y = 1790;

    const bg = this.add.graphics();
    bg.fillStyle(UI_FILL, 0.85);
    bg.fillRoundedRect(16, y - 74, DESIGN_WIDTH - 32, 140, 18);
    bg.lineStyle(2, UI_STROKE, 0.5);
    bg.strokeRoundedRect(16, y - 74, DESIGN_WIDTH - 32, 140, 18);
    this.paletteContainer.add(bg);

    for (let i = 0; i < pageConfigs.length; i++) {
      const cfg = pageConfigs[i];
      const x = startX + i * (size + gap);
      const iconKey = KIND_ICON_KEYS[cfg.kind];
      const selected = cfg.id === this.selectedId;

      const btn = this.add.container(x, y);
      const box = this.add.graphics();
      box.fillStyle(selected ? UI_GOLD : UI_SLOT_FILL, selected ? 0.5 : 0.95);
      box.fillRoundedRect(-size / 2, -size / 2, size, size, 12);
      box.lineStyle(3, selected ? 0xffd43b : UI_GOLD, selected ? 1 : 0.4);
      box.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);
      btn.add(box);

      if (this.textures.exists(iconKey)) {
        btn.add(this.add.image(0, -10, iconKey).setDisplaySize(52, 52));
      } else {
        const fallback = this.add.graphics();
        fallback.fillStyle(KIND_COLORS[cfg.kind], 1);
        fallback.fillCircle(0, -10, 22);
        btn.add(fallback);
      }
      btn.add(this.add.text(0, 30, getBuildingName(cfg.id).substring(0, 2), {
        fontSize: '18px', color: selected ? '#ffd43b' : '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5));

      const hit = this.add.rectangle(0, 0, size, size, 0x000000, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selectedId = cfg.id;
        this.renderPalette();
      });
      btn.add(hit);
      this.paletteContainer.add(btn);
    }

    // 翻页按钮
    if (totalPages > 1) {
      makeUiButton(this, this.paletteContainer, 70, y, 70, 70, '<', {
        box: { radius: 12, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
      }, () => {
        this.palettePage--;
        this.renderPalette();
      });
      makeUiButton(this, this.paletteContainer, DESIGN_WIDTH - 70, y, 70, 70, '>', {
        box: { radius: 12, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
      }, () => {
        this.palettePage++;
        this.renderPalette();
      });
    }

    // 页码
    this.paletteContainer.add(this.add.text(DESIGN_WIDTH / 2, y + 70, `${this.palettePage + 1}/${totalPages}`, {
      fontSize: '20px', color: '#aaaaaa'
    }).setOrigin(0.5));
  }
}
