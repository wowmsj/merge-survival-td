/**
 * 基地合成（基地即合成场 · 阶段 2）运行时验收
 *
 * 自包含：自动启动 webpack-dev-server（dev mode，__DEV_FEATURES__=true 使调试钩子生效），
 * Playwright 无头浏览器验收后关闭服务器。若 8080 已有服务在跑则直接复用。
 *
 * 用法：node scripts/check-base-merge.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 路径：BootScene 直进 BaseScene（localStorage base_3d=1 → __base3d 钩子；GameScene 已删除，
 *   BaseScene 是唯一主场景，合成棋盘与建造栏同屏）。
 *
 * 覆盖：物品层棋子数=state.grid 物品数、真实拖拽同 id 合成、发射器二次点击产出、
 * 拖拽到建筑格/未认领格弹回、建造摆放模式下物品拖拽禁用、tap 建筑弹详情 / tap 空地取消选中、
 * 场景 restart 后无重复画布无未捕获异常。截图输出到 screenshots/base-merge-*.png。
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
    s.resources.coin = 99999; // 建造摆放测试用
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

/** 装页内测试助手，并把相机压回 zoom=1 让 13×13 全在画面内（boot 后与 restart 后各调一次） */
async function enterBase(page) {
  const ok = await page.waitForFunction(() => window.__base3d, null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  if (!ok) throw new Error('基地 3D 未就绪（__base3d 钩子未出现，base_3d 开关未生效？）');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__base3d.owner.orbit.setZoom(1);
    // 页内格子判定助手（对齐 core canHostItem：在网格内、无物品、已认领、无建筑、无地形）
    window.__t = {
      item: (r, c) => window.__base3d.state.grid.cells[r][c].item,
      building: (r, c) => window.__base3d.state.base.buildings.some(b => b.row === r && b.col === c),
      claimed: (r, c) => !!window.__base3d.state.base.tiles?.[r]?.[c]?.claimed,
      terrain: (r, c) => !!window.__base3d.state.base.tiles?.[r]?.[c]?.terrain,
      hostable(r, c) {
        return r >= 0 && r < 13 && c >= 0 && c < 13 &&
          !this.item(r, c) && this.claimed(r, c) && !this.building(r, c) && !this.terrain(r, c);
      },
      count() {
        let n = 0;
        for (const row of window.__base3d.state.grid.cells) for (const cell of row) if (cell.item) n++;
        return n;
      },
      /** 相邻双可承载格（行优先，用于合成/移动夹具） */
      findPair() {
        for (let r = 0; r < 13; r++) for (let c = 0; c < 12; c++) {
          if (this.hostable(r, c) && this.hostable(r, c + 1)) return [[r, c], [r, c + 1]];
        }
        return null;
      },
      /** 带可承载邻居的可承载格（发射器落点要在九宫内有空位） */
      findWithNeighbor() {
        for (let r = 1; r < 12; r++) for (let c = 1; c < 12; c++) {
          if (!this.hostable(r, c)) continue;
          for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
            if (this.hostable(r + dr, c + dc)) return [r, c];
          }
        }
        return null;
      },
      /** 未认领格（弹回测试；建筑/地形不影响「弹回」结论） */
      findUnclaimed() {
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          if (!this.claimed(r, c) && !this.building(r, c)) return [r, c];
        }
        return null;
      },
      put(r, c, item) {
        window.__base3d.state.grid.cells[r][c].item = item;
        window.__base3d.refreshItems();
        return item;
      }
    };
    // 初始 42 物品快照：前面用例的合成/发射副产物会占掉外圈可摆放格，摆放模式用例前还原
    window.__gridSnapshot = window.__base3d.state.grid.cells.map(row => row.map(cell => cell.item));
  });
}

