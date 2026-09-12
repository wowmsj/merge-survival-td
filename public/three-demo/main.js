import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from '/vendor/addons/geometries/RoundedBoxGeometry.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a69989');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const camera = new THREE.OrthographicCamera();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minZoom = .65; controls.maxZoom = 2.3;
controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI / 2.5;
function home() { camera.position.set(17, 20, 23); controls.target.set(0, .1, 0); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); }
function resize() {
  const aspect = innerWidth / innerHeight;
  const span = aspect < 1 ? 21 / aspect : 16;
  camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
  camera.top = span / 2; camera.bottom = -span / 2;
  camera.near = .1; camera.far = 120; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
resize(); home(); addEventListener('resize', resize);
const ambient = new THREE.HemisphereLight(0xe2e4e6, 0x615044, 2); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffe1bd, 2.5); sun.position.set(-8, 18, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, {left:-13,right:13,top:13,bottom:-13,near:.5,far:60});
sun.shadow.normalBias = .035; sun.shadow.bias = -.0001; scene.add(sun);
const materials = new Map();
const ramp=new THREE.DataTexture(new Uint8Array([100,180,250]),3,1,THREE.RedFormat);ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
function mat(color) { if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({color,gradientMap:ramp})); return materials.get(color); }
const cube = new RoundedBoxGeometry(1,1,1,2,.07);
function box(parent,x,y,z,w,h,d,color) {
  const mesh = new THREE.Mesh(cube,mat(color)); mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function group(x,z) { const g = new THREE.Group(); g.position.set(x,0,z); scene.add(g); return g; }
function beam(parent,a,b,width,color) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const m = box(parent,0,0,0,width,start.distanceTo(end),width,color);
  m.position.copy(start.add(end).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(new THREE.Vector3(...a)).normalize()); return m;
}
const C={grass:'#b09067',grass2:'#c2a57b',soil:'#79604b',stone:'#a2a7a3',dark:'#344b57',wood:'#a57043',edge:'#d0a05f',roof:'#bc5748',cream:'#e0c9a0'};
box(scene,0,-.72,0,200,.1,200,'#a69989');
const route = [];
for(let x=-7;x<=5;x++)route.push([x,4]);
for(let z=3;z>=0;z--)route.push([5,z]);
for(let x=4;x>=-4;x--)route.push([x,0]);
for(let z=-1;z>=-4;z--)route.push([-4,z]);
for(let x=-3;x<=1;x++)route.push([x,-4]);
const routeSet = new Set(route.map(p=>p.join(',')));
const land = new Map(), occupied = new Set(), pickable=[];
for(let x=-7;x<=7;x++)for(let z=-5;z<=5;z++) {
  if((x<-5&&z<-2)||(x>5&&z>3)||(x>4&&z<-3))continue;
  const key=`${x},${z}`, path=routeSet.has(key);
  box(scene,x,-.38,z,.99,.65,.99,C.soil);
  const tile=box(scene,x,-.015,z,.99,.12,.99,path?C.stone:((x*7+z*3)%4===0?C.grass2:C.grass));
  tile.userData.cell=[x,z];pickable.push(tile);land.set(key,tile);
  if(path){for(let a=0;a<2;a++)for(let b=0;b<2;b++)box(scene,x-.245+a*.49,.055,z-.245+b*.49,.46,.035,.46,(x+a+z+b)%3===0?'#b5aa96':'#958b7e');}
  if((x*3+z*7)%5===0){beam(scene,[x-.3,.08,z-.15],[x+.08,.08,z+.07],.018,'#695a4c');beam(scene,[x+.08,.08,z+.07],[x+.19,.08,z+.3],.014,'#695a4c');}
}
function claim(x,z){occupied.add(`${x},${z}`);}
function roof(g,y,w,d) {
  for(const side of [-1,1]){const p=box(g,side*w*.245,y,0,w*.58,.13,d,C.roof);p.rotation.z=side*-.43;
    for(let i=-2;i<=2;i++){const s=box(g,side*w*.245,y+.075,i*d/5,w*.58,.045,.035,i===1?'#976a4f':'#9c8772');s.rotation.z=side*-.43;}}
  box(g,0,y+w*.13,0,.12,.12,d+.1,C.dark);
}
const base = group(2,-3);claim(2,-3);claim(1,-3);claim(2,-2);
box(base,0,.13,0,2.4,.25,2.1,C.stone);box(base,0,.8,0,1.9,1.25,1.55,C.cream);
for(const x of [-.88,.88])for(const z of [-.7,.7])box(base,x,.85,z,.14,1.5,.14,C.wood);
roof(base,1.7,2.5,2);box(base,0,.58,.79,.48,.9,.08,C.dark);
for(const x of [-.6,.6]){box(base,x,1,.81,.32,.35,.05,'#79abb1');box(base,x,1,.85,.035,.38,.05,C.wood);}
box(base,0,.08,1.15,1,.15,.5,C.cream);box(base,.65,2.02,-.3,.27,.65,.32,C.stone);
for(const x of [-.6,.6]){const board=box(base,x,1,.87,.45,.08,.07,C.wood);board.rotation.z=.3;}
box(base,0,1.22,.83,.43,.23,.035,'#d2ac51');
for(const x of [-.13,0,.13]){const stripe=box(base,x,1.22,.854,.045,.22,.01,C.dark);stripe.rotation.z=-.4;}
const rotors=[];
function windmill(x,z){claim(x,z);const g=group(x,z);box(g,0,.1,0,1,.2,1,C.stone);box(g,0,.8,0,.78,1.4,.78,'#5994a0');roof(g,1.55,1.1,1);
  const rotor=new THREE.Group();rotor.position.set(0,1.55,.57);g.add(rotor);rotors.push(rotor);
  for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.z=i*Math.PI/2;rotor.add(arm);box(arm,0,.58,0,.1,1.1,.1,C.wood);box(arm,.13,.7,0,.34,.7,.09,C.cream);box(arm,.13,.98,.01,.34,.12,.11,'#d29043');}
  box(rotor,0,0,.03,.2,.2,.15,C.edge);
}
windmill(-1,-2);windmill(5,-2);
const turrets=[];
function tower(x,z){claim(x,z);const g=group(x,z);box(g,0,.12,0,.9,.24,.9,C.stone);
  for(const a of [-.29,.29])for(const b of [-.29,.29])box(g,a,.72,b,.13,1.25,.13,C.wood);
  beam(g,[-.3,.3,.3],[.3,1.2,.3],.075,C.edge);beam(g,[.3,.3,-.3],[-.3,1.2,-.3],.075,C.edge);
  box(g,0,1.27,0,.95,.15,.95,C.edge);
  for(const a of [-.4,.4])box(g,a,1.48,0,.07,.28,.85,C.wood);
  const head=new THREE.Group();head.position.y=1.5;g.add(head);
  box(head,0,0,0,.26,.3,.65,'#517e94');box(head,0,.06,-.32,1.05,.17,.2,C.wood);box(head,0,.13,-.48,.085,.085,.85,'#f0d38b');
  turrets.push({x,z,head,cooldown:Math.random()});document.querySelector('#towers').textContent=turrets.length;
}
tower(-3,2);tower(3,2);tower(3,-1);tower(-3,-2);
function wall(x,z){claim(x,z);const g=group(x,z);for(let i=-1;i<=1;i++){box(g,i*.28,.4,0,.23,.75,.24,C.wood);box(g,i*.28,.81,0,.17,.12,.18,C.edge);}box(g,0,.4,.17,.96,.12,.12,C.edge);}
for(const x of [-4,-3,-2,-1,0,1,2])wall(x,1);
for(const x of [-2,-1,0,1])wall(x,-1);
const radar=group(0,-3);claim(0,-3);box(radar,0,.32,0,.85,.64,.8,C.dark);box(radar,0,.95,0,.12,.8,.12,C.edge);
const dish=new THREE.Group();dish.position.y=1.38;radar.add(dish);
const bowl=new THREE.Mesh(new THREE.SphereGeometry(.46,10,5,0,Math.PI*2,0,Math.PI/2),mat('#cfdbc8'));bowl.rotation.x=-Math.PI/3;dish.add(bowl);beam(dish,[0,0,0],[0,.3,.45],.045,C.wood);
function tree(x,z){claim(x,z);const g=group(x,z);box(g,0,.4,0,.13,.8,.13,C.wood);beam(g,[0,.45,0],[.28,.85,.1],.065,C.wood);beam(g,[0,.65,0],[-.2,1,.05],.055,C.wood);if((x+z)%2===0){box(g,.08,.85,0,.4,.35,.35,'#857044');box(g,.04,1.08,0,.25,.15,.23,'#a08a57');}}
for(const [x,z]of [[-7,0],[-6,2],[-5,-4],[-2,-5],[4,-3],[7,-1],[6,2],[2,5],[-4,5]])tree(x,z);
for(const [x,z]of [[-5,2],[1,-2],[4,-2],[-2,-3]]){claim(x,z);const g=group(x,z);box(g,0,.25,0,.48,.5,.48,C.edge);for(const a of [-.18,.18])box(g,a,.25,.25,.045,.51,.035,C.wood);box(g,0,.49,0,.5,.03,.5,C.wood);}
for(const [x,z]of [[-5,3],[5,3],[-4,-3],[2,-4]]){const g=group(x+.38,z+.35);box(g,0,.48,0,.06,.95,.06,C.dark);box(g,0,1,0,.19,.23,.19,'#efd592');}

