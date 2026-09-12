const assert=require('node:assert/strict');const{chromium}=require('playwright');
(async()=>{const b=await chromium.launch();try{
 const p=await b.newPage({viewport:{width:480,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:58922/merge/?voxel=1');await p.waitForFunction(()=>window.mergeDemo);
 if(process.argv[2])await p.locator('[data-angle]').filter({hasText:process.argv[2]}).click();
 assert.equal(await p.evaluate(()=>mergeDemo.items.filter(Boolean).length),28);
 const points=await p.evaluate(async()=>{const T=await import('/vendor/three.module.js'),d=mergeDemo,r=d.renderer.domElement.getBoundingClientRect();return [0,1,35].map(i=>{const c=d.coords(i),v=new T.Vector3(c.x,.16,c.z).project(d.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}})});
 async function drag(a,b){await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:8});await p.mouse.up();}
 await drag(points[0],points[1]);assert.equal(await p.evaluate(()=>mergeDemo.items[1].id),10002);assert.equal(await p.evaluate(()=>mergeDemo.state.merges),1);
 await drag(points[1],points[2]);assert.equal(await p.evaluate(()=>mergeDemo.items[35].id),10002);
 await p.locator('#produce').click();assert.equal(await p.evaluate(()=>mergeDemo.state.energy),99);
 await p.locator('#reset').click();assert.equal(await p.evaluate(()=>mergeDemo.items.filter(Boolean).length),28);
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: 63 cells, 28 voxel props, drag, merge, spawn, reset, mobile layout.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
