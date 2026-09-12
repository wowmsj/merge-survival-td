import * as Phaser from 'phaser';
import { BaseScene } from './phaser/scenes/BaseScene';
import { NightScene } from './phaser/scenes/NightScene';
import { Night3DScene } from './phaser/scenes/Night3DScene';
import { NightTestScene } from './phaser/scenes/NightTestScene';
import { BootScene } from './phaser/scenes/BootScene';
import { getPlatform } from './platform/common/Platform';
import { initAnalytics } from './platform/common/analytics';

function blockEdgeNavigation(): void {
  const edge = 24;
  let startX = 0;
  let startY = 0;
  let fromEdge = false;
  document.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    fromEdge = startX <= edge || startX >= window.innerWidth - edge;
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    const touch = event.touches[0];
    if (!touch || !fromEdge) return;
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > dy && dx > 6) event.preventDefault();
  }, { passive: false });
}

/** 屏蔽移动端浏览器手势：iOS 捏合缩放、长按系统菜单、下拉刷新/整页回弹 */
function blockMobileGestures(): void {
  // iOS Safari 10+ 无视 viewport 的 user-scalable=no，需拦 gesture 事件防捏合缩放
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault());
  }
  // 长按弹出系统菜单（Android 复制/分享、iOS 放大镜旁路）
  document.addEventListener('contextmenu', e => e.preventDefault());
  // 下拉刷新/整页拖动：游戏无原生滚动，全部拦截；
  // preventDefault 只阻止浏览器接管滚动/缩放，pointer 事件照常派发，游戏拖拽/捏合不受影响
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

/**
 * 游戏入口
 */
async function main() {
  blockEdgeNavigation();
  blockMobileGestures();
  initAnalytics();
  // 初始化平台
  const platform = getPlatform();
  await platform.init();

  // 固定竖屏设计分辨率 1080 x 1920
  const DESIGN_WIDTH = 1080;
  const DESIGN_HEIGHT = 1920;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    backgroundColor: '#1a1a2e',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT
    },
    scene: [BootScene, BaseScene, NightScene, Night3DScene, NightTestScene],
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false
      }
    },
    input: {
      activePointers: 3
    },
    render: {
      pixelArt: false,
      antialias: true,
      transparent: true
    }
  };

  new Phaser.Game(config);
  // Phaser 接管画面后移除 HTML 占位 Loading
  document.getElementById('boot-loading')?.remove();
}

main().catch(console.error);
