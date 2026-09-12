import * as T from 'three';
import {C,mesh,box,ball,cyl,ring,line,group,bolt,handle,cross,panel,wear,crate,bag,bottle,leaf,plant,basket,sheet,stamp} from './model-parts.js';
export function chip(g,v){
  box(g,0,.035,0,.65,.07,.55,v>1?C.blue:C.green);box(g,0,.1,0,.29,.07,.29,C.dark);box(g,0,.143,0,.24,.015,.24,C.steel);
  for(let i=0;i<8;i++)for(const s of [-1,1]){box(g,s*.35,.04,-.24+i*.068,.065,.025,.018,C.gold);box(g,-.26+i*.074,.04,s*.3,.018,.025,.065,C.gold);}
  if(v>0)for(let i=0;i<5;i++)box(g,-.22+i*.1,.082,.2,.06,.025,.045,i%2?C.gold:C.dark);
  const s=stamp(g,v<2?'CPU':['T','C','E','+','★'][v-2]||'+',C.paper);s.rotation.x=-Math.PI/2;s.position.y=.154;
}
export function battery(g,v){
  const count=v?6:1;for(let i=0;i<count;i++){const a=group(g,(i%3-1)*.18,0,(Math.floor(i/3)-.5)*.25,v?.6:1);cyl(a,0,.35,0,.15,.66,v?C.blue:'#81b847');cyl(a,0,.71,0,.1,.06,C.steel);for(const y of [.03,.64])ring(a,0,y,0,.15,.014,C.edge).rotation.x=Math.PI/2;panel(a,0,.36,.155,.15,.24,C.gold);}
  if(v)for(const y of [.15,.32])box(g,0,y,0,.64,.04,.49,C.dark);
}
export function machine(g,v){
  if(v===7){box(g,0,.5,0,.3,.25,.45,C.wood);box(g,0,.2,-.08,.13,.4,.14,C.dark);cyl(g,0,.5,.36,.1,.3,C.steel).rotation.x=Math.PI/2;ring(g,0,.5,.51,.085,.02,C.dark);panel(g,0,.51,.24,.14,.1,C.gold);return;}
  const charger=v>=4&&v<=6,core=v>=13,high=charger?.95:v===3?.95:.62,c=core?C.dark:v<4?C.red:C.green;
  box(g,0,high/2,0,.65,high,.52,c);box(g,0,high+.025,0,.68,.055,.55,C.wood);
  panel(g,0,high*.62,.273,.42,.24,charger?C.blue:C.dark);for(let i=0;i<3;i++)panel(g,-.2+i*.2,high*.2,.28,.09,.08,i%2?C.gold:C.red);
  for(const x of [-.32,.32])for(let j=0;j<5;j++)box(g,x,high*.4+j*.05,0,.012,.018,.27,C.edge);
  if(charger){for(const x of (v===6?[-.3,.3]:[.3]))line(g,[[x,high*.8,0],[x*1.6,.2,0],[x*1.8,.04,.18],[x,.15,.3],[x,high*.4,.3]],.021,C.edge);}
  else if(v===11){for(const x of [-.25,.25])for(let j=0;j<7;j++)box(g,x,.79,-.22+j*.073,.12,.27,.023,C.wood);cyl(g,0,.77,0,.17,.18,C.gold);}
  else if(core){for(const x of [-.28,.28])line(g,[[x,.1,.24],[x,high+.17,.2],[x,high+.17,-.2],[x,.2,-.24]],.037,v===13?'#8abd58':C.blue);ring(g,0,high+.08,0,.24,.025,C.blue).rotation.x=Math.PI/2;}
  else{handle(g,0,high+.055,0);ring(g,0,high+.06,0,.16,.023,C.dark).rotation.x=Math.PI/2;for(let i=0;i<6;i++){const a=i*Math.PI/3;line(g,[[0,high+.075,0],[Math.cos(a)*.13,high+.075,Math.sin(a)*.13]],.014,C.steel);}}
  if(v===2)for(const x of [-.35,.35]){panel(g,x,.65,0,.3,.32,C.blue).rotation.z=x>0?-.6:.6;}
  if(v===8||v===9){box(g,0,.15,.5,.44,.15,.49,C.dark);for(let i=0;i<7;i++)box(g,0,.23,.3+i*.05,.44,.014,.016,C.steel);mesh(g,new T.ConeGeometry(.18,.28,8),C.steel,0,.88,0);}
  wear(g,0,high*.5,.272,.6,high);
  if(v===0){g.scale.y=.65;line(g,[[.2,.3,.25],[.5,.2,.3],[.55,.04,0],[.28,.04,-.3]],.026,C.edge);}
  if(v===3)for(let j=0;j<3;j++)for(const x of [-.15,.15])panel(g,x,.18+j*.25,.29,.16,.18,C.gold);
  if(v===12){for(const x of [-.2,0,.2]){ring(g,x,.49,.3,.065,.013,C.paper);line(g,[[x,.49,.31],[x+.025,.53,.31]],.007,C.red);}}
}
export function robot(g,v){
  if(v===1){cyl(g,0,.09,0,.38,.17,C.steel);ring(g,0,.18,0,.28,.013,C.edge).rotation.x=Math.PI/2;cyl(g,0,.2,0,.11,.045,C.steel);for(let i=0;i<6;i++)line(g,[[.15,.02,-.15],[.37+i*.012,.02,-.15+i*.02]],.008,C.edge);return;}
  if(v===2){box(g,0,.12,0,.55,.2,.6,C.dark);cyl(g,0,.3,0,.2,.18,C.steel);line(g,[[0,.35,0],[.2,.65,-.2],[.1,.91,.1],[-.12,.7,.23]],.065,C.steel);for(const s of [-1,1])line(g,[[-.12,.7,.23],[-.12+s*.1,.58,.23],[-.12+s*.06,.53,.23]],.023,C.edge);return;}
  box(g,0,.45,0,.39,.4,.24,v===0?C.wood:C.steel);box(g,0,.79,0,.37,.29,.28,v===0?C.wood:C.steel);panel(g,0,.81,.15,.26,.1,C.dark);
  for(const x of [-.085,.085])ball(g,x,.82,.169,.028,.028,.012,C.gold);
  for(const s of [-1,1]){line(g,[[s*.25,.59,0],[s*.31,.39,0],[s*.3,.23,.1]],.05,C.steel);ball(g,s*.26,.56,0,.07,.07,.07,C.edge);line(g,[[s*.12,.25,0],[s*.12,.06,.04]],.055,C.steel);box(g,s*.12,.035,.09,.14,.07,.22,C.edge);}
  if(v===5){panel(g,-.33,.35,.17,.27,.4,C.steel);line(g,[[.3,.3,.1],[.3,.35,.48]],.038,C.dark);}else if(v===3){box(g,0,.48,-.23,.3,.4,.2,C.gold);line(g,[[.3,.26,.1],[.3,.26,.4]],.025,C.wood);}else if(v===4)ball(g,0,.84,.2,.085,.085,.04,C.gold);
  wear(g,0,.48,.125);
}
export function core(g,v){
  if(v===1){const s=new T.Shape([[-.3,-.25],[.25,-.3],[.32,.12],[.08,.37],[-.25,.3]].map(p=>new T.Vector2(...p)));mesh(g,new T.ExtrudeGeometry(s,{depth:.08,bevelEnabled:false}),C.blue,0,.3,0);line(g,[[-.2,.1,.1],[0,.35,.1],[.15,.3,.1]],.02,'#7ddeee');return;}
  if(v===0){cyl(g,0,.3,0,.24,.6,C.steel);for(const y of [.03,.3,.58])ring(g,0,y,0,.25,.025,C.blue).rotation.x=Math.PI/2;return;}
  cyl(g,0,.09,0,.36,.18,C.dark);ring(g,0,.2,0,.3,.035,C.blue).rotation.x=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;box(g,Math.cos(a)*.32,.15,Math.sin(a)*.32,.12,.16,.13,C.steel);}
  if(v>=4){mesh(g,new T.IcosahedronGeometry(.28,1),v===5?C.steel:C.blue,0,.45,0);for(let i=0;i<3;i++){const r=ring(g,0,.45,0,.3,.022,'#8bd7e8');r.rotation.set(i*1.04,0,i*.7);}}
  else if(v===3)ring(g,0,.31,0,.26,.04,C.steel).rotation.x=Math.PI/2;
}
export function weapon(g,v){
  if(v===0){line(g,[[0,0,0],[0,.45,0],[-.2,.75,0]],.047,C.wood);line(g,[[0,.4,0],[.2,.75,0]],.047,C.wood);line(g,[[-.2,.75,0],[0,.43,.1],[.2,.75,0]],.012,C.edge);return;}
  if(v===1||v===2){line(g,[[-.35,.05,0],[-.48,.4,0],[-.35,.85,0]],.028,C.wood);line(g,[[-.35,.05,0],[-.35,.85,0]],.007,C.paper);line(g,[[-.35,.45,0],[.35,.45,0]],.012,C.wood);if(v===2)box(g,0,.4,0,.12,.72,.14,C.dark);return;}
  box(g,0,.3,0,.13,.55,.12,v===3?C.wood:C.green);line(g,[[0,.55,0],[0,1.02,0]],.025,C.dark);box(g,.1,.18,0,.12,.17,.1,C.wood);if(v===4){box(g,-.07,.37,0,.12,.3,.1,C.dark);line(g,[[0,.6,.08],[0,.81,.08]],.034,C.steel);}g.rotation.z=-.55;
}
export function currency(g,v,kind){
  const count=Math.min(18,1+v*3);
  for(let i=0;i<count;i++){const x=count===1?0:(i%3-1)*.18,z=count===1?0:(Math.floor(i/3)%2-.5)*.22,y=.04+Math.floor(i/6)*.06;
    if(kind==='coin'){cyl(g,x,y,z,.12,.04,C.gold);ring(g,x,y+.025,z,.095,.009,C.paper).rotation.x=Math.PI/2;}
    else if(kind==='gem')mesh(g,new T.OctahedronGeometry(.17,0),C.blue,x,y+.1,z);
    else{const s=new T.Shape();for(let j=0;j<10;j++){const a=j*Math.PI/5+Math.PI/2,r=j%2?.12:.23;j?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}mesh(g,new T.ExtrudeGeometry(s,{depth:.06,bevelEnabled:true,bevelThickness:.012,bevelSize:.015,bevelSegments:1}),kind==='star'?C.green:C.gold,x,.25+Math.floor(i/3)*.09,z);}
  }
}
export function paper(g,v,id,kind='map'){
  if(kind==='map'&&v<2){for(let i=0;i<(v?4:12);i++){const a=group(g,(i%4-1.5)*.16,Math.floor(i/4)*.014,(Math.floor(i/4)-1)*.18,v?.37:.22);a.rotation.y=i*.7;sheet(a,0,C.paper);}return;}
  const blue=kind==='blueprint',gold=blue&&v===3;
  sheet(g,v,blue?(gold?C.paper:v===0?'#547c91':'#99bdd0'):C.paper);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.strokeStyle=blue?(gold?'#826442':'#31546a'):'#977245';c.lineWidth=2;
  if(blue){for(let i=16;i<250;i+=16){c.globalAlpha=.3;c.beginPath();c.moveTo(i,0);c.lineTo(i,256);c.moveTo(0,i);c.lineTo(256,i);c.stroke();}c.globalAlpha=1;
    const category=id>=70200?18+Math.floor((id-70201)/4):id>=70169?id-70151:Math.floor((id-70101)/4)+1;
    c.lineWidth=3;c.strokeRect(66,100,124,106);c.strokeRect(53,86,150,16);c.beginPath();c.moveTo(60,85);c.lineTo(128,42);c.lineTo(196,85);c.stroke();
    if([1,2,3,4].includes(category)){c.strokeRect(104,43,48,30);c.beginPath();c.moveTo(130,43);c.lineTo(130,22);c.lineTo(182,22);c.stroke();}
    else if(category>=12&&category<=14)for(let j=0;j<6;j++){c.beginPath();c.moveTo(66+j*22,176);c.lineTo(76+j*22,110);c.stroke();}
    else if(category>=15)for(let y=115;y<205;y+=22){c.beginPath();c.moveTo(66,y);c.lineTo(190,y);c.stroke();}
    else{c.strokeRect(92,132,30,72);c.strokeRect(144,125,25,25);}
    // Center symbol distinguishes tactical blueprint families, including the three support buildings.
    c.clearRect(84,105,88,90);c.lineWidth=4;
    if(category===18){for(let j=0;j<3;j++){c.strokeRect(95+j*24,130,16,48);c.beginPath();c.moveTo(95+j*24,130);c.lineTo(103+j*24,118);c.lineTo(111+j*24,130);c.stroke();}}
    else if(category===19){c.beginPath();c.arc(128,140,32,0,Math.PI);c.moveTo(128,140);c.lineTo(158,108);c.moveTo(128,169);c.lineTo(128,198);c.stroke();}
    else if(category===20){c.beginPath();c.moveTo(109,113);c.lineTo(98,139);c.lineTo(130,171);c.lineTo(149,150);c.lineTo(119,120);c.stroke();}
    else if(category===6){c.strokeRect(120,124,16,64);c.strokeRect(96,148,64,16);}
    else if(category===7){c.beginPath();c.moveTo(128,128);c.lineTo(128,204);for(let i=0;i<3;i++){const a=i*2.094;c.moveTo(128,128);c.lineTo(128+Math.cos(a)*43,128+Math.sin(a)*43);}c.stroke();}
    else if(category===2){c.strokeRect(106,154,46,25);c.strokeRect(126,139,57,13);}
    else if(category===3){for(let j=0;j<4;j++){c.beginPath();c.ellipse(128,130+j*13,24,6,0,0,Math.PI*2);c.stroke();}}
    else if(category===4){for(let j=0;j<3;j++){const a=j*Math.PI/3;c.beginPath();c.moveTo(128-Math.cos(a)*29,151-Math.sin(a)*29);c.lineTo(128+Math.cos(a)*29,151+Math.sin(a)*29);c.stroke();}}
    else{c.strokeRect(98,135,60,50);for(let j=0;j<3;j++)c.strokeRect(104+j*17,145,9,17);}
    c.font='14px monospace';c.fillStyle=c.strokeStyle;c.fillText(String(id),85,234);
  }else if(kind==='book'){
    c.fillStyle=['#d6be85','#528599','#738458','#33383a'][v%4];c.fillRect(0,0,256,256);c.strokeStyle='#ead1a0';c.lineWidth=5;c.strokeRect(12,12,232,232);
    c.beginPath();c.arc(126,68,14,0,Math.PI*2);c.moveTo(126,84);c.lineTo(126,135);c.lineTo(92,185);c.moveTo(126,132);c.lineTo(170,176);c.moveTo(126,105);c.lineTo(89,124);c.moveTo(127,105);c.lineTo(163,90);c.stroke();
    for(let j=0;j<3;j++){c.beginPath();c.moveTo(60,209+j*9);c.lineTo(196,209+j*9);c.stroke();}
  }else{
    c.fillStyle=v>=11?'#cfab5d':'#c8ae71';c.beginPath();for(let i=0;i<18;i++){const a=i*Math.PI/9,r=65+Math.sin(i*2.2+v)*24;const x=130+Math.cos(a)*r,y=122+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();c.stroke();
    if(v===7||v===8){c.strokeStyle='#faf0c7';c.lineWidth=9;for(let j=0;j<5;j++){c.beginPath();c.moveTo(24+j*44,0);c.lineTo(50+j*30,256);c.moveTo(0,20+j*50);c.lineTo(256,50+j*38);c.stroke();}}
    if(v>6){c.strokeStyle='#659fa7';c.lineWidth=7;c.beginPath();c.moveTo(95,0);c.bezierCurveTo(190,100,40,170,115,256);c.stroke();}
    if(v===12){c.strokeStyle='#ad493a';c.lineWidth=5;c.beginPath();c.moveTo(164,87);c.lineTo(188,111);c.moveTo(188,87);c.lineTo(164,111);c.stroke();}
  }
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const m=new T.Mesh(new T.PlaneGeometry(.61,.67),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.026;m.userData.paintedDetail=true;g.add(m);
  if(gold||v===5)for(const x of [-.38,.38]){const roll=cyl(g,x,.065,0,.045,.88,gold?C.gold:C.paper);roll.rotation.x=Math.PI/2;for(const z of [-.46,.46])ball(g,x,.065,z,.055,.055,.055,gold?C.gold:C.wood);}
  if(kind==='book'){box(g,0,-.06,0,.8,.1,.85,C.edge);box(g,-.38,.01,0,.05,.14,.85,C.wood);}
  if(kind==='map'&&v===6)for(let i=0;i<5;i++){const x=(i%3-1)*.19,z=(Math.floor(i/3)-.5)*.28;box(g,x,.09,z,.13,.13,.17,C.paper);box(g,x,.17,z,.15,.04,.19,C.red);}
}
