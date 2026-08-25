import * as Phaser from 'phaser';
import { Language, getText } from '../../core/i18n';
import { BasePanel } from './BasePanel';
import { IUiButton, makeUiButton } from './UiWidgets';
import { UI_FILL, UI_GOLD, UI_ORANGE, UI_STROKE, drawUiBox } from './UiStyle';
import { createInitialGameState } from '../../core/model/GameState';
import { BASE_CENTER } from '../../core/model/Base';
import { getAllBuildingConfigs } from '../../core/config/BuildingConfig';
import { PlayMode } from '../../core/types';

export class SettingsPanel extends BasePanel {
  private restartTimer: Phaser.Time.TimerEvent | null = null;
  private restartButton: IUiButton | null = null;
  private nightTestOverlay: Phaser.GameObjects.Container | null = null;
  private playModeOverlay: Phaser.GameObjects.Container | null = null;
  private testDay = 7;

  constructor(
    scene: Phaser.Scene,
    private readonly onLanguage: (language: Language) => void,
    private readonly onRestart: () => void,
    private readonly playMode: PlayMode = 'merge',
    private readonly onPlayModeChange?: (mode: PlayMode) => void
  ) {
    super(scene);
  }

  open(): void {
    super.open();
    if (!this.container) return;
    this.addMask(() => this.close());
    const { px, py } = this.addPanelChrome(getText('settings.title'), 620, 640, { dividerY: 88 });
    makeUiButton(this.scene, this.container, px + 175, py + 140, 230, 68, getText('settings.chinese'), {}, () => this.onLanguage('zh-CN'));
    makeUiButton(this.scene, this.container, px + 445, py + 140, 230, 68, getText('settings.english'), {}, () => this.onLanguage('en'));

    // 玩法模式切换
    const modeLabel = getText('settings.playMode.current', { mode: getText(`settings.playMode.${this.playMode}`) });
    this.container.add(this.scene.add.text(px + 310, py + 240, modeLabel, {
      fontSize: '26px', color: '#ccccdd'
    }).setOrigin(0.5));
    makeUiButton(this.scene, this.container, px + 175, py + 310, 230, 68, getText('settings.playMode.merge'), {
      box: { fill: this.playMode === 'merge' ? 0x2b4a2b : undefined, stroke: this.playMode === 'merge' ? 0x51cf66 : UI_STROKE, strokeAlpha: 0.8, radius: 14 }
    }, () => this.confirmPlayModeChange('merge'));
    makeUiButton(this.scene, this.container, px + 445, py + 310, 230, 68, getText('settings.playMode.build'), {
      box: { fill: this.playMode === 'build' ? 0x2b4a2b : undefined, stroke: this.playMode === 'build' ? 0x51cf66 : UI_STROKE, strokeAlpha: 0.8, radius: 14 }
    }, () => this.confirmPlayModeChange('build'));

    makeUiButton(this.scene, this.container, px + 310, py + 400, 300, 72, getText('settings.nightTest'), {
      box: { stroke: UI_GOLD, strokeAlpha: 0.8, radius: 14 }
    }, () => this.openNightTestDialog());
    this.restartButton = makeUiButton(this.scene, this.container, px + 310, py + 510, 300, 72, getText('dialog.restart'), {
      box: { stroke: UI_ORANGE, strokeAlpha: 0.7, radius: 14 }
    }, () => this.confirmRestart());
  }

  close(): void {
    this.nightTestOverlay?.destroy();
    this.nightTestOverlay = null;
    this.playModeOverlay?.destroy();
    this.playModeOverlay = null;
    this.restartTimer?.remove(false);
    this.restartTimer = null;
    super.close();
  }

  private confirmPlayModeChange(mode: PlayMode): void {
    if (mode === this.playMode || !this.onPlayModeChange || !this.container) return;
    if (this.playModeOverlay) return;
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.container(width / 2, height / 2).setDepth(1001);

    const bg = this.scene.add.graphics();
    drawUiBox(bg, 0, 0, 520, 240, { fill: UI_FILL, fillAlpha: 0.98, stroke: UI_GOLD, strokeAlpha: 0.8, radius: 20 });
    overlay.add(bg);

    overlay.add(this.scene.add.text(0, -50, getText('settings.playMode.confirm'), {
      fontSize: '26px', color: '#ffffff', align: 'center', wordWrap: { width: 440 }
    }).setOrigin(0.5));

    makeUiButton(this.scene, overlay, -120, 60, 180, 64, getText('dialog.cancel'), {
      box: { radius: 12, fill: 0x3a3f4e, stroke: UI_STROKE, strokeAlpha: 0.6 }
    }, () => {
      overlay.destroy();
      this.playModeOverlay = null;
    });
    makeUiButton(this.scene, overlay, 120, 60, 180, 64, getText('dialog.confirmRestart'), {
      box: { radius: 12, fill: 0x4a2b2b, stroke: 0xff6b6b, strokeAlpha: 0.9 }
    }, () => {
      overlay.destroy();
      this.playModeOverlay = null;
      this.onPlayModeChange!(mode);
    });

    this.container.add(overlay);
    this.playModeOverlay = overlay;
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
