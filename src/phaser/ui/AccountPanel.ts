import * as Phaser from 'phaser';
import { getText } from '../../core/i18n';
import type { IGameState } from '../../core/types';
import { BasePanel } from './BasePanel';
import { makeUiButton } from './UiWidgets';
import { UI_FILL, UI_GOLD, UI_STROKE, drawUiBox } from './UiStyle';
import {
  getCurrentUser, isLoggedIn, sendPasswordReset, signIn, signOut, signUp
} from '../../platform/common/Auth';
import { flushCloudUpload, loadCloudSave, SAVE_TIME_TOLERANCE, type ICloudSave } from '../../platform/common/CloudSave';

/**
 * BaseScene 注入的存档操作上下文（面板不直接持有 StorageSystem/Scene 状态）
 */
export interface IAccountContext {
  /** 立即保存本地档（localStorage 第一落点） */
  save: () => void;
  /** 把云端档写入 localStorage（保留云端 timestamp），随后 reload 载入 */
  adoptCloudState: (state: IGameState) => void;
  /** 重新载入页面（采用云端档后） */
  reload: () => void;
  toast: (msg: string) => void;
}

interface IDomInput {
  el: HTMLInputElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 账号面板：邮箱 + 密码登录/注册/忘记密码；已登录显示同步与退出。
 * 输入框用 DOM overlay（透明 input 盖在 Phaser 输入框上）调起系统键盘，
 * 位置按 Scale.FIT 画布实际显示区域换算，窗口尺寸变化时同步。
 */
export class AccountPanel extends BasePanel {
  private email = '';
  private password = '';
  private busy = false;
  private domInputs: IDomInput[] = [];
  private statusText: Phaser.GameObjects.Text | null = null;
  private conflictOverlay: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, private readonly ctx: IAccountContext) {
    super(scene);
  }

  open(): void {
    super.open();
    if (!this.container) return;
    this.addMask(() => this.close());
    if (isLoggedIn()) this.renderLoggedIn();
    else this.renderLogin();
    window.addEventListener('resize', this.repositionDomInputs);
    window.addEventListener('orientationchange', this.repositionDomInputs);
  }

  close(): void {
    window.removeEventListener('resize', this.repositionDomInputs);
    window.removeEventListener('orientationchange', this.repositionDomInputs);
    this.removeDomInputs();
    this.conflictOverlay = null;
    super.close();
  }

  /**
   * 面板骨架：先加与底板同尺寸的透明事件挡板，再画 chrome（挡板在遮罩之上、✕/按钮之下）。
   * 必须挡板：Phaser 在 window 级监听 pointerup，点在 DOM input（或底板空白）上时 hit-test
   * 命中最上层的全屏遮罩会把面板关掉；挡板吃掉底板区域内的指针事件，遮罩只在面板外触发。
   */
  private openChrome(w: number, h: number): { px: number; py: number } {
    const { width, height } = this.scene.scale;
    if (this.container) {
      const blocker = this.scene.add.rectangle(width / 2, height / 2, w, h, 0x000000, 0);
      blocker.setInteractive();
      this.container.add(blocker);
    }
    return this.addPanelChrome(getText('account.title'), w, h, { dividerY: 88 });
  }

  // ---------- 未登录 ----------

