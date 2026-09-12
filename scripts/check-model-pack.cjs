const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../assets/models');
const catalog=require('./model-catalog.cjs');
(async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.assets.map(a=>a.id).sort((a,b)=>a-b),catalog.map(a=>a.id).sort((a,b)=>a-b));
  await fs.mkdir(path.join(root,'sheets'),{recursive:true});
  let layers=[];
  for(const [i,a] of manifest.assets.entries()){
    const glb=await fs.readFile(path.join(root,a.file));
    assert.equal(glb.readUInt32LE(0),0x46546c67);
    assert.equal(glb.readUInt32LE(8),glb.length);
    const stats=await sharp(path.join(root,a.preview)).stats();
    assert(stats.channels[3].min===0&&stats.channels[3].max===255,`${a.id}: alpha`);
    assert(stats.channels[0].stdev>10,`${a.id}: blank preview`);
    assert(a.pixelError<=3,`${a.id}: export appearance`);
    const slot=i%24;
    for(const [j,file] of [a.reference,a.preview].entries()){
      if(file)layers.push({input:await sharp(path.join(root,file)).resize(160,160,{fit:'contain',background:'#d4caba'}).flatten({background:'#d4caba'}).png().toBuffer(),left:(slot%3)*320+j*160,top:Math.floor(slot/3)*190+30});
    }
    layers.push({input:Buffer.from(`<svg width="320" height="30"><text x="12" y="22" font-size="18" fill="#f3e5ce">${a.id} / 2D → 3D</text></svg>`),left:(slot%3)*320,top:Math.floor(slot/3)*190});
    if(slot===23||i===manifest.assets.length-1){await sharp({create:{width:960,height:Math.ceil((slot+1)/3)*190,channels:4,background:'#464038'}}).composite(layers).png().toFile(path.join(root,`sheets/page-${Math.floor(i/24)+1}.png`));layers=[];}
  }
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:58922/models/');
    await page.waitForFunction(()=>window.modelGalleryReady);
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    assert.equal(await page.locator('article').count(),24);
    await page.locator('#search').fill('70170');
    assert.equal(await page.locator('article').count(),1);
    await page.locator('article button').click();
    await page.waitForFunction(()=>document.querySelector('#modelName').textContent.includes('70170'));
    await page.locator('#angle').fill('110');
    await page.locator('#close').click();
    await page.locator('#search').fill('');
    await page.locator('#type').selectOption('1');
    await page.locator('#next').click();
    assert.equal(await page.locator('article').count(),4);
    await page.locator('#prev').click();
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(root,'previews/gallery-mobile.png')});
  }finally{await browser.close();}
  console.log(`PASS: ${manifest.assets.length} GLBs and transparent previews, reference sheets, search/pagination/3D rotation/mobile gallery without overflow.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
