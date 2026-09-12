const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs');require('./model-catalog.cjs');
const runtime=require('../src/core/model/Base.ts').createDefaultBase();
const layout=JSON.parse(fs.readFileSync('assets/models/blender-samples/warm-base-layout.json','utf8'));
assert.equal(layout.tiles.length,runtime.rows*runtime.cols);
for(const tile of layout.tiles){const {row,col,model,...state}=tile;assert.deepEqual(state,runtime.tiles[row][col]);}
const buildings=[...new Map(runtime.buildings.map(b=>[b.row+','+b.col,b])).values()];
assert.equal(layout.buildings.length,buildings.length);
for(const b of layout.buildings){const {model,rotationY,...state}=b;assert.deepEqual(state,buildings.find(x=>x.row===b.row&&x.col===b.col));}
(async()=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{Box3,Vector3}=await import('three');
 for(const [kind,file] of Object.entries(layout.modules)){
  const bytes=fs.readFileSync('assets/models/blender-samples/'+file);
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const box=new Box3().setFromObject(model),size=box.getSize(new Vector3());
  assert(size.x<=.926&&size.z<=.926,kind+' exported footprint');
  assert(box.min.y>=-.001||kind.startsWith('ground'),kind+' exported floor');
 }
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:940}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:58922/models/blender-samples/base-style.html');
  await page.waitForFunction(()=>window.baseReady);
  for(const key of ['warm_base_13x13','sample_diorama','sample_core','sample_ground_0','sample_wall','warm_grass','warm_woods','warm_rubble','warm_shack','warm_pond','warm_ruin','warm_ruin_1','warm_ruin_2']){
   await page.selectOption('#asset',key);await page.waitForFunction(()=>window.baseReady);
   const bounds=await page.evaluate(async()=>{
    const {Box3,Vector3}=await import('/vendor/three.module.js');
    const box=new Box3().setFromObject(basePreview.model);let meshes=0;
    basePreview.model.traverse(o=>{if(o.isMesh){meshes++;if(!o.material)throw Error('Missing material')}});
    return {size:box.getSize(new Vector3()).toArray(),meshes};
   });
   assert(bounds.meshes>0);
   const limit=key==='warm_base_13x13'?12.926:key==='sample_diorama'?2.926:.926;
   assert(bounds.size[0]<=limit,key+' width');
   assert(bounds.size[2]<=limit,key+' depth');
   if(key==='warm_base_13x13'){
    const state=await page.evaluate(()=>{
     let tiles=0;const buildings=[];basePreview.model.traverse(o=>{if(o.name.startsWith('tile_'))tiles++;if(o.name.startsWith('building_'))buildings.push(o.name)});
     return {tiles,buildings};
    });
    assert.equal(state.tiles,169);assert.equal(state.buildings.length,layout.buildings.length);
    for(const row of [4,5,6])assert(!state.buildings.includes('building_'+row+'_12'));
   }
   await page.screenshot({path:'assets/models/blender-samples/'+key+'-preview.png'});
  }
  await page.selectOption('#asset','sample_diorama');await page.waitForFunction(()=>window.baseReady);
  assert.equal(await page.evaluate(()=>{let count=0;basePreview.model.traverse(o=>{if(o.name.startsWith('tile_'))count++});return count}),9);
  await page.uncheck('#shadows');await page.check('#shadows');
  await page.selectOption('#asset','warm_base_13x13');await page.waitForFunction(()=>window.baseReady);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'assets/models/blender-samples/sample-mobile-preview.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS actual runtime layout, 169 tiles, east openings, 13 views, single-cell bounds, mobile, console');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
