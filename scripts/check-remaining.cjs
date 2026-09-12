const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const rows=require('../assets/models/blender-samples/remaining-chains.json').filter(c=>c.seq>=(+process.argv[2]||31)&&c.seq<=(+process.argv[3]||68));
(async()=>{const b=await chromium.launch();try{
 for(const c of rows){
  const entries=c.seq>=66?[...c.items.slice(1),c.items[0]]:c.items;
  const manifest=JSON.parse(fs.readFileSync(`assets/models/blender-samples/${c.key}-manifest.json`));
  assert.deepEqual(manifest.map(p=>p.id),entries.map(p=>p.id));
  assert.deepEqual(manifest.map(p=>p.name),entries.map(p=>p.name));
  assert(fs.statSync(`assets/models/blender-samples/voxel-${c.key}.blend`).size>0);
  const hashes=new Set();
  for(const m of manifest){const file=fs.readFileSync(`assets/models/blender-samples/voxel_32_${m.id}.glb`);assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);assert(m.triangles<12000);const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());for(const mesh of gltf.meshes)for(const p of mesh.primitives)assert(p.material>=0&&p.material<gltf.materials.length);hashes.add(crypto.createHash('sha256').update(file).digest('hex'));}
  assert.equal(hashes.size,entries.length);
  const p=await b.newPage({viewport:{width:1000,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:58922/models/blender-samples/voxel.html?chain=${c.key}`);await p.waitForFunction(()=>window.voxelReady);
  assert.equal(await p.locator('article').count(),entries.length);
  for(const check of await p.evaluate(()=>voxelChecks)){assert(Math.max(...check.size)<.84);assert.equal(check.bottom,0);}
  await p.screenshot({path:`assets/models/blender-samples/${c.key}-preview.png`,fullPage:true});
  await p.locator('input[type=range]').first().fill('135');await p.locator('input[type=range]').first().dispatchEvent('input');
  await p.locator('button').first().click();await p.screenshot({path:`assets/models/blender-samples/${c.key}-alternate.png`,fullPage:true});
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.setViewportSize({width:1000,height:1100});
  await p.goto(`http://127.0.0.1:58922/merge/?voxel=1&${c.key}=1`);await p.waitForFunction(()=>window.mergeDemo);
  assert.deepEqual(await p.evaluate(()=>mergeDemo.items.filter(Boolean).map(it=>it.id)),entries.flatMap(e=>[e.id,e.id]));
  let merges=0;
  for(let index=0;index<entries.length;index++){
   const points=await p.evaluate(async index=>{const T=await import('/vendor/three.module.js'),d=mergeDemo,r=d.renderer.domElement.getBoundingClientRect();return [index*2,index*2+1].map((i,j)=>{const pos=d.coords(i);let v=new T.Vector3(pos.x,.16,pos.z);if(!j)v=new T.Box3().setFromObject(d.visuals.get(d.items[i].key).g).getCenter(new T.Vector3());v.project(d.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}})},index);
   await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();await p.mouse.move(points[1].x,points[1].y,{steps:5});await p.mouse.up();
   const next=entries[index].next;
   assert.equal(await p.evaluate(i=>mergeDemo.items[i]?.id,index*2+1),next||entries[index].id,`${c.key}/${entries[index].id}`);if(next)merges++;
  }
  assert.equal(await p.evaluate(()=>mergeDemo.state.merges),merges);
  await p.locator('#reset').click();await p.screenshot({path:`assets/models/blender-samples/${c.key}-board.png`});
  await p.locator('#produce').click();assert.equal(await p.evaluate(()=>mergeDemo.items.filter(Boolean).length),entries.length*2+1);
  assert.deepEqual(errors,[]);await p.close();console.log(`PASS ${c.key}: ${entries.length} models, ${merges} merges, boundary, spawn, mobile, screenshots`);
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
