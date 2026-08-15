import * as Phaser from 'phaser';
import { GameEvents, eventBus } from '../../core/events/EventBus';
import { IStoryBeat, STORY_CHARACTERS } from '../../core/config/StoryConfig';
import { UI_FILL, UI_STROKE, drawUiBox } from './UiStyle';
import { getSpeakerName, getStoryLines, getText } from '../../core/i18n';

/**
 * 剧情对话浮层：监听 STORY_PLAY，底部对话框逐句播放，点击推进。
 * 播完一段回发 STORY_BEAT_DONE（StorySystem 接着播队列下一段）。
 * 旁白（narrator）无立绘、文字用浅蓝灰色与角色台词区分（统一左对齐）。
 */
export class StoryDialog {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private beat: IStoryBeat | null = null;
  private lineIndex = 0;
  /** 播完一段后的回调（场景用来存档） */
  onBeatDone: () => void = () => {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    eventBus.on(GameEvents.STORY_PLAY, this.onPlay);
  }

  destroy(): void {
    eventBus.off(GameEvents.STORY_PLAY, this.onPlay);
    this.close(false);
  }

  /** 对话框是否正在展示（场景用来屏蔽棋盘输入，防止点穿） */
  get isOpen(): boolean {
    return this.container !== null;
  }

  private onPlay = (data: { beat: IStoryBeat }): void => {
    this.open(data.beat);
  };

  private open(beat: IStoryBeat): void {
    this.close(false);
    this.beat = beat;
    this.lineIndex = 0;

    const { width, height } = this.scene.scale;
    this.container = this.scene.add.container(0, 0).setDepth(900);

    // 暗场 + 点击推进
    const dim = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();
    dim.on('pointerup', () => this.next());
    this.container.add(dim);
    this.renderLine();
  }

  /** 渲染当前句 */
  private renderLine(): void {
    if (!this.container || !this.beat) return;
    // 清掉上一句的对话框元素（保留第一个子节点 dim）
    while (this.container.length > 1) {
      this.container.getAt(1).destroy();
    }

    const { width, height } = this.scene.scale;
    const lines = getStoryLines(this.beat.id, this.beat.lines);
    const line = lines[this.lineIndex];
    const char = STORY_CHARACTERS[line.who] ?? { name: line.who };
    const isNarrator = line.who === 'narrator';

    const panelH = 300;
    const panelY = height - panelH - 40;
    const hasPortrait = !isNarrator && char.texture && this.scene.textures.exists(char.texture);

    // 立绘（面板左上方探出）
    if (hasPortrait) {
      const portrait = this.scene.add.image(150, panelY - 90, char.texture!)
        .setDisplaySize(300, 300);
      this.container.add(portrait);
    }

    // 对话框底
    const box = this.scene.add.graphics();
    drawUiBox(box, width / 2, panelY + panelH / 2, width - 60, panelH, {
      fill: UI_FILL, fillAlpha: 0.97, stroke: UI_STROKE, strokeAlpha: 0.9, radius: 20
    });
    this.container.add(box);

    // 名牌
    if (!isNarrator) {
      const tag = this.scene.add.graphics();
      drawUiBox(tag, 150, panelY - 6, 180, 56, {
        fill: 0x3a2c1c, fillAlpha: 1, stroke: 0xffd166, strokeAlpha: 0.9, radius: 12
      });
      this.container.add(tag);
      this.container.add(this.scene.add.text(150, panelY - 6, getSpeakerName(line.who), {
        fontSize: '30px', color: '#ffd166', fontStyle: 'bold'
      }).setOrigin(0.5));
    }

    // 台词（旁白同样左对齐：整段居中对齐换行后会变成「居中诗」，中文斜体也很难看）
    const textX = hasPortrait ? 300 : 70;
    const textW = hasPortrait ? width - 60 - textX - 30 : width - 60 - 140;
    const text = this.scene.add.text(textX, panelY + 50, line.text, {
      fontSize: '32px',
      color: isNarrator ? '#ccccee' : '#ffffff',
      fontStyle: 'normal',
      align: 'left',
      wordWrap: { width: textW, useAdvancedWrap: true },
      lineSpacing: 10,
      // Canvas 测量对中文上伸部分偏小，padding 防止顶部字形被裁
      padding: { left: 4, right: 4, top: 10, bottom: 6 }
    });
    this.container.add(text);

    // 继续提示
    const hint = this.scene.add.text(width - 90, panelY + panelH - 40,
      this.lineIndex < lines.length - 1 ? getText('story.continue') : getText('story.close'), {
        fontSize: '24px', color: '#999999'
      }).setOrigin(1, 0.5);
    this.container.add(hint);
    this.scene.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
  }

  /** 推进一句；播完回发 STORY_BEAT_DONE */
  private next(): void {
    if (!this.beat) return;
    if (this.lineIndex < getStoryLines(this.beat.id, this.beat.lines).length - 1) {
      this.lineIndex++;
      this.renderLine();
      return;
    }
    this.close(true);
  }

  /** 播完一段回发（由场景转调 StorySystem.beatDone） */
  private close(notify: boolean): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    // 先清空 this.beat 再回调：beatDone 可能立刻开播下一段（open 新 beat），
    // 若顺序反了会把新 beat 误清成 null，导致对话框卡死点不动
    const beat = this.beat;
    this.beat = null;
    if (notify && beat) {
      this.onBeatDone();
    }
  }
}