/** 真实鼠标拖拽（>8px 阈值，分步移动） */
async function drag(page, r1, c1, r2, c2) {
  const from = await page.evaluate(([r, c]) => window.__base3d.cellScreen(r, c), [r1, c1]);
  const to = await page.evaluate(([r, c]) => window.__base3d.cellScreen(r, c), [r2, c2]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
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
    // 基地 3D 开关必须在 BootScene 之前写入（默认已开，这里显式固定防本地回退）
    await context.addInitScript(() => {
      localStorage.setItem('merge_survival_td_base_3d', '1');
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.message || e)));

    check('开局剧情对话已全部关闭', await bootGame(page));
    await enterBase(page);

    // ================= 1. 物品层棋子数 = state.grid 物品数（初始 42） =================
    check('基地 3D 渲染器激活（__base3d 钩子存在）', await page.evaluate(() => !!window.__base3d));
    check('基地 3D 画布存在且只有一张',
      await page.evaluate(() => document.querySelectorAll('canvas[data-base3d]').length) === 1);
    {
      // 单次 evaluate 读两侧，无 tick 竞态
      const r = await page.evaluate(() => ({ grid: window.__t.count(), layer: window.__base3d.itemCount() }));
      check(`物品层棋子数 = state.grid 物品数（grid=${r.grid}）`, r.grid === 42 && r.layer === r.grid,
        JSON.stringify(r));
    }
    await page.screenshot({ path: path.join(SHOTS, 'base-merge-items.png') });

    // ================= 2. 真实拖拽两个同 id 物品 → 合成成功 =================
    // 用棋盘上已有的同 id 普通物品对（中央 7×7 很满，注入空格只能落走廊，会堵杀僵尸通路）
    {
      const fixture = await page.evaluate(() => {
        const s = window.__base3d.state;
        const byId = {};
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          const it = s.grid.cells[r][c].item;
          if (!it || it.st) continue; // 普通物品（无蜘蛛网/纸箱）
          (byId[it.id] = byId[it.id] || []).push({ r, c, it });
        }
        for (const id of Object.keys(byId)) {
          const list = byId[id];
          if (list.length >= 2) {
            window.__srcRef = list[0].it;
            window.__srcId = list[0].it.id;
            return { r1: list[0].r, c1: list[0].c, r2: list[1].r, c2: list[1].c, id: list[0].it.id };
          }
        }
        return null;
      });
      check('找到棋盘上已有的同 id 合成对', !!fixture, JSON.stringify(fixture));
      if (fixture) {
        await drag(page, fixture.r1, fixture.c1, fixture.r2, fixture.c2);
        await page.waitForTimeout(500);
        const r = await page.evaluate(([r1, c1, r2, c2, srcId]) => ({
          srcChanged: window.__t.item(r1, c1) !== window.__srcRef, // 合成消耗/奖励替换，原引用必失效
          dst: window.__t.item(r2, c2),
          srcId
        }), [fixture.r1, fixture.c1, fixture.r2, fixture.c2, fixture.id]);
        check('拖拽同 id 物品合成成功（落点变为合成产物，源格原物品被消耗）',
          r.srcChanged && !!r.dst && r.dst.id !== r.srcId, JSON.stringify(r));
        await page.screenshot({ path: path.join(SHOTS, 'base-merge-merged.png') });
      }
    }

    // ================= 3. 点发射器物品两次 → 产出落到邻近可承载格 =================
    {
      const sp = await page.evaluate(() => {
        const cell = window.__t.findWithNeighbor();
        if (!cell) return null;
        const [r, c] = cell;
        window.__t.put(r, c, { id: 901, times: 5 }); // 钻石瓶：anc 点击发射器，noPower 不耗体力
        return { r, c };
      });
      check('找到发射器夹具格（带可承载邻居）', !!sp, JSON.stringify(sp));
      if (sp) {
        await page.waitForTimeout(300);
        const before = await page.evaluate(() => window.__t.count());
        const p = await page.evaluate(([r, c]) => window.__base3d.cellScreen(r, c), [sp.r, sp.c]);
        await page.mouse.click(p.x, p.y); // 第一次：选中
        await page.waitForTimeout(250);
        const sel = await page.evaluate(() => window.__base3d.getSelection());
        check('首次点击发射器 = 选中高亮', !!sel && sel.row === sp.r && sel.col === sp.c, JSON.stringify(sel));
        await page.mouse.click(p.x, p.y); // 第二次：发射
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => window.__t.count());
        check('二次点击发射器产出新物品（物品数 +1）', after === before + 1, `${before} → ${after}`);
        await page.screenshot({ path: path.join(SHOTS, 'base-merge-spawn.png') });
        // 清掉发射器，避免干扰后续计数断言
        await page.evaluate(([r, c]) => { window.__base3d.state.grid.cells[r][c].item = null; window.__base3d.refreshItems(); }, [sp.r, sp.c]);
        await page.mouse.click(p.x, p.y); // 点空格取消选中
        await page.waitForTimeout(200);
      }
    }

    // ================= 4. 拖拽到建筑格 / 未认领格 → 弹回（物品原位） =================
    {
      // 夹具源格：另找一对可承载格放普通物品
      const fx = await page.evaluate(() => {
        const cell = window.__t.findWithNeighbor();
        if (!cell) return null;
        const [r, c] = cell;
        window.__t.put(r, c, { id: 10012 });
        return { r, c };
      });
      check('找到弹回测试夹具格', !!fx, JSON.stringify(fx));
      if (fx) {
        // 建筑格：核心 (6,6)
        await drag(page, fx.r, fx.c, 6, 6);
        await page.waitForTimeout(300);
        const r1 = await page.evaluate(([r, c]) => ({
          src: window.__t.item(r, c), core: window.__t.item(6, 6)
        }), [fx.r, fx.c]);
        check('拖拽到建筑格（核心）弹回，物品原位', r1.src?.id === 10012 && !r1.core, JSON.stringify(r1));

        // 未认领格
        const un = await page.evaluate(() => window.__t.findUnclaimed());
        check('找到未认领格', !!un, JSON.stringify(un));
        if (un) {
          await drag(page, fx.r, fx.c, un[0], un[1]);
          await page.waitForTimeout(300);
          const r2 = await page.evaluate(([r, c, ur, uc]) => ({
            src: window.__t.item(r, c), dst: window.__t.item(ur, uc)
          }), [fx.r, fx.c, un[0], un[1]]);
          check('拖拽到未认领格弹回，物品原位', r2.src?.id === 10012 && !r2.dst, JSON.stringify(r2));
        }
        // 清理夹具
        await page.evaluate(([r, c]) => { window.__base3d.state.grid.cells[r][c].item = null; window.__base3d.refreshItems(); }, [fx.r, fx.c]);
      }
    }

    // ================= 5. 建造摆放模式下拖物品不触发物品拖拽 =================
    {
      // 还原初始物品快照（清掉前面用例的合成/发射副产物，与进基地时一致）
      await page.evaluate(() => {
        const cells = window.__base3d.state.grid.cells;
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) cells[r][c].item = window.__gridSnapshot[r][c];
        window.__base3d.refreshItems();
      });
      const fx = await page.evaluate(() => {
        // 用棋盘上已有的普通物品做拖拽源（注入空格只能落走廊，会把可摆放格堵成 0）
        const s = window.__base3d.state;
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          const it = s.grid.cells[r][c].item;
          if (it && !it.st) return { r1: r, c1: c, id: it.id };
        }
        return null;
      });
      // 落点：任意可承载空格（弹回/移动都不允许发生）
      const dst = await page.evaluate(() => {
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          if (window.__t.hostable(r, c)) return { r, c };
        }
        return null;
      });
      const card = await designPoint(page, 275, 1618); // 建造栏首页第一张塔卡
      // Phaser 在 window 级监听 pointerup 且不校验 pointerdown 位置：前面拖拽的落点若扫过卡片，
      // placing 可能已被误开。先读出状态对齐到「未摆放」，再点卡片进入摆放模式。
      for (let i = 0; i < 3; i++) {
        const cur = await page.evaluate(() => window.__base3d.owner.scene.placing);
        if (cur === null) break;
        await page.mouse.click(card.x, card.y);
        await page.waitForTimeout(300);
      }
      await page.mouse.click(card.x, card.y);
      await page.waitForTimeout(400);
      const placingInfo = await page.evaluate(() => ({
        placing: window.__base3d.owner.scene.placing,
        hints: window.__base3d.placementHints()
      }));
      const hints = placingInfo.hints;
      check('进入建造摆放模式（绿框提示出现）', placingInfo.placing !== null && hints > 0, JSON.stringify(placingInfo));
      if (fx && dst && hints > 0) {
        await drag(page, fx.r1, fx.c1, dst.r, dst.c);
        await page.waitForTimeout(300);
        const r = await page.evaluate(([r1, c1, r2, c2, id]) => ({
          src: window.__t.item(r1, c1), dst: window.__t.item(r2, c2), id
        }), [fx.r1, fx.c1, dst.r, dst.c, fx.id]);
        check('摆放模式下拖物品不触发物品拖拽（物品原位、落点仍空）',
          r.src?.id === r.id && !r.dst, JSON.stringify(r));
        await page.screenshot({ path: path.join(SHOTS, 'base-merge-placing.png') });
      } else {
        check('摆放模式拖拽前置（夹具/落点/绿框）', false, JSON.stringify({ fx, dst, hints }));
      }
      // 退出摆放模式（对齐到 placing=null）
      for (let i = 0; i < 3; i++) {
        const cur = await page.evaluate(() => window.__base3d.owner.scene.placing);
        if (cur === null) break;
        await page.mouse.click(card.x, card.y);
        await page.waitForTimeout(300);
      }
      check('退出摆放模式（绿框清除）', await page.evaluate(() => window.__base3d.placementHints()) === 0);
    }

    // ================= 6. tap 建筑仍弹详情、tap 空地取消选中 =================
    {
      // 先选中一个物品
      const sel1 = await page.evaluate(() => {
        const cell = window.__t.findWithNeighbor();
        if (!cell) return null;
        window.__t.put(cell[0], cell[1], { id: 40001 });
        return cell;
      });
      if (sel1) {
        const p = await page.evaluate(([r, c]) => window.__base3d.cellScreen(r, c), sel1);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(250);
        const s = await page.evaluate(() => window.__base3d.getSelection());
        check('tap 物品格选中高亮', !!s && s.row === sel1[0] && s.col === sel1[1], JSON.stringify(s));
      }
      // tap 建筑（核心）→ 详情弹窗
      const core = await page.evaluate(() => window.__base3d.cellScreen(6, 6));
      await page.mouse.click(core.x, core.y);
      await page.waitForTimeout(400);
      check('tap 建筑（核心）打开建筑详情弹窗', await page.evaluate(() => window.__base3d.dialogOpen()));
      await page.evaluate(() => window.__base3d.owner.scene.closeDialog());
      await page.waitForTimeout(300);
      check('关闭弹窗后 3D 画布恢复可见', await page.evaluate(() => {
        const c = document.querySelector('canvas[data-base3d]');
        return !!c && getComputedStyle(c.parentElement).visibility !== 'hidden';
      }));
      // tap 空地 → 取消选中
      const cell = await page.evaluate(() => {
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          if (window.__t.hostable(r, c)) return [r, c];
        }
        return null;
      });
      check('找到可承载空地', !!cell);
      if (cell) {
        const p = await page.evaluate(([r, c]) => window.__base3d.cellScreen(r, c), cell);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(250);
        check('tap 空地取消选中', await page.evaluate(() => window.__base3d.getSelection()) === null);
      }
      if (sel1) {
        await page.evaluate(([r, c]) => { window.__base3d.state.grid.cells[r][c].item = null; window.__base3d.refreshItems(); }, sel1);
      }
    }

    check('交互阶段无未捕获页面异常', pageErrors.length === 0, pageErrors.join(' | '));

    // ================= 7. 场景 restart：无重复画布、无未捕获异常 =================
    {
      // GameScene 已删除，BaseScene 是唯一主场景；离开/返回等价于存档后 restart
      await page.evaluate(() => window.__base3d.owner.scene.save());
      const destroyedBefore = await page.evaluate(() => window.__base3dDestroyed || 0);
      // 打旧渲染器标记，避免 waitForFunction 拿到 restart 前的旧钩子
      await page.evaluate(() => { window.__base3d.__oldRenderer = true; });
      await page.evaluate(() => window.__base3d.owner.scene.scene.restart());
      await page.waitForFunction(() => window.__base3d && !window.__base3d.__oldRenderer, null, { timeout: 15000 });
      await page.waitForTimeout(600);
      check('restart 后 __base3d 钩子重新出现', await page.evaluate(() => !!window.__base3d));
      check('restart 后基地 3D 画布唯一（无重复实例）',
        await page.evaluate(() => document.querySelectorAll('canvas[data-base3d]').length) === 1);
      check('restart 销毁了旧渲染器（dispose 计数 +1）',
        await page.evaluate((n) => (window.__base3dDestroyed || 0) === n + 1, destroyedBefore));
      await enterBase(page); // 重装 __t 助手与相机
      const r = await page.evaluate(() => ({ grid: window.__t.count(), layer: window.__base3d.itemCount() }));
      check('restart 后物品层棋子数仍与 state.grid 一致', r.layer === r.grid, JSON.stringify(r));
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

  console.log(`\n===== 基地合成验收：${passed} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
