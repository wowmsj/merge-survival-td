import * as T from 'three';
import {GLTFLoader} from '/vendor/addons/loaders/GLTFLoader.js';
const {assets}=await fetch('./manifest.json').then(r=>r.json());
const names={1:'工具与手套',2:'冷藏·水源·物资',3:'推车·储物·探索',4:'植物·草药·护甲',5:'电子·动物',6:'功能设备·核心',7:'建筑蓝图'};
for(const type of new Set(assets.map(a=>a.type))){const option=document.createElement('option');option.value=type;option.textContent=names[type]||`奖励 / ${type}`;document.querySelector('#type').append(option);}
document.querySelector('h1').textContent=`全量棋子模型 / ${assets.length} 件`;
const dialog=document.querySelector('#viewer'),stage=document.querySelector('#stage');
let renderer,scene,camera,model,request=0,page=0;
function draw(){if(renderer&&model)renderer.render(scene,camera);}
function dispose(root){root?.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const mat of [].concat(m.material)){mat.map?.dispose();mat.dispose();}}});}
async function view(asset){
  const current=++request;dialog.showModal();document.querySelector('#modelName').textContent='加载中…';
  if(!renderer){renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(480,480);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=false;stage.append(renderer.domElement);scene=new T.Scene();scene.background=new T.Color('#d4caba');scene.add(new T.HemisphereLight(0xffffff,0x867156,2));const light=new T.DirectionalLight(0xffeddb,2.4);light.position.set(-3,6,5);scene.add(light);camera=new T.OrthographicCamera(-.6,.6,.6,-.6,.1,20);camera.position.set(-3,2.5,4);camera.lookAt(0,.415,0);}
  if(model){scene.remove(model);dispose(model);model=null;renderer.render(scene,camera);}
  try{const gltf=await new GLTFLoader().loadAsync(asset.file);if(current!==request){dispose(gltf.scene);return;}model=gltf.scene;scene.add(model);document.querySelector('#angle').value=0;document.querySelector('#modelName').textContent=`${asset.id} · ${asset.name}`;draw();}catch(e){document.querySelector('#modelName').textContent='加载失败：'+e.message;}
}
function filter(){
  const q=document.querySelector('#search').value.trim().toLowerCase(),t=document.querySelector('#type').value;
  const match=assets.filter(a=>(!t||String(a.type)===t)&&`${a.id} ${a.name}`.toLowerCase().includes(q));
  page=Math.min(page,Math.max(0,Math.ceil(match.length/24)-1));const cards=document.querySelector('#cards');cards.replaceChildren();
  for(const a of match.slice(page*24,page*24+24)){
    const article=document.createElement('article'),title=document.createElement('h2'),pair=document.createElement('div');title.textContent=`${a.id} · ${a.name}`;pair.className='pair';
    for(const [src,label] of [[a.reference,'原图'],[a.preview,'GLB 预览']]){const el=document.createElement(src?'img':'span');if(src){el.src=src;el.alt=label;}else{el.className='missing';el.textContent='无对应原图';}pair.append(el);}
    const link=document.createElement('a');link.href=a.file;link.download='';link.textContent='下载 GLB';const button=document.createElement('button');button.textContent='查看 3D';button.onclick=()=>view(a);article.append(title,pair,link,button);cards.append(article);
  }
  document.querySelector('#count').textContent=` ${match.length} 件 · ${page+1}/${Math.max(1,Math.ceil(match.length/24))}`;
  document.querySelector('#prev').disabled=page===0;document.querySelector('#next').disabled=(page+1)*24>=match.length;
}
for(const id of ['search','type'])document.getElementById(id).oninput=()=>{page=0;filter()};
document.getElementById('prev').onclick=()=>{page--;filter()};document.getElementById('next').onclick=()=>{page++;filter()};
document.querySelector('#angle').oninput=e=>{if(model){model.rotation.y=Number(e.target.value)*Math.PI/180;draw();}};
document.querySelector('#close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{request++;if(model){scene.remove(model);dispose(model);model=null;}});
filter();window.modelGalleryReady=assets.length;
