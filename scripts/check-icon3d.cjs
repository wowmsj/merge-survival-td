/**
 * 物品 3D 快照图标验收（src/three/ModelIconRenderer.ts + TaskBar/InfoBar 接入）
 *
 * 自包含：自动启动/复用 8080 dev-server（dev mode，__icon3d 调试计数生效），
 * Playwright 无头验收。用法：node scripts/check-icon3d.cjs
 *
 * 两个上下文：
 *   A 正常：任务栏至少一个图标升级为 3D 快照（icon3d_ 纹理）；点开棋盘上
 *     非任务物品的物品详情（InfoBar），其大图标升级为 3D 快照。
 *     截图 icon3d-taskbar.png / icon3d-detail.png。
 *   B 回退：abort 所有 voxel_32_*.glb 请求 → 记住失败、UI 保持 2D 图标、无异常。
 *
 * 渲染模式说明：e2e 固定开基地 3D（需要 __base3d 钩子读 state/点格子；GameScene
 * 已删除，BaseScene 是唯一主场景）。图标渲染器与棋盘渲染模式无关（走同一 applyModelIcon 路径）。
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

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  let server = null;
  if (await httpOk(BASE)) {
    console.log(`复用已运行的 ${BASE}`);
  } else {
    console.log('启动 webpack-dev-server（dev mode，首次编译约 1 分钟）...');
    server = spawn('npx', ['webpack', 'serve', '--mode', 'development', '--no-open', '--port', String(PORT)], {
      cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', d => process.stderr.write(`[dev] ${d}`));
    if (!(await waitServer(BASE, 240000))) throw new Error('webpack-dev-server 启动超时');
    console.log('dev server 就绪');
  }

  const browser = await chromium.launch();
  try {
    // ================= 上下文 A：正常 3D 快照图标 =================
    {
      const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
      await context.addInitScript(() => {
        localStorage.setItem('merge_survival_td_base_3d', '1');
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e.message || e)));

      check('A: 开局剧情对话已全部关闭', await bootGame(page));
      check('A: 任务栏有任务（__base3d.state.tasks 非空）',
        await page.evaluate(() => (window.__base3d.state.tasks || []).length > 0));

      // 任务栏：至少一个所需材料图标升级为 3D 快照
      const needs = await page.evaluate(() =>
        (window.__base3d.state.tasks || []).flatMap(t => (t.propArr || []).map(p => p.id)));
      await page.waitForFunction(() =>
        window.__icon3d && window.__icon3d.applied.length > 0, null, { timeout: 20000 }).catch(() => {});
      {
        const st = await page.evaluate(() => window.__icon3d
          ? { applied: window.__icon3d.applied, rendered: window.__icon3d.rendered, failed: window.__icon3d.failed }
          : null);
        check('A: 任务栏至少一个图标升级为 3D 快照',
          !!st && st.applied.some(id => needs.includes(id)),
          `applied=${JSON.stringify(st && st.applied)} needs=${JSON.stringify(needs)}`);
      }
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'icon3d-taskbar.png') });

      // 物品详情（InfoBar）：点一个无状态（非纸箱/蛛网）、非任务需求且确有 GLB 模型的物品
      const cell = await page.evaluate((needIds) => {
        const g = window.__base3d.state.grid;
        for (let r = 0; r < g.rowNum; r++) {
          for (let c = 0; c < g.colNum; c++) {
            const it = window.__base3d.getItemAt(r, c);
            if (it && !it.st && !needIds.includes(it.id)) {
              return { row: r, col: c, id: it.id };
            }
          }
        }
        return null;
      }, needs);
      check('A: 棋盘上找到可选中的非任务物品用于详情验收', !!cell);
      if (cell) {
        const pt = await page.evaluate(({ row, col }) => window.__base3d.cellScreen(row, col), cell);
        await page.mouse.click(pt.x, pt.y);
        await page.waitForFunction(
          id => window.__icon3d && window.__icon3d.applied.includes(id),
          cell.id, { timeout: 15000 }).catch(() => {});
        const applied = await page.evaluate(() => window.__icon3d ? window.__icon3d.applied : []);
        check('A: 物品详情图标升级为 3D 快照', applied.includes(cell.id),
          `id=${cell.id} applied=${JSON.stringify(applied)}`);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS, 'icon3d-detail.png') });
      }
      check('A: 全程无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));
      await context.close();
    }

    // ================= 上下文 B：两级模型全部 404 → 保持 2D 图标 =================
    {
      const context = await browser.newContext({ viewport: { width: 540, height: 960 } });
      await context.addInitScript(() => {
        localStorage.setItem('merge_survival_td_base_3d', '1');
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e.message || e)));
      await page.route('**/assets/models/blender-samples/voxel_32_*.glb**', route => route.abort());
      await page.route('**/assets/models/props/prop_*.glb**', route => route.abort());

      check('B: 开局剧情对话已全部关闭', await bootGame(page));
      // 任务栏渲染后应尝试过 3D 快照并全部失败
      await page.waitForFunction(() =>
        window.__icon3d && window.__icon3d.failed.length > 0, null, { timeout: 15000 }).catch(() => {});
      {
        const st = await page.evaluate(() => window.__icon3d
          ? { applied: window.__icon3d.applied.length, rendered: window.__icon3d.rendered.length, failed: window.__icon3d.failed.length }
          : null);
        check('B: GLB 404 时记住失败且 UI 保持 2D 图标（无换图）',
          !!st && st.failed > 0 && st.applied === 0, JSON.stringify(st));
      }
      await page.screenshot({ path: path.join(SHOTS, 'icon3d-fallback.png') });
      check('B: 回退路径无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) {
      if (process.platform === 'win32') spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }

  console.log(`\n===== 3D 快照图标验收：${passed} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