// Salvaged structures and warning paint sit outside the navigable corridor.
for(const [x,z] of [[-6,-1],[6,0],[-6,5]]){
  claim(x,z);const g=group(x,z);
  box(g,0,.17,0,.86,.34,.32,'#777d77');
  for(let i=-2;i<=2;i++){const stripe=box(g,i*.15,.18,.17,.08,.27,.015,i%2?'#303a37':'#bd9f50');stripe.rotation.z=-.3;}
}
for(const [x,z] of [[-5,-3],[6,-3],[4,5]]){
  claim(x,z);const g=group(x,z);
  box(g,0,.32,0,.4,.64,.4,'#885d4c');
  for(const y of [.15,.5])box(g,0,y,0,.43,.045,.43,'#444e49');
  box(g,.34,.13,.17,.26,.26,.33,'#676f6c');
}
// Batch stationary blocks by material; moving mechanisms retain independent transforms.
scene.updateMatrixWorld(true);
const moving = new Set([...rotors, ...turrets.map(t=>t.head), dish]);
const batches = new Map();
scene.traverse(object=>{
  if(!object.isMesh || object.geometry!==cube)return;
  for(let p=object.parent;p;p=p.parent)if(moving.has(p))return;
  if(!batches.has(object.material))batches.set(object.material,[]);
  batches.get(object.material).push(object);
});
for(const [material,objects] of batches){
  const batch=new THREE.InstancedMesh(cube,material,objects.length);
  objects.forEach((object,i)=>{batch.setMatrixAt(i,object.matrixWorld);object.removeFromParent();});
  batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);
}

