const assert=require('node:assert/strict');const fs=require('node:fs');const{chromium}=require('playwright');
(async()=>{const b=await chromium.launch();try{const p=await b.newPage({viewport:{width:1000,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const manifest=JSON.parse(fs.readFileSync('assets/models/blender-samples/frames-manifest.json'));assert.equal(manifest.length,7);
 const hashes=new Set();for(const m of manifest){const file=fs.readFileSync(`assets/models/blender-samples/voxel_32_${m.id}.glb`);assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);hashes.add(require('node:crypto').createHash('sha256').update(file).digest('hex'));assert(m.triangles<12000);}assert.equal(hashes.size,7);
 await p.goto('http://127.0.0.1:58922/models/blender-samples/voxel.html?chain=frames');await p.waitForFunction(()=>window.voxelReady);assert.equal(await p.locator('article').count(),7);for(const m of await p.evaluate(()=>voxelChecks)){assert(Math.max(...m.size)<.84);assert.equal(m.bottom,0);}
 await p.screenshot({path:'assets/models/blender-samples/frames-preview.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.setViewportSize({width:1000,height:1100});await p.goto('http://127.0.0.1:58922/merge/?voxel=1&frames=1');await p.waitForFunction(()=>window.mergeDemo);
 for(let level=0;level<7;level++){
   const points=await p.evaluate(async level=>{const T=await import('/vendor/three.module.js'),d=mergeDemo,r=d.renderer.domElement.getBoundingClientRect();return [level*2,level*2+1].map((i,j)=>{const pos=d.coords(i);let v=new T.Vector3(pos.x,.16,pos.z);if(!j)v=new T.Box3().setFromObject(d.visuals.get(d.items[i].key).g).getCenter(new T.Vector3());v.project(d.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}})},level);
   await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();await p.mouse.move(points[1].x,points[1].y,{steps:6});await p.mouse.up();
   assert.equal(await p.evaluate(i=>mergeDemo.items[i]?.id,level*2+1),level===6?20058:20053+level,`level ${level+1}`);
 }
 assert.equal(await p.evaluate(()=>mergeDemo.state.merges),6);await p.locator('#reset').click();await p.screenshot({path:'assets/models/blender-samples/frames-board.png'});assert.deepEqual(errors,[]);console.log('PASS: 7 distinct GLBs, budgets, bounds, gallery/mobile, 6 merge transitions and max-level refusal.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
