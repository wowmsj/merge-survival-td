const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:58922/models/blender-samples/index.html');
    await page.waitForFunction(()=>window.samplesReady);
    const checks=await page.evaluate(()=>window.sampleChecks);
    assert.equal(checks.length,6);
    for(const model of checks){assert(Math.max(...model.size)<=.84);assert(Math.abs(model.bottom)<.005);}
    await page.locator('input').first().fill('65');
    await page.locator('input').first().fill('0');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'assets/models/blender-samples/browser.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'assets/models/blender-samples/mobile.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: six GLBs, sample dimensions, near-ground pivots, rotation, desktop/mobile layout, no JS errors.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
