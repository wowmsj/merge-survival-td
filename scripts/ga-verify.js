/**
 * GA4 埋点自动验证（Playwright）
 * 打开 itch 游戏页 -> 点 Run game -> 监听网络请求，确认 gtag 加载且 collect 携带我们的 tid
 * 运行：PLAYWRIGHT_BROWSERS_PATH=$PWD/tmp/pw-browsers node scripts/ga-verify.js
 */
const { chromium } = require('playwright');

const GAME_PAGE = 'https://876176qqcom.itch.io/merge-fortress';
// 直开 iframe 地址（第一方上下文），用于对照测试第三方 iframe 是否被浏览器限制
const DIRECT_PAGE = 'https://html-classic.itch.zone/html/18964117/index.html';
const TID = 'G-N4P6VYLS6H';
const direct = process.argv[2] === 'direct';
const local = process.argv[2] === 'local'; // 本地跨域 iframe 模拟：localhost 页面嵌 127.0.0.1 的游戏

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] // 无头模式下软件渲染 WebGL，保证 Phaser 能启动
  });
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });

  const hits = { gtagLoaded: false, collect: [] };
  page.on('request', req => {
    const url = req.url();
    if (url.includes(`googletagmanager.com/gtag/js?id=${TID}`)) hits.gtagLoaded = true;
    if (url.includes('google-analytics.com/g/collect') && url.includes(`tid=${TID}`)) {
      const en = new URL(url).searchParams.get('en');
      hits.collect.push(en || '(unknown)');
    }
  });
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('google-analytics.com/g/collect') && url.includes(`tid=${TID}`)) {
      console.log(`collect 响应: HTTP ${res.status()}`);
    }
  });

  const target = local ? 'http://localhost:8902/wrapper.html' : (direct ? DIRECT_PAGE : GAME_PAGE);
  console.log(local ? '打开本地跨域 iframe 模拟页...' : (direct ? '直接打开游戏 iframe 地址（第一方上下文）...' : '打开游戏页面...'));
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (!direct && !local) {
    console.log('点击 Run game...');
    await page.click('text=Run game', { timeout: 15000 });
  }

  console.log('等待游戏加载并产生事件（40s）...');
  await page.waitForTimeout(40000);

  await page.screenshot({ path: 'tmp/ga-verify.png' });

  console.log('--- 结果 ---');
  console.log(`collect 请求（tid=${TID}）: ${hits.collect.length} 条`);
  console.log('事件:', hits.collect.join(', ') || '(无)');
  console.log('截图: tmp/ga-verify.png');

  await browser.close();
  process.exit(hits.collect.length > 0 ? 0 : 1);
})().catch(err => { console.error('验证脚本出错:', err.message); process.exit(2); });
