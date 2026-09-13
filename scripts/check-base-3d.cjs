/**
 * 白天基地 3D 暖土 GLB 接入验收（BaseScene 网格区域，对应 docs/KIMI-暖土资源交付清单.md）
 *
 * 自包含：自动启动 webpack-dev-server（dev mode，__DEV_FEATURES__=true 使调试钩子生效），
 * Playwright 无头浏览器验收后关闭服务器。若 8080 已有服务在跑则直接复用。
 *
 * 用法：node scripts/check-base-3d.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 路径：BootScene 直进 BaseScene（localStorage base_3d=1 → __base3d 钩子；GameScene 已删除，
 *   BaseScene 是唯一主场景，合成棋盘与建造栏同屏）。
 *
 * 验收点：169 格地基/地形特征/建筑全 GLB、相机旋转/俯仰钳位/缩放钳位/窄屏取景、
 * 摆放绿格提示与真实放置、点种子塔格走真 handleCellTap 弹建筑详情、场景 restart 后 dispose 无残留。
 * 截图：base3d-default.png / base3d-rotated.png / base3d-placing.png。
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
    s.resources.coin = 99999; // 摆放测试用
    s.unlockedBuildings.push(101); // 箭塔蓝图解锁（正常流程走合成链，测试直接解锁）
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

/** 放种子建筑（塔/资源/墙/陷阱各一）并同步 3D 层（boot 后已在 BaseScene，无需菜单跳转） */
async function enterBase(page) {
  await page.evaluate(() => {
    const b = window.__base3d.state.base.buildings;
    b.push({ cfgId: 101, level: 1, hp: 400, maxHp: 400, row: 3, col: 3 }); // 箭塔
    b.push({ cfgId: 202, level: 1, hp: 150, maxHp: 150, row: 9, col: 9 }); // 资源
    b.push({ cfgId: 401, level: 1, hp: 300, maxHp: 300, row: 9, col: 3 }); // 墙
    b.push({ cfgId: 301, level: 1, hp: 50, maxHp: 50, row: 3, col: 9 });   // 陷阱
    window.__base3d.owner.syncAll();
  });
  await page.waitForTimeout(600);
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
    const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
    await context.addInitScript(() => {
      localStorage.setItem('merge_survival_td_base_3d', '1');
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.message || e)));

    check('开局剧情对话已全部关闭', await bootGame(page));
    await enterBase(page);
    check('基地 3D 渲染器激活（__base3d 钩子存在）',
      await page.evaluate(() => !!window.__base3d));
    check('基地 3D 画布存在且只有一张',
      await page.evaluate(() => document.querySelectorAll('canvas[data-base3d]').length) === 1);

    // 地形：169 格暖土地基 + 地形特征
    await page.waitForFunction(() => {
      const t = window.__base3d.terrain();
      return t.loaded || t.fallback;
    }, null, { timeout: 20000 });
    {
      const t = await page.evaluate(() => window.__base3d.terrain());
      check('暖土地基 GLB 加载（169 格，非回退）', t.loaded && !t.fallback && t.tiles === 169, JSON.stringify(t));
    }
    await page.waitForFunction(() => window.__base3d.terrain().features > 20, null, { timeout: 10000 }).catch(() => {});
    {
      const t = await page.evaluate(() => window.__base3d.terrain());
      check('地形特征 GLB 已铺设（grass/woods/rubble/shack/pond）', t.features > 20, JSON.stringify(t));
    }

    // 建筑：默认基地（核心 + 废墟圈）+ 4 个种子建筑全部 GLB 化
    await page.waitForFunction(() => {
      const b = window.__base3d.buildings();
      return b.total > 40 && b.glb === b.total;
    }, null, { timeout: 15000 }).catch(() => {});
    {
      const b = await page.evaluate(() => window.__base3d.buildings());
      check('建筑全部 GLB 化（核心/废墟/塔/墙/陷阱/资源）',
        b.total > 40 && b.glb === b.total, JSON.stringify(b));
    }
    {
      // fit() 的数学保证是针对 zoom=1「全景恰好铺满」；默认视图已放大到 ORBIT_DEFAULT_ZOOM，先压回 1 再探针
      const f = await page.evaluate(() => {
        const orbit = window.__base3d.owner.orbit;
        const z0 = orbit.zoom;
        orbit.setZoom(1);
        const probe = window.__base3d.fit();
        orbit.setZoom(z0);
        return probe;
      });
      check('zoom=1 基地四角在画面内（无溢出）', f.maxNdcX <= 1.001 && f.maxNdcY <= 1.001, JSON.stringify(f));
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'base3d-default.png') });
    check('初始化阶段无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

    // ================= 相机手势：旋转 / 俯仰钳位 / 缩放 =================
    const readCam = () => page.evaluate(() => window.__base3d.camera());
    const center = await designPoint(page, 540, 763); // 网格矩形中心
    const drag = async (dx, dy) => {
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + dx, center.y + dy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    };

    const cam0 = await readCam();
    await drag(196, 0);
    const cam1 = await readCam();
    check('拖动旋转方位角（自由 360°）',
      Math.abs(cam1.azimuth - cam0.azimuth) > 0.8 && Math.abs(cam1.azimuth - cam0.azimuth) < 2.4,
      `az ${cam0.azimuth.toFixed(2)} → ${cam1.azimuth.toFixed(2)}`);
    {
      const f = await page.evaluate(() => {
        const orbit = window.__base3d.owner.orbit;
        const z0 = orbit.zoom;
        orbit.setZoom(1);
        const probe = window.__base3d.fit();
        orbit.setZoom(z0);
        return probe;
      });
      check('旋转 ~90° 后 zoom=1 无溢出', f.maxNdcX <= 1.001 && f.maxNdcY <= 1.001, JSON.stringify(f));
    }

    // ============ 拖拽方向（玩家反馈"旋转是反的"回归）：拖拽方向 == 场景移动方向 ============
    {
      const resetCam = () => page.evaluate(() => {
        const o = window.__base3d.owner.orbit;
        o.azimuth = Math.atan2(-10, -10);
        o.elevation = 40 * Math.PI / 180;
        o.apply();
      });
      const nearCell = [1, 1]; // 默认视角下的近景角格（画面下方）
      const screenOf = () => page.evaluate(
        ([r, c]) => window.__base3d.cellToScreen(r, c), nearCell);

      await resetCam();
      await page.waitForTimeout(120);
      const p0 = await screenOf();
      const a0 = await readCam();
      await drag(120, 0);
      const p1 = await screenOf();
      const a1 = await readCam();
      check('右拖 → 方位角减小（相机反向环绕 = 抓住场景）', a1.azimuth < a0.azimuth,
        `az ${a0.azimuth.toFixed(3)} → ${a1.azimuth.toFixed(3)}`);
      check('右拖 → 近景格跟着右移（方向未反）', p1.x - p0.x > 20,
        `x ${p0.x.toFixed(1)} → ${p1.x.toFixed(1)}`);

      await resetCam();
      await page.waitForTimeout(120);
      const q0 = await screenOf();
      const e0 = await readCam();
      await drag(0, 100);
      const q1 = await screenOf();
      const e1 = await readCam();
      check('下拖 → 俯仰角增大（相机抬高 = 抓住场景）', e1.elevation > e0.elevation,
        `el ${(e0.elevation * 180 / Math.PI).toFixed(1)}° → ${(e1.elevation * 180 / Math.PI).toFixed(1)}°`);
      check('下拖 → 近景格跟着下移（方向未反）', q1.y - q0.y > 20,
        `y ${q0.y.toFixed(1)} → ${q1.y.toFixed(1)}`);
    }

    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'base3d-rotated.png') });

    // 下拖 = 把场景往下拽 → 相机抬高、更俯视，钳位上限 75°（不到正顶、不翻转）
    await drag(0, 1500);
    const camHigh = await readCam();
    check('下拖到底 → 俯仰钳位上限（75°，不到正顶）',
      Math.abs(camHigh.elevation - camHigh.maxElevation) < 1e-3 && camHigh.maxElevation < Math.PI / 2,
      `el=${(camHigh.elevation * 180 / Math.PI).toFixed(1)}°`);
    // 上推 = 把场景往上推 → 相机压低，钳位下限 25°（永不触地/翻转）
    await drag(0, -2000);
    const camLow = await readCam();
    check('上推到底 → 俯仰钳位下限（25°，不翻转）',
      Math.abs(camLow.elevation - camLow.minElevation) < 1e-3 && camLow.minElevation > 0,
      `el=${(camLow.elevation * 180 / Math.PI).toFixed(1)}°`);

    const zoomIn = page.locator('button[data-base3d-ctl="zoom-in"]');
    const zoomOut = page.locator('button[data-base3d-ctl="zoom-out"]');
    check('缩放按钮已挂载（＋/－）', (await zoomIn.count()) === 1 && (await zoomOut.count()) === 1);
    for (let i = 0; i < 6; i++) await zoomIn.click();
    const camZoom = await readCam();
    check('＋ 按钮放大并钳位倍率上限', camZoom.zoom === camZoom.maxZoom && camZoom.maxZoom <= 3, `zoom=${camZoom.zoom}`);
    for (let i = 0; i < 10; i++) await zoomOut.click();
    const camZoomOut = await readCam();
    check('－ 按钮缩小并钳位下限（zoom=1 全景恰好铺满）', camZoomOut.zoom === camZoomOut.minZoom, `zoom=${camZoomOut.zoom}`);

    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -400);
    const camWheel = await readCam();
    check('滚轮缩放生效', camWheel.zoom > camZoomOut.zoom, `zoom=${camWheel.zoom}`);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);

    // 窄屏 400×800 不横向溢出
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForTimeout(500);
    {
      const f = await page.evaluate(() => window.__base3d.fit());
      check('窄屏 400×800 zoom=1 无横向溢出', f.maxNdcX <= 1.001, JSON.stringify(f));
    }
    await page.setViewportSize({ width: 540, height: 960 });
    await page.waitForTimeout(500);
    check('相机手势全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

    // 点格用例不依赖残留相机姿态：回到「俯瞰全景」可读视角（近顶视 + zoom=1 恰好铺满，
    // 投影落点不被前景建筑遮挡），否则残留的低俯角会让 cellToScreen 落点压到别的格上。
    await page.evaluate(() => {
      const o = window.__base3d.owner.orbit;
      o.azimuth = Math.atan2(-10, -10);
      o.elevation = 75 * Math.PI / 180;
      o.setZoom(1);
    });
    await page.waitForTimeout(300);

    // ================= 摆放模式：绿格提示 + 真实放置 =================
    {
      const card = await designPoint(page, 275, 1618); // 建造栏首页第一张塔卡
      await page.mouse.click(card.x, card.y);
      await page.waitForTimeout(400);
      const hints = await page.evaluate(() => window.__base3d.placementHints());
      check('点建造栏塔卡后合法格绿框提示出现', hints > 0, `hints=${hints}`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, 'base3d-placing.png') });

      const before = await page.evaluate(() => window.__base3d.buildings().total);
      // 找一个合法空格，用 3D 画布轻点放置（走真 handleCellTap → baseSystem.place）
      const target = await page.evaluate(() => {
        const host = window.__base3d.owner; // Base3DRenderer 实例（dev 钩子）
        for (let r = 0; r < 13; r++) {
          for (let c = 0; c < 13; c++) {
            // host.host 是 BaseScene 注入的 IBase3DHost
            if (host.host.canPlaceAt(r, c)) {
              const p = window.__base3d.cellToScreen(r, c);
              return { row: r, col: c, x: p.x, y: p.y };
            }
          }
        }
        return null;
      });
      check('找到可放置的合法空格', !!target, JSON.stringify(target));
      if (target) {
        await page.mouse.click(target.x, target.y);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => window.__base3d.buildings().total);
        check('轻点合法格真实放置建筑（total +1）', after === before + 1, `${before} → ${after}`);
        const hintsAfter = await page.evaluate(() => window.__base3d.placementHints());
        check('放置成功后退出了摆放模式（绿框清除）', hintsAfter === 0, `hints=${hintsAfter}`);
      }
    }

    // ================= 格子点击：点种子塔 → 建筑详情弹窗 =================
    {
      const p = await page.evaluate(() => window.__base3d.cellToScreen(3, 3)); // 种子箭塔
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(500);
      check('轻点种子塔格打开建筑详情弹窗（走真 handleCellTap）',
        await page.evaluate(() => window.__base3d.dialogOpen()));
      check('弹窗打开时 3D 画布隐藏让位',
        await page.evaluate(() => {
          const c = document.querySelector('canvas[data-base3d]');
          const root = c && c.parentElement;
          return !!root && getComputedStyle(root).visibility === 'hidden';
        }));
      // 关弹窗（调 BaseScene.closeDialog，运行时私有方法可直接触达）
      await page.evaluate(() => window.__base3d.owner.scene.closeDialog());
      await page.waitForTimeout(400);
      check('弹窗关闭后 3D 画布恢复可见',
        await page.evaluate(() => {
          const c = document.querySelector('canvas[data-base3d]');
          return !!c && getComputedStyle(c.parentElement).visibility !== 'hidden';
        }));
    }

    // ================= 场景 restart：dispose 无残留 =================
    {
      // GameScene 已删除，BaseScene 是唯一主场景；离开/返回等价于存档后 restart
      await page.evaluate(() => window.__base3d.owner.scene.save());
      const destroyedBefore = await page.evaluate(() => window.__base3dDestroyed || 0);
      // 打旧渲染器标记，避免 waitForFunction 拿到 restart 前的旧钩子
      await page.evaluate(() => { window.__base3d.__oldRenderer = true; });
      await page.evaluate(() => window.__base3d.owner.scene.scene.restart());
      await page.waitForFunction(() => window.__base3d && !window.__base3d.__oldRenderer, null, { timeout: 15000 });
      await page.waitForTimeout(600);
      check('restart 后基地 3D 画布唯一（旧画布已移除）',
        await page.evaluate(() => document.querySelectorAll('canvas[data-base3d]').length) === 1);
      check('restart 后缩放按钮唯一一对（旧按钮已移除）',
        await page.evaluate(() => document.querySelectorAll('button[data-base3d-ctl]').length) === 2);
      check('restart 销毁旧渲染器（dispose 计数 +1，无残留循环）',
        await page.evaluate((n) => (window.__base3dDestroyed || 0) === n + 1, destroyedBefore));
    }
    check('全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));
    await context.close();
  } finally {
    await browser.close();
    if (server) {
      // shell:true 派生的 npm/npx 需要整树 kill
      if (process.platform === 'win32') spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }

  console.log(`\n===== 基地3D暖土接入验收：${passed} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
