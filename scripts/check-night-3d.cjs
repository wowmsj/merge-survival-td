/**
 * 夜战 3D 暖土 GLB 接入验收（对应 docs/KIMI-暖土资源交付清单.md 的接入侧）
 *
 * 自包含：自动启动 webpack-dev-server（dev mode，__DEV_FEATURES__=true 使调试钩子生效），
 * Playwright 无头浏览器验收后关闭服务器。若 8080 已有服务在跑则直接复用。
 *
 * 用法：node scripts/check-night-3d.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 两个上下文：
 *   A 全量 GLB：地形 169 格/地形特征/建筑（含种子塔/墙/陷阱/资源）/僵尸全部 GLB 化，
 *     截图 night3d-base.png、night3d-wave.png；随后核心 hp=1 快进战斗结束，
 *     点结算按钮回 BaseScene，断言 dispose 无残留画布。
 *   B 回退：abort warm_core/warm_building_wall/warm_enemy_1 三个 GLB 请求，
 *     断言对应实体走程序化回退（不隐形、不报错），截图 night3d-fallback.png。
 *
 * 路径：BootScene 直进 BaseScene（GameScene 已删除，BaseScene 是唯一主场景）
 *   → BaseScene 顶栏「夜战」(940,306) → 确认弹窗「战斗」(390,1359)
 *   → Night3DScene（localStorage render_mode=3d）。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8080;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(ROOT, 'screenshots');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
}

function httpOk(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function waitServer(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await httpOk(url)) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

/** 设计坐标（1080×1920）→ 屏幕坐标 */
function designPoint(page, x, y) {
  return page.evaluate(([dx, dy]) => {
    const c = document.querySelector('#game-container canvas').getBoundingClientRect();
    return { x: c.left + dx / 1080 * c.width, y: c.top + dy / 1920 * c.height };
  }, [x, y]);
}

/** 启动游戏并点穿开局剧情对话，返回时停在 BaseScene（__base3d 钩子可用） */
async function bootGame(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__base3d, null, { timeout: 90000 });
  await page.evaluate(() => {
    const s = window.__base3d.state;
    s.storySeen = Array.from({ length: 131 }, (_, i) => i + 1);
    s.storyRewardClaims = Array.from({ length: 131 }, (_, i) => i + 1);
    s.handIndex = 9999;
  });
  const dialogGone = async () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-base3d]');
    return !!c && getComputedStyle(c).visibility !== 'hidden';
  });
  for (let i = 0; i < 40 && !(await dialogGone()); i++) {
    await page.mouse.click(270, 480);
    await page.waitForTimeout(350);
  }
  return dialogGone();
}

