import {batchChains,remainingChains} from './batch-chains.js';
import * as THREE from 'three';
import { createItemModel, modelIds, VIEW_SLOPE } from './models.js';
import { RoundedBoxGeometry } from '/vendor/addons/geometries/RoundedBoxGeometry.js';

import { wearMap } from './surfaces.js';
import { GLTFLoader } from '/vendor/addons/loaders/GLTFLoader.js';
const voxelMode=new URLSearchParams(location.search).has('voxel');
const toolsMode=voxelMode&&new URLSearchParams(location.search).has('tools');
const batchMode=voxelMode?batchChains.find(c=>new URLSearchParams(location.search).has(c.key)):null;
const huntingMode=voxelMode&&new URLSearchParams(location.search).has('hunting');
const packsMode=voxelMode&&new URLSearchParams(location.search).has('packs');
const terminalsMode=voxelMode&&new URLSearchParams(location.search).has('terminals');
const mediaMode=voxelMode&&new URLSearchParams(location.search).has('media');
const lostMode=voxelMode&&new URLSearchParams(location.search).has('lost');
const cluesMode=voxelMode&&new URLSearchParams(location.search).has('clues');
const mapsMode=voxelMode&&new URLSearchParams(location.search).has('maps');
const keysMode=voxelMode&&new URLSearchParams(location.search).has('keys');
const storageMode=voxelMode&&new URLSearchParams(location.search).has('storage');
const haulersMode=voxelMode&&new URLSearchParams(location.search).has('haulers');
const skillsMode=voxelMode&&new URLSearchParams(location.search).has('skills');
const manualsMode=voxelMode&&new URLSearchParams(location.search).has('manuals');
const commsMode=voxelMode&&new URLSearchParams(location.search).has('comms');
const framesMode=voxelMode&&new URLSearchParams(location.search).has('frames');
const scrapMode=voxelMode&&new URLSearchParams(location.search).has('scrap');
const cartsMode=voxelMode&&new URLSearchParams(location.search).has('carts');
const medicalMode=voxelMode&&new URLSearchParams(location.search).has('medical');
const foodMode=voxelMode&&new URLSearchParams(location.search).has('food');
const drinksMode=voxelMode&&new URLSearchParams(location.search).has('drinks');
const fridgesMode=voxelMode&&new URLSearchParams(location.search).has('fridges');
const glovesMode=voxelMode&&new URLSearchParams(location.search).has('gloves');
const voxelModels=new Map();
if(voxelMode){
  const loader=new GLTFLoader();
  await Promise.all((batchMode?.loadIds??Array.from({length:batchMode?batchMode.count+(batchMode.key==='sacks'?1:0):huntingMode?5:packsMode?5:terminalsMode?4:mediaMode?8:lostMode?6:cluesMode?12:mapsMode?13:keysMode?5:storageMode?11:haulersMode?7:skillsMode?9:manualsMode?4:commsMode?6:framesMode?7:scrapMode||cartsMode?11:medicalMode?4:foodMode?5:drinksMode||fridgesMode?10:glovesMode?3:toolsMode?14:11},(_,i)=>(batchMode?batchMode.start:huntingMode?30072:packsMode?30067:terminalsMode?30063:mediaMode?30055:lostMode?30049:cluesMode?30037:mapsMode?30024:keysMode?30019:storageMode?30008:haulersMode?30001:skillsMode?20069:manualsMode?20065:commsMode?20059:framesMode?20052:scrapMode?20041:cartsMode?20030:medicalMode?20026:foodMode?20021:drinksMode?20011:fridgesMode?20001:glovesMode?10026:toolsMode?10012:10001)+i)).map(async id=>voxelModels.set(id,(await loader.loadAsync(`/models/blender-samples/voxel_32_${id}.glb`)).scene)));
  for(const id of voxelModels.keys())modelIds.add(id);
}
const buildModel=id=>{const model=voxelMode?voxelModels.get(id).clone(true):createItemModel(id);if(voxelMode)model.scale.setScalar(.76);return model;};
let viewAngle=45;

