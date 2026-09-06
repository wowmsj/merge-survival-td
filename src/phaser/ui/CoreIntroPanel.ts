import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { getCoreAuraChance, getCoreTier, isCoreChainItem } from '../../core/config/MergeCoreConfig';
import { forEachCell } from '../../core/model/Grid';
import { getItemIconKey } from '../config/ItemIconMap';
import { UI_GOLD } from './UiStyle';
import { BasePanel } from './BasePanel';
import { getPropName, getText } from '../../core/i18n';

/**
 * 合成核心简介弹窗（InfoBar「简介」按钮打开）
 * 静态说明（外婆的装置是干什么的、怎么升级）+ 动态状态（当前核心/光环/可合成档次）
 */
export class CoreIntroPanel extends BasePanel {
  private state: IGameState;

  constructor(scene: Phaser.Scene, state: IGameState) {
    super(scene, { depth: 600, persistent: true });
    this.state = state;
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
    const panelW = 560;
    const panelH = 700;

    // 遮罩（点击关闭）
    this.addMask(() => this.close(), 0.6);

    const { px, py } = this.addPanelChrome(getText('core.intro.title'), panelW, panelH, {
      box: { fillAlpha: 0.97, stroke: UI_GOLD, strokeAlpha: 0.5, strokeWidth: 2, radius: 20 },
      titleY: 44,
      titleFontSize: '32px',
      closeStyle: 'box',
      dividerY: 88,
      dividerPad: 30
    });

    // 当前棋盘上最高级核心链道具（无则显示 60024 神秘零件灰掉）
    let bestCore = 0;
    forEachCell(this.state.grid, item => {
      if (item && isCoreChainItem(item.id) && item.id > bestCore) bestCore = item.id;
    });
    const shownId = bestCore || 60024;
    const activated = bestCore >= 60026;

    // 核心图标
    const iconKey = getItemIconKey(shownId, this.scene.textures);
    if (iconKey && this.scene.textures.exists(iconKey)) {
      const img = this.scene.add.image(width / 2, py + 176, iconKey).setDisplaySize(120, 120);
      if (!activated) img.setTint(0x555555).setAlpha(0.7);
      this.container.add(img);
    }

    // 当前核心名称行
    const nameColor = activated ? '#8ce99a' : '#777777';
    const nameText = this.scene.add.text(width / 2, py + 252,
      activated ? getPropName(bestCore) : getText('core.intro.inactive'), {
        fontSize: '26px', color: nameColor, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5);
    this.container.add(nameText);

    // 动态状态：光环 + 可合成档次
    const aura = Math.round(getCoreAuraChance(this.state) * 100);
    const tier = getCoreTier(this.state);
    const status = this.scene.add.text(width / 2, py + 296,
      getText('core.intro.status', { aura, tierName: getText(`core.tier.${tier}`) }), {
        fontSize: '22px', color: '#ffd75e',
        stroke: '#000000', strokeThickness: 3
      }).setOrigin(0.5);
    this.container.add(status);

    // 简介正文
    const body = this.scene.add.text(px + 40, py + 340, getText('core.intro.body'), {
      fontSize: '21px', color: '#d5d9e5',
      wordWrap: { width: panelW - 80, useAdvancedWrap: true },
      lineSpacing: 10
    });
    this.container.add(body);
  }
}
