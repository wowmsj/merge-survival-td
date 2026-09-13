/**
 * 僵尸路线预览端到端验收
 *
 * 自包含：8080 已有 dev server 则复用，否则自动启动（dev mode 才有 __base3d/__basescene 调试钩子）。
 * 用法：node scripts/check-route-preview.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 验收点：
 *   - 白天基地（3D / 2D）默认画出僵尸路线箭头，箭头数与算出的路线格一致
 *   - 箭头方向可沿走回核心（方向聚合正确，与夜战寻路同源）
 *   - 顶栏「路线」开关可隐藏/恢复箭头，状态持久化
 *   - 摆放模式下悬停某格 → 路线按「该格被建筑占用」重算（改道预览）
 * 截图：screenshots/route-3d.png / route-placing-3d.png / route-2d.png
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

/** 启动游戏、清档、跳过开局剧情 */
async function boot(page, mode) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((m) => {
    localStorage.setItem('merge_survival_td_base_3d', m);
    localStorage.removeItem('merge_survival_td_state');
    localStorage.removeItem('merge_survival_td_route');
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

/** 场景里当前实际显示的箭头数（3D 看可见 mesh，2D 看箭头层子节点） */
const arrowCount = (page, expr) => page.evaluate(e => {
  const scene = eval(e);
  if (scene.renderer3d) return scene.renderer3d.routeMeshes.filter(m => m.visible).length;
  return scene.routeLayer.list.length;
}, expr);

/** 沿箭头从每个刷怪点走回核心，返回是否全部到达（验证方向聚合） */
const allArrowsReachCore = (page, expr) => page.evaluate(e => {
  const p = eval(e).routePreview;
  if (!p || !p.core) return false;
  const arrows = new Map(p.cells.map(c => [`${c.row},${c.col}`, c]));
  for (const spawn of p.spawnCells) {
    let cur = { row: spawn.row, col: spawn.col };
    let ok = false;
    for (let i = 0; i < 40; i++) {
      if (cur.row === p.core.row && cur.col === p.core.col) { ok = true; break; }
      const cell = arrows.get(`${cur.row},${cur.col}`);
      if (!cell) break;
      cur = { row: cur.row + cell.dr, col: cur.col + cell.dc };
    }
    if (!ok) return false;
  }
  return true;
}, expr);

/** 3D 网格内某格的屏幕坐标（用渲染器 pickCell 反查质心，避免手算投影） */
async function cellScreenPoint(page, row, col) {
  return page.evaluate(([r, c]) => {
    const owner = window.__base3d.owner;
    const rect = document.querySelector('canvas[data-base3d]').getBoundingClientRect();
    let sx = 0, sy = 0, n = 0;
    for (let dy = 2; dy < rect.height; dy += 3) {
      for (let dx = 2; dx < rect.width; dx += 3) {
        const hit = owner.pickCell({ clientX: rect.left + dx, clientY: rect.top + dy });
        if (hit && hit.row === r && hit.col === c) { sx += rect.left + dx; sy += rect.top + dy; n++; }
      }
    }
    return n > 0 ? { x: sx / n, y: sy / n } : null;
  }, [row, col]);
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
    const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
    const page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', e => errors.push(String(e.message || e)));

    /** 3D 网格区域（画布矩形）——用于裁切高清放大图，方便肉眼核对箭头 */
    const gridClip = () => page.evaluate(() => {
      const r = document.querySelector('canvas[data-base3d]').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });

    // ---- 3D：默认显示路线 ----
    let expr = await boot(page, '1');
    const base3d = await page.evaluate(e => {
      const s = eval(e);
      const p = s.routePreview;
      return { cells: p.cells.length, spawn: p.spawnCells.length, hasRoute: p.hasRoute, visible: s.routeVisible };
    }, expr);
    check('3D 默认开启路线显示', base3d.visible === true, JSON.stringify(base3d));
    check('3D 算出路线（入口 ' + base3d.spawn + ' 个 / 路线格 ' + base3d.cells + '）',
      base3d.hasRoute && base3d.cells > 0 && base3d.spawn > 0, JSON.stringify(base3d));
    check('3D 箭头数与路线格一致', (await arrowCount(page, expr)) === base3d.cells, `箭头 ${await arrowCount(page, expr)} vs 路线格 ${base3d.cells}`);
    check('3D 箭头方向可走回核心', await allArrowsReachCore(page, expr));
    await page.screenshot({ path: path.join(SHOTS, 'route-3d.png') });
    // 高清放大图：新开局（棋子+废墟）与四边全开（清空棋盘）两种布局
    await page.screenshot({ path: path.join(SHOTS, 'route-zoom-initial.png'), clip: await gridClip() });
    await page.evaluate(e => {
      const scene = eval(e);
      scene.state.base.buildings = scene.state.base.buildings.filter(b => b.cfgId !== 901);
      for (const row of scene.state.grid.cells) for (const cell of row) cell.item = null;
      scene.renderGrid();
    }, expr);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS, 'route-zoom-open.png'), clip: await gridClip() });
    // 恢复新开局布局继续后面的断言
    expr = await boot(page, '1');

    // ---- 开关 ----
    await page.evaluate(e => eval(e).toggleRoute(), expr);
    await page.waitForTimeout(300);
    check('关闭后箭头隐藏', (await arrowCount(page, expr)) === 0);
    check('关闭状态写入 localStorage', await page.evaluate(() => localStorage.getItem('merge_survival_td_route') === '0'));
    await page.evaluate(e => eval(e).toggleRoute(), expr);
    await page.waitForTimeout(300);
    check('再开恢复箭头', (await arrowCount(page, expr)) === base3d.cells);

    // ---- 摆放预览：多走廊场景下真指针悬停改道 ----
    // （新开局只有东边一条走廊，canPlace 会拒绝封死唯一通路；这里模拟第 5 天四边全开后布防）
    const setup = await page.evaluate(e => {
      const scene = eval(e);
      scene.state.base.buildings = scene.state.base.buildings.filter(b => b.cfgId !== 901); // 拆掉废墟，四边全开
      scene.state.resources.coin = 99999;
      if (!scene.state.unlockedBuildings.includes(101)) scene.state.unlockedBuildings.push(101);
      scene.renderGrid();
      scene.placing = 101; // 箭塔
      const before = scene.routePreview.cells.map(c => `${c.row},${c.col}`).join('|');
      // 找一个「可建造且在路线上、且不是刷怪点」的格作为悬停目标
      const target = scene.routePreview.cells.find(c => !c.spawn &&
        scene.baseSystem.canPlace(scene.state, 101, c.row, c.col).ok);
      return target ? { row: target.row, col: target.col, before } : null;
    }, expr);
    check('多走廊棋盘上存在可建造的路线格（改道用例前提）', setup !== null, JSON.stringify(setup));

    const pt = await cellScreenPoint(page, setup.row, setup.col);
    await page.mouse.move(pt.x, pt.y); // 真实指针悬停 → Base3DRenderer.updateHover → onCellHover
    await page.waitForTimeout(400);
    const reroute = await page.evaluate(([e, before]) => {
      const scene = eval(e);
      const after = scene.routePreview.cells.map(c => `${c.row},${c.col}`).join('|');
      return {
        hoverCell: scene.hoverCell,
        changed: before !== after,
        blockedStillOnRoute: scene.routePreview.cells.some(c => c.row === scene.hoverCell?.row && c.col === scene.hoverCell?.col),
        hasRoute: scene.routePreview.hasRoute
      };
    }, [expr, setup.before]);
    check('3D 指针悬停触发布防改道预览（onCellHover 已接线）',
      !!reroute.hoverCell && reroute.hoverCell.row === setup.row && reroute.hoverCell.col === setup.col, JSON.stringify(reroute));
    check('悬停格被假设占用，路线绕开该格且仍有通路',
      reroute.blockedStillOnRoute === false && reroute.changed === true && reroute.hasRoute === true, JSON.stringify(reroute));
    await page.screenshot({ path: path.join(SHOTS, 'route-placing-3d.png') });
    await page.screenshot({ path: path.join(SHOTS, 'route-zoom-placing.png'), clip: await gridClip() });

    // 摆下一座塔：路线应稳定为「占用后」的结果
    const placed = await page.evaluate((e) => {
      const scene = eval(e);
      const hover = scene.hoverCell;
      const ok = scene.baseSystem.place(scene.state, 101, hover.row, hover.col);
      scene.placing = null;
      scene.hoverCell = null;
      scene.renderGrid();
      return { ok, cells: scene.routePreview.cells.length, stillOnRoute: scene.routePreview.cells.some(c => c.row === hover.row && c.col === hover.col) };
    }, expr);    check('放塔后路线绕开该格并保持通路', placed.ok && placed.stillOnRoute === false, JSON.stringify(placed));

    // ---- 2D：同样画箭头 ----
    expr = await boot(page, '0');
    const base2d = await page.evaluate(e => {
      const s = eval(e);
      return { cells: s.routePreview.cells.length, visible: s.routeVisible, layer: s.routeLayer.list.length };
    }, expr);
    check('2D 默认开启路线显示', base2d.visible === true, JSON.stringify(base2d));
    check('2D 箭头精灵数与路线格一致', base2d.layer === base2d.cells && base2d.cells > 0, JSON.stringify(base2d));
    check('2D 箭头方向可走回核心', await allArrowsReachCore(page, expr));
    await page.screenshot({ path: path.join(SHOTS, 'route-2d.png') });

    check('全程无页面错误', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n===== 路线预览 e2e：${passed} 通过，${failed} 失败 =====`);
  if (errors.length) console.log('页面错误：\n' + errors.join('\n'));
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
