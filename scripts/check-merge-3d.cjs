const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sharp = require('sharp');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:58921/merge/');
    await page.waitForFunction(() => window.mergeDemo);
    assert.equal(await page.evaluate(() => mergeDemo.renderer.shadowMap.enabled), false);
    async function cell(i) {
      return page.evaluate(async i => {
        const { Vector3 } = await import('three');
        const q = mergeDemo.coords(i), v = new Vector3(q.x, .34, q.z).project(mergeDemo.camera);
        const r = mergeDemo.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 };
      }, i);
    }
    async function drag(a, b) {
      const from = await cell(a), to = await cell(b);
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
    }
    const models = await page.evaluate(async () => {
      const { createItemModel } = await import('./models.js');
      const { batchIds } = await import('./reference-models.js');
      const { Box3, Vector3 } = await import('three');
      return batchIds.map(id => {
        const model = createItemModel(id), size = new Box3().setFromObject(model,true).getSize(new Vector3());
        let meshes = 0, textured = false;
        model.traverse(m => { if (m.isMesh) { meshes++; textured ||= !!m.material.map; } });
        return { id, meshes, textured, x: size.x, y: size.y, z: size.z };
      });
    });
    assert.equal(models.length, 18);
    models.forEach(m => { assert(m.meshes >= 3); assert(m.y > .1 && m.x <= .84 && m.z <= .84); });
    await drag(6, 7);
    assert.equal(await page.evaluate(() => mergeDemo.visuals.get(mergeDemo.items[7].key).id), 20012);
    await drag(16, 17);
    assert.equal(await page.evaluate(() => mergeDemo.visuals.get(mergeDemo.items[17].key).id), 30002);
    assert.equal(await page.evaluate(() => mergeDemo.items.length), 63);
    await drag(8, 62);
    assert.equal(await page.evaluate(() => mergeDemo.items[62].id), 20012);
    assert.equal(await page.evaluate(() => mergeDemo.items[8]), null);
    const generator = await cell(0);
    await page.mouse.click(generator.x, generator.y);
    assert.equal(await page.evaluate(() => mergeDemo.state.energy), 100);
    await page.mouse.click(generator.x, generator.y);
    assert.equal(await page.evaluate(() => mergeDemo.state.energy), 99);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tmp/merge-models-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tmp/merge-models-mobile.png' });
    const stats = await sharp('tmp/merge-models-mobile.png').extract({ left: 20, top: 200, width: 350, height: 350 }).stats();
    assert(stats.channels[0].stdev > 15);
    assert.deepEqual(errors, []);
    console.log('PASS: 18 volumetric models fit cells, both chains update models after merge, select/produce, desktop/mobile nonblank, no page errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
