import * as Phaser from 'phaser';
import { Language, getText } from '../../core/i18n';
import { BasePanel } from './BasePanel';
import { IUiButton, makeUiButton } from './UiWidgets';
import { UI_ORANGE } from './UiStyle';

export class SettingsPanel extends BasePanel {
  private restartTimer: Phaser.Time.TimerEvent | null = null;
  private restartButton: IUiButton | null = null;

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
    const { px, py } = this.addPanelChrome(getText('settings.title'), 620, 500, { dividerY: 88 });
    makeUiButton(this.scene, this.container, px + 175, py + 160, 230, 68, getText('settings.chinese'), {}, () => this.onLanguage('zh-CN'));
    makeUiButton(this.scene, this.container, px + 445, py + 160, 230, 68, getText('settings.english'), {}, () => this.onLanguage('en'));
    this.restartButton = makeUiButton(this.scene, this.container, px + 310, py + 350, 300, 72, getText('dialog.restart'), {
      box: { stroke: UI_ORANGE, strokeAlpha: 0.7, radius: 14 }
    }, () => this.confirmRestart());
  }

  close(): void {
    this.restartTimer?.remove(false);
    this.restartTimer = null;
    super.close();
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
