import * as T from 'three';
import {C,mesh,box,ball,cyl,ring,line,group,bolt,handle,cross,panel,wear,crate,bag,bottle,leaf,plant,basket,sheet,stamp} from './model-parts.js';
export function pot(g,v){
  if(v===0){for(let i=0;i<5;i++){const pts=[[.2,0],[.3,.2],[.27,.21],[.18,.03],[.2,0]];const a=mesh(g,new T.LatheGeometry(pts.map(p=>new T.Vector2(...p)),12,i*1.1,.8),C.wood,(i%2-.5)*.22,.025,Math.floor(i/2)*.12);a.rotation.z=(i%2-.5)*.4;}return;}
  const c=v===5?C.red:'#b77237',points=[[.19,0],[.27,.02],[.32,.48],[.35,.5],[.35,.56],[.28,.56],[.27,.48],[.22,.08],[.19,.08]];
  const p=mesh(g,new T.LatheGeometry(points.map(a=>new T.Vector2(...a)),24,0,v===1?5.4:Math.PI*2),c);
  if(v===2)line(g,[[.2,.55,.24],[.14,.4,.25],[.2,.25,.24]],.013,C.edge);
  if(v===3)for(const a of [0,2.1,4.2])line(g,[[Math.sin(a)*.28,0,Math.cos(a)*.28],[Math.sin(a)*.36,.55,Math.cos(a)*.36]],.018,C.steel);
  if(v>=7)cyl(g,0,.48,0,.275,.045,C.edge);
  if(v>=8)plant(group(g,0,.5,0,v===8?.5:.7),v===8?1:5);
}
export function seeds(g,v){
  if(v<2){box(g,0,.25,0,.4,.5,.15,C.paper);box(g,0,.52,0,.42,.055,.16,C.wood);plant(group(g,0,.17,.09,.3),1);return;}
  const sack=(a,open)=>{ball(a,0,.24,0,.28,.27,.23,C.wood);cyl(a,0,.49,0,.17,.1,C.paper,.21);ring(a,0,.55,0,.2,.022,C.wood).rotation.x=Math.PI/2;if(!open){line(a,[[-.18,.45,0],[.18,.45,0]],.024,C.edge);box(a,0,.61,0,.18,.12,.18,C.paper);}else cyl(a,0,.52,0,.18,.02,C.edge);wear(a,0,.3,.225,.35,.35);};
  const count=v<5?1:v===5?2:v===6?3:4;for(let i=0;i<count;i++){const a=group(g,(i%2)*.3,Math.floor(i/2)*.27,0,count>1?.8:1);sack(a,v===3||v===4);}
  if(v===3)for(let i=0;i<24;i++){const a=i*2.4,r=.14*Math.sqrt(i/24);ball(g,Math.cos(a)*r,.57,Math.sin(a)*r,.025,.02,.017,i%2?C.gold:C.green);}
}
export function clothing(g,v){
  if(v===3){bag(g,1);return;}
  if(v<3){box(g,0,.035,0,.5,.07,.6,C.wood);if(v===1){const roll=cyl(g,0,.2,0,.18,.5,C.paper);roll.rotation.z=Math.PI/2;ring(g,-.26,.2,0,.12,.012,C.edge).rotation.y=Math.PI/2;}if(v===2)seeds(g,2);return;}
  box(g,0,.38,0,.57,.6,.22,v===4?C.dark:v===5?C.wood:v===6?C.green:C.steel);
  for(const x of [-.23,.23])line(g,[[x,.2,.12],[x,.78,.12],[x,.78,-.12],[x,.2,-.12]],.052,v===7?C.steel:C.wood);
  if(v>5)for(const x of [-.18,0,.18])panel(g,x,.3,.145,.15,.23,v===7?C.steel:C.green);
  if(v===7)for(const x of [-.35,.35])ball(g,x,.67,0,.16,.11,.18,C.steel);
}
export function garden(g,v){
  if(v===0){ball(g,0,.035,0,.3,.06,.22,C.edge);for(let i=0;i<3;i++)ball(g,-.12+i*.13,.12,0,.055,.1,.025,C.gold);return;}
  if(v===1){box(g,0,.07,0,.7,.13,.48,C.steel);for(let i=0;i<6;i++)plant(group(g,(i%3-1)*.22,.13,(Math.floor(i/3)-.5)*.22,.37),1);return;}
  pot(g,7);
  if(v<4)plant(group(g,0,.5,0,.65),v+1,v===2);
  else{line(g,[[0,.45,0],[-.07,.9,0],[0,1.15,0]],.045,C.wood);for(let i=0;i<8;i++){const a=i*2.4,x=Math.cos(a)*.22,z=Math.sin(a)*.22;line(g,[[0,.85,0],[x,1.1,z]],.018,C.wood);if(v===5){for(let j=0;j<6;j++)ball(g,x+Math.cos(j)*.07,1.18,z+Math.sin(j)*.07,.07,.045,.07,j%2?'#edb996':'#e2a080');}else plant(group(g,x,.87,z,.42),4);}}
}
export function insect(g,v){
  const flying=[2,5].includes(v),c=v>3?C.red:'#b6c49a';
  for(let i=0;i<5;i++){ball(g,0,.12+Math.sin(i*.5)*.035,-.23+i*.11,.15-i*.018,.12-i*.012,.1,c);ring(g,0,.12,-.2+i*.11,.11-i*.01,.009,C.edge);}
  ball(g,0,.14,.29,.13,.12,.11,C.gold);for(const x of [-.07,.07])ball(g,x,.18,.38,.023,.026,.012,C.edge);
  if(flying)for(const s of [-1,1]){const wing=ball(g,s*.23,.21,0,.25,.018,.15,'#dace94');wing.rotation.z=s*.28;for(let i=0;i<3;i++)line(g,[[0,.21,0],[s*.4,.26,-.09+i*.09]],.008,C.wood);}
  if(flying)for(const x of [-.08,.08])line(g,[[x,.2,.3],[x*2,.34,.37]],.013,C.edge);
}
export function herbs(g,v){
  if(v===1||v===3){bottle(g,v===1?'#a7c2a3':C.paper);if(v===3)cyl(g,0,.78,0,.17,.03,C.green);return;}
  if(v===4){seeds(g,0);return;}if(v===5){seeds(g,2);return;}
  if(v===6||v===8){crate(g);for(let i=0;i<4;i++)plant(group(g,-.24+i*.16,.3,0,.6),3);if(v===8)cross(g,0,.27,.333,.2,C.red);return;}
  for(let i=0;i<4;i++){const a=group(g,(i-1.5)*.06,0,0,.8);a.rotation.z=(i-1.5)*.2;plant(a,v===0?3:5);}
  line(g,[[-.15,.12,.035],[.15,.12,.035]],.025,C.red);
}
export function animal(g,v,kind='cat'){
  const bird=kind==='bird',rat=kind==='rat',colors=bird?['#3dadcf','#a46a36','#9962b4','#d35736',C.steel,'#d5a3b6']:rat?['#d49492','#7b7374','#958677']:['#c99348','#87939d','#c4ac91','#d8a553','#e3cba6','#9b9789','#b6b4a5','#cd923b','#a68c78','#d49337','#eee0c3'];
  const count=rat&&v>2?v-1:1;
  for(let i=0;i<count;i++){
    const a=group(g,(i%2)*.35,0,Math.floor(i/2)*.3,count>1?.67:1),c=colors[v%colors.length];
    if(rat){
      ball(a,0,.22,-.07,v===2?.28:.22,.2,.32,c);ball(a,0,.24,.25,.15,.14,.2,c);ball(a,0,.19,.4,.085,.07,.09,'#b58e87');
      for(const x of [-.11,.11]){ball(a,x,.36,.21,.06,.07,.025,'#c48e91');ball(a,x,.28,.37,.028,.03,.018,C.edge);for(const z of [-.22,.2])ball(a,x*1.55,.045,z,.07,.045,.11,'#bd8987');}
      line(a,[[0,.15,-.35],[.26,.04,-.48],[.42,.04,-.22],[.43,.07,.14]],.021,'#c58d89');
      for(let j=0;j<6;j++)mesh(a,new T.ConeGeometry(.03,.09,4),c,(j%2-.5)*.18,.41,-.24+Math.floor(j/2)*.11);
      continue;
    }
    ball(a,0,.28,0,bird?.25:.22,bird?.3:.25,rat?.3:.2,c);ball(a,0,.58,rat?.23:.09,bird?.24:.21,bird?.24:.19,.19,c);
    for(const x of [-.095,.095]){ball(a,x,.6,rat?.392:.255,.031,.037,.018,C.edge);ball(a,x-.008,.616,rat?.409:.27,.008,.009,.007,'#fff3d7');ball(a,x,.04,.14,.075,.045,.1,bird?C.gold:c);}
    if(bird){const b=mesh(a,new T.ConeGeometry(.07,.14,4),C.gold,0,.51,.3);b.rotation.x=Math.PI/2;for(const s of [-1,1])ball(a,s*.235,.32,0,.075,.18,.14,c);ball(a,0,.24,.19,.15,.17,.04,C.paper);}
    else{for(const x of [-.15,.15]){if(rat){ball(a,x,.73,.17,.07,.075,.025,'#c18b8a');}else{mesh(a,new T.ConeGeometry(.08,.18,3),c,x,.78,.07);mesh(a,new T.ConeGeometry(.045,.1,3),'#c4938a',x,.8,.09);}}
      ball(a,0,.52,rat?.415:.281,.025,.02,.013,'#b87b72');line(a,[[.1,.18,-.15],[.31,.2,-.31],[.38,.47,-.25],[.31,.6,-.18]],rat?.02:.035,c);
      for(const x of [-.13,.13])line(a,[[x,.5,.28],[x*1.7,.49,.3]],.006,C.edge);
      if(!rat&&[0,3,6,7,9,10].includes(v))for(const x of [-.15,.15])for(let j=0;j<3;j++)line(a,[[x,.67-j*.05,.19],[x*.7,.66-j*.05,.245]],.01,C.edge);
      ball(a,0,.26,.19,.13,.18,.04,v===1?'#a5afb6':C.paper);
      for(const x of [-.12,.12]){line(a,[[x,.32,.14],[x,.08,.18]],.042,v===1?c:C.paper);ball(a,x,.07,-.14,.085,.07,.1,c);}
      if([4,8,10].includes(v))for(const s of [-1,1])ball(a,s*.16,.65,.15,.06,.095,.03,s<0?C.wood:C.dark);
      if(v===7){a.scale.x*=1.3;a.scale.y*=.85;}
      if(v===9)for(let j=0;j<5;j++)for(const s of [-1,1])line(a,[[s*.21,.31+j*.025,-.12],[s*.2,.32+j*.025,0]],.016,C.edge);
    }
    if(bird&&v>0){if(v===2){mesh(a,new T.ConeGeometry(.18,.4,10),c,0,.92,0);line(a,[[.33,0,0],[.33,.79,0]],.02,C.wood);ball(a,.33,.82,0,.07,.08,.07,'#c77ade');}else if(v===5){for(let j=0;j<5;j++)mesh(a,new T.ConeGeometry(.035,.15,4),C.gold,(j-2)*.06,.85,.07);}else{panel(a,-.25,.3,.2,.19,.24,v===4?C.steel:C.red);line(a,[[.32,.1,.1],[.32,.73,.1]],.022,C.steel);}}
    if(!bird&&!rat&&[2,5,8].includes(v)){ring(a,0,.42,.07,.16,.017,C.red).rotation.x=Math.PI/2;ball(a,0,.4,.24,.035,.04,.02,C.gold);}
  }
}
export function petHome(g,v){
  if(v===2){box(g,0,.3,0,.6,.6,.55,C.wood);for(const s of [-1,1]){const roof=box(g,s*.19,.71,0,.48,.04,.69,C.paper);roof.rotation.z=-s*.58;}panel(g,0,.22,.285,.25,.36,C.edge);return;}
  box(g,0,.035,0,.72,.07,.6,C.steel);for(const x of [-.34,.34])for(const z of [-.28,.28])box(g,x,.32,z,.025,.64,.025,C.dark);
  for(let i=0;i<8;i++){const x=-.32+i*.09;for(const z of [-.28,.28])box(g,x,.33,z,.012,.6,.012,C.steel);box(g,x,.64,0,.012,.018,.6,C.steel);}
  for(let i=0;i<6;i++)for(const x of [-.34,.34])box(g,x,.33,-.25+i*.1,.014,.6,.014,C.steel);
  if(v===0)animal(group(g,0,.05,0,.55),1,'rat');
}
