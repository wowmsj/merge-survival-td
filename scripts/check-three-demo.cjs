const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:58920');
    await page.waitForFunction(() => window.demo);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tmp/three-demo-desktop.png' });
    await page.click('#build');
    const cell = await page.evaluate(async () => {
      const { Vector3 } = await import('three');
      const p = new Vector3(0, .05, 3).project(demo.camera);
      return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
    });
    await page.mouse.click(cell.x, cell.y);
    assert.equal(await page.locator('#towers').textContent(), '5');
    await page.click('#wave');
    await page.waitForFunction(() => demo.state.kills > 0, { timeout: 30000 });
    const before = await page.evaluate(() => demo.enemies.map(e => e.progress));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => demo.enemies.map(e => e.progress));
    assert.notDeepEqual(before, after, 'Enemies must move');
    await page.screenshot({ path: 'tmp/three-demo-combat.png' });
    await page.click('#night');
    assert.equal(await page.locator('#night').getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: 'tmp/three-demo-night.png' });
    await page.click('#night');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tmp/three-demo-mobile.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const file of ['tmp/three-demo-desktop.png', 'tmp/three-demo-mobile.png']) {
      const { channels } = await sharp(file).extract(file.includes('mobile') ? { left: 20, top: 330, width: 350, height: 170 } : { left: 250, top: 300, width: 900, height: 400 }).stats();
      assert(channels[0].stdev > 15, 'Scene pixels must contain nonblank geometry');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile scene pixels, building placement, moving enemies, combat, night toggle, no page errors.');
    console.log(await page.evaluate(() => ({ ...demo.state, drawCalls: demo.renderer.info.render.calls })));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
