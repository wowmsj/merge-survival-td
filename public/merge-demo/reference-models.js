import * as THREE from 'three';
import { RoundedBoxGeometry } from '/vendor/addons/geometries/RoundedBoxGeometry.js';
import { paintedPanel, addInk } from './painted-details.js';

export const referenceIds = [20004,20011,20013,30004];
const cache=new Map();
function material(color){if(!cache.has(color))cache.set(color,new THREE.MeshStandardMaterial({color,roughness:.62,metalness:['#9faeac','#c8cebf'].includes(color)?.22:0}));return cache.get(color);}
function mesh(g,geo,color,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);g.add(m);return m;}
function box(g,x,y,z,w,h,d,c){return mesh(g,new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.15),c,x,y,z);}
function lathe(g,points,c){return mesh(g,new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),40),c);}
function tube(g,points,r,c){return mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,8,false),c);}
function cylinder(g,x,y,z,r,h,c){return mesh(g,new THREE.CylinderGeometry(r,r,h,24),c,x,y,z);}
function bolt(g,x,y,z){const b=mesh(g,new THREE.SphereGeometry(.017,8,6),'#514e46',x,y,z);b.scale.z=.45;}
function fridge(g){
  box(g,0,.66,0,.73,1.3,.61,'#727f7d');
  box(g,0,.68,.025,.7,1.28,.64,'#b9bbaa');
  box(g,0,.17,0,.74,.31,.63,'#978273');
  box(g,0,.98,.363,.67,.55,.075,'#e1d4b4');
  box(g,0,.405,.363,.67,.56,.075,'#c5c8b5');
  box(g,0,.69,.355,.71,.022,.02,'#494740');
  for(const y of [.99,.41])tube(g,[[-.225,y+.16,.409],[-.25,y+.13,.455],[-.25,y-.12,.455],[-.225,y-.16,.409]],.019,'#726c5a');
  const plates=[[-.23,.23,.2,.25,'#889b9e'],[.19,.23,.25,.3,'#aa8063'],[.25,1.19,.17,.22,'#91a4a3'],[-.26,.7,.16,.18,'#8e9e9b']];
  for(const[x,y,w,h,c]of plates){box(g,x,y,.41,w,h,.012,c);for(const a of [-1,1])for(const b of [-1,1])bolt(g,x+a*(w/2-.028),y+b*(h/2-.028),.423);}
  for(let i=0;i<6;i++){const p=box(g,-.369,.18+i*.18,-.08+(i%2)*.18,.014,.17,.25,i%2?'#929e9b':'#aa8f78');p.rotation.x=.04;}
  paintedPanel(g,'door',0,.98,.403,.65,.53);
  paintedPanel(g,'door',0,.405,.403,.65,.54);
  box(g,0,1.322,0,.69,.013,.6,'#ded4b8');box(g,.06,1.333,-.07,.25,.014,.3,'#a3aca5');
  paintedPanel(g,'door',0,1.331,0,.67,.57,true);
}
function bottle(g,settled=false){
  const glass=lathe(g,[[0,0],[.24,0],[.28,.04],[.285,.16],[.285,.78],[.26,.88],[.14,1.02],[.125,1.13],[.1,1.13],[.115,1],[.24,.86],[.255,.77],[.255,.06],[0,.06]],'#a9ccbf');
  glass.material=new THREE.MeshPhysicalMaterial({color:'#bbd5c5',transparent:true,opacity:.34,roughness:.16,clearcoat:1,depthWrite:false,side:THREE.DoubleSide});glass.renderOrder=2;
  cylinder(g,0,.365,0,.251,.62,settled?'#7bc9dd':'#9e803c');cylinder(g,0,.684,0,.25,.008,settled?'#b3e3e7':'#b99a53');
  if(settled)cylinder(g,0,.12,0,.252,.15,'#b8a46d');
  const lip=mesh(g,new THREE.TorusGeometry(.251,.017,8,32),'#ddc584',0,.69,0);lip.rotation.x=Math.PI/2;
  const cap=lathe(g,[[.105,1.1],[.156,1.1],[.16,1.21],[.12,1.24],[.099,1.22],[.099,1.15]],settled?'#8db7c2':'#b88a4b');
  cylinder(g,0,1.163,0,.098,.012,'#664726');
  for(let i=0;i<12;i++){const a=-.9+(i%4)*.55;const speck=mesh(g,new THREE.SphereGeometry(.017+(i%3)*.006,8,6),'#705d32',Math.sin(a)*.25,.08+(i%5)*(settled?.016:.11),Math.cos(a)*.25);speck.scale.y=.6;}
  tube(g,[[-.15,.84,.21],[-.18,.76,.225],[-.18,.6,.225]],.016,'#f3f0dc');
}
function kettle(g){
  lathe(g,[[0,.04],[.29,.04],[.38,.1],[.39,.2],[.389,.3],[.375,.43],[.35,.55],[.3,.66],[.24,.735],[.16,.77],[0,.77]],'#9faeac');
  cylinder(g,0,.1,0,.39,.075,'#594b41');cylinder(g,0,.17,0,.395,.025,'#d6d9c9');
  lathe(g,[[0,.76],[.23,.76],[.2,.8],[.09,.86],[0,.86]],'#c8cebf');
  cylinder(g,0,.865,0,.072,.06,'#4c443d');cylinder(g,0,.91,0,.064,.045,'#716557');
  tube(g,[[0,.61,-.27],[0,.92,-.31],[0,1.12,-.19],[0,1.15,.16],[0,.98,.3],[0,.64,.3]],.036,'#4b4038');
  tube(g,[[0,1.105,-.17],[0,1.135,0],[0,1.1,.18]],.061,'#384448');
  const spout=new THREE.Group();spout.position.set(-.31,.42,.03);spout.rotation.z=.65;g.add(spout);
  lathe(spout,[[.14,0],[.13,.16],[.085,.37],[.064,.37],[.095,.14],[.115,.01]],'#c8cebf');
  cylinder(spout,0,.34,0,.064,.012,'#443e37');
  for(const z of [-.28,.3])bolt(g,0,.65,z);
  tube(g,[[.18,.59,.235],[.23,.49,.26]],.019,'#ececda');
  for(let i=0;i<3;i++)box(g,.22-i*.07,.26+i*.025,.3,.032,.052,.014,'#7e8980');
}
function trolley(g){
  box(g,0,.26,0,.82,.08,1.13,'#5c5145');box(g,0,.315,0,.72,.035,1.02,'#98a29a');
  for(const x of [-.4,.4])box(g,x,.35,0,.043,.08,1.16,'#98734e');
  for(const z of [-.56,.56])box(g,0,.35,z,.84,.075,.045,'#98734e');
  for(const x of [-.39,.39])for(const z of [-.39,.39]){
    const tire=mesh(g,new THREE.TorusGeometry(.125,.044,10,24),'#423c38',x,.14,z);tire.rotation.y=Math.PI/2;
    const hub=cylinder(g,x,.14,z,.1,.07,'#99755c');hub.rotation.z=Math.PI/2;
    const axle=cylinder(g,x+(x>0?.043:-.043),.14,z,.037,.015,'#4b433e');axle.rotation.z=Math.PI/2;
  }
  tube(g,[[-.36,.35,-.52],[-.36,1.02,-.6],[.36,1.02,-.6],[.36,.35,-.52]],.027,'#4c443d');
  tube(g,[[-.36,.98,-.59],[0,.98,-.59],[.36,.98,-.59]],.013,'#c6b594');
  tube(g,[[-.37,.35,.5],[-.37,.61,.53],[.37,.61,.53],[.37,.35,.5]],.023,'#615747');
  paintedPanel(g,'bed',0,.335,0,.71,1.01,true);
}
export const batchIds=[20004,...Array.from({length:10},(_,i)=>20011+i),...Array.from({length:7},(_,i)=>30001+i)];
function flask(g){lathe(g,[[0,0],[.28,0],[.3,.05],[.28,.15],[.13,.48],[.11,.75],[.08,.75],[.09,.47],[.25,.1],[0,.07]],'#b0d9da');cylinder(g,0,.11,0,.245,.04,'#78b8c7');tube(g,[[-.19,.12,.18],[-.09,.46,.08]],.012,'#f1f2dc');}
function cleanBottle(g){lathe(g,[[0,0],[.16,0],[.18,.05],[.18,.53],[.1,.65],[.08,.78],[0,.78]],'#51c4e2');cylinder(g,0,.8,0,.09,.08,'#3479a1');tube(g,[[-.1,.12,.15],[-.11,.45,.14],[-.05,.58,.09]],.011,'#ddf7ed');}
function water(g,id){
  if(id===20011||id===20012){bottle(g,id===20012);return;}
  if(id===20013){kettle(g);return;}
  if(id===20014){
    flask(g);box(g,.36,.045,0,.15,.09,.42,'#675147');cylinder(g,.36,.51,0,.023,.93,'#a9b8b4');
    lathe(g,[[.04,.68],[.08,.68],[.08,.78],[.27,1.05],[.29,1.15],[.26,1.15],[.24,1.04],[.05,.8]],'#aec6bf');
    lathe(g,[[.05,.84],[.26,1.1],[.29,1.19],[.25,1.2],[.06,.85]],'#dec69a');tube(g,[[.25,1,0],[.37,1,0]],.018,'#766153');
  }else if(id===20015){flask(g);cylinder(g,0,.77,0,.125,.065,'#aa8352');tube(g,[[0,.79,0],[0,1.03,0],[.17,1.11,0],[.36,1.01,0],[.39,.61,0]],.026,'#b3d8d8');
  }else if(id===20016){
    box(g,-.03,.43,0,.61,.85,.4,'#83cce1');cylinder(g,-.15,.9,0,.105,.1,'#267eb7');
    tube(g,[[.2,.77,.02],[.34,.73,.02],[.35,.48,.02],[.23,.44,.02]],.047,'#d5edf0');
    tube(g,[[-.25,.15,.205],[-.25,.68,.205],[-.08,.78,.15]],.013,'#e1f5e9');
  }else if(id===20017){
    box(g,0,.14,0,.82,.28,.68,'#b78a54');
    for(const x of [-.27,0,.27])for(const z of [-.17,.17]){const b=new THREE.Group();b.scale.setScalar(.62);b.position.set(x,.12,z);g.add(b);cleanBottle(b);}
    for(const x of [-.43,.43]){const flap=box(g,x,.35,0,.24,.025,.7,'#d4ac6f');flap.rotation.z=x>0?-.5:.5;}
  }else if(id===20018){cleanBottle(g);cylinder(g,0,.38,0,.184,.25,'#247aaa');box(g,0,.38,.19,.12,.16,.018,'#c5edf0');
  }else if(id===20019){
    cylinder(g,0,.42,0,.27,.8,'#d9a044');cylinder(g,0,.84,0,.29,.07,'#e9d9b3');cylinder(g,0,.04,0,.28,.055,'#ece0bb');
    box(g,0,.42,.273,.37,.46,.012,'#f1dfae');mesh(g,new THREE.SphereGeometry(.12,12,8),'#c49b5a',0,.34,.3).scale.y=.5;
    tube(g,[[.19,.09,.3],[.45,.18,.29]],.03,'#d4d7c6');mesh(g,new THREE.SphereGeometry(.1,12,8),'#e9ddbd',.18,.09,.32).scale.y=.3;
  }else if(id===20020){
    box(g,0,.45,0,.57,.84,.34,'#71834c');cylinder(g,0,.93,0,.12,.16,'#58633a');
    for(const x of [-.24,.24])tube(g,[[x,.2,.16],[x,.65,.15],[x*.3,.83,.09]],.033,'#434c2e');
    for(const x of [-.14,.14]){box(g,x,.31,.192,.2,.26,.05,'#859056');bolt(g,x,.39,.23);}tube(g,[[.1,.94,0],[.23,.91,0],[.2,.83,0]],.015,'#4b432b');
  }
}
function tire(g,x=0,z=0){
  const wheel=mesh(g,new THREE.TorusGeometry(.29,.09,10,24),'#494540',x,.37,z);wheel.rotation.y=Math.PI/2;
  const hub=cylinder(g,x,.37,z,.23,.13,'#a78358');hub.rotation.z=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const tread=box(g,x,.37+Math.cos(a)*.34,z+Math.sin(a)*.34,.24,.07,.13,i%2?'#696357':'#585448');tread.rotation.x=-a;}
  for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(g,new THREE.SphereGeometry(.025,8,6),'#554733',x-.07,.37+Math.cos(a)*.14,z+Math.sin(a)*.14);}
}
function vehicle(g,id){
  if(id===30001||id===30002){tire(g,-.1);if(id===30002)tire(g,.2,.3);return;}
  if(id===30003){
    for(const x of [-.34,.34]){tube(g,[[x,.15,.55],[x,.15,-.55],[x,.87,-.55]],.028,'#85633f');tube(g,[[x,.15,.3],[x,.55,.3],[x,.55,-.5]],.022,'#85633f');}
    tube(g,[[-.34,.87,-.55],[.34,.87,-.55]],.026,'#b0966c');
    for(const x of [-.37,.37]){const w=mesh(g,new THREE.TorusGeometry(.23,.033,8,24),'#5e4e3c',x,.25,-.15);w.rotation.y=Math.PI/2;for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(g,[[x,.25,-.15],[x,.25+Math.cos(a)*.23,-.15+Math.sin(a)*.23]],.009,'#987649');}}
    return;
  }
  trolley(g);
  if(id===30005){
    for(const x of [-.38,.38])box(g,x,.47,0,.03,.27,1.08,'#918b70');
    for(let i=0;i<7;i++){const tool=box(g,-.24+(i%3)*.22,.65,-.3+Math.floor(i/3)*.25,.055,.56,.055,i%2?'#897253':'#9eaaa4');tool.rotation.z=(i%3-1)*.4;box(g,tool.position.x,.94,tool.position.z,.14,.07,.055,'#84918c');}
    const w=mesh(g,new THREE.TorusGeometry(.17,.055,8,20),'#4a4540',.1,.66,.18);w.rotation.x=.7;
  }else if(id===30006){g.scale.set(1.2,1,1.25);box(g,0,.33,0,.68,.018,1,'#8c9c91');paintedPanel(g,'bed',0,.344,0,.65,.97,true);
  }else if(id===30007){
    for(let i=0;i<8;i++){const x=-.23+(i%2)*.43,z=-.36+(Math.floor(i/2)%2)*.5,y=.5+Math.floor(i/4)*.33;box(g,x,y,z,.37,.3,.42,i%3?'#b99151':'#5a8986');for(const dx of [-.12,.12])box(g,x+dx,y+.005,z+.217,.025,.3,.012,'#ddc086');box(g,x,y+.05,z+.227,.15,.09,.01,'#d5d5af');}
    box(g,.07,1.17,-.14,.36,.3,.36,'#ad8549');
  }
}
export function buildReferenceModel(id){const g=new THREE.Group();if(id===20004)fridge(g);else if(id>=30001)vehicle(g,id);else water(g,id);addInk(g);return g;}
