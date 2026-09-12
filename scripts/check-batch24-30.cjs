const assert=require('node:assert/strict');const fs=require('node:fs');const{chromium}=require('playwright');
const rows=[{"key":"birds","seq":24,"start":30077,"count":6,"title":"小鸟手办","first":"小鸟精灵","detail":"精灵、游侠、法师、勇者、骑士、公主；通过主色、服饰和装备拉开等级。"},{"key":"pots","seq":25,"start":40001,"count":10,"title":"花盆培育","first":"破碎花盆","detail":"碎片、残盆、修补、泥胚、上色、空盆、培土、小苗、绿植。"},{"key":"seeds","seq":26,"start":40011,"count":4,"title":"种子补给","first":"小种子包","detail":"薄纸包、加量纸包、扎口大袋、满装种子袋。"},{"key":"sacks","seq":27,"start":40015,"count":4,"title":"空种子袋","first":"空种子袋","detail":"空袋、两袋、捆扎叠袋、成堆袋。正式配置末级接麻袋布，单链预览止于本链。"},{"key":"armor","seq":28,"start":40019,"count":8,"title":"布料护甲","first":"麻袋布","detail":"布片、布卷、布袋、背包、防弹夹层、自制衣、加固衣、重甲。"},{"key":"plants","seq":29,"start":40027,"count":6,"title":"绿植培育","first":"种子","detail":"种子、育苗盘、带花小苗、绿植、发财树、开花树。"},{"key":"moths","seq":30,"start":40033,"count":6,"title":"变异昆虫","first":"变异幼虫","detail":"幼虫、蛹、成虫、荧光飞蛾、赤翼飞蛾、萤后；后三级按正式名称制作。"}];
(async()=>{const b=await chromium.launch();try{const p=await b.newPage({viewport:{width:1000,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const {key,start,count} of rows.filter(r=>!process.argv[2]||r.key===process.argv[2])){
 const manifest=JSON.parse(fs.readFileSync(`assets/models/blender-samples/${key}-manifest.json`));assert.equal(manifest.length,count);
 assert.deepEqual(manifest.map(m=>m.id),Array.from({length:count},(_,i)=>start+i));
 const hashes=new Set();for(const m of manifest){const file=fs.readFileSync(`assets/models/blender-samples/voxel_32_${m.id}.glb`);assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);hashes.add(require('node:crypto').createHash('sha256').update(file).digest('hex'));assert(m.triangles<12000);}assert.equal(hashes.size,count);
 await p.goto(`http://127.0.0.1:58922/models/blender-samples/voxel.html?chain=${key}`);await p.waitForFunction(()=>window.voxelReady);assert.equal(await p.locator('article').count(),count);for(const m of await p.evaluate(()=>voxelChecks)){assert(Math.max(...m.size)<.84);assert.equal(m.bottom,0);}
 await p.screenshot({path:`assets/models/blender-samples/${key}-preview.png`,fullPage:true});
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.setViewportSize({width:1000,height:1100});await p.goto(`http://127.0.0.1:58922/merge/?voxel=1&${key}=1`);await p.waitForFunction(()=>window.mergeDemo);
 for(let level=0;level<count;level++){
   const points=await p.evaluate(async level=>{const T=await import('/vendor/three.module.js'),d=mergeDemo,r=d.renderer.domElement.getBoundingClientRect();return [level*2,level*2+1].map((i,j)=>{const pos=d.coords(i);let v=new T.Vector3(pos.x,.16,pos.z);if(!j)v=new T.Box3().setFromObject(d.visuals.get(d.items[i].key).g).getCenter(new T.Vector3());v.project(d.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}})},level);
   await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();await p.mouse.move(points[1].x,points[1].y,{steps:6});await p.mouse.up();
   assert.equal(await p.evaluate(i=>mergeDemo.items[i]?.id,level*2+1),level===count-1&&key!=='sacks'?start+count-1:start+1+level,`level ${level+1}`);
 }
 assert.equal(await p.evaluate(()=>mergeDemo.state.merges),count-(key==='sacks'?0:1));await p.locator('#reset').click();await p.screenshot({path:`assets/models/blender-samples/${key}-board.png`});assert.deepEqual(errors,[]);console.log('PASS:',key,count,'GLBs, bounds, mobile,',count-1,'transitions and preview boundary.');
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
