/** 调试：看跨域 iframe 里 gtag 的内部状态 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[console:${msg.location().url?.slice(0, 60)}]`, msg.text().slice(0, 200)));
  page.on('pageerror', err => console.log('[pageerror]', String(err).slice(0, 300)));
  page.on('requestfailed', req => {
    if (/google|gtag/.test(req.url())) console.log('[reqfail]', req.url().slice(0, 100), req.failure()?.errorText);
  });
  page.on('request', req => {
    if (/google-analytics|googletagmanager/.test(req.url())) console.log('[req]', req.method(), req.url().slice(0, 120));
  });

  await page.goto('http://localhost:8902/wrapper.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(20000);

  const frame = page.frames().find(f => f.url().includes('127.0.0.1:8901'));
  if (!frame) { console.log('!! 没找到游戏 iframe'); process.exit(2); }
  const state = await frame.evaluate(() => {
    const out = { gtagType: typeof window.gtag, dataLayerLen: (window.dataLayer || []).length, dl0: null, cid: null, lsOk: false, cookie: null };
    try { out.dl0 = JSON.stringify(window.dataLayer?.slice(0, 4))?.slice(0, 400); } catch (e) { out.dl0 = 'stringify fail'; }
    try { out.cid = localStorage.getItem('mf_ga_cid'); out.lsOk = true; } catch (e) { out.lsOk = false; }
    try { document.cookie = 't=1'; out.cookie = document.cookie; } catch (e) { out.cookie = 'blocked:' + e.message; }
    return out;
  });
  console.log('iframe 内部状态:', JSON.stringify(state, null, 2));

  // 手动触发一条事件，看会不会发 collect
  await frame.evaluate(() => { try { window.gtag && window.gtag('event', 'manual_probe', { probe: 1 }); } catch (e) { console.log('gtag call err', e.message); } });
  await page.waitForTimeout(8000);

  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