/** 在基地放种子建筑（塔/墙/陷阱/资源各一，避开东侧刷怪行进路线 rows 4-6），再进入夜战 3D 场景 */
async function enterNight(page) {
  await page.evaluate(() => {
    const b = window.__base3d.state.base.buildings;
    b.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 3, col: 3 }); // 箭塔
    b.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 9, col: 9 }); // 资源
    b.push({ cfgId: 401, level: 1, hp: 300, maxHp: 300, row: 9, col: 3 }); // 墙
    b.push({ cfgId: 301, level: 1, hp: 50, maxHp: 50, row: 3, col: 9 });   // 陷阱
    window.__base3d.owner.syncAll();
  });
  await page.waitForTimeout(600);
  // BaseScene 顶栏「夜战」→ 确认弹窗「战斗」。弹窗打开是异步的，
  // 重试循环：夜战点击被弹窗遮罩挡住时无害，战斗按钮位置固定
  const p = await designPoint(page, 940, 306);
  const fight = await designPoint(page, 390, 1359);
  let entered = false;
  for (let i = 0; i < 8 && !entered; i++) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(700);
    await page.mouse.click(fight.x, fight.y);
    entered = await page.waitForFunction(() => window.__night3d, null, { timeout: 2500 })
      .then(() => true).catch(() => false);
  }
  if (!entered) throw new Error('无法进入夜战 3D 场景（夜战/战斗按钮未命中）');
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  // 起 dev server（已有则复用）
  let server = null;
  if (await httpOk(BASE)) {
    console.log(`复用已运行的 ${BASE}`);
  } else {
    console.log('启动 webpack-dev-server（dev mode，首次编译约 1 分钟）...');
    server = spawn('npx', ['webpack', 'serve', '--mode', 'development', '--no-open', '--port', String(PORT)], {
      cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', d => process.stderr.write(`[dev] ${d}`));
    const ok = await waitServer(BASE, 240000);
    if (!ok) throw new Error('webpack-dev-server 启动超时');
    console.log('dev server 就绪');
  }

  const browser = await chromium.launch();
  try {
    // ================= 上下文 A：全量 GLB =================
    {
      const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
      await context.addInitScript(() => {
        localStorage.setItem('merge_survival_td_base_3d', '1');
        localStorage.setItem('merge_survival_td_render_mode', '3d');
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e.message || e)));

      check('A: 开局剧情对话已全部关闭', await bootGame(page));
      await enterNight(page);
      check('A: 夜战 3D 渲染器激活（__night3d 钩子存在）',
        await page.evaluate(() => !!window.__night3d));
      check('A: 夜战 3D 画布存在且只有一张',
        await page.evaluate(() => document.querySelectorAll('canvas[data-night3d]').length) === 1);
      {
        // 3D 画布必须精确覆盖 Phaser 游戏画布（flex+autoCenter 下不能用容器 50% 居中）
        const al = await page.evaluate(() => {
          const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, w: b.width, h: b.height }; };
          const phaser = document.querySelector('#game-container canvas:not([data-night3d])');
          const n3d = document.querySelector('canvas[data-night3d]');
          return { phaser: box(phaser), n3d: box(n3d) };
        });
        const aligned = Math.abs(al.phaser.left - al.n3d.left) < 1 && Math.abs(al.phaser.top - al.n3d.top) < 1
          && Math.abs(al.phaser.w - al.n3d.w) < 1 && Math.abs(al.phaser.h - al.n3d.h) < 1;
        check('A: 3D 画布与游戏画布精确对齐', aligned, JSON.stringify(al));
      }

      // 地形：169 格暖土地基 + 地形特征（树林/瓦砾/棚屋/水池/杂草）
      await page.waitForFunction(() => {
        const t = window.__night3d.terrain();
        return t.loaded || t.fallback;
      }, null, { timeout: 20000 });
      {
        const t = await page.evaluate(() => window.__night3d.terrain());
        check('A: 暖土地基 GLB 加载（169 格，非回退）', t.loaded && !t.fallback && t.tiles === 169, JSON.stringify(t));
      }
      // 地形特征在地基就位后才开始异步加载，等它们挂上
      await page.waitForFunction(() => window.__night3d.terrain().features > 20, null, { timeout: 10000 }).catch(() => {});
      {
        const t = await page.evaluate(() => window.__night3d.terrain());
        check('A: 地形特征 GLB 已铺设（grass/woods/rubble/shack/pond）', t.features > 20, JSON.stringify(t));
      }

      // 建筑：默认基地（核心 + 废墟圈）+ 4 个种子建筑全部 GLB 化
      await page.waitForFunction(() => {
        const b = window.__night3d.buildings();
        return b.total > 40 && b.glb === b.total;
      }, null, { timeout: 15000 }).catch(() => {});
      {
        const b = await page.evaluate(() => window.__night3d.buildings());
        check('A: 建筑全部 GLB 化（核心/废墟/塔/墙/陷阱/资源）',
          b.total > 40 && b.glb === b.total, JSON.stringify(b));
      }
      await page.waitForTimeout(400);

      // ===== 渲染参数验收（docs/KIMI-基地渲染参数.md §1/§2/§6）=====
      {
        const st = await page.evaluate(() => window.__night3d.style());
        check('A: 渲染参数符合规范（透明背景/ACES/exposure1.15/SRGB/阴影）',
          st.background === 'transparent' && st.aces && st.exposure === 1.15 && st.srgb && st.shadows,
          JSON.stringify(st));
      }
      {
        const cam = await page.evaluate(() => window.__night3d.camera());
        // §6 默认视角 ≈ position(-10, 8.5, -10) 看原点：az=-3π/4，el≈31°
        check('A: 默认相机为规范斜 45° 视角（az≈-135°, el≈31°）',
          Math.abs(cam.azimuth - Math.atan2(-10, -10)) < 0.02 &&
          Math.abs(cam.elevation - Math.atan2(8.5, Math.hypot(10, 10))) < 0.02,
          `az=${(cam.azimuth * 180 / Math.PI).toFixed(1)}° el=${(cam.elevation * 180 / Math.PI).toFixed(1)}°`);
      }
      {
        const f = await page.evaluate(() => window.__night3d.fit());
        check('A: 默认 zoom=1 基地四角在画面内（无溢出）', f.maxNdcX <= 1 && f.maxNdcY <= 1, JSON.stringify(f));
      }
      await page.screenshot({ path: path.join(SHOTS, 'night3d-style-default.png') });
      await page.screenshot({ path: path.join(SHOTS, 'night3d-base.png') });

      // 僵尸：波次自动刷新（1.5s 后开始出兵），GLB 升级完成
      await page.waitForFunction(() => {
        const b = window.__night3d.battle();
        return b && b.zombies >= 3;
      }, null, { timeout: 30000 });
      await page.waitForFunction(() => window.__night3d.zombies().glb >= 3, null, { timeout: 10000 }).catch(() => {});
      {
        const z = await page.evaluate(() => window.__night3d.zombies());
        check('A: 僵尸 GLB 实例已出现（warm_enemy_1）', z.total >= 3 && z.glb >= 3, JSON.stringify(z));
      }
      await page.screenshot({ path: path.join(SHOTS, 'night3d-wave.png') });
      check('A: 全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

      // ================= 相机手势：旋转 / 俯仰钳位 / 缩放 =================
      const readCam = () => page.evaluate(() => window.__night3d.camera());
      const center = await designPoint(page, 540, 960);
      const drag = async (dx, dy) => {
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(center.x + dx, center.y + dy, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(80);
      };

      // 水平拖 ~90°：方位角自由旋转
      const cam0 = await readCam();
      await drag(196, 0);
      const cam1 = await readCam();
      check('A: 拖动旋转方位角（自由 360°）',
        Math.abs(cam1.azimuth - cam0.azimuth) > 0.8 && Math.abs(cam1.azimuth - cam0.azimuth) < 2.4,
        `az ${cam0.azimuth.toFixed(2)} → ${cam1.azimuth.toFixed(2)}`);
      {
        const f = await page.evaluate(() => window.__night3d.fit());
        check('A: 旋转 ~90° 后 zoom=1 无溢出', f.maxNdcX <= 1.001 && f.maxNdcY <= 1.001, JSON.stringify(f));
      }
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, 'night3d-rotate.png') });

      // 俯仰：大幅下拉压到下限（场景不翻转），再上推顶到上限
      await drag(0, 1500);
      const camLow = await readCam();
      check('A: 俯仰钳位下限（永不低于地平线/不翻转）',
        Math.abs(camLow.elevation - camLow.minElevation) < 1e-3 && camLow.minElevation > 0,
        `el=${(camLow.elevation * 180 / Math.PI).toFixed(1)}°`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, 'night3d-tilt.png') });
      await drag(0, -2000);
      const camHigh = await readCam();
      check('A: 俯仰钳位上限（不到正顶 90°）',
        Math.abs(camHigh.elevation - camHigh.maxElevation) < 1e-3 && camHigh.maxElevation < Math.PI / 2,
        `el=${(camHigh.elevation * 180 / Math.PI).toFixed(1)}°`);

      // 缩放按钮：＋ 放大到上限并钳位；－ 缩回下限（全景可见）
      const zoomIn = page.locator('button[data-night3d-ctl="zoom-in"]');
      const zoomOut = page.locator('button[data-night3d-ctl="zoom-out"]');
      check('A: 缩放按钮已挂载（＋/－，pointer-events:auto）',
        (await zoomIn.count()) === 1 && (await zoomOut.count()) === 1);
      for (let i = 0; i < 6; i++) await zoomIn.click();
      const camZoom = await readCam();
      check('A: ＋ 按钮放大并钳位倍率上限',
        camZoom.zoom === camZoom.maxZoom && camZoom.maxZoom <= 3, `zoom=${camZoom.zoom}`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, 'night3d-zoom.png') });
      for (let i = 0; i < 10; i++) await zoomOut.click();
      const camZoomOut = await readCam();
      check('A: － 按钮缩小并钳位下限（zoom=1 全景恰好铺满）',
        camZoomOut.zoom === camZoomOut.minZoom, `zoom=${camZoomOut.zoom}`);

      // 滚轮缩放
      await page.mouse.move(center.x, center.y);
      await page.mouse.wheel(0, -400);
      const camWheel = await readCam();
      check('A: 滚轮缩放生效', camWheel.zoom > camZoomOut.zoom, `zoom=${camWheel.zoom}`);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);

      // §10.6：窄屏 400×800 不横向溢出（zoom=1，默认斜视角）
      await page.setViewportSize({ width: 400, height: 800 });
      await page.waitForTimeout(500);
      {
        const f = await page.evaluate(() => window.__night3d.fit());
        check('A: 窄屏 400×800 zoom=1 无横向溢出', f.maxNdcX <= 1.001, JSON.stringify(f));
      }
      await page.setViewportSize({ width: 540, height: 960 });
      await page.waitForTimeout(500);

      // 恢复默认视角后收尾（方位角拖回 ~0 不必要，断言只依赖钩子值）
      check('A: 相机手势全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

      // 快进战斗结束：核心 hp=1，等僵尸拆完（无塔在进攻路线上，结局 win/lost 均可）
      await page.evaluate(() => {
        const core = window.__night3d.state().base.buildings.find(b => b.cfgId === 1);
        core.hp = 1;
      });
      await page.waitForFunction(() => {
        const b = window.__night3d.battle();
        return b && (b.status === 'won' || b.status === 'lost');
      }, null, { timeout: 90000 });
      await page.waitForTimeout(400);
      const p = await designPoint(page, 540, 1040); // 结算按钮
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction(() => window.__base3d, null, { timeout: 15000 });
      check('A: 离开 Night3DScene 后 3D 画布已移除',
        await page.evaluate(() => document.querySelectorAll('canvas[data-night3d]').length) === 0);
      check('A: 离开 Night3DScene 后缩放按钮已移除',
        await page.evaluate(() => document.querySelectorAll('button[data-night3d-ctl]').length) === 0);
      check('A: Night3DRenderer.dispose 被调用（无残留循环）',
        await page.evaluate(() => (window.__night3dDestroyed || 0) >= 1 && !window.__night3d));
      check('A: 收尾无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));
      await context.close();
    }

    // ================= 上下文 B：GLB 404 → 程序化回退 =================
    {
      const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
      await context.addInitScript(() => {
        localStorage.setItem('merge_survival_td_base_3d', '1');
        localStorage.setItem('merge_survival_td_render_mode', '3d');
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e.message || e)));
      // 阻断：核心 / 墙 / 普通僵尸 三个 GLB
      for (const f of ['warm_core.glb', 'warm_building_wall.glb', 'warm_enemy_1.glb']) {
        await page.route(`**/assets/models/blender-samples/${f}**`, route => route.abort());
      }

      check('B: 开局剧情对话已全部关闭', await bootGame(page));
      await enterNight(page);

      await page.waitForFunction(() => window.__night3d.terrain().loaded, null, { timeout: 20000 });
      // 等建筑 GLB 升级完毕（除被阻断的核心/墙）
      await page.waitForFunction(() => {
        const b = window.__night3d.buildings();
        return b.total > 40 && b.glb + b.procedural === b.total && b.procedural >= 2;
      }, null, { timeout: 15000 }).catch(() => {});
      {
        const b = await page.evaluate(() => window.__night3d.buildings());
        check('B: 被阻断的核心/墙走程序化回退，其余建筑 GLB 化',
          b.procedural >= 2 && b.glb > 40, JSON.stringify(b));
      }
      await page.waitForFunction(() => {
        const b = window.__night3d.battle();
        return b && b.zombies >= 2;
      }, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      {
        const z = await page.evaluate(() => window.__night3d.zombies());
        check('B: 被阻断的 warm_enemy_1 走程序化回退（僵尸不隐形）',
          z.total >= 2 && z.procedural >= 2 && z.glb === 0, JSON.stringify(z));
      }
      await page.screenshot({ path: path.join(SHOTS, 'night3d-fallback.png') });
      check('B: 回退路径无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) {
      // shell:true 派生的 npm/npx 需要整树 kill
      if (process.platform === 'win32') spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }

  console.log(`\n===== 夜战3D暖土接入验收：${passed} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
