import * as T from 'three';
import {C,mesh,box,ball,cyl,ring,line,group,bolt,handle,cross,panel,wear,crate,bag,bottle,leaf,plant,basket,sheet,stamp} from './model-parts.js';
import {paintedPanel} from './painted-details.js';

export function tool(g,v){
  if(v===12){box(g,0,.27,0,.12,.54,.09,C.red);box(g,0,.53,0,.23,.25,.12,C.red);line(g,[[-.08,.52,0],[-.18,.72,0],[.02,.82,0]],.043,C.steel);box(g,.035,.66,0,.15,.08,.1,C.steel);cyl(g,.1,.53,0,.043,.17,C.edge);g.rotation.z=.3;return;}
  const color=[C.red,C.wood,C.steel,C.gold,C.wood,C.wood,C.blue,C.gold,C.red,C.red,C.green,C.green,C.red,C.blue][v];
  if([0,1,2,3,4,5,6].includes(v)){
    if(v===2){line(g,[[-.13,0,0],[.15,.65,0],[-.1,.79,0]],.045,C.steel);return;}
    if(v===4){line(g,[[.15,.1,0],[-.17,.1,0],[-.2,.65,0],[.17,.65,0],[.17,.53,0]],.045,C.steel);cyl(g,.14,.25,0,.025,.42,C.steel);box(g,.14,.04,0,.3,.05,.06,C.wood);return;}
    box(g,0,.2,0,.105,.38,.105,color);box(g,0,.53,0,.04,.35,.04,C.steel);
    if(v===0){for(const x of [-.037,.037])box(g,x,.2,.055,.012,.25,.008,C.edge);box(g,0,.72,0,.065,.08,.012,C.steel);}
    if(v===1){box(g,-.02,.73,0,.38,.15,.15,C.steel);line(g,[[.13,.75,0],[.23,.65,0],[.23,.56,0]],.035,C.steel);}
    if(v===3){for(const x of [-.05,.05])line(g,[[0,.65,0],[x,.77,0],[x,.8,.06]],.025,C.steel);}
    if(v===5){handle(g,0,.68,0,.25,.17,C.wood);box(g,0,.39,0,.29,.56,.025,C.steel);for(let i=0;i<10;i++){const tooth=mesh(g,new T.ConeGeometry(.027,.05,3),C.steel,.16,.13+i*.05,0);tooth.rotation.z=-Math.PI/2;}}
    if(v===6){for(const s of [-1,1]){line(g,[[s*.12,.06,0],[s*.16,.27,0],[s*.04,.48,0],[s*.1,.72,0],[s*.04,.77,0]],.038,s<0?C.steel:C.blue);}bolt(g,0,.5,.05);}
  }else{
    const grinder=[8,13].includes(v),saw=[10,11].includes(v);
    box(g,0,.52,0,.22,.22,.47,color);box(g,0,.25,.08,.12,.43,.14,C.edge);box(g,0,.04,.07,.24,.1,.23,color);
    if(saw){const blade=cyl(g,0,.29,.27,.27,.04,C.steel);blade.rotation.x=Math.PI/2;ring(g,0,.29,.298,.12,.01,C.edge);box(g,0,.02,0,.55,.025,.55,C.steel);handle(g,0,.65,0);}
    else if(grinder){cyl(g,0,.32,.3,.21,.07,C.dark);box(g,0,.47,.27,.21,.2,.2,color);handle(g,.19,.4,.1,.26,.04);}
    else{const b=cyl(g,0,.52,.34,.075,.23,C.steel);b.rotation.x=Math.PI/2;line(g,[[0,.52,.44],[0,.52,.64]],.025,C.steel);}
    for(let i=0;i<4;i++)box(g,.113,.52,-.15+i*.07,.006,.07,.024,C.edge);
    wear(g,0,.48,.239,.2,.2);
  }
  g.rotation.z=-.32;
}
export function glove(g,v){
  const one=(x,s)=>{const a=group(g,x,0,0,s),c=v===0?'#ad953e':'#bb965b';box(a,0,.28,0,.28,.35,.08,c);box(a,0,.055,0,.3,.12,.095,C.wood);
    for(let i=0;i<4;i++){const finger=ball(a,-.105+i*.07,.51+(i===1?.05:0),0,.035,.16,.04,c);finger.rotation.z=(i-1.5)*-.12;}
    const thumb=ball(a,-.2,.3,0,.05,.12,.045,c);thumb.rotation.z=.7;
    if(v===2)for(const x of [-.085,0,.085])box(a,x,.32,.05,.06,.17,.025,C.dark);
    wear(a,0,.27,.044,.26,.3);};one(v?-.13:0,1);if(v)one(.16,.9);
}
export function storage(g,v){
  if(v===0){box(g,0,.18,0,.68,.32,.4,C.wood);const lid=cyl(g,0,.34,0,.21,.68,C.wood);lid.rotation.z=Math.PI/2;handle(g,0,.54,0,.3,.12,C.edge);for(const x of [-.28,.28])box(g,x,.2,.22,.07,.33,.035,C.steel);return;}
  if(v===1){box(g,0,.05,0,.8,.1,.6);for(const x of [-.32,.32])box(g,x,.11,0,.08,.06,.6,C.steel);return;}
  if(v===2){crate(g);return;}
  if(v===5){bag(g,1);for(const x of [-.25,0,.25])line(g,[[x,.22,.33],[x,.75,.33]],.022,C.steel);return;}
  if(v===8){box(g,0,.03,0,.8,.06,.8,C.wood);for(let i=0;i<5;i++){const a=group(g,-.27+i*.135,.07,0,.45);tool(a,i);}return;}
  if(v===10){box(g,0,.55,0,.9,.1,.6);for(const x of [-.39,.39])for(const z of [-.24,.24])box(g,x,.27,z,.07,.5,.07);box(g,0,.95,-.28,.9,.7,.06);for(let i=0;i<5;i++)tool(group(g,-.3+i*.15,.66,-.22,.33),i);return;}
  const c=v===6?C.red:v===9?C.dark:C.wood;
  box(g,0,.3,0,.8,.58,.48,c);box(g,0,.61,0,.83,.08,.5,c);
  if([7,9].includes(v)){for(let i=0;i<(v===9?5:2);i++){const y=.11+i*(v===9?.1:.25);panel(g,0,y,.25,.72,v===9?.08:.2,v===9?C.red:C.wood);handle(g,0,y-.02,.28,.3,.04,C.steel);}if(v===9)for(const x of [-.3,.3])for(const z of [-.17,.17])ball(g,x,-.04,z,.05,.07,.05,C.dark);}
  else{handle(g,0,.65,0);for(const x of [-.25,.25])panel(g,x,.43,.25,.06,.13,C.steel);}
  if(v===3){box(g,0,.67,-.19,.8,.06,.46,C.steel).rotation.x=-1;for(let i=0;i<5;i++)ring(g,-.25+i*.12,.63,.05,.045,.012,C.steel);}
  paintedPanel(g,'bed',0,.655,0,.75,.43,true);wear(g,0,.3,.248,.8,.5);
}
export function refrigerator(g,v){
  if(v<2){box(g,0,.27,0,.65,.5,.5,v?C.blue:C.red);box(g,0,.55,0,.68,.09,.53,v?'#91bfc8':'#de997f');handle(g,0,.57,0,.57,.22,C.dark);return;}
  const w=v===8?1:v===9?.88:.6,h=v===8?.55:1.1,c=v===4?'#d0c5a2':C.steel;
  box(g,0,h/2,0,w,h,.52,c);
  const n=v===9?2:1;for(let i=0;i<n;i++){const x=(i-(n-1)/2)*w/n;panel(g,x,h/2,.27,w/n-.03,h-.04,v===5?C.dark:c);handle(g,x-w/n*.3,h*.43,.3,.025,.22,C.edge);}
  if([6,7].includes(v))box(g,0,h*.6,.284,w,.02,.013,C.edge);
  if(v===5)for(let i=0;i<6;i++)bottle(group(g,(i%2-.5)*.22,.11+Math.floor(i/2)*.29,.3,.26),i%2?C.green:C.blue);
  if(v===7)for(const x of [-w/2,w/2])for(let j=0;j<6;j++)bolt(g,x,.08+j*.18,.28);
  for(let i=0;i<4;i++)box(g,-w/2-.003,.13+i*.04,0,.008,.013,.24,C.edge);
}
export function food(g,v){
  if(v===0){ball(g,0,.12,0,.2,.13,.45,'#b56e31');for(let i=0;i<4;i++){const b=box(g,0,.24,-.24+i*.16,.24,.018,.04,'#e5b567');b.rotation.y=.3;}return;}
  if(v===1){cyl(g,0,.08,0,.34,.13,'#c6954c');for(let i=0;i<23;i++){const a=i*2.4,r=.26*Math.sqrt(i/23);cyl(g,Math.cos(a)*r,.15,Math.sin(a)*r,.013,.008,C.wood);}return;}
  if(v===3){cyl(g,0,.23,0,.29,.44,C.wood);cyl(g,0,.46,0,.3,.025,C.steel);ring(g,.07,.482,0,.06,.01,C.dark).rotation.x=Math.PI/2;panel(g,0,.24,.291,.36,.22,C.red);return;}
  box(g,0,.07,0,.48,.13,.7,v===2?C.steel:C.green);for(const z of [-.32,.32])for(let i=0;i<8;i++)box(g,-.21+i*.06,.13,z,.025,.018,.09,C.paper);wear(g,0,.13,.31);
}
export function medical(g,v){
  if(v===0){bottle(g,'#b9d4cf');box(g,0,.86,0,.33,.09,.12,C.red);line(g,[[.08,.83,0],[.04,.71,0]],.024,C.red);return;}
  if(v===3){bag(g,1,C.red);cross(g,0,.67,.27,.22);return;}
  if(v===2){bottle(g,'#aa702c');for(let i=0;i<5;i++)ball(g,.25+(i%2)*.12,.03,.1+Math.floor(i/2)*.12,.055,.025,.03,C.paper);return;}
  crate(g);for(let i=0;i<5;i++){const a=group(g,-.26+i*.13,.35,0);a.rotation.z=(i-2)*.15;box(a,0,.2,0,.1,.4,.025,'#d4a276');cross(a,0,.2,.02,.065,C.red);}
}
export function metal(g,v){
  if(v===0){const r=ring(g,0,.05,0,.26,.04,C.dark);r.rotation.x=Math.PI/2;r.scale.x=.6;return;}
  if([0,1,2,5,11].includes(v)){
    const turns=[1,5,6,4,0,5][v]||7,r=v===0?.22:.25,pts=[];for(let i=0;i<=turns*32;i++){const a=i*Math.PI/16;pts.push([Math.cos(a)*r,i/(turns*32)*(v===5||v===11?.7:.2),Math.sin(a)*r]);}line(g,pts,v===0?.055:.025,v===1?C.wood:C.steel);return;
  }
  if(v===4){ring(g,0,.32,0,.28,.045,C.edge);ring(g,0,.32,0,.09,.025,C.steel);for(let i=0;i<6;i++){const a=i*Math.PI/3;line(g,[[0,.32,0],[Math.cos(a)*.26,.32+Math.sin(a)*.26,0]],.025,C.steel);}return;}
  if(v===6){cyl(g,0,.39,0,.28,.76,'#927557');for(const y of [.03,.26,.52,.77])ring(g,0,y,0,.285,.016,C.steel).rotation.x=Math.PI/2;cyl(g,.14,.79,0,.04,.02,C.dark);return;}
  if(v===12){mesh(g,new T.DodecahedronGeometry(.32,0),C.steel,0,.3,0);return;}
  if([13,14].includes(v)){for(let i=0;i<(v===13?7:12);i++){const a=cyl(g,(i%3-.9)*.09,.06+Math.floor(i/3)*.1,0,.044,.9,C.steel);a.rotation.x=Math.PI/2;}for(const z of [-.29,.29]){const r=ring(g,0,.17,z,.22,.017,C.edge);r.scale.x=.8;}return;}
  if([15,16,17].includes(v)){const h=v===15?.4:.8;for(const x of [-.3,.3])for(const z of [-.3,.3])line(g,[[x,0,z],[x,h,z]],.027,C.steel);for(const y of [0,h])line(g,[[-.3,y,-.3],[.3,y,-.3],[.3,y,.3],[-.3,y,.3],[-.3,y,-.3]],.027,C.steel);for(const z of [-.3,.3]){line(g,[[-.3,0,z],[.3,h,z]],.018,C.edge);line(g,[[.3,0,z],[-.3,h,z]],.018,C.edge);}return;}
  if([3,8].includes(v)){box(g,0,.035,0,.6,.07,.6,C.wood);box(g,-.26,.3,0,.07,.6,.6,C.wood);return;}
  if(v===9){box(g,0,.3,0,.07,.6,.8,C.wood);for(const y of [.02,.6])box(g,0,y,0,.38,.05,.8,C.wood);return;}
  box(g,0,.05,0,.65,.1,.65,C.wood);for(const x of [-.25,.25])for(const z of [-.25,.25])cyl(g,x,.11,z,.025,.02,C.steel);paintedPanel(g,'bed',0,.106,0,.62,.62,true);
}
export function radio(g,v){
  if(v===0){box(g,0,.55,0,.7,.42,.06);box(g,0,.3,0,.06,.8,.06);const s=stamp(g,'SOS',C.red);s.position.set(0,.56,.037);return;}
  if(v===1){const cone=cyl(g,0,.48,0,.27,.38,C.green,.09);cone.rotation.x=Math.PI/2;box(g,0,.2,-.08,.1,.36,.12,C.green);return;}
  box(g,0,.35,0,.8,.63,.32,v===2?C.wood:C.green);panel(g,-.13,.47,.17,.43,.14,C.gold);
  for(let i=0;i<6;i++)box(g,-.15,.12+i*.04,.18,.4,.013,.015,C.edge);
  for(const x of [.18,.29]){const b=cyl(g,x,.27,.19,.043,.025,C.edge);b.rotation.x=Math.PI/2;}
  line(g,[[.25,.66,0],[.34,1.08,0]],.013,C.steel);handle(g,0,.68,0);
  if(v>3)for(const x of [-.4,.4])cyl(g,x,.35,0,.1,.5,C.edge);
  if(v===3){for(const x of [-.3,.3])box(g,x,.2,.25,.18,.23,.14,C.green);line(g,[[-.37,.1,-.19],[-.37,.8,-.19],[.37,.8,-.19],[.37,.1,-.19]],.04,C.wood);}
  if(v===4){ring(g,0,.53,.19,.1,.014,C.gold);box(g,0,.05,.08,.72,.1,.48,C.dark);}
  if(v===5){panel(g,.12,.25,.22,.3,.16,C.dark);for(let i=0;i<4;i++)box(g,-.2+i*.13,.71,0,.07,.04,.08,C.paper);}
}
export function furniture(g,v){
  if(v<4){crate(g);handle(g,0,.23,.34,.25,.07,C.steel);if(v===0)for(let i=0;i<3;i++)box(g,-.12+i*.12,.51,0,.1,.04,.8);return;}
  const n=v===5?4:2,w=v===5||v===7?.85:.65,c=v===9?C.green:C.wood;
  box(g,0,.44,0,w,.86,.48,c);box(g,0,.9,0,w+.06,.055,.53,C.paper);
  if(v<6)for(let i=0;i<n;i++){const x=n===4?(i%2-.5)*.4:0,y=n===4?.23+Math.floor(i/2)*.4:.23+i*.4;panel(g,x,y,.25,n===4?.37:.58,.32,c);handle(g,x,y,.28,.18,.045,C.steel);}
  else{for(const x of [-w*.24,w*.24]){panel(g,x,.44,.25,w*.46,.79,c);handle(g,x*.3,.4,.28,.025,.17,C.gold);}if(v>7){ring(g,0,.44,.29,.14,.025,C.steel);for(const a of [0,2.1,4.2])line(g,[[0,.44,.3],[Math.cos(a)*.13,.44+Math.sin(a)*.13,.3]],.018,C.steel);}}
  if(v===7)for(const x of [-.6,.6]){box(g,x,.27,0,.3,.52,.48,C.wood);for(let j=0;j<3;j++)panel(g,x,.09+j*.16,.25,.27,.14,C.wood);}
}
export function key(g,v){
  if(v<2){for(let i=0;i<(v?3:1);i++){const a=group(g,(i-1)*.1,0,0);a.rotation.z=i*.3;ring(a,0,.65,0,.12,.032,i?C.steel:C.gold);line(a,[[0,.53,0],[0,.06,0]],.028,C.gold);for(const y of [.1,.18])box(a,.045,y,0,.1,.055,.03,C.gold);}return;}
  if(v===4){ring(g,0,.26,0,.25,.05,C.dark).rotation.y=Math.PI/2;box(g,0,.46,.02,.36,.13,.34,C.steel);ring(g,0,.535,0,.12,.018,C.blue).rotation.x=Math.PI/2;return;}
  box(g,0,.055,0,.38,.11,.66,C.dark);panel(g,0,.065,.335,.15,.06,C.red);if(v===3)ring(g,0,.12,0,.12,.017,C.blue).rotation.x=Math.PI/2;else box(g,-.08,.117,.19,.1,.008,.1,C.gold);
}
export function electronics(g,v){
  if(v===0){box(g,0,.06,0,.25,.12,.6,C.steel);box(g,0,.06,.37,.18,.09,.16,C.dark);return;}
  if(v===1){ball(g,0,.15,0,.22,.15,.34,C.paper);line(g,[[0,.3,.18],[0,.3,-.1]],.01,C.edge);line(g,[[0,.03,-.3],[.3,.03,-.45],[.4,.03,.3]],.015,C.edge);return;}
  if(v===2){box(g,0,.12,0,.7,.16,.33,C.dark);for(const x of [-.24,.24])ball(g,x,.1,.15,.13,.1,.22,C.dark);box(g,-.2,.215,0,.16,.025,.04,C.steel);box(g,-.2,.215,0,.04,.025,.16,C.steel);for(const x of [.15,.25])for(const z of [-.06,.05])cyl(g,x,.22,z,.026,.025,C.red);return;}
  const handheld=v>=8||v===4,vr=v===7,w=handheld?.45:.72,h=handheld?.12:.4,d=handheld?.76:.35;
  box(g,0,h/2,0,w,h,d,v===4?C.gold:v>=10?C.green:C.steel);
  if(handheld){box(g,0,h+.004,-.12,w*.8,.016,.33,C.dark);box(g,0,h+.015,-.12,w*.68,.01,.26,C.blue);for(let i=0;i<3;i++)cyl(g,-.12+i*.12,h+.02,.22,.025,.02,C.edge);}
  else if(v===5){const lens=cyl(g,0,.19,.24,.12,.11,C.dark);lens.rotation.x=Math.PI/2;ring(g,0,.19,.3,.085,.013,C.blue);}
  else if(v===6){for(const x of [-.16,.16]){line(g,[[x,.4,0],[x,.75,0]],.035,C.paper);ball(g,x,.74,.035,.07,.09,.09,C.paper);}}
  else{panel(g,0,.23,.19,.52,.2,vr?C.dark:C.wood);for(const x of [-.16,.16])ring(g,x,.22,.212,.07,.012,C.edge);handle(g,0,.4,0,.64,.34);}
  if(v===11)line(g,[[.16,h,-.3],[.16,h+.38,-.3]],.015,C.edge);
}
