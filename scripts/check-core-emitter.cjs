/**
 * 基地核心（= 合成核心 = 发射器）端到端验收
 *
 * 自包含：8080 已有 dev server 则复用，否则自动启动（dev mode，__DEV_FEATURES__=true 才有调试钩子）。
 * Playwright 无头浏览器验收后关闭服务器。
 * 用法：node scripts/check-core-emitter.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 验收点：
 *   - 3D 网格：长按核心格开核心面板（不误触发射）；单击选中 → 再点发射（库存 -1、棋盘 +1 件）
 *   - 2D 网格：同上两条输入链路（长按判定与 3D 同一套 480ms 真实计时）
 *   - 核心面板：升级链路（消耗 60024/60025 当量 → Lv+1、产出池变大）
 *   - 冷却中渲染网格 + 信息卡不报错
 * 截图：screenshots/core-panel-3d.png / core-panel-2d.png / core-card-cooling.png
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
const CORE_ROW = 6;
const CORE_COL = 6;
/** 长按判定 480ms；无头环境定时器可能被钳制，按住时间给足余量 */
const HOLD_MS = 1400;

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
}

function httpOk(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 400); });
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

/** 启动游戏、清档、跳过开局剧情；返回该模式下取场景的表达式 */
async function boot(page, mode) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((m) => {
    localStorage.setItem('merge_survival_td_base_3d', m);
    localStorage.removeItem('merge_survival_td_state');
  }, mode);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const expr = mode === '1' ? 'window.__base3d && window.__base3d.owner.scene' : 'window.__basescene';
  await page.waitForFunction(e => !!eval(e), expr, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.evaluate((e) => {
    const s = eval(e).state;
    s.storySeen = Array.from({ length: 140 }, (_, i) => i + 1);
    s.storyRewardClaims = Array.from({ length: 140 }, (_, i) => i + 1);
    s.handIndex = 9999;
  }, expr);
  for (let i = 0; i < 40; i++) {
    const open = await page.evaluate(e => eval(e).storyDialog.isOpen, expr);
    if (!open) break;
    await page.mouse.click(270, 480);
    await page.waitForTimeout(250);
  }
  return expr;
}

/** 核心格中心屏幕坐标：3D 用渲染器 pickCell 反查质心（画布只覆盖网格矩形）；2D 用 cellXY + 全屏画布映射 */
async function cellPoint(page, expr, row, col) {
  return page.evaluate(([e, r, c]) => {
    const scene = eval(e);
    const p = scene.cellXY(r, c);
    const canvas3d = document.querySelector('canvas[data-base3d]');
    if (canvas3d) {
      const owner = window.__base3d.owner;
      const rect = canvas3d.getBoundingClientRect();
      let sx = 0, sy = 0, n = 0;
      for (let dy = 2; dy < rect.height; dy += 3) {
        for (let dx = 2; dx < rect.width; dx += 3) {
          const x = rect.left + dx, y = rect.top + dy;
          const hit = owner.pickCell({ clientX: x, clientY: y });
          if (hit && hit.row === r && hit.col === c) { sx += x; sy += y; n++; }
        }
      }
      if (n > 0) return { x: sx / n, y: sy / n };
    }
    const canvas = document.querySelector('#game-container canvas').getBoundingClientRect();
    return { x: canvas.left + p.x / 1080 * canvas.width, y: canvas.top + p.y / 1920 * canvas.height };
  }, [expr, row, col]);
}

const state = (page, expr) => page.evaluate(e => {
  const scene = eval(e);
  const core = scene.state.base.buildings.find(b => b.cfgId === 1);
  return {
    selected: scene.selectedItem,
    panel: scene.coreIntroPanel.isOpen,
    times: core.times,
    level: core.level,
    items: scene.state.grid.cells.flat().filter(c => c.item).length
  };
}, expr);

