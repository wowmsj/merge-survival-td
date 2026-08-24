import * as Phaser from 'phaser';
import { Language, getText } from '../../core/i18n';
import { BasePanel } from './BasePanel';
import { IUiButton, makeUiButton } from './UiWidgets';
import { UI_FILL, UI_GOLD, UI_ORANGE, UI_STROKE, drawUiBox } from './UiStyle';
import { createInitialGameState } from '../../core/model/GameState';
import { BASE_CENTER } from '../../core/model/Base';
import { getAllBuildingConfigs } from '../../core/config/BuildingConfig';

export class SettingsPanel extends BasePanel {
  private restartTimer: Phaser.Time.TimerEvent | null = null;
  private restartButton: IUiButton | null = null;
  private nightTestOverlay: Phaser.GameObjects.Container | null = null;
  private testDay = 7;

  constructor(
    scene: Phaser.Scene,
    private readonly onLanguage: (language: Language) => void,
    private readonly onRestart: () => void
  ) {
    super(scene);
  }

  open(): void {
    super.open();
    if (!this.container) return;
    this.addMask(() => this.close());
    const { px, py } = this.addPanelChrome(getText('settings.title'), 620, 520, { dividerY: 88 });
    makeUiButton(this.scene, this.container, px + 175, py + 160, 230, 68, getText('settings.chinese'), {}, () => this.onLanguage('zh-CN'));
    makeUiButton(this.scene, this.container, px + 445, py + 160, 230, 68, getText('settings.english'), {}, () => this.onLanguage('en'));
    makeUiButton(this.scene, this.container, px + 310, py + 270, 300, 72, getText('settings.nightTest'), {
      box: { stroke: UI_GOLD, strokeAlpha: 0.8, radius: 14 }
    }, () => this.openNightTestDialog());
    this.restartButton = makeUiButton(this.scene, this.container, px + 310, py + 380, 300, 72, getText('dialog.restart'), {
      box: { stroke: UI_ORANGE, strokeAlpha: 0.7, radius: 14 }
    }, () => this.confirmRestart());
  }

  close(): void {
    this.nightTestOverlay?.destroy();
    this.nightTestOverlay = null;
    this.restartTimer?.remove(false);
    this.restartTimer = null;
    super.close();
  }

  private openNightTestDialog(): void {
    if (!this.container || this.nightTestOverlay) return;
    this.testDay = 7;
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.container(width / 2, height / 2).setDepth(1000);

    const bg = this.scene.add.graphics();
    drawUiBox(bg, 0, 0, 460, 280, { fill: UI_FILL, fillAlpha: 0.98, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 20 });
    overlay.add(bg);

    overlay.add(this.scene.add.text(0, -90, getText('nightTest.title'), {
      fontSize: '32px', color: '#ffe066', fontStyle: 'bold'
    }).setOrigin(0.5));

    const dayText = this.scene.add.text(0, -20, `${this.testDay}`, {
      fontSize: '36px', color: '#ffd43b', fontStyle: 'bold'
    }).setOrigin(0.5);
    overlay.add(dayText);

    const updateDay = (delta: number) => {
      this.testDay = Math.max(1, Math.min(99, this.testDay + delta));
      dayText.setText(`${this.testDay}`);
    };

    makeUiButton(this.scene, overlay, -70, -20, 56, 56, '<', {
      box: { radius: 10, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
    }, () => updateDay(-1));
    makeUiButton(this.scene, overlay, 70, -20, 56, 56, '>', {
      box: { radius: 10, fill: 0x2a2f3e, stroke: UI_GOLD, strokeAlpha: 0.6 }
    }, () => updateDay(1));

    makeUiButton(this.scene, overlay, -110, 60, 180, 68, getText('dialog.cancel'), {
      box: { radius: 12, fill: 0x3a3f4e, stroke: UI_STROKE, strokeAlpha: 0.6 }
    }, () => {
      overlay.destroy();
      this.nightTestOverlay = null;
    });
    makeUiButton(this.scene, overlay, 110, 60, 180, 68, getText('nightTest.start'), {
      box: { radius: 12, fill: 0x2b4a2b, stroke: 0x51cf66, strokeAlpha: 0.9 }
    }, () => {
      overlay.destroy();
      this.nightTestOverlay = null;
      this.startNightTest();
    });

    this.container.add(overlay);
    this.nightTestOverlay = overlay;
  }

  private startNightTest(): void {
    this.close();
    const state = createInitialGameState();
    state.day = this.testDay;
    state.resources.coin = 999999;
    state.resources.diamond = 999999;
    state.resources.power = 9999;
    state.resources.medicine = 9999;
    state.resources.scrap = 9999;
    state.resources.fuel = 9999;
    state.unlockedBuildings = getAllBuildingConfigs().map(c => c.id);
    // 预放 4 座风力发电站确保电力
    state.base.buildings.push(
      { cfgId: 203, level: 1, hp: 150, maxHp: 150, row: BASE_CENTER - 1, col: BASE_CENTER - 1 },
      { cfgId: 203, level: 1, hp: 150, maxHp: 150, row: BASE_CENTER - 1, col: BASE_CENTER + 1 },
      { cfgId: 203, level: 1, hp: 150, maxHp: 150, row: BASE_CENTER + 1, col: BASE_CENTER - 1 },
      { cfgId: 203, level: 1, hp: 150, maxHp: 150, row: BASE_CENTER + 1, col: BASE_CENTER + 1 }
    );
    this.scene.scene.start('NightTestScene', { state });
  }

  private confirmRestart(): void {
    if (this.restartTimer) {
      this.restartTimer.remove(false);
      this.restartTimer = null;
      this.onRestart();
      return;
    }
    this.restartButton?.text.setText(getText('dialog.confirmRestart')).setColor('#ff6b6b');
    this.restartTimer = this.scene.time.delayedCall(3000, () => {
      this.restartTimer = null;
      this.restartButton?.text.setText(getText('dialog.restart')).setColor('#ffffff');
    });
  }
}
