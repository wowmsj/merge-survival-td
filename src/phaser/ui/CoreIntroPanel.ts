import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { CoreSystem } from '../../core/systems/CoreSystem';
import { getCoreAuraChance, getCoreTier } from '../../core/config/MergeCoreConfig';
import { getCorePropId, getCoreTimesAt, getCoreUpgradeCost, isCoreMaxLevel } from '../../core/config/CoreConfig';
import { getItemIconKey } from '../config/ItemIconMap';
import { UI_GOLD } from './UiStyle';
import { BasePanel } from './BasePanel';
import { makeUiButton } from './UiWidgets';
import { getPropName, getText } from '../../core/i18n';

export interface ICorePanelHost {
  /** 升级核心（成功返回 true，面板据此重绘） */
  onUpgrade(): boolean;
  /** 查看产出池（打开 SpawnerProductsPanel） */
  onViewProducts(): void;
  /** 修复核心（受损时可用） */
  onRepair(): boolean;
  /** 钻石跳过核心冷却 */
  onSkipCd(): boolean;
}

/**
 * 基地核心面板（长按核心格 / 选中后点「核心」按钮打开）
 *
 * 基地核心 = 合成核心 = 发射器：面板展示等级、库存、冷却、光环、可合成档次、
 * 升级消耗（夜战掉落的 60024/60025 材料当量）与修复入口。
 */
export class CoreIntroPanel extends BasePanel {
  private state: IGameState;
  private host: ICorePanelHost;
  private coreSystem: CoreSystem;

  constructor(scene: Phaser.Scene, state: IGameState, host: ICorePanelHost, coreSystem: CoreSystem) {
    super(scene, { depth: 600, persistent: true });
    this.state = state;
    this.host = host;
    this.coreSystem = coreSystem;
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  open(): void {
    super.open();
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    this.container.removeAll(true);

    const { width } = this.scene.scale;
    const panelW = 620;
    const panelH = 860;

    this.addMask(() => this.close(), 0.6);

    const { px, py } = this.addPanelChrome(getText('core.panel.title'), panelW, panelH, {
      box: { fillAlpha: 0.97, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 20 },
      titleY: 44,
      titleFontSize: '32px',
      closeStyle: 'box',
      dividerY: 88,
      dividerPad: 30
    });

    const level = this.coreSystem.getLevel(this.state);
    const propId = getCorePropId(level);
    const core = this.coreSystem.ensure(this.state);
    const maxTimes = getCoreTimesAt(level);

    // 核心图标（随等级）
    const iconKey = getItemIconKey(propId, this.scene.textures);
    if (iconKey && this.scene.textures.exists(iconKey)) {
      this.container.add(this.scene.add.image(width / 2, py + 170, iconKey).setDisplaySize(128, 128));
    }

    // 名称 + 等级
    this.container.add(this.scene.add.text(width / 2, py + 252,
      getText('core.panel.name', { name: getPropName(propId), level }), {
        fontSize: '28px', color: '#8ce99a', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3, align: 'center',
        wordWrap: { width: panelW - 80, useAdvancedWrap: true }, maxLines: 2
      }).setOrigin(0.5));

    // 状态行
    const remainMs = this.coreSystem.cdRemainMs(this.state);
    const cooling = this.coreSystem.inCd(this.state) || remainMs > 0;
    const cdText = cooling ? this.formatMs(remainMs) : getText('core.panel.ready');
    const aura = Math.round(getCoreAuraChance(this.state) * 100);
    const tier = getCoreTier(this.state);

    const rows: { label: string; value: string; color?: string }[] = [
      { label: getText('core.panel.stock'), value: `${core?.times ?? 0} / ${maxTimes}` },
      { label: getText('core.panel.cooldown'), value: cdText, color: cooling ? '#ffa94d' : '#8ce99a' },
      { label: getText('core.panel.aura'), value: `+${aura}%`, color: '#ffd75e' },
      { label: getText('core.panel.tier'), value: getText(`core.tier.${tier}`), color: '#ffd75e' }
    ];
    rows.forEach((row, i) => {
      const ry = py + 310 + i * 46;
      this.container!.add(this.scene.add.text(px + 56, ry, row.label, {
        fontSize: '26px', color: '#8899aa'
      }).setOrigin(0, 0.5));
      this.container!.add(this.scene.add.text(px + panelW - 56, ry, row.value, {
        fontSize: '26px', color: row.color ?? '#ffffff', fontStyle: 'bold'
      }).setOrigin(1, 0.5));
    });

    // 升级消耗行
    const upY = py + 512;
    const cost = getCoreUpgradeCost(level);
    const owned = this.coreSystem.materialValue(this.state);
    const maxed = isCoreMaxLevel(level);
    const check = this.coreSystem.canUpgrade(this.state);
    this.container.add(this.scene.add.text(px + 56, upY, getText('core.panel.upgradeCost'), {
      fontSize: '26px', color: '#8899aa'
    }).setOrigin(0, 0.5));
    this.container.add(this.scene.add.text(px + panelW - 56, upY,
      maxed ? getText('core.panel.maxLevel') : `${owned} / ${cost}`, {
        fontSize: '26px', color: maxed ? '#ffd75e' : (check.ok ? '#8ce99a' : '#ff6b6b'), fontStyle: 'bold'
      }).setOrigin(1, 0.5));

    // 升级说明（材料来源）+ 简介，都用固定顶部对齐，避免英文换行后压到按钮
    this.container.add(this.scene.add.text(px + 56, upY + 40,
      getText('core.panel.upgradeHint'), {
        fontSize: '19px', color: '#777788',
        wordWrap: { width: panelW - 112, useAdvancedWrap: true }, maxLines: 2
      }));
    this.container.add(this.scene.add.text(px + 56, py + 636, getText('core.panel.body'), {
      fontSize: '19px', color: '#d5d9e5',
      wordWrap: { width: panelW - 112, useAdvancedWrap: true },
      lineSpacing: 6, maxLines: 5
    }));

    // 按钮区：查看产出 / 升级 / 跳过冷却（冷却时）/ 修复（受损时）
    const btnY = py + panelH - 70;
    const btnW = 250;
    const btnH = 68;
    makeUiButton(this.scene, this.container, px + 40 + btnW / 2, btnY, btnW, btnH,
      getText('action.view'), { box: { radius: 12 }, fontSize: '24px' },
      () => this.host.onViewProducts());

    if (cooling) {
      makeUiButton(this.scene, this.container, px + panelW - 40 - btnW / 2, btnY, btnW, btnH,
        getText('action.skipCooldown'), { box: { radius: 12 }, fontSize: '24px' },
        () => { if (this.host.onSkipCd()) this.render(); });
    } else {
      makeUiButton(this.scene, this.container, px + panelW - 40 - btnW / 2, btnY, btnW, btnH,
        maxed ? getText('core.panel.maxLevel') : getText('core.panel.upgrade'), {
          box: { radius: 12 },
          fontSize: '24px',
          disabled: !check.ok
        },
        () => { if (this.host.onUpgrade()) this.render(); });
    }

    // 受损时插入修复按钮
    const coreHp = core?.hp ?? 0;
    const coreMaxHp = core?.maxHp ?? 0;
    if (core && coreHp < coreMaxHp) {
      makeUiButton(this.scene, this.container, width / 2, btnY - 90, panelW - 112, 64,
        getText('core.panel.repair'), { box: { radius: 12 }, fontSize: '24px' },
        () => { if (this.host.onRepair()) this.render(); });
    }
  }

  private formatMs(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
