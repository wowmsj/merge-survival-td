import * as T from 'three';
import {RoundedBoxGeometry} from '/vendor/addons/geometries/RoundedBoxGeometry.js';
import {paintedPanel} from './painted-details.js';
export const C={wood:'#a77946',edge:'#584233',steel:'#8eaaa9',dark:'#3d494b',paper:'#e8c98e',red:'#c55b40',blue:'#458ba8',green:'#728454',gold:'#dba541'};
const mats=new Map();
export function mat(c){if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.65,metalness:c===C.steel?.22:0}));return mats.get(c);}
export function mesh(g,geo,c,x=0,y=0,z=0){const m=new T.Mesh(geo,mat(c));m.position.set(x,y,z);g.add(m);return m;}
export function box(g,x,y,z,w,h,d,c=C.wood){const m=mesh(g,new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.15),c,x,y,z);if(w>.32&&h>.27&&[C.wood,C.steel,C.dark,C.red,C.blue,C.green].includes(c))paintedPanel(m,'door',0,0,d/2+.002,w*.93,h*.93);return m;}
export function ball(g,x,y,z,rx,ry,rz,c){const m=mesh(g,new T.SphereGeometry(1,16,10),c,x,y,z);m.scale.set(rx,ry,rz);return m;}
export function cyl(g,x,y,z,r,h,c=C.steel,top=r){return mesh(g,new T.CylinderGeometry(top,r,h,20),c,x,y,z);}
export function ring(g,x,y,z,r,t,c=C.edge){return mesh(g,new T.TorusGeometry(r,t,8,24),c,x,y,z);}
export function line(g,pts,r=.018,c=C.edge){return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),Math.max(8,pts.length*4),r,6,false),c);}
export function group(g,x=0,y=0,z=0,s=1){const a=new T.Group();a.position.set(x,y,z);a.scale.setScalar(s);g.add(a);return a;}
export function bolt(g,x,y,z){ball(g,x,y,z,.014,.014,.008,C.edge);}
export function handle(g,x,y,z,w=.35,h=.18,c=C.edge){line(g,[[x-w/2,y,z],[x-w/2,y+h,z],[x+w/2,y+h,z],[x+w/2,y,z]],.025,c);}
export function cross(g,x,y,z,s=.2,c='#f2dfb5'){box(g,x,y,z,s,.07,.018,c);box(g,x,y,z,.07,s,.019,c);}
export function panel(g,x,y,z,w,h,c=C.blue){const m=box(g,x,y,z,w,h,.016,c);for(const dx of [-1,1])for(const dy of [-1,1])bolt(g,x+dx*(w/2-.025),y+dy*(h/2-.025),z+.012);return m;}
export function wear(g,x,y,z,w=.4,h=.4){for(const [dx,dy] of [[-.38,.3],[.36,-.3],[-.25,-.37]]){const b=box(g,x+dx*w,y+dy*h,z,.04,.014,.004,'#b88d5b');b.rotation.z=.4;}}
export function crate(g,v=1,c=C.wood){
  box(g,0,.04,0,.8,.08,.62,c);
  for(const x of [-.38,.38])box(g,x,.28,0,.055,.48,.62,c);
  for(const z of [-.29,.29])for(let j=0;j<3;j++)box(g,0,.12+j*.15,z,.8,.13,.045,c);
  for(const x of [-.34,.34])for(const z of [-.32,.32]){box(g,x,.28,z,.05,.51,.03,C.edge);bolt(g,x,.47,z+.02);}
  if(v>1){box(g,0,.55,0,.8,.07,.62,c);wear(g,0,.3,.319,.7,.4);}
}
export function bag(g,v=0,c=C.wood){
  box(g,0,.4,0,.62,.75,.36,c);box(g,0,.72,.045,.65,.21,.42,c);handle(g,0,.81,0,.23,.1);
  for(const x of [-.19,.19]){box(g,x,.44,.2,.045,.56,.025,C.edge);box(g,x,.45,.221,.08,.09,.018,C.gold);}
  box(g,0,.2,.25,.39,.23,.12,c);wear(g,0,.72,.267,.6,.2);
  if(v>0)for(const x of [-.38,.38])box(g,x,.25,0,.16,.3,.32,c);
  if(v>1){const roll=cyl(g,0,.94,0,.13,.68,C.green);roll.rotation.z=Math.PI/2;for(const x of [-.21,.21]){const r=ring(g,x,.94,0,.135,.015,C.edge);r.rotation.y=Math.PI/2;}}
  for(const x of [-.29,.29])for(let i=0;i<12;i++)box(g,x,.1+i*.05,.188,.016,.023,.006,C.paper);
  if(v>2){bottle(group(g,.41,.12,.02,.32),C.blue);ring(g,.13,.69,.269,.055,.012,C.steel);}
}
export function bottle(g,c=C.blue,v=0){
  cyl(g,0,.32,0,.22,.57,c);cyl(g,0,.67,0,.22,.15,c,.095);cyl(g,0,.79,0,.09,.14,C.edge);
  panel(g,0,.35,.223,.23,.21,v===1?C.red:C.paper);line(g,[[-.14,.15,.17],[-.14,.48,.17]],.012,'#d9eece');
}
export function leaf(g,x,y,z,s=1,c=C.green,angle=0){const shape=new T.Shape();shape.moveTo(0,-.15);shape.bezierCurveTo(-.13,-.03,-.09,.09,0,.19);shape.bezierCurveTo(.09,.08,.13,-.04,0,-.15);const m=mesh(g,new T.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelThickness:.008,bevelSize:.006,bevelSegments:1,curveSegments:6}),c,x,y,z);m.scale.setScalar(s);m.rotation.z=angle;return m;}
export function plant(g,v=1,flower=false){
  line(g,[[0,0,0],[.03,.3,0],[0,.65+v*.035,0]],.019,C.green);
  for(let i=0;i<3+v*2;i++){const a=i*2.4,y=.14+i/(3+v*2)*.45,r=v>2?.18:.12;leaf(g,Math.sin(a)*r,y,Math.cos(a)*r,1,i%2?'#86a944':'#527d3c',Math.sin(a)*1.1);}
  if(flower)for(let i=0;i<6;i++){const a=i*Math.PI/3;ball(g,Math.cos(a)*.11,.77+Math.sin(a)*.11,0,.075,.075,.035,'#efaa88');}if(flower)ball(g,0,.77,.04,.055,.055,.025,C.gold);
}
export function basket(g,v=0){
  const points=[[.27,0],[.29,.02],[.36,.4],[.33,.4],[.27,.06]];mesh(g,new T.LatheGeometry(points.map(p=>new T.Vector2(...p)),24),C.wood);cyl(g,0,.03,0,.27,.03,C.edge);
  for(let i=0;i<7;i++){const r=ring(g,0,.035+i*.058,0,.3+i*.008,.016,C.paper);r.rotation.x=Math.PI/2;}
  for(let i=0;i<16;i++){const a=i*Math.PI/8;line(g,[[Math.cos(a)*.29,0,Math.sin(a)*.29],[Math.cos(a)*.36,.4,Math.sin(a)*.36]],.012,C.edge);}
  if(v)handle(g,0,.42,0,.59,.4,C.wood);
}
export function sheet(g,v=0,c=C.paper){
  const points=v===0?[[-.36,-.35],[.1,-.35],[.35,-.15],[.32,.34],[-.1,.31],[-.36,.12]]:[[-.38,-.4],[.31,-.4],[.38,-.32],[.38,.4],[-.38,.4]];
  const shape=new T.Shape(points.map(p=>new T.Vector2(...p)));
  const m=mesh(g,new T.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:false}),c);m.rotation.x=-Math.PI/2;
  return m;
}
export function stamp(g,symbol,c=C.paper){
  const cv=document.createElement('canvas');cv.width=cv.height=128;const ctx=cv.getContext('2d');
  ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=4;ctx.font=`bold ${symbol.length>1?48:84}px sans-serif`;ctx.textAlign='center';ctx.fillText(symbol,64,92);
  const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
  const m=new T.Mesh(new T.PlaneGeometry(.4,.25),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));m.userData.paintedDetail=true;g.add(m);return m;
}
