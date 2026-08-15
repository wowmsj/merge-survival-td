import * as Phaser from 'phaser';

/**
 * 全局 UI 样式基准：深色扁平 + 细描边（与 HUD 顶栏一致）
 * 底：深蓝灰半透明；描边：蓝灰 0x3d4a63 或淡金 0xc8a54a 低 alpha
 */
export const UI_FILL = 0x1a1f2e;
export const UI_SLOT_FILL = 0x232a3d;
export const UI_STROKE = 0x3d4a63;
export const UI_GOLD = 0xc8a54a;
export const UI_GREEN = 0x4caf50;
export const UI_ORANGE = 0xe8590c;
/** 卡片底（图鉴卡/章节行等列表项的实色底） */
export const UI_CARD_FILL = 0x252b3d;
/** 绿色确认框底（可提交任务/已解锁产出/+扩容槽：深绿底 + UI_GREEN 描边） */
export const UI_GREEN_FILL = 0x1e3326;

export interface IUiBoxOpts {
  fill?: number;
  fillAlpha?: number;
  stroke?: number;
  strokeAlpha?: number;
  strokeWidth?: number;
  radius?: number;
}

/** 在 Graphics 上绘制居中圆角矩形底（深色底 + 细描边） */
export function drawUiBox(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  opts: IUiBoxOpts = {}
): void {
  const fill = opts.fill ?? UI_SLOT_FILL;
  const fillAlpha = opts.fillAlpha ?? 0.9;
  const stroke = opts.stroke ?? UI_GOLD;
  const strokeAlpha = opts.strokeAlpha ?? 0.35;
  const strokeWidth = opts.strokeWidth ?? 2;
  const radius = opts.radius ?? 14;
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radius);
  g.lineStyle(strokeWidth, stroke, strokeAlpha);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radius);
}