  private renderLogin(): void {
    const { px, py } = this.openChrome(720, 960);
    if (!this.container) return;

    this.container.add(this.scene.add.text(px + 360, py + 132, getText('account.hint'), {
      fontSize: '24px', color: '#aab0c4', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5));

    this.container.add(this.scene.add.text(px + 80, py + 216, getText('account.email'), {
      fontSize: '26px', color: '#ccccdd'
    }).setOrigin(0, 0.5));
    const emailBox = this.scene.add.graphics();
    drawUiBox(emailBox, px + 360, py + 272, 560, 80, { fill: 0x1a1a2e, fillAlpha: 0.9, stroke: UI_STROKE, strokeAlpha: 0.7, radius: 14 });
    this.container.add(emailBox);
    const emailText = this.scene.add.text(px + 360, py + 272, getText('account.emailPlaceholder'), {
      fontSize: '28px', color: '#667'
    }).setOrigin(0.5);
    this.container.add(emailText);

    this.container.add(this.scene.add.text(px + 80, py + 356, getText('account.password'), {
      fontSize: '26px', color: '#ccccdd'
    }).setOrigin(0, 0.5));
    const pwdBox = this.scene.add.graphics();
    drawUiBox(pwdBox, px + 360, py + 412, 560, 80, { fill: 0x1a1a2e, fillAlpha: 0.9, stroke: UI_STROKE, strokeAlpha: 0.7, radius: 14 });
    this.container.add(pwdBox);
    const pwdText = this.scene.add.text(px + 360, py + 412, getText('account.passwordPlaceholder'), {
      fontSize: '28px', color: '#667'
    }).setOrigin(0.5);
    this.container.add(pwdText);

    // 透明 DOM input 覆盖在输入框上：点击聚焦调起系统键盘，值回显到 Phaser 文本
    this.mountDomInput(px + 80, py + 232, 560, 80, 'email', v => {
      this.email = v;
      emailText.setText(v || getText('account.emailPlaceholder')).setColor(v ? '#ffffff' : '#667');
    });
    this.mountDomInput(px + 80, py + 372, 560, 80, 'password', v => {
      this.password = v;
      pwdText.setText(v ? '•'.repeat(Math.min(v.length, 24)) : getText('account.passwordPlaceholder')).setColor(v ? '#ffffff' : '#667');
    });

    makeUiButton(this.scene, this.container, px + 190, py + 548, 300, 84, getText('account.signIn'), {
      box: { radius: 14, stroke: UI_GOLD, strokeAlpha: 0.8 }
    }, () => void this.handleSignIn());
    makeUiButton(this.scene, this.container, px + 530, py + 548, 300, 84, getText('account.signUp'), {
      box: { radius: 14 }
    }, () => void this.handleSignUp());
    makeUiButton(this.scene, this.container, px + 360, py + 656, 300, 68, getText('account.forgot'), {
      box: { radius: 12, fill: 0x3a3f4e, stroke: UI_STROKE, strokeAlpha: 0.6 }, fontSize: '24px'
    }, () => void this.handleForgot());

    this.statusText = this.scene.add.text(px + 360, py + 760, '', {
      fontSize: '24px', color: '#ff8787', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5);
    this.container.add(this.statusText);
  }

  private validateInput(): string | null {
    const email = this.email.trim();
    if (!email) return 'account.error.noEmail';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'account.error.invalidEmail';
    if (!this.password) return 'account.error.noPassword';
    return null;
  }

  private async handleSignIn(): Promise<void> {
    if (this.busy) return;
    const invalid = this.validateInput();
    if (invalid) { this.setStatus(getText(invalid), false); return; }
    this.busy = true;
    this.setStatus(getText('account.signingIn'), true);
    const res = await signIn(this.email.trim(), this.password);
    this.busy = false;
    if (!res.ok) { this.setStatus(getText(res.errorKey ?? 'account.error.generic'), false); return; }
    await this.afterAuthSuccess();
  }

  private async handleSignUp(): Promise<void> {
    if (this.busy) return;
    const invalid = this.validateInput();
    if (invalid) { this.setStatus(getText(invalid), false); return; }
    this.busy = true;
    this.setStatus(getText('account.signingIn'), true);
    const res = await signUp(this.email.trim(), this.password);
    this.busy = false;
    if (!res.ok) { this.setStatus(getText(res.errorKey ?? 'account.error.generic'), false); return; }
    if (res.needsEmailConfirm) {
      // 项目开启邮件确认：注册成功但无 session，引导玩家去邮箱验证
      this.setStatus(getText('account.signupConfirmSent'), true);
      return;
    }
    await this.afterAuthSuccess();
  }

  private async handleForgot(): Promise<void> {
    if (this.busy) return;
    const email = this.email.trim();
    if (!email) { this.setStatus(getText('account.error.noEmail'), false); return; }
    this.busy = true;
    this.setStatus(getText('account.signingIn'), true);
    const res = await sendPasswordReset(email);
    this.busy = false;
    this.setStatus(getText(res.ok ? 'account.resetSent' : (res.errorKey ?? 'account.error.generic')), res.ok);
  }

  /** 登录/注册成功后的绑定流程：云端无档→直接上传；有档且不同→冲突弹窗 */
  private async afterAuthSuccess(): Promise<void> {
    this.ctx.save();
    const cloud = await loadCloudSave();
    if (!cloud?.state) {
      await flushCloudUpload();
      this.ctx.toast(getText('account.bound'));
      this.rerender();
      return;
    }
    const local = this.readLocalInfo();
    if (local && Math.abs(local.timestamp - cloud.updatedAt) <= SAVE_TIME_TOLERANCE) {
      await flushCloudUpload();
      this.ctx.toast(getText('account.bound'));
      this.rerender();
      return;
    }
    this.showConflict(cloud, local);
  }

  // ---------- 已登录 ----------

  private renderLoggedIn(): void {
    const { px, py } = this.openChrome(720, 660);
    if (!this.container) return;
    const email = getCurrentUser()?.email ?? '';

    this.container.add(this.scene.add.text(px + 360, py + 150, `${getText('account.loggedInAs')}\n${email}`, {
      fontSize: '28px', color: '#ffffff', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5));

    makeUiButton(this.scene, this.container, px + 360, py + 320, 320, 84, getText('account.syncNow'), {
      box: { radius: 14, stroke: UI_GOLD, strokeAlpha: 0.8 }
    }, () => void this.handleSyncNow());
    makeUiButton(this.scene, this.container, px + 360, py + 430, 320, 76, getText('account.signOut'), {
      box: { radius: 14, fill: 0x3a3f4e, stroke: UI_STROKE, strokeAlpha: 0.6 }
    }, () => void this.handleSignOut());

    this.statusText = this.scene.add.text(px + 360, py + 540, getText('account.hint'), {
      fontSize: '22px', color: '#aab0c4', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5);
    this.container.add(this.statusText);
  }

  private async handleSyncNow(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.ctx.save();
    const ok = await flushCloudUpload();
    this.busy = false;
    this.ctx.toast(getText(ok ? 'account.syncDone' : 'account.syncFail'));
    this.setStatus('', true);
  }

  private async handleSignOut(): Promise<void> {
    await signOut();
    // 登出后本地档保留转为游客档继续玩；云端留最后一份副本
    this.rerender();
  }

  // ---------- 冲突弹窗 ----------

  private showConflict(cloud: ICloudSave, local: { timestamp: number; day: number } | null): void {
    if (!this.container || !cloud.state) return;
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.container(width / 2, height / 2).setDepth(1002);

    const bg = this.scene.add.graphics();
    drawUiBox(bg, 0, 0, 700, 640, { fill: UI_FILL, fillAlpha: 0.99, stroke: UI_GOLD, strokeAlpha: 0.9, radius: 20 });
    overlay.add(bg);

    overlay.add(this.scene.add.text(0, -250, getText('account.conflict.title'), {
      fontSize: '36px', color: '#ffe066', fontStyle: 'bold'
    }).setOrigin(0.5));
    overlay.add(this.scene.add.text(0, -180, getText('account.conflict.body'), {
      fontSize: '24px', color: '#ccccdd', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5));

    makeUiButton(this.scene, overlay, -170, 30, 300, 150, getText('account.conflict.cloud', {
      day: cloud.day, time: formatSaveTime(cloud.updatedAt)
    }), { box: { radius: 14, stroke: 0x51cf66, strokeAlpha: 0.9 }, fontSize: '26px' }, () => {
      // 选云端：写入 localStorage 后重载，整局按云端档重新开始
      this.ctx.adoptCloudState(cloud.state!);
      this.ctx.reload();
    });
    makeUiButton(this.scene, overlay, 170, 30, 300, 150, getText('account.conflict.local', {
      day: local?.day ?? 0, time: formatSaveTime(local?.timestamp ?? Date.now())
    }), { box: { radius: 14, stroke: UI_GOLD, strokeAlpha: 0.9 }, fontSize: '26px' }, () => {
      void this.resolveConflictKeepLocal();
    });
    makeUiButton(this.scene, overlay, 0, 190, 240, 64, getText('account.conflict.later'), {
      box: { radius: 12, fill: 0x3a3f4e, stroke: UI_STROKE, strokeAlpha: 0.6 }, fontSize: '24px'
    }, () => {
      overlay.destroy();
      this.conflictOverlay = null;
      this.rerender();
    });

    this.container.add(overlay);
    this.conflictOverlay = overlay;
  }

  /** 选本地：用本机档覆盖云端 */
  private async resolveConflictKeepLocal(): Promise<void> {
    this.ctx.save();
    const ok = await flushCloudUpload();
    this.conflictOverlay?.destroy();
    this.conflictOverlay = null;
    this.ctx.toast(getText(ok ? 'account.syncDone' : 'account.syncFail'));
    this.rerender();
  }

  // ---------- 工具 ----------

  private readLocalInfo(): { timestamp: number; day: number } | null {
    try {
      const raw = localStorage.getItem('merge_survival_td_state');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.state || typeof data.state !== 'object') return null;
      return {
        timestamp: typeof data.state.timestamp === 'number' ? data.state.timestamp : 0,
        day: typeof data.state.day === 'number' ? data.state.day : 0
      };
    } catch {
      return null;
    }
  }

  private rerender(): void {
    if (!this.container) return;
    this.container.removeAll(true);
    this.removeDomInputs();
    this.addMask(() => this.close());
    if (isLoggedIn()) this.renderLoggedIn();
    else this.renderLogin();
  }

  private setStatus(msg: string, ok: boolean): void {
    this.statusText?.setText(msg).setColor(ok ? '#8ce99a' : '#ff8787');
  }

  private mountDomInput(x: number, y: number, w: number, h: number, type: string, onValue: (v: string) => void): void {
    if (typeof document === 'undefined') return;
    const el = document.createElement('input');
    el.type = type;
    el.autocomplete = 'off';
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    // fontSize ≥16px 防 iOS 聚焦自动缩放页面；透明但可点击，覆盖在 Phaser 输入框上调起键盘
    el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;border:none;padding:0;margin:0;background:transparent;z-index:9999;';
    el.style.fontSize = '16px';
    el.addEventListener('input', () => onValue(el.value));
    document.body.appendChild(el);
    this.domInputs.push({ el, x, y, w, h });
    this.repositionDomInputs();
  }

  /** Phaser 设计坐标（1080x1920）→ 屏幕 CSS 坐标：按画布实际显示位置换算，适配 Scale.FIT */
  private repositionDomInputs = (): void => {
    const canvas = this.scene.game.canvas;
    if (!canvas || this.domInputs.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const s = rect.width / this.scene.scale.width;
    for (const item of this.domInputs) {
      item.el.style.left = `${rect.left + item.x * s}px`;
      item.el.style.top = `${rect.top + item.y * s}px`;
      item.el.style.width = `${item.w * s}px`;
      item.el.style.height = `${item.h * s}px`;
    }
  };

  private removeDomInputs(): void {
    for (const item of this.domInputs) item.el.remove();
    this.domInputs = [];
  }
}

/** 存档时间展示：统一短格式，避免 toLocaleString 默认输出过长 */
function formatSaveTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
