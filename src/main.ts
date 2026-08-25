import * as Phaser from 'phaser';
import { GameScene } from './phaser/scenes/GameScene';
import { BaseScene } from './phaser/scenes/BaseScene';
import { NightScene } from './phaser/scenes/NightScene';
import { Night3DScene } from './phaser/scenes/Night3DScene';
import { NightTestScene } from './phaser/scenes/NightTestScene';
import { BootScene } from './phaser/scenes/BootScene';
import { getPlatform } from './platform/common/Platform';

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

/**
 * 游戏入口
 */
async function main() {
  blockEdgeNavigation();
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
    scene: [BootScene, GameScene, BaseScene, NightScene, Night3DScene, NightTestScene],
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
      antialias: true
    }
  };

  new Phaser.Game(config);
  // Phaser 接管画面后移除 HTML 占位 Loading
  document.getElementById('boot-loading')?.remove();
}

main().catch(console.error);
