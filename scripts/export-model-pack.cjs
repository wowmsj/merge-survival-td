const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const props=require('./model-catalog.cjs');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'assets/models');
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',').map(Number);
(async()=>{
  await fs.mkdir(path.join(destination,'props'),{recursive:true});await fs.mkdir(path.join(destination,'previews'),{recursive:true});
  let assets=selected?JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8')).assets:[];
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.exposeFunction('saveModel',async entry=>{
      const p=props.find(p=>p.id===entry.id);assert(p);
      assert(entry.meshCount>0&&Math.abs(entry.minY)<1e-5,`${entry.id} origin ${entry.minY}`);
      assert(entry.size.every(n=>Number.isFinite(n)&&n>0&&n<=.831),`${entry.id} dimensions ${entry.size}`);
      const data=Buffer.from(entry.base64,'base64');assert.equal(data.readUInt32LE(0),0x46546c67);
      const file=`props/prop_${p.id}.glb`,preview=`previews/prop_${p.id}.png`,reference=p.reference?`previews/reference_${p.id}.png`:null;
      await fs.writeFile(path.join(destination,file),data);
      await fs.writeFile(path.join(destination,preview),Buffer.from(entry.preview,'base64'));
      if(reference)await fs.copyFile(path.join(root,p.reference),path.join(destination,reference));
      const asset={id:p.id,name:p.name,type:p.type,chain:p.sonname||p.typename||entry.kind,nextId:p.blessId,file,preview,reference,referenceSource:p.reference,status:'prototype',family:entry.kind,variant:entry.variant,footprint:[1,1],bounds:entry.size,bytes:data.length,meshes:entry.meshCount,triangles:entry.triangles,pixelError:entry.pixelError,animations:[],nodes:[`prop_${p.id}`]};
      assets=assets.filter(a=>a.id!==p.id);assets.push(asset);
      if(assets.length%25===0||selected)console.log(`Verified ${p.id}: ${assets.length} assets, ${data.length} bytes`);
    });
    await page.goto('http://127.0.0.1:58922/merge/');
    await page.waitForFunction(()=>window.mergeDemo,{}, {timeout:60000});
    await page.evaluate(()=>mergeDemo.renderer.setAnimationLoop(null));
    await page.evaluate(async({ids,allIds})=>{
      const {createItemModel,modelIds}=await import('./models.js');
      const {recipes}=await import('./all-models.js');
      if(allIds.length!==modelIds.size||allIds.some(id=>!modelIds.has(id)))throw new Error('Runtime catalog and model recipes differ');
      const {GLTFExporter}=await import('/vendor/addons/exporters/GLTFExporter.js'),{GLTFLoader}=await import('/vendor/addons/loaders/GLTFLoader.js');
      const {mergeGeometries,mergeVertices}=await import('/vendor/addons/utils/BufferGeometryUtils.js');
      const T=await import('three'),renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
      renderer.setSize(384,384);renderer.shadowMap.enabled=false;renderer.toneMapping=T.ACESFilmicToneMapping;
      const scene=new T.Scene(),camera=new T.OrthographicCamera(-.6,.6,.6,-.6,.1,20);camera.position.set(-3,2.5,4);camera.lookAt(0,.415,0);
      scene.add(new T.HemisphereLight(0xffffff,0x867156,2));const light=new T.DirectionalLight(0xffeddb,2.4);light.position.set(-3,6,5);scene.add(light);
      const dispose=obj=>obj.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const mat of [].concat(m.material)){for(const k of ['map','normalMap','roughnessMap','metalnessMap'])mat[k]?.dispose();mat.dispose();}}});
      const gl=renderer.getContext();
      function batchStaticMeshes(root){
        root.updateMatrixWorld(true);const buckets=new Map();
        root.traverse(m=>{if(!m.isMesh)return;const a=m.material;
          const key=a.transparent?m.uuid:JSON.stringify([a.type,a.color.getHex(),a.roughness,a.metalness,a.side,a.depthWrite,a.map?.uuid,m.renderOrder]);
          const geo=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld);
          const bucket=buckets.get(key)||{material:a,order:m.renderOrder,userData:m.userData,geos:[]};bucket.geos.push(geo);buckets.set(key,bucket);
        });
        root.traverse(m=>{if(m.isMesh)m.geometry.dispose();});root.clear();
        for(const bucket of buckets.values()){
          const joined=mergeGeometries(bucket.geos,false);if(!joined)throw new Error('Cannot combine static prop geometry');
          const geometry=mergeVertices(joined),m=new T.Mesh(geometry,bucket.material);m.renderOrder=bucket.order;m.userData={...bucket.userData};root.add(m);
          joined.dispose();bucket.geos.forEach(g=>g.dispose());
        }
      }
      for(const id of ids){
        const model=createItemModel(id,{upright:true});model.name=`prop_${id}`;
        const original=new Uint8Array(384*384*4);scene.add(model);renderer.render(scene,camera);gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,original);scene.remove(model);
        batchStaticMeshes(model);
        const buffer=await new GLTFExporter().parseAsync(model,{binary:true}),loaded=await new GLTFLoader().parseAsync(buffer,'');
        const bounds=new T.Box3().setFromObject(loaded.scene);let meshCount=0,triangles=0;
        loaded.scene.traverse(m=>{if(m.isMesh){meshCount++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;}});
        scene.add(loaded.scene);renderer.render(scene,camera);
        const preview=renderer.domElement.toDataURL('image/png').split(',')[1],pixels=new Uint8Array(original.length);gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const pixelError=pixels.reduce((s,p,i)=>s+Math.abs(p-original[i]),0)/pixels.length;
        if(pixelError>3)throw new Error(`prop_${id} exported appearance differs: ${pixelError}`);
        scene.remove(loaded.scene);let binary='';for(const b of new Uint8Array(buffer))binary+=String.fromCharCode(b);
        await window.saveModel({id,...recipes.get(id),base64:btoa(binary),preview,size:bounds.getSize(new T.Vector3()).toArray(),minY:bounds.min.y,meshCount,triangles,pixelError});
        dispose(model);dispose(loaded.scene);renderer.renderLists.dispose();
      }
      renderer.dispose();
    },{ids:selected||props.map(p=>p.id),allIds:props.map(p=>p.id)});
  }finally{await browser.close();}
  assets.sort((a,b)=>a.id-b.id);
  const manifest={version:3,style:'cartoon-brown-outline-local-wear',castShadow:false,receiveShadow:false,unit:'one grid cell',up:'+Y',forward:'+Z',pivot:'bottom-center',mergeGrid:{rows:9,cols:7},baseGrid:{rows:13,cols:13},initialTerritory:{rows:7,cols:7},assets};
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
  const inventory={props:props.map(p=>({id:p.id,name:p.name,nextId:p.blessId,reference:p.reference,status:assets.some(a=>a.id===p.id)?'prototype-exported':'pending'})),buildings:require('../src/core/config/data/building.json').map(p=>({id:p.id,name:p.name,status:'out-of-this-prop-batch'})),heroes:require('../src/core/config/data/hero.json').map(p=>({key:p.key,name:p.name,status:'out-of-this-prop-batch'})),zombies:require('../src/core/config/data/zombie.json').map(p=>({id:p.id,name:p.name,status:'out-of-this-prop-batch'}))};
  await fs.writeFile(path.join(destination,'inventory.json'),JSON.stringify(inventory,null,2));
  await fs.copyFile(path.join(root,'public/merge-demo/asset-gallery.html'),path.join(destination,'index.html'));
  console.log(`PASS: ${assets.length} GLB prototypes, ${assets.reduce((s,a)=>s+a.bytes,0)} bytes. Runtime ID coverage verified.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
