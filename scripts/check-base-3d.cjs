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

    // ============ 相机：一指平移 / 右键旋转 / 按钮 / 俯仰钳位 / 缩放 / 边缘滑动 ============
    const readCam = () => page.evaluate(() => window.__base3d.camera());
    const center = await designPoint(page, 540, 763); // 网格矩形中心
    const drag = async (dx, dy, button = 'left') => {
      await page.mouse.move(center.x, center.y);
      await page.mouse.down({ button });
      await page.mouse.move(center.x + dx, center.y + dy, { steps: 12 });
      await page.mouse.up({ button });
      await page.waitForTimeout(80);
    };
    const rotateDrag = (dx, dy) => drag(dx, dy, 'right');
    /** 回到默认读图视角（含平移归位），每个用例自己起跑，互不污染 */
    const resetCam = (elevationDeg = 40) => page.evaluate((deg) => {
      const o = window.__base3d.owner.orbit;
      o.resetView();
      o.elevation = deg * Math.PI / 180;
      o.apply();
    }, elevationDeg);
    const screenOf = (r, c) => page.evaluate(([rr, cc]) => window.__base3d.cellToScreen(rr, cc), [r, c]);
    /** 平移量 = 相机目标点相对归位点 (0, 0.3) 的距离（归位点 z=0.3，不是原点） */
    const panOffset = (c) => Math.hypot(c.targetX, c.targetZ - 0.3);
    const nearCell = [1, 1]; // 默认视角下的近景角格（画面下方）

    // ---- 一指拖动 = 平移地图（地图扩大后必需；方位角/俯仰不能被带走）----
    {
      await resetCam();
      await page.waitForTimeout(120);
      const p0 = await screenOf(...nearCell);
      const a0 = await readCam();
      await drag(120, 0);
      const p1 = await screenOf(...nearCell);
      const a1 = await readCam();
      check('一指拖动 → 平移地图（方位角/俯仰不动）',
        Math.abs(a1.azimuth - a0.azimuth) < 1e-6 && Math.abs(a1.elevation - a0.elevation) < 1e-6 &&
        Math.hypot(a1.targetX - a0.targetX, a1.targetZ - a0.targetZ) > 0.2,
        `az ${a0.azimuth.toFixed(3)}→${a1.azimuth.toFixed(3)} target ${a0.targetX.toFixed(2)},${a0.targetZ.toFixed(2)}→${a1.targetX.toFixed(2)},${a1.targetZ.toFixed(2)}`);
      check('一指右拖 → 近景格跟着右移（内容跟手）', p1.x - p0.x > 20,
        `x ${p0.x.toFixed(1)} → ${p1.x.toFixed(1)}`);
    }

    // ---- 右键拖动 = 旋转（桌面端；与 three.js OrbitControls 同手感）----
    {
      await resetCam();
      await page.waitForTimeout(120);
      const p0 = await screenOf(...nearCell);
      const a0 = await readCam();
      await rotateDrag(120, 100);
      const p1 = await screenOf(...nearCell);
      const a1 = await readCam();
      check('右键拖动 → 方位角减小（相机反向环绕 = 抓住场景）', a1.azimuth < a0.azimuth,
        `az ${a0.azimuth.toFixed(3)} → ${a1.azimuth.toFixed(3)}`);
      check('右键拖动 → 俯仰角增大（相机抬高 = 抓住场景）', a1.elevation > a0.elevation,
        `el ${(a0.elevation * 180 / Math.PI).toFixed(1)}° → ${(a1.elevation * 180 / Math.PI).toFixed(1)}°`);
      check('右键拖动 → 近景格跟着右移（方向未反）', p1.x - p0.x > 20,
        `x ${p0.x.toFixed(1)} → ${p1.x.toFixed(1)}`);
    }
    {
      // 旋转到任意角度都不溢出（取景数学与角度无关）
      const f = await page.evaluate(() => {
        const orbit = window.__base3d.owner.orbit;
        const z0 = orbit.zoom;
        orbit.setZoom(1);
        const probe = window.__base3d.fit();
        orbit.setZoom(z0);
        return probe;
      });
      check('旋转后 zoom=1 无溢出', f.maxNdcX <= 1.001 && f.maxNdcY <= 1.001, JSON.stringify(f));
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'base3d-rotated.png') });

    // ---- 视角按钮组：旋转 ⟲⟳ / 俯仰 ⌃⌄ / 回正 ⌂ / 缩放 ＋－ ----
    {
      const btns = await page.locator('button[data-base3d-ctl]').count();
      check('视角按钮组挂载 7 个（旋转/俯仰/回正/缩放）', btns === 7, `count=${btns}`);
      const tap = async (ctl) => {
        await page.locator(`button[data-base3d-ctl="${ctl}"]`).click();
        await page.waitForTimeout(90);
      };
      const DEG = 180 / Math.PI;

      await resetCam(52);
      const b0 = await readCam();
      await tap('rotate-right');
      const b1 = await readCam();
      check('⟳ 按钮 → 场景右转 15°（方位角 -15°）',
        Math.abs((b0.azimuth - b1.azimuth) * DEG - 15) < 0.5 && Math.abs(b1.elevation - b0.elevation) < 1e-6,
        `Δaz=${((b0.azimuth - b1.azimuth) * DEG).toFixed(2)}°`);
      await tap('rotate-left');
      const b2 = await readCam();
      check('⟲ 按钮 → 场景左转回原位（方位角 +15°）',
        Math.abs(b2.azimuth - b0.azimuth) < 1e-6,
        `az ${b0.azimuth.toFixed(3)} → ${b2.azimuth.toFixed(3)}`);

      await tap('tilt-up');
      const b3 = await readCam();
      check('⌃ 按钮 → 相机抬高 12°（更俯视）',
        Math.abs((b3.elevation - b2.elevation) * DEG - 12) < 0.5,
        `Δel=${((b3.elevation - b2.elevation) * DEG).toFixed(2)}°`);
      await tap('tilt-down');
      const b4 = await readCam();
      check('⌄ 按钮 → 相机压低 12°（回到原俯仰）',
        Math.abs(b4.elevation - b2.elevation) < 1e-6,
        `el=${(b4.elevation * DEG).toFixed(2)}°`);

      await drag(120, 0); // 先平移走
      await tap('rotate-right');
      await tap('tilt-up');
      await tap('reset');
      const b5 = await readCam();
      check('⌂ 回正 → 方位角/俯仰/缩放/平移全部复位',
        Math.abs(b5.azimuth - Math.atan2(-10, -10)) < 1e-6 &&
        Math.abs(b5.elevation - 52 * Math.PI / 180) < 1e-6 &&
        Math.abs(b5.zoom - b5.defaultZoom) < 1e-6 &&
        panOffset(b5) < 1e-6,
        JSON.stringify(b5));
      check('默认倍率 > 1（按投影顶到刚好不裁切，不是保守的 zoom=1）',
        b5.defaultZoom > 1.1 && b5.defaultZoom <= b5.maxZoom, `defaultZoom=${b5.defaultZoom}`);
    }

    // ---- 默认视角必须完整显示基地：底座四角（含建筑顶高）不越界，不能被画布 overflow:hidden 裁掉 ----
    {
      const probe = await page.evaluate(() => {
        window.__base3d.owner.orbit.resetView();
        return window.__base3d.fit(6.75, 2.6); // 6.75 = 13/2 + 底座外沿；2.6 ≈ 最高建筑顶
      });
      check('默认视角基地完整不裁切（底座四角在画面内）',
        probe.maxNdcX <= 1 && probe.maxNdcY <= 1, JSON.stringify(probe));
      const probeIn = await page.evaluate(() => window.__base3d.fit(6.5, 1.8));
      check('默认视角把基地顶到足够大（边长占用 ≥ 85%）',
        Math.max(probeIn.maxNdcX, probeIn.maxNdcY) >= 0.85, JSON.stringify(probeIn));
    }

    // ---- 3D 场景铺满整屏并在 UI 之上：放大后基地画到网格矩形之外，不再被那条看不见的框线切掉 ----
    {
      const st = await page.evaluate(() => {
        const f = window.__base3d.framing();
        const canvas = document.querySelector('canvas[data-base3d]');
        const input = document.querySelector('[data-base3d-input]');
        const root = canvas.parentElement;
        const kids = Array.from(root.children).map(el => el.tagName + (el.dataset.base3dInput ? '#input' : el.dataset.base3d ? '#canvas' : ''));
        return {
          canvas: { w: Math.round(f.canvasRect.width), h: Math.round(f.canvasRect.height) },
          input: { w: Math.round(f.inputRect.width), h: Math.round(f.inputRect.height) },
          vw: window.innerWidth, vh: window.innerHeight,
          frame: f.frame, projected: f.projected,
          kids,
          inputPointer: input ? getComputedStyle(input).pointerEvents : 'missing',
          canvasPointer: canvas ? getComputedStyle(canvas).pointerEvents : 'missing'
        };
      });
      check('3D 渲染画布铺满整屏（放大后有溢出空间）',
        st.canvas.w === st.vw && st.canvas.h === st.vh, JSON.stringify(st.canvas));
      check('渲染画布不吃事件、输入层只盖网格矩形（UI 照常可点）',
        st.canvasPointer === 'none' && st.inputPointer === 'auto' && st.input.w < st.vw,
        JSON.stringify(st));
      check('viewOffset：基地中心投影正好落在网格矩形中心',
        Math.abs(st.projected.x - st.frame.x) < 2 && Math.abs(st.projected.y - st.frame.y) < 2,
        `proj=${JSON.stringify(st.projected)} frame=${JSON.stringify(st.frame)}`);

      // 放大到底 → 基地宽到可用宽度的 2 倍（玩家要求"能放大到超过屏幕范围，至少现在的两倍"）
      const zoomInBtn = page.locator('button[data-base3d-ctl="zoom-in"]');
      for (let i = 0; i < 8; i++) await zoomInBtn.click();
      await page.waitForTimeout(300);
      const sp = await page.evaluate(() => {
        const c = window.__base3d.camera();
        const f = window.__base3d.framing();
        const game = document.querySelector('#game-container canvas').getBoundingClientRect();
        const probe = window.__base3d.fit(6.75, 2.6);
        const halfW = probe.maxNdcX * f.inputRect.width / 2;
        const halfH = probe.maxNdcY * f.inputRect.height / 2;
        return {
          zoom: +c.zoom.toFixed(3), maxZoom: +c.maxZoom.toFixed(3), defaultZoom: +c.defaultZoom.toFixed(3),
          probe: { x: +probe.maxNdcX.toFixed(3), y: +probe.maxNdcY.toFixed(3) },
          baseW: Math.round(halfW * 2), baseBottom: Math.round(f.frame.y + halfH),
          limitW: Math.round(Math.min(window.innerWidth, game.width))
        };
      });
      check('放大到底被钳位在倍率上限', Math.abs(sp.zoom - sp.maxZoom) < 1e-6 && sp.maxZoom > 1.1, JSON.stringify(sp));
      check('放大到底基地溢出网格矩形（不再被框线切掉）', sp.probe.x > 1.05, JSON.stringify(sp.probe));
      check('倍率上限 ≥ 默认倍率的 2 倍（能放到超过屏幕范围）',
        sp.maxZoom >= sp.defaultZoom * 1.9, JSON.stringify(sp));
      check('放大到底基地宽度 ≈ 可用宽度的 2 倍（允许超出屏幕）',
        sp.baseW >= sp.limitW * 1.9 && sp.baseW <= sp.limitW * 2.1, JSON.stringify(sp));
      // 放大后基地会盖住 UI（玩家要求允许超出屏幕）；DOM 视角按钮仍在最上层，不受影响
      check('放大到底基地确实超出屏幕（可盖住 UI，符合"放大超过屏幕"的要求）',
        sp.baseW > sp.limitW + 2, JSON.stringify(sp));
      // 放到 2 倍后仍能靠一指平移看全每一格：把边角格平移进画面内
      const reach = await page.evaluate(() => {
        const o = window.__base3d.owner.orbit;
        const f = window.__base3d.framing();
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const corner = { row: 12, col: 12 };
        let best = Infinity;
        let inside = false;
        for (const [dx, dy] of [[-1e6, -1e6], [1e6, -1e6], [-1e6, 1e6], [1e6, 1e6]]) {
          o.resetView();
          o.setZoom(o.zoomMax);
          o.panBy(dx, dy, vh);
          const p = window.__base3d.cellToScreen(corner.row, corner.col);
          if (p.x >= 0 && p.x <= vw && p.y >= 0 && p.y <= vh) inside = true;
          best = Math.min(best, Math.hypot(p.x - f.frame.x, p.y - f.frame.y));
        }
        o.resetView();
        return { best: Math.round(best), inside, panLimit: +o.panLimit.toFixed(2) };
      });
      check('放大到顶时一指平移能把边角格拉进画面（不缺视角）', reach.inside === true, JSON.stringify(reach));
      await page.screenshot({ path: path.join(SHOTS, 'base3d-zoom-spill.png') });
      await page.locator('button[data-base3d-ctl="reset"]').click();
      await page.waitForTimeout(200);

      // 视角按钮仍锚在网格矩形右下角（不能跑到屏幕角落压住卡片栏/菜单）
      const btn = await page.evaluate(() => {
        const g = document.querySelector('button[data-base3d-ctl="zoom-in"]').parentElement.getBoundingClientRect();
        const f = window.__base3d.framing();
        return { gx: g.right, gy: g.bottom, frameRight: f.frame.x + f.inputRect.width / 2, frameBottom: f.frame.y + f.inputRect.height / 2 };
      });
      check('视角按钮锚在网格矩形右下角（不压卡片栏）',
        Math.abs(btn.gx - (btn.frameRight - 8)) < 3 && Math.abs(btn.gy - (btn.frameBottom - 8)) < 3,
        JSON.stringify(btn));
    }

    // ---- 拖棋子到画布边缘 → 地图自动平移（地图扩大后把棋子搬到屏幕外格子的唯一办法）----
    {
      await resetCam(75);
      await page.evaluate(() => window.__base3d.owner.orbit.setZoom(1));
      await page.waitForTimeout(200);
      const src = await page.evaluate(() => {
        const s = window.__base3d.state;
        for (let r = 0; r < s.grid.rowNum; r++) {
          for (let c = 0; c < s.grid.colNum; c++) {
            const it = window.__base3d.getItemAt(r, c);
            if (it && it.st !== 2) return { row: r, col: c }; // 2=纸箱不可拖；蜘蛛网可拖
          }
        }
        return null;
      });
      check('找到可拖棋子（边缘滑动用例）', !!src, JSON.stringify(src));
      if (src) {
        const p = await screenOf(src.row, src.col);
        const t0 = await readCam();
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + 40, p.y, { steps: 5 }); // 先起拖
        const rect = await page.evaluate(() => {
          const c = document.querySelector('canvas[data-base3d]').getBoundingClientRect();
          return { right: c.right, top: c.top, height: c.height };
        });
        await page.mouse.move(rect.right - 5, p.y, { steps: 10 }); // 贴右边缘停住
        await page.waitForTimeout(700);
        const t1 = await readCam();
        await page.mouse.up();
        await page.waitForTimeout(200);
        check('拖棋子贴边停住 → 地图自动平移',
          Math.hypot(t1.targetX - t0.targetX, t1.targetZ - t0.targetZ) > 0.3,
          `target ${t0.targetX.toFixed(2)},${t0.targetZ.toFixed(2)} → ${t1.targetX.toFixed(2)},${t1.targetZ.toFixed(2)}`);
        check('边缘滑动期间不改方位角/俯仰',
          Math.abs(t1.azimuth - t0.azimuth) < 1e-6 && Math.abs(t1.elevation - t0.elevation) < 1e-6,
          `az ${t1.azimuth.toFixed(3)} el ${t1.elevation.toFixed(3)}`);
        check('边缘滑动不超出平移范围', panOffset(t1) <= t1.panLimit + 1e-6,
          `offset=${panOffset(t1).toFixed(3)} limit=${t1.panLimit.toFixed(3)}`);
      }
    }

    // ---- 俯仰钳位（右键拖动，永不触地/翻转）----
    await resetCam(52);
    await rotateDrag(0, 1500);
    const camHigh = await readCam();
    check('下拖到底 → 俯仰钳位上限（75°，不到正顶）',
      Math.abs(camHigh.elevation - camHigh.maxElevation) < 1e-3 && camHigh.maxElevation < Math.PI / 2,
      `el=${(camHigh.elevation * 180 / Math.PI).toFixed(1)}°`);
    await rotateDrag(0, -2000);
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
    check('放大后可平移范围随之变大（能推到角落）',
      camZoom.panLimit > 1.001, `limit=${camZoom.panLimit.toFixed(2)}`);
    for (let i = 0; i < 10; i++) await zoomOut.click();
    const camZoomOut = await readCam();
    check('－ 按钮缩小并钳位下限', camZoomOut.zoom === camZoomOut.minZoom, `zoom=${camZoomOut.zoom}`);
    check('缩放下限能缩到看见城市外的战争迷雾（< 0.5，城市约 1/3 屏）',
      camZoomOut.minZoom > 0.2 && camZoomOut.minZoom < 0.5 && camZoomOut.zoom < 0.5,
      `min=${camZoomOut.minZoom} zoom=${camZoomOut.zoom}`);
    check('缩到最小时平移范围收回到取景余量（城市不会被推出画面）',
      Math.abs(camZoomOut.panLimit - 1) < 1e-6, `limit=${camZoomOut.panLimit}`);

    // ---- 世界层：64×64 世界、城市 13×13 居中、城市外是战争迷雾 ----
    const world = await page.evaluate(() => window.__base3d.world());
    console.log('world:', JSON.stringify(world));
    check('世界尺寸 64×64，城市 13×13 居中（原点格 25）',
      world.size === 64 && world.cityOrigin === 25, JSON.stringify(world));
    check('迷雾贴图：城市内透明、城市外近不透明',
      world.fogCityAlpha !== null && world.fogCityAlpha < 0.05 &&
      world.fogOutsideAlpha !== null && world.fogOutsideAlpha > 0.85, JSON.stringify(world));
    check('缩到最小时迷雾显形（fogOpacity > 0.5）', world.fogOpacity > 0.5, JSON.stringify(world));
    // 缩到最小时城市变小、迷雾占据画面（截图留证）
    await page.screenshot({ path: path.join(SHOTS, 'base3d-fog-world.png') });
    await page.locator('button[data-base3d-ctl="reset"]').click();
    await page.waitForTimeout(300);
    const worldHome = await page.evaluate(() => window.__base3d.world());
    check('正常读图视角（回正后）迷雾完全隐藏（不压暗 HUD/卡片栏）',
      worldHome.fogOpacity === 0, JSON.stringify(worldHome));

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
      const f = await page.evaluate(() => {
        const o = window.__base3d.owner.orbit;
        o.resetView();
        o.setZoom(1);
        return window.__base3d.fit();
      });
      check('窄屏 400×800 zoom=1 无横向溢出', f.maxNdcX <= 1.001, JSON.stringify(f));
    }
    await page.setViewportSize({ width: 540, height: 960 });
    await page.waitForTimeout(500);
    check('相机手势全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

    // 画布必须居中：Phaser 的 autoCenter 与 #game-container 的 flex 居中叠加会「双居中」，
    // 非 9:16 窗口下画布会整体偏离中心（1280×800 曾偏出 622px 深色空边，看着像被遮罩挡住）。
    for (const vp of [{ width: 620, height: 719 }, { width: 412, height: 915 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(450);
      const bands = await page.evaluate(() => {
        const c = document.querySelector('#game-container canvas').getBoundingClientRect();
        return {
          left: +c.left.toFixed(1), right: +(window.innerWidth - c.right).toFixed(1),
          top: +c.top.toFixed(1), bottom: +(window.innerHeight - c.bottom).toFixed(1)
        };
      });
      check(`画布居中：${vp.width}×${vp.height} 四边留边对称（无双居中偏移）`,
        Math.abs(bands.left - bands.right) < 2 && Math.abs(bands.top - bands.bottom) < 2,
        JSON.stringify(bands));
    }
    await page.setViewportSize({ width: 540, height: 960 });
    await page.waitForTimeout(450);

    // 点格用例不依赖残留相机姿态：回到「俯瞰全景」可读视角（近顶视 + zoom=1 恰好铺满 + 平移归位，
    // 投影落点不被前景建筑遮挡），否则残留的低俯角会让 cellToScreen 落点压到别的格上。
    await page.evaluate(() => {
      const o = window.__base3d.owner.orbit;
      o.resetView();
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
      check('restart 后视角按钮唯一一组（旧按钮已移除）',
        await page.evaluate(() => document.querySelectorAll('button[data-base3d-ctl]').length) === 7);
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
