const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1500,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:58922/models/blender-samples/assembly.html');await page.waitForFunction(()=>window.assemblyReady);
 const models=await page.evaluate(()=>window.assemblyChecks);assert.deepEqual(models.map(m=>m.id),[10001,10002,10003,10004,10005]);
 for(const m of models){assert(Math.max(...m.size)<.84);assert(Math.abs(m.bottom)<.005);assert.equal(m.meshes,1);}
 for(const input of await page.locator('input').all()){await input.fill('90');await input.fill('0');}
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: five distinct assembly stages, dimensions, isolated roots, rotation and mobile layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
