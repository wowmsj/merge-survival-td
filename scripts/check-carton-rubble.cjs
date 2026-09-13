/**
 * 基地美术一致性验收：纸箱封印 = 3D 瓦砾堆 + 地图上不再有破旧建筑
 *
 * 自包含：8080 已有 dev server 则复用，否则自动启动（dev mode 才有 __base3d 调试钩子）。
 * 用法：node scripts/check-carton-rubble.cjs
 * 退出码：有 FAIL 则非 0。
 *
 * 验收点：
 *   - 初始封印数量不变（32 纸箱 / 6 蜘蛛网），但纸箱不再画 2D 贴图（sealEl 无背景）
 *   - 每个纸箱格都有 3D 封印模型（复用地图 warm_rubble.glb），数量与纸箱数一致
 *   - 地图地形不含破旧建筑（shack），原 12 格已改为瓦砾堆
 * 截图：screenshots/base-rubble-seal-zoom.png（网格区域放大）
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

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('merge_survival_td_base_3d', '1');
      localStorage.removeItem('merge_survival_td_state');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__base3d, null, { timeout: 180000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const s = window.__base3d.state;
      s.storySeen = Array.from({ length: 140 }, (_, i) => i + 1);
      s.storyRewardClaims = Array.from({ length: 140 }, (_, i) => i + 1);
      s.handIndex = 9999;
    });
    for (let i = 0; i < 40; i++) {
      const open = await page.evaluate(() => window.__base3d.owner.scene.storyDialog.isOpen);
      if (!open) break;
      await page.mouse.click(270, 480);
      await page.waitForTimeout(250);
    }
    // 等地形 GLB 加载完成（封印外观此时才切 3D）
    await page.waitForFunction(() => window.__base3d.owner.sealIs3D(), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const owner = window.__base3d.owner;
      const state = window.__base3d.state;
      let carton = 0, spider = 0, carton2d = 0, seal3d = 0;
      const terrainCount = {};
      for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
          const v = owner.itemViews[r][c];
          const item = v?.item;
          if (item?.st === 2) {
            carton++;
            if (v.sealEl.style.backgroundImage) carton2d++;
            if (owner.sealMeshes.has(`${r},${c}`)) seal3d++;
          } else if (item?.st === 1) {
            spider++;
          }
          const t = state.base.tiles[r][c].terrain;
          if (t) terrainCount[t] = (terrainCount[t] ?? 0) + 1;
        }
      }
      return {
        carton, spider, carton2d, seal3d,
        sealIs3D: owner.sealIs3D(),
        terrainCount,
        hasShack: Object.keys(terrainCount).includes('shack')
      };
    });

    check('初始封印数量不变（32 纸箱 / 6 蜘蛛网）', info.carton === 32 && info.spider === 6, JSON.stringify(info));
    check('封印已切到 3D 外观（sealIs3D）', info.sealIs3D === true, JSON.stringify(info));
    check('每个纸箱格都有 3D 瓦砾堆封印模型', info.seal3d === info.carton && info.carton > 0, JSON.stringify(info));
    check('纸箱不再画 2D 贴图', info.carton2d === 0, JSON.stringify(info));
    check('地图地形不含破旧建筑（shack）', info.hasShack === false, JSON.stringify(info));
    check('地形总数 62（原 shack 12 格已改为瓦砾堆）',
      Object.values(info.terrainCount).reduce((a, b) => a + b, 0) === 62 && info.terrainCount.rubble === 32,
      JSON.stringify(info.terrainCount));

    // 封印瓦砾不是地形：点它只提示「靠近合成」，不扣金币、也不清除
    const tap = await page.evaluate(() => {
      const scene = window.__base3d.owner.scene;
      let pos = null;
      for (let r = 0; r < 13 && !pos; r++) {
        for (let c = 0; c < 13 && !pos; c++) {
          if (scene.state.grid.cells[r][c].item?.st === 2) pos = { row: r, col: c };
        }
      }
      const coinBefore = scene.state.resources.coin;
      const logs = [];
      const orig = scene.showToast.bind(scene);
      scene.showToast = (m) => { logs.push(String(m)); return orig(m); };
      scene.handleCellTap(pos.row, pos.col);
      scene.showToast = orig;
      return {
        pos,
        logs,
        coinDelta: scene.state.resources.coin - coinBefore,
        stillSealed: scene.state.grid.cells[pos.row][pos.col].item?.st === 2,
        terrain: scene.state.base.tiles[pos.row][pos.col].terrain ?? null
      };
    });
    const hint = (tap.logs[0] || '').toLowerCase();
    check('点封印瓦砾只提示「相邻合成打开」（文案含 rubble/瓦砾）',
      /rubble|瓦砾/.test(hint), JSON.stringify(tap));
    check('点封印瓦砾不扣金币、不被清除、仍是封印',
      tap.coinDelta === 0 && tap.stillSealed === true && tap.terrain === null, JSON.stringify(tap));

    const rect = await page.evaluate(() => {
      const r = document.querySelector('canvas[data-base3d]').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    await page.screenshot({ path: path.join(SHOTS, 'base-rubble-seal-zoom.png'), clip: rect });
    await page.screenshot({ path: path.join(SHOTS, 'base-rubble-seal.png') });
    check('全程无页面错误', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n===== 封印/地形美术 e2e：${passed} 通过，${failed} 失败 =====`);
  if (errors.length) console.log('页面错误：\n' + errors.join('\n'));
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