/** 长按：按下 → 按住 HOLD_MS → 抬手；返回按住 300ms 时「长按计时是否已启动」 */
async function longPress(page, pt, mode) {
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const armed = await page.evaluate((m) => {
    if (m === '1') {
      const o = window.__base3d.owner;
      return { timer: o.holdTimer !== null, fired: o.holdFired };
    }
    const s = window.__basescene;
    return { timer: s.coreHoldTimer !== null, fired: s.coreHoldFired };
  }, mode);
  await page.waitForTimeout(HOLD_MS - 300);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return armed;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  let server = null;
  if (await httpOk(BASE)) {
    console.log(`复用已运行的 ${BASE}`);
  } else {
    console.log('启动 webpack-dev-server（dev mode，首次编译约 1 分钟）…');
    server = spawn('npx', ['webpack', 'serve', '--mode', 'development', '--no-open', '--port', String(PORT)], {
      cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', d => process.stderr.write(`[dev] ${d}`));
    if (!(await waitServer(BASE, 240000))) throw new Error('webpack-dev-server 启动超时');
    console.log('dev server 就绪');
  }

  const errors = [];
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
    const page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e)));

    // ---- 3D：长按开面板（不发射） ----
    let expr = await boot(page, '1');
    check('3D 启动：BaseScene + 基地核心 1 级库存 6', await page.evaluate(() =>
      window.__base3d.owner.scene.scene.key === 'BaseScene'
      && window.__base3d.state.base.buildings.some(b => b.cfgId === 1 && b.level === 1 && b.times === 6)));
    check('3D 开局棋盘无核心道具（60026~60031 已退休）', await page.evaluate(() =>
      window.__base3d.state.grid.cells.flat().every(c => !c.item || c.item.id < 60026 || c.item.id > 60031)));
    let pt = await cellPoint(page, expr, CORE_ROW, CORE_COL);
    let armed = await longPress(page, pt, '1');
    let s = await state(page, expr);
    check('3D 长按计时已启动（按住 300ms 时）', armed.timer === true || armed.fired === true, JSON.stringify(armed));
    check('3D 长按核心格 → 打开核心面板', s.panel === true, JSON.stringify(s));
    check('3D 长按不误触发射（库存仍 6）', s.times === 6, JSON.stringify(s));
    await page.screenshot({ path: path.join(SHOTS, 'core-panel-3d.png') });

    // ---- 3D：单击选中 → 再点发射 ----
    expr = await boot(page, '1');
    pt = await cellPoint(page, expr, CORE_ROW, CORE_COL);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
    const s1 = await state(page, expr);
    check('3D 单击核心 = 选中（未发射）',
      !!s1.selected && s1.selected.row === CORE_ROW && s1.selected.col === CORE_COL && s1.times === 6, JSON.stringify(s1));
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(600);
    const s2 = await state(page, expr);
    check('3D 再次点击核心 = 发射（库存 6→5）', s2.times === 5, JSON.stringify(s2));
    check('3D 核心产出入棋盘（物品 +1）', s2.items === s1.items + 1, JSON.stringify(s2));

    // ---- 核心面板：升级链路 + 冷却渲染 ----
    const upgraded = await page.evaluate(() => {
      const scene = window.__base3d.owner.scene;
      scene.coreIntroPanel.close();
      const st = window.__base3d.state;
      let placed = 0;
      for (let r = 0; r < 13 && placed < 4; r++) {
        for (let c = 0; c < 13 && placed < 4; c++) {
          const cell = st.grid.cells[r][c];
          if (!cell.item && (r !== 6 || c !== 6)) { cell.item = { id: 60025 }; placed++; }
        }
      }
      const ok = scene.coreSystem.upgrade(st);
      const core = st.base.buildings.find(b => b.cfgId === 1);
      return { ok, level: core.level, pool: scene.coreSystem.products(st).length };
    });
    check('核心面板升级链路可用（Lv1→Lv2，产出池变大）',
      upgraded.ok && upgraded.level === 2 && upgraded.pool > 4, JSON.stringify(upgraded));
    await page.evaluate(() => {
      const scene = window.__base3d.owner.scene;
      const core = window.__base3d.state.base.buildings.find(b => b.cfgId === 1);
      core.times = 0;
      core.cd = Date.now() + 600000;
      core.cdSum = 600000;
      scene.renderGrid();
      scene.setItemSelection({ row: core.row, col: core.col });
    });
    await page.waitForTimeout(400);
    check('冷却中渲染网格 + 信息卡不报错', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: path.join(SHOTS, 'core-card-cooling.png') });

    // ---- 2D：单击选中 → 再点发射 ----
    expr = await boot(page, '0');
    check('2D 启动：网格模式（renderer3d 为空）', await page.evaluate(() => window.__basescene.renderer3d === null));
    pt = await cellPoint(page, expr, CORE_ROW, CORE_COL);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
    const t1 = await state(page, expr);
    check('2D 单击核心 = 选中（未发射）',
      !!t1.selected && t1.selected.row === CORE_ROW && t1.selected.col === CORE_COL && t1.times === 6, JSON.stringify(t1));
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(600);
    const t2 = await state(page, expr);
    check('2D 再次点击核心 = 发射（库存 6→5）', t2.times === 5, JSON.stringify(t2));

    // ---- 2D：长按开面板 ----
    expr = await boot(page, '0');
    pt = await cellPoint(page, expr, CORE_ROW, CORE_COL);
    armed = await longPress(page, pt, '0');
    const t3 = await state(page, expr);
    check('2D 长按计时已启动（按住 300ms 时）', armed.timer === true || armed.fired === true, JSON.stringify(armed));
    check('2D 长按核心格 → 打开核心面板', t3.panel === true, JSON.stringify(t3));
    check('2D 长按不误触发射（库存仍 6）', t3.times === 6, JSON.stringify(t3));
    await page.screenshot({ path: path.join(SHOTS, 'core-panel-2d.png') });
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n===== 基地核心 e2e：${passed} 通过，${failed} 失败 =====`);
  if (errors.length) console.log('页面错误：\n' + errors.join('\n'));
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