const stage=document.querySelector('#stage'), rows=9, cols=7;
const table=await fetch('/data/prop_prop.json').then(r=>r.json());
const config=new Map(table.map(p=>[p.id,p]));
for(const c of remainingChains)for(const p of c.items)config.set(p.id,{...config.get(p.id),id:p.id,name:p.name,blessId:p.next});
if(voxelMode){
  // Keep the actual 11-level merge links and names from the runtime table.
  document.querySelector('h1').textContent='方块棋子工作台';
  document.querySelector('header small').textContent='32 格 · 7 列 × 9 行 · 试验棋盘';
  document.querySelector('#produce').textContent=batchMode?'添加'+batchMode.first:huntingMode?'添加弹弓':packsMode?'添加补给篮':terminalsMode?'添加旧掌机':mediaMode?'添加旧U盘':lostMode?'添加遗失的眼镜':cluesMode?'添加旧斗篷':mapsMode?'添加碎纸堆':keysMode?'添加钥匙':storageMode?'添加储物篮':haulersMode?'添加旧车轮':skillsMode?'添加拾荒入门':manualsMode?'添加体能手册':commsMode?'添加手绘告示':framesMode?'添加弹簧零件':scrapMode?'添加废橡胶带':cartsMode?'添加废塑料板':medicalMode?'添加酒精喷雾':foodMode?'添加干面包':drinksMode?'添加脏水':fridgesMode?'添加旧保温箱':glovesMode?'添加单只手套':toolsMode?'添加螺丝刀':'添加旧把手';
  document.querySelector('a[href="./compare.html"]').href='/models/blender-samples/voxel.html?chain='+(batchMode?batchMode.key:huntingMode?'hunting':packsMode?'packs':terminalsMode?'terminals':mediaMode?'media':lostMode?'lost':cluesMode?'clues':mapsMode?'maps':keysMode?'keys':storageMode?'storage':haulersMode?'haulers':skillsMode?'skills':manualsMode?'manuals':commsMode?'comms':framesMode?'frames':scrapMode?'scrap':cartsMode?'carts':medicalMode?'medical':foodMode?'food':drinksMode?'drinks':fridgesMode?'fridges':glovesMode?'gloves':toolsMode?'tools':'1');
}
const scene=new THREE.Scene();scene.background=new THREE.Color('#958778');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;stage.prepend(renderer.domElement);
const camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,50);camera.position.set(0,18,18*VIEW_SLOPE);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
if(voxelMode){
  scene.background.set('#273640');
  const controls=document.createElement('div');controls.style.cssText='position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:2;white-space:nowrap';
  controls.setAttribute('aria-label','棋盘视角');
  for(const [angle,label] of [[90,'俯视'],[45,'斜45°'],[30,'斜30°']]){const b=document.createElement('button');b.textContent=label;b.dataset.angle=angle;b.onclick=()=>{viewAngle=angle;setView();resize();};controls.append(b);}
  stage.append(controls);
  function setView(){const a=viewAngle*Math.PI/180,d=20*Math.cos(a)/Math.sqrt(2);camera.up.set(0,viewAngle===90?0:1,viewAngle===90?-1:0);camera.position.set(-d,20*Math.sin(a),d);camera.lookAt(0,0,0);camera.updateMatrixWorld();for(const b of controls.children){b.setAttribute('aria-pressed',String(+b.dataset.angle===viewAngle));b.style.background=+b.dataset.angle===viewAngle?'#9b763b':'#344b59';}}
  setView();
}


