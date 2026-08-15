import * as Phaser from 'phaser';
import { IGameState } from '../../core/types';
import { IStoryBeat, getMainStoryBeats } from '../../core/config/StoryConfig';
import { UI_CARD_FILL, UI_GOLD, UI_STROKE, drawUiBox } from './UiStyle';
import { makeUiButton } from './UiWidgets';
import { BasePanel } from './BasePanel';
import { getStoryLines, getStoryUnlockCondition, getText } from '../../core/i18n';

const PAGE_SIZE = 5;

/** 面板宽高（竖屏固定坐标布局，居中） */
const PANEL_W = 700;
const PANEL_H = 1080;

/**
 * 剧情回顾面板：收录全部主线剧情（序章 + 天数章节，引导剧情不算）。
 * 已解锁章节显示内容摘要、可点「回顾」重播；未解锁显示解锁条件。
 * 由 GameScene 的「剧情」按钮打开；onReplay 回调负责关闭面板并重播。
 */
export class StoryArchivePanel extends BasePanel {
  private state: IGameState;
  private page = 0;
  /** 点击「回顾」：参数为要重播的 beat（面板由回调方关闭） */
  onReplay: (beat: IStoryBeat) => void = () => {};

  constructor(scene: Phaser.Scene, state: IGameState) {
    super(scene); // 一次性模式：open 新建容器、close 销毁，depth 850
    this.state = state;
  }

  open(): void {
    this.page = 0;
    super.open();
    this.render();
  }

  private render(): void {
    if (!this.container) return;
    this.container.removeAll(true);

    const { width } = this.scene.scale;
    const beats = getMainStoryBeats();
    const seen = new Set(this.state.storySeen);
    const pageCount = Math.max(1, Math.ceil(beats.length / PAGE_SIZE));
    this.page = Phaser.Math.Clamp(this.page, 0, pageCount - 1);

    // 遮罩（不拦截点击穿透，仅背景压暗；关闭走右上角 ×）
    this.addMask();

    const { py } = this.addPanelChrome(getText('archive.title'), PANEL_W, PANEL_H, { titleY: 44, closeY: 36 });

    // 解锁进度
    const unlockedCount = beats.filter(b => seen.has(b.id)).length;
    this.container.add(this.scene.add.text(width / 2, py + 88, getText('archive.progress', { unlocked: unlockedCount, total: beats.length }), {
      fontSize: '22px', color: '#8f94a8'
    }).setOrigin(0.5));

    // 章节行
    const rowH = 156;
    const start = this.page * PAGE_SIZE;
    const pageBeats = beats.slice(start, start + PAGE_SIZE);
    pageBeats.forEach((beat, i) => {
      const cy = py + 160 + rowH / 2 + i * rowH;
      const unlocked = seen.has(beat.id);
      this.renderRow(beat, unlocked, width / 2, cy, PANEL_W - 60, rowH - 18);
    });

    // 翻页
    const footerY = py + PANEL_H - 56;
    const pageText = this.scene.add.text(width / 2, footerY, `${this.page + 1} / ${pageCount}`, {
      fontSize: '24px', color: '#ccccdd'
    }).setOrigin(0.5);
    this.container.add(pageText);
    this.addPageButton(width / 2 - 130, footerY, getText('page.previous'), this.page > 0, () => { this.page--; this.render(); });
    this.addPageButton(width / 2 + 130, footerY, getText('page.next'), this.page < pageCount - 1, () => { this.page++; this.render(); });
  }

  /** 单个章节行：已解锁 → 摘要 + 回顾按钮；未解锁 → 置灰 + 解锁条件 */
  private renderRow(beat: IStoryBeat, unlocked: boolean, cx: number, cy: number, w: number, h: number): void {
    if (!this.container) return;
    const box = this.scene.add.graphics();
    drawUiBox(box, cx, cy, w, h, unlocked
      ? { fill: UI_CARD_FILL, fillAlpha: 1, stroke: UI_GOLD, strokeAlpha: 0.5, radius: 14 }
      : { fill: 0x1f2330, fillAlpha: 0.7, stroke: UI_STROKE, strokeAlpha: 0.6, radius: 14 });
    this.container.add(box);

    const left = cx - w / 2 + 28;
    const chapter = this.scene.add.text(left, cy - h / 2 + 20, getText('archive.chapter', { chapter: beat.chapter }), {
      fontSize: '26px', color: unlocked ? '#ffd75e' : '#6a7086', fontStyle: 'bold'
    });
    this.container.add(chapter);

    if (unlocked) {
      // 摘要：首句台词（通常旁白）截断
      const first = getStoryLines(beat.id)[0]?.text ?? beat.lines[0]?.text ?? '';
      const snippet = first.length > 18 ? first.slice(0, 18) + '…' : first;
      this.container.add(this.scene.add.text(left, cy - h / 2 + 62, snippet, {
        fontSize: '22px', color: '#9fa4b8', wordWrap: { width: w - 220 }
      }));
      // 回顾按钮
      const btnW = 110;
      const bx = cx + w / 2 - 24 - btnW / 2;
      makeUiButton(this.scene, this.container, bx, cy, btnW, 56, getText('archive.replay'),
        { box: { radius: 12 }, fontSize: '24px' },
        () => this.onReplay(beat));
    } else {
      this.container.add(this.scene.add.text(left, cy - h / 2 + 62, `🔒 ${getStoryUnlockCondition(beat)}`, {
        fontSize: '22px', color: '#6a7086'
      }));
    }
  }
}