const enemies=[], shots=[];let running=false,spawned=0,spawnCd=0,kills=0,hp=1000,building=false,night=false;
function humanoid(fast){const g=group(route[0][0],route[0][1]);const skin=fast?'#aaa074':'#8aa078';box(g,0,.49,0,.3,.35,.23,fast?'#b18369':'#647b7e');box(g,0,.82,0,.29,.3,.27,skin);
  for(const x of [-.085,.085])box(g,x,.85,.141,.045,.04,.025,'#253e32');
  const limbs=[];for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.09,.34,0);g.add(leg);box(leg,0,-.16,0,.105,.3,.13,'#53645c');limbs.push(leg);const arm=box(g,side*.22,.52,.09,.11,.3,.13,skin);arm.rotation.x=-.65;}
  return {g,limbs};}
function start(){if(running)return;running=true;spawned=0;spawnCd=0;document.querySelector('#wave').textContent='防守中';document.querySelector('#wave').disabled=true;}
function notice(s){const el=document.querySelector('#notice');el.textContent=s;el.style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.style.display='none',2300);}
function removeEnemy(e){scene.remove(e.g);enemies.splice(enemies.indexOf(e),1);}
function update(dt,t){for(const r of rotors)r.rotation.z-=dt*.8;dish.rotation.y+=dt*.4;
  if(running&&spawned<18){spawnCd-=dt;if(spawnCd<=0){const fast=spawned%4===3;enemies.push({...humanoid(fast),progress:0,speed:fast?1.4:.7,hp:fast?28:42,fast});spawned++;spawnCd=1.2;}}
  for(const e of [...enemies]){e.progress+=dt*e.speed;const i=Math.floor(e.progress);if(i>=route.length-1){hp=Math.max(0,hp-25);removeEnemy(e);continue;}
    const a=route[i],b=route[i+1],f=e.progress-i;e.g.position.set(a[0]+(b[0]-a[0])*f,0,a[1]+(b[1]-a[1])*f);e.g.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);e.limbs.forEach((l,j)=>l.rotation.x=Math.sin(t*(e.fast?13:8)+j*Math.PI)*.5);}
  for(const tower of turrets){tower.cooldown-=dt;const target=enemies.find(e=>Math.hypot(e.g.position.x-tower.x,e.g.position.z-tower.z)<3.6);if(!target)continue;
    tower.head.rotation.y=Math.atan2(target.g.position.x-tower.x,target.g.position.z-tower.z)+Math.PI;
    if(tower.cooldown<=0){tower.cooldown=.65;const from=new THREE.Vector3(tower.x,1.6,tower.z),to=target.g.position.clone().add(new THREE.Vector3(0,.5,0));const mesh=beam(scene,from.toArray(),to.toArray(),.025,'#eee1a9');shots.push({mesh,life:.09});target.hp-=14;if(target.hp<=0){kills++;removeEnemy(target);}}}
  for(let i=shots.length-1;i>=0;i--){shots[i].life-=dt;if(shots[i].life<=0){scene.remove(shots[i].mesh);shots.splice(i,1);}}
  if(running&&spawned===18&&enemies.length===0){running=false;document.querySelector('#wave').disabled=false;document.querySelector('#wave').textContent='下一波';notice('防线守住了');}
  document.querySelector('#hp').textContent=hp;document.querySelector('#kills').textContent=kills;
}
document.querySelector('#wave').onclick=start;
document.querySelector('#build').onclick=()=>{building=!building;document.querySelector('#build').setAttribute('aria-pressed',building);if(building)notice('选择一块空地');};
document.querySelector('#reset').onclick=home;
document.querySelector('#night').onclick=()=>{night=!night;document.body.classList.toggle('night',night);document.querySelector('#night').setAttribute('aria-pressed',night);scene.background.set(night?'#303c3d':'#a69989');ambient.intensity=night?1:2;sun.intensity=night?.8:2.5;sun.color.set(night?'#96bed6':'#ffe1bd');};
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{if(!building||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>8)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(pickable)[0];if(!hit)return;const [x,z]=hit.object.userData.cell,key=`${x},${z}`;if(occupied.has(key)||routeSet.has(key)){notice('这块位置不能建造');return;}tower(x,z);notice('箭塔已就位');});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();notice('画面暂时中断，请刷新重试');});
const clock=new THREE.Clock();let elapsed=0;
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;update(dt,elapsed);controls.update();renderer.render(scene,camera);});
window.demo={scene,camera,renderer,enemies,turrets,start,get state(){return {running,kills,hp,spawned};}};