scene.add(new THREE.HemisphereLight(0xe1ebee,0x68584a,.85));const light=new THREE.DirectionalLight(0xffedda,3);light.position.set(-4,12,5);light.castShadow=false;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-4.5,right:4.5,top:6,bottom:-6});light.shadow.normalBias=.012;light.shadow.blurSamples=8;light.shadow.radius=3;renderer.shadowMap.type=THREE.PCFSoftShadowMap;scene.add(light);
const boxGeo=new THREE.BoxGeometry(1,1,1);
function box(x,y,z,w,h,d,color){const m=new THREE.Mesh(boxGeo,new THREE.MeshStandardMaterial({color,roughness:.85}));m.position.set(x,y,z);m.scale.set(w,h,d);m.receiveShadow=true;m.castShadow=false;scene.add(m);return m;}
box(0,-1.04,0,100,.1,100,voxelMode?'#273640':'#807a72');
const slab=new THREE.Mesh(new RoundedBoxGeometry(7.48,.76,9.5,3,.1),new THREE.MeshStandardMaterial({color:'#246e99',roughness:.75,metalness:.05,bumpMap:wearMap,bumpScale:.008,roughnessMap:wearMap}));slab.position.y=-.35;slab.castShadow=false;slab.receiveShadow=true;scene.add(slab);
if(voxelMode){slab.material.color.set('#344957');slab.material.bumpMap=null;slab.material.roughnessMap=null;}
box(0,.015,0,7.15,.17,9.15,voxelMode?'#283740':'#795131');
const coords=i=>({x:i%cols-(cols-1)/2,z:Math.floor(i/cols)-(rows-1)/2});
const tileGeometry=new RoundedBoxGeometry(.94,.12,.94,3,.026);
for(let i=0;i<rows*cols;i++){const {x,z}=coords(i);const odd=(i+Math.floor(i/cols))%2;const tile=new THREE.Mesh(tileGeometry,new THREE.MeshStandardMaterial({color:voxelMode?(odd?'#526673':'#617784'):(odd?'#bf904e':'#d5a764'),roughness:.9}));tile.position.set(x,.0875,z);tile.castShadow=false;tile.receiveShadow=true;scene.add(tile);if(!voxelMode&&i%5===0){const scratch=box(x+.29,.149,z+.31,.12,.002,.006,'#90612e');scratch.rotation.y=.45;}}
for(const x of [-3.63,3.63])for(const z of [-4.6,4.6]){box(x,.052,z,.2,.065,.22,'#9b9588');box(x,.09,z,.055,.016,.055,'#474542');}
for(const x of [-2.6,2.6]){box(x,-.21,4.76,.58,.18,.035,'#83745e');for(let i=0;i<4;i++)box(x-.18+i*.12,-.21,4.783,.05,.16,.014,i%2?'#b7a061':'#403e39');}
for(const x of [-2,2]){box(x,-.22,4.81,.55,.07,.1,'#262d2e');}
// Wear stays on the perimeter and cell corners, away from item silhouettes.
for(const side of [-1,1]){
  for(let i=0;i<10;i++){
    const z=-4.15+i*.88;
    const chip=box(side*3.64,.039,z,.13,.009,.09+(i%3)*.06,i%3?'#af7144':'#cad2c8');chip.rotation.y=(i%3-1)*.24;
    box(side*3.739,-.18-(i%2)*.16,z,.014,.09,.15,'#a45b37');
  }
}
for(const [x,z] of [[-3.5,-2.5],[3.5,1.5]]){
  const patch=box(x,.075,z,.29,.07,.72,'#d35636');patch.rotation.y=.09;
  for(const offset of [-.25,.25])box(x,.118,z+offset,.06,.03,.06,'#f0d699');
}
box(.65,-.28,4.77,1.25,.37,.04,'#c74730');
for(let i=0;i<7;i++){const stripe=box(-1.65+i*.18,.058,-4.61,.1,.025,.17,i%2?'#f0bd34':'#293d43');stripe.rotation.y=-.35;}
for(const i of (voxelMode?[]:[10,27,39,51,59])){
  const {x,z}=coords(i);
  const crack=box(x+.32,.15,z-.32,.19,.003,.017,'#775032');crack.rotation.y=-.65;
  const branch=box(x+.23,.15,z-.26,.09,.003,.012,'#775032');branch.rotation.y=.4;
}
const cursor=new THREE.Group();
for(const x of [-.48,.48]){const side=box(x,0,0,.025,.016,.97,'#95f5e4');scene.remove(side);cursor.add(side);}
for(const z of [-.48,.48]){const side=box(0,0,z,.97,.016,.025,'#95f5e4');scene.remove(side);cursor.add(side);}
scene.add(cursor);cursor.visible=false;
document.querySelector('#loading').remove();
const items=Array(rows*cols).fill(null), visuals=new Map();let selected=0,energy=100,merges=0,drag=null,serial=0;
function item(id){return {key:++serial,id};}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',1600);}
function makeVisual(it){const g=new THREE.Group(),model=buildModel(it.id);g.userData.itemKey=it.key;g.add(model);scene.add(g);visuals.set(it.key,{g,model,id:it.id,bounce:0});return visuals.get(it.key);}
function sync(){for(const [key,v]of visuals)if(!items.some(it=>it?.key===key)){scene.remove(v.g);visuals.delete(key);}items.forEach((it,i)=>{if(!it)return;const v=visuals.get(it.key)||makeVisual(it),p=coords(i);if(v.id!==it.id){v.g.remove(v.model);v.model=buildModel(it.id);v.g.add(v.model);v.id=it.id;}if(!drag||drag.key!==it.key){v.g.position.set(p.x,.16,p.z);v.g.rotation.set(0,0,0);}});renderInfo();if(voxelMode){document.querySelector('#selectedIcon').style.display='none';document.querySelector('#produce').disabled=energy<=0;}}
function renderInfo(){const it=items[selected],cfg=it&&config.get(it.id);document.querySelector('#energy').textContent=energy;document.querySelector('#merges').textContent=merges;document.querySelector('#name').textContent=cfg?.name||'空格';document.querySelector('#detail').textContent=!voxelMode&&it?.id===20004?'发射器 · 产出水源':cfg?`合成等级 ${cfg.luna || 1} · ${cfg.blessId?'下一阶：'+config.get(cfg.blessId)?.name:'已达最高等级'}`:'可以放入道具';const img=document.querySelector('#selectedIcon');img.style.visibility=it?'visible':'hidden';if(it)img.src=`/icons/icon_p${it.id}.png`;document.querySelector('#produce').disabled=(!voxelMode&&it?.id!==20004)||energy<=0;const p=coords(selected);cursor.position.set(p.x,.19,p.z);cursor.visible=true;}
function reset(){drag=null;items.fill(null);if(voxelMode){(batchMode?Array.from({length:batchMode.count*2},(_,i)=>batchMode.ids?batchMode.ids[Math.floor(i/2)]:batchMode.start+Math.floor(i/2)):huntingMode?Array.from({length:10},(_,i)=>30072+Math.floor(i/2)):packsMode?Array.from({length:10},(_,i)=>30067+Math.floor(i/2)):terminalsMode?Array.from({length:8},(_,i)=>30063+Math.floor(i/2)):mediaMode?Array.from({length:16},(_,i)=>30055+Math.floor(i/2)):lostMode?Array.from({length:12},(_,i)=>30049+Math.floor(i/2)):cluesMode?Array.from({length:24},(_,i)=>30037+Math.floor(i/2)):mapsMode?Array.from({length:26},(_,i)=>30024+Math.floor(i/2)):keysMode?Array.from({length:10},(_,i)=>30019+Math.floor(i/2)):storageMode?Array.from({length:22},(_,i)=>30008+Math.floor(i/2)):haulersMode?Array.from({length:14},(_,i)=>30001+Math.floor(i/2)):skillsMode?Array.from({length:18},(_,i)=>20069+Math.floor(i/2)):manualsMode?Array.from({length:8},(_,i)=>20065+Math.floor(i/2)):commsMode?Array.from({length:12},(_,i)=>20059+Math.floor(i/2)):framesMode?Array.from({length:14},(_,i)=>20052+Math.floor(i/2)):scrapMode?Array.from({length:22},(_,i)=>20041+Math.floor(i/2)):cartsMode?Array.from({length:22},(_,i)=>20030+Math.floor(i/2)):medicalMode?Array.from({length:8},(_,i)=>20026+Math.floor(i/2)):foodMode?Array.from({length:10},(_,i)=>20021+Math.floor(i/2)):drinksMode?Array.from({length:20},(_,i)=>20011+Math.floor(i/2)):fridgesMode?Array.from({length:20},(_,i)=>20001+Math.floor(i/2)):glovesMode?Array.from({length:24},(_,i)=>10026+Math.floor(i/2)%3):toolsMode?Array.from({length:28},(_,i)=>10012+Math.floor(i/2)):[10001,10001,10002,10002,10003,10003,10004,10004,10005,10005,10006,10006,10007,10007,10008,10008,10009,10009,10010,10010,10011,10011,10001,10002,10003,10004,10005,10006]).forEach((id,i)=>items[i]=item(id));}else{items[0]=item(20004);[20011,20011,20012,20012,20013,20011,20011,20014,20014,20015,30001,30001,30002,30002,30003,30004,30004,30005].forEach((id,i)=>items[i+6]=item(id));}selected=0;energy=100;merges=0;sync();}
function produce(){if(!voxelMode&&items[selected]?.id!==20004)return;const empty=items.findIndex(it=>!it);if(empty<0){toast('棋盘已满');return;}if(energy<=0){toast('体力不足');return;}items[empty]=item(batchMode?batchMode.start:huntingMode?30072:packsMode?30067:terminalsMode?30063:mediaMode?30055:lostMode?30049:cluesMode?30037:mapsMode?30024:keysMode?30019:storageMode?30008:haulersMode?30001:skillsMode?20069:manualsMode?20065:commsMode?20059:framesMode?20052:scrapMode?20041:cartsMode?20030:medicalMode?20026:foodMode?20021:drinksMode?20011:fridgesMode?20001:glovesMode?10026:toolsMode?10012:voxelMode?10001:20011);energy--;sync();visuals.get(items[empty].key).bounce=1;}
function drop(from,to){if(to<0||to===from||!items[from])return false;const a=items[from],b=items[to];if(!b){items[to]=a;items[from]=null;selected=to;}else if(a.id===b.id&&(voxelMode||a.id!==20004)&&config.get(a.id)?.blessId&&(voxelMode?voxelModels.has(config.get(a.id).blessId):modelIds.has(config.get(a.id).blessId))){b.id=config.get(a.id).blessId;items[from]=null;selected=to;merges++;visuals.get(b.key).bounce=1;toast('合成成功');}else{toast('这两个道具不能合成');return false;}return true;}
const ray=new THREE.Raycaster(),point=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),-.15),hit=new THREE.Vector3();
function position(e){const r=renderer.domElement.getBoundingClientRect();point.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(point,camera);ray.ray.intersectPlane(ground,hit);return hit;}
function indexAt(p){const x=Math.floor(p.x+cols/2),z=Math.floor(p.z+rows/2);return x>=0&&x<cols&&z>=0&&z<rows?z*cols+x:-1;}
renderer.domElement.addEventListener('pointerdown',e=>{if(drag)return;const p=position(e);let i=indexAt(p);const meshHit=ray.intersectObjects([...visuals.values()].map(v=>v.g),true)[0];if(meshHit){let object=meshHit.object;while(object&&!object.userData.itemKey)object=object.parent;if(object)i=items.findIndex(it=>it?.key===object.userData.itemKey);}if(i<0)return;const previous=selected;selected=i;renderInfo();if(!items[i])return;drag={pointer:e.pointerId,from:i,key:items[i].key,x:e.clientX,y:e.clientY,moved:false,previous};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(!drag.moved)return;const p=position(e),v=visuals.get(drag.key);v.bounce=0;const lift=.9-.15;v.g.position.set(p.x+(voxelMode?lift*camera.position.x/camera.position.y:0),.9,p.z+lift*(voxelMode?camera.position.z/camera.position.y:VIEW_SLOPE));v.g.rotation.set(.08,.1,-.08);v.g.scale.setScalar(1.14);const i=indexAt(p);if(i>=0){const c=coords(i);cursor.position.set(c.x,.19,c.z);}});
function finish(e,cancel=false){if(!drag||e.pointerId!==drag.pointer)return;const d=drag;drag=null;visuals.get(d.key)?.g.scale.setScalar(1);if(!cancel){if(d.moved)drop(d.from,indexAt(position(e)));else if(!voxelMode&&d.previous===d.from&&items[d.from]?.id===20004)produce();}sync();if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);}
renderer.domElement.addEventListener('pointerup',e=>finish(e));renderer.domElement.addEventListener('pointercancel',e=>finish(e,true));
document.querySelector('#produce').onclick=produce;document.querySelector('#reset').onclick=reset;
if(voxelMode)renderer.domElement.addEventListener('pointerdown',()=>{document.querySelector('#produce').disabled=energy<=0;});
function resize(){const w=stage.clientWidth,h=stage.clientHeight,aspect=w/h;let span=Math.max(rows+.9,(cols+.9)/aspect);if(voxelMode){camera.updateMatrixWorld();let halfX=0,halfY=0;for(const x of [-3.85,3.85])for(const z of [-4.9,4.9])for(const y of [-.9,1]){const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);halfX=Math.max(halfX,Math.abs(p.x));halfY=Math.max(halfY,Math.abs(p.y));}span=Math.max((halfY+.45)*2,(halfX+.3)*2/aspect);}camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(w,h);}
addEventListener('resize',resize);resize();reset();
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;for(const v of visuals.values()){if(v.bounce>0){v.bounce=Math.max(0,v.bounce-dt*2.6);v.g.scale.setScalar(1+Math.sin(v.bounce*Math.PI)*.18);v.g.position.y=.16+Math.sin(v.bounce*Math.PI)*.35;}}renderer.render(scene,camera);});
window.mergeDemo={items,coords,camera,renderer,visuals,get state(){return {energy,merges,selected};}};
