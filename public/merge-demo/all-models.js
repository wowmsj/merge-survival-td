import * as T from 'three';
import * as P from './model-parts.js';
import * as F from './prop-model-families.js';
import * as O from './organic-models.js';
import * as D from './device-models.js';
import {batchIds,buildReferenceModel} from './reference-models.js';
import {addInk,paintedPanel} from './painted-details.js';
const {C,mesh,box,ball,cyl,ring,line,group,handle,cross,panel,crate,bag,bottle,plant,basket,sheet}=P;
export const recipes=new Map();
const range=(a,b,kind)=>{for(let id=a;id<=b;id++)recipes.set(id,{kind,variant:id-a});};
const set=(id,kind,variant=0)=>recipes.set(id,{kind,variant});
range(10001,10011,'storage');range(10012,10025,'tool');range(10026,10028,'glove');
range(20001,20010,'refrigerator');range(20011,20020,'reference');range(20021,20025,'food');range(20026,20029,'medical');range(20030,20040,'salvage');range(20041,20058,'metal');range(20059,20064,'radio');range(20065,20068,'book');range(20069,20077,'medal');
range(30001,30007,'reference');set(30008,'basket',1);range(30009,30018,'furniture');range(30019,30023,'key');range(30024,30036,'map');range(30037,30054,'story');range(30055,30066,'electronics');set(30067,'basket',3);range(30068,30071,'bag');range(30072,30076,'weapon');range(30077,30082,'bird');
range(40001,40010,'pot');range(40011,40018,'seeds');range(40019,40026,'clothing');range(40027,40032,'garden');range(40033,40038,'insect');range(40039,40047,'herbBasket');range(40048,40056,'herbs');
range(50001,50002,'battery');range(50003,50004,'chip');range(50005,50010,'robot');range(50011,50016,'trash');range(50017,50021,'rat');set(50022,'petHome');set(50036,'petHome',1);set(50023,'petHome',2);set(50024,'petHome',2);range(50025,50035,'cat');
range(60001,60015,'machine');range(60016,60020,'upgradeChip');set(60021,'bag',2);set(60022,'watch');set(60023,'medical');range(60024,60031,'core');
range(70001,70017,'blueprintCrate');range(70101,70171,'blueprint');
for(const start of [70201,70205,70209])for(let i=0;i<3;i++)set(start+i,'blueprint',i);
range(101,108,'uiToken');range(201,205,'coin');range(206,209,'gem');set(210,'energy');set(211,'coin',6);range(301,304,'star');set(305,'ticket');set(306,'bag');set(401,'bag',2);range(801,805,'energy');for(let i=0;i<4;i++)set(806+i,'machine',[0,4,7,10][i]);set(901,'gemJar');set(1001,'rewardCrate');set(1002,'rewardCrate',1);range(1003,1006,'scavengerBag');range(1007,1009,'pig');range(1010,1010,'supply');range(2001,2010,'supply');
for(const id of batchIds)set(id,'reference');

function salvage(g,v){
  if(v<2){for(let i=0;i<(v?7:1);i++)box(g,0,.025+i*.05,0,.6,.04,.25,[C.steel,C.red,C.gold,C.green][i%4]);if(v)for(const x of [-.2,.2])line(g,[[x,0,-.15],[x,.37,-.15],[x,.37,.15],[x,0,.15]],.014,C.wood);return;}
  if(v===2){crate(g,1,C.gold);return;}if(v===3){F.storage(g,3);return;}if(v===4){bag(g,2);for(let i=0;i<3;i++)bottle(group(g,-.22+i*.22,.65,0,.3),C.blue);return;}
  const base=buildReferenceModel(v===7?30004:v===9?30007:30004);g.add(base);
  if(v===5){for(let i=0;i<3;i++)crate(group(g,0,.36+i*.25,0,.45),2);}
  if(v===6){base.rotation.x=-.12;}
  if(v===7)for(let i=0;i<5;i++)box(g,0,.39+i*.045,0,.67,.035,.95,C.wood);
  if(v===10){box(g,0,.69,0,.6,.38,.7,C.gold);for(const x of [-.32,.32])line(g,[[x,.4,-.3],[x,1.2,-.3],[x,1.2,.25],[x,.4,.25]],.028,C.steel);box(g,0,1.23,0,.75,.05,.75,C.steel);for(const x of [-.24,.24]){box(g,x,.68,.65,.07,1.15,.07,C.dark);box(g,x,.13,.91,.07,.06,.6,C.dark);}}
}
function story(g,v){
  if(v===0){mesh(g,new T.ConeGeometry(.35,.68,12,1,true),C.dark,0,.34,0);ball(g,0,.72,0,.2,.23,.18,C.dark);ball(g,0,.7,.12,.12,.16,.04,C.edge);return;}
  if(v===1){const pts=[[0,0],[.3,0],[.28,.15],[.1,.5],[.1,.7],[.07,.7],[.07,.49],[.23,.1],[0,.04]];mesh(g,new T.LatheGeometry(pts.map(a=>new T.Vector2(...a)),24),'#a4cbb8');cyl(g,0,.09,0,.24,.08,'#89b753');return;}
  if([2,8,10].includes(v)){D.paper(g,v,v,'book');return;}
  if(v===3){cyl(g,0,.35,0,.08,.64,'#b7d7b7');cyl(g,0,.35,0,.063,.5,'#86be36');cyl(g,0,.71,0,.09,.08,C.wood);ball(g,0,.03,0,.08,.08,.08,'#b7d7b7');g.rotation.z=.4;return;}
  if(v===4){const shape=new T.Shape([[-.35,0],[.35,0],[0,.65]].map(a=>new T.Vector2(...a)));mesh(g,new T.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:1}),C.gold);ball(g,0,.35,.075,.08,.08,.04,C.red);return;}
  if([5,7].includes(v)){box(g,0,.3,0,.63,.58,.03,C.paper);panel(g,0,.32,.023,.54,.4,C.blue);box(g,-.16,.3,.038,.14,.24,.01,C.steel);return;}
  if(v===6){F.key(g,1);return;}if(v===9||v===11){F.electronics(g,v===9?8:10);return;}
  if(v===12){for(const x of [-.15,.15])ring(g,x,.19,0,.135,.012,C.edge);line(g,[[-.02,.22,0],[.02,.22,0]],.01,C.edge);for(const x of [-.28,.28])line(g,[[x,.2,0],[x,.2,-.3]],.012,C.edge);return;}
  if(v===13){cyl(g,0,.04,0,.4,.07,C.wood);cyl(g,0,.2,0,.26,.28,C.paper,.22);ring(g,0,.11,0,.26,.015,C.edge).rotation.x=Math.PI/2;return;}
  if(v===14){for(const x of [-.14,.14]){ball(g,x,.35,0,.15,.24,.12,C.red);box(g,x,.08,0,.23,.16,.19,C.red);ball(g,x+.12,.26,.03,.065,.13,.07,C.red);}return;}
  if(v===15||v===16){basket(g,1);for(let i=0;i<4;i++)box(g,0,.4+i*.07,0,.48,.06,.37,[C.red,C.blue,C.green,C.gold][i]);return;}
  crate(g);for(const x of [-.35,.35])box(g,x,.65,0,.05,.9,.05,C.wood);box(g,0,1.1,0,.8,.25,.09,C.wood);const s=P.stamp(g,'?',C.edge);s.position.set(0,1.1,.05);
}
function trash(g,v){
  if(v===0){mesh(g,new T.DodecahedronGeometry(.3,0),C.paper,0,.25,0);for(let i=0;i<4;i++)line(g,[[-.2,.3,i*.08-.1],[.03,.4,i*.08-.1],[.2,.22,i*.08-.1]],.01,C.wood);return;}
  if(v===1){line(g,[[-.3,.06,0],[.3,.06,0]],.022,C.paper);for(let i=0;i<6;i++)for(const s of [-1,1])line(g,[[-.2+i*.07,.06,0],[-.2+i*.07,.06,s*.13]],.015,C.paper);mesh(g,new T.ConeGeometry(.11,.19,3),C.paper,-.35,.05,0).rotation.z=Math.PI/2;return;}
  if(v===2){cyl(g,0,.22,0,.15,.42,C.red,.21);cyl(g,0,.44,0,.22,.03,C.paper);line(g,[[0,.4,0],[0,.68,0],[.15,.7,0]],.018,C.paper);return;}
  if(v===3){crate(g,1,C.gold);return;}if(v===4){crate(g,1,C.blue);for(let i=0;i<4;i++)box(g,-.22+i*.14,.54,0,.12,.35,.035,C.paper);return;}
  ball(g,0,.3,0,.33,.35,.28,C.dark);cyl(g,0,.66,0,.1,.12,C.edge,.17);for(let i=0;i<3;i++)box(g,-.2+i*.18,.21,.25,.12,.08,.035,C.wood);
}
function medal(g,v){
  const disc=cyl(g,0,.32,0,.33,.075,C.wood);disc.rotation.x=Math.PI/2;ring(g,0,.32,.045,.28,.02,C.gold);
  if(v===5)cross(g,0,.32,.06,.3,C.red);
  else if(v===4){for(const r of [.07,.17])ring(g,0,.32,.06,r,.013,C.red);cross(g,0,.32,.06,.44,C.red);}
  else if(v===0){ring(g,-.04,.38,.07,.12,.021,C.blue);line(g,[[.05,.27,.07],[.19,.13,.07]],.034,C.gold);}
  else if(v===1){box(g,0,.32,.09,.1,.34,.06,C.dark);ball(g,0,.51,.09,.12,.05,.06,C.gold);}
  else if(v===6){for(let i=0;i<3;i++)box(g,0,.19+i*.11,.08,.37,.09,.04,C.paper);}
  else if(v===7){ring(g,0,.28,.09,.16,.02,C.wood);line(g,[[0,.29,.09],[0,.51,.09]],.022,C.paper);}
  else if(v===8)D.currency(group(g,0,.04,.08,.9),0,'badge');
  else if(v===2){box(g,0,.33,.09,.13,.25,.05,C.paper);box(g,.075,.22,.09,.26,.09,.06,C.paper);for(let i=0;i<3;i++)line(g,[[-.06,.3+i*.05,.13],[.05,.3+i*.05,.13]],.009,C.wood);}
  else{ball(g,0,.34,.09,.13,.14,.04,C.paper);for(let i=0;i<4;i++)ball(g,-.09+i*.06,.42,.12,.031,.055,.025,C.paper);}
}
function energyToken(g){
  const disc=cyl(g,0,.34,0,.3,.06,C.blue);disc.rotation.x=Math.PI/2;ring(g,0,.34,.035,.29,.018,C.gold);
  const s=new T.Shape([[-.03,.63],[-.18,.3],[-.01,.3],[-.06,.04],[.19,.4],[.035,.4],[.1,.63]].map(p=>new T.Vector2(...p)));
  mesh(g,new T.ExtrudeGeometry(s,{depth:.045,bevelEnabled:false}),C.gold,0,0,.04);
}
function dress(g){
  const s=new T.Shape([[-.18,.62],[-.3,.48],[-.18,.4],[-.12,.45],[-.1,.3],[-.3,0],[.3,0],[.1,.3],[.12,.45],[.18,.4],[.3,.48],[.18,.62],[.08,.55],[-.08,.55]].map(p=>new T.Vector2(...p)));
  mesh(g,new T.ExtrudeGeometry(s,{depth:.07,bevelEnabled:true,bevelSize:.015,bevelThickness:.01,bevelSegments:1}), '#c86d9a');
  line(g,[[-.18,.63,.03],[0,.73,.03],[.18,.63,.03],[-.18,.63,.03]],.014,C.edge);ring(g,0,.78,.03,.04,.012,C.edge);
}
export function buildFullModel(id){
  const d=recipes.get(id);if(!d)throw new Error(`Unclassified prop ${id}`);
  if(d.kind==='reference')return buildReferenceModel(id);
  const g=new T.Group(),v=d.variant,k=d.kind;g.name=`prop_${id}_${k}`;
  if(F[k])F[k](g,v);
  else if(O[k])O[k](g,v);
  else if(D[k])D[k](g,v);
  else switch(k){
    case 'salvage':salvage(g,v);break;
    case 'story':story(g,v);break;
    case 'trash':trash(g,v);break;
    case 'medal':medal(g,v);break;
    case 'cat':case 'rat':case 'bird':O.animal(g,v,k);break;
    case 'bag':bag(g,v);break;
    case 'scavengerBag':bag(g,v%2+1,v<2?C.blue:C.dark);break;
    case 'basket':basket(g,v);if(v>1)for(let i=0;i<3;i++)bottle(group(g,-.18+i*.18,.3,0,.36),C.gold);break;
    case 'herbBasket':if(v===0)F.metal(g,1);else{basket(g,v>=4?1:0);if(v>=4)for(let i=0;i<3;i++)plant(group(g,-.2+i*.2,.3,0,.5),3,i===1);if(v===6){box(g,0,.48,0,.05,.07,.65,C.red);box(g,0,.48,0,.65,.07,.05,C.red);}}break;
    case 'book':D.paper(g,v,id,'book');break;
    case 'map':D.paper(g,v,id);break;
    case 'blueprint':D.paper(g,id>=70169&&id<70200?3:id<70200?(id-70101)%4:v,id,'blueprint');break;
    case 'blueprintCrate':crate(g);for(let i=0;i<3;i++){const scroll=cyl(g,-.22+i*.22,.7,0,.065,.6,C.paper);scroll.rotation.z=(i-1)*-.25;ring(g,-.22+i*.22,1,0,.04,.01,C.wood).rotation.x=Math.PI/2;}panel(g,0,.3,.335,.25,.27,[C.red,C.steel,C.blue,C.blue,C.green][v%5]);{const s=P.stamp(g,['♜','●','ϟ','❄','♧','✚','⚙','⌂','▣','⚒','♻','▲','✹','≋','▤','▦','▥'][v],C.paper);s.position.set(0,.3,.349);}break;
    case 'upgradeChip':D.chip(g,v+2);break;
    case 'coin':case 'gem':case 'star':D.currency(g,v,k);break;
    case 'uiToken':if(id===103)energyToken(g);else if(id===106)dress(g);else D.currency(g,0,id===102?'gem':id===104?'star':id===105?'badge':'coin');break;
    case 'energy':if(id===210){energyToken(g);break;}if(v===0){ball(g,0,.32,0,.25,.29,.15,C.gold);cyl(g,0,.66,0,.075,.15,C.wood);energyToken(group(g,0,.13,.17,.45));}else if(v===1){bottle(g,C.gold);}else if(v===2){ball(g,0,.32,0,.26,.26,.22,C.gold);cyl(g,0,.64,0,.085,.2,C.wood,.16);for(const x of [-.24,.24])ring(g,x,.47,0,.075,.022,C.wood);}else if(v===3){for(let i=0;i<3;i++){const a=group(g,(i-1)*.2,i===1?.27:0,0,.6);cyl(a,0,.2,0,.17,.4,C.gold);cyl(a,0,.42,0,.18,.025,C.steel);}}else{D.core(g,3);cyl(g,0,.43,0,.22,.38,C.gold);}break;
    case 'gemJar':bottle(g,C.blue);D.currency(group(g,0,.1,.05,.7),1,'gem');break;
    case 'rewardCrate':crate(g,1,v?C.gold:C.wood);{const lid=box(g,0,.71,-.25,.8,.07,.62,C.wood);lid.rotation.x=-1;const emblem=P.stamp(g,v?'ϟ':'$',C.paper);emblem.position.set(0,.32,.335);if(v)energyToken(group(g,0,.44,0,.6));else D.currency(group(g,0,.49,0,.75),3,'coin');}break;
    case 'supply':{
      if(id===2010){box(g,0,.37,0,.55,.7,.5,C.green);box(g,0,.76,0,.6,.09,.55,C.green);for(const x of [-.26,.26])ball(g,x,.05,-.17,.07,.08,.07,C.dark);const s=P.stamp(g,'↻',C.paper);s.position.set(0,.4,.255);break;}
      crate(g,1,C.wood);
      if(id===2004){for(let i=0;i<6;i++)box(g,(i%3-1)*.18,.5+Math.floor(i/3)*.1,0,.15,.13,.17,'#a8d2df');}
      else if(id===2005){for(let i=0;i<3;i++)O.pot(group(g,-.23+i*.23,.5,0,.32),9);}
      else if(id===2008){for(let i=0;i<3;i++)bottle(group(g,-.23+i*.23,.45,0,.43),[C.gold,C.green,C.blue][i]);}
      else if(id===2009){for(let i=0;i<3;i++)box(g,0,.54+i*.07,0,.6,.06,.4,[C.red,C.green,C.blue][i]);}
      else if(id===2006||id===2007){ball(g,-.15,.65,0,.13,.14,.13,C.dark);handle(g,-.15,.77,0,.17,.12,C.dark);F.metal(group(g,.18,.53,0,.48),1);}
      else{for(let i=0;i<3;i++)F.tool(group(g,-.22+i*.22,.4,0,.4),i);}
      break;
    }
    case 'watch':ring(g,0,.38,0,.3,.035,C.gold);const face=cyl(g,0,.38,0,.28,.07,C.paper);face.rotation.x=Math.PI/2;line(g,[[.13,.38,.05],[0,.38,.05],[0,.6,.05]],.012,C.edge);ring(g,0,.76,0,.07,.018,C.gold);break;
    case 'ticket':dress(g);break;
    case 'pig':ball(g,0,.33,0,.35,.28,.3,C.wood);ball(g,0,.34,.28,.24,.22,.18,C.wood);cyl(g,0,.36,.43,.12,.04,C.paper).rotation.x=Math.PI/2;for(const x of [-.07,.07])ball(g,x,.36,.459,.018,.024,.009,C.edge);for(const x of [-.15,.15]){mesh(g,new T.ConeGeometry(.08,.16,3),C.wood,x,.62,.19);ball(g,x,.48,.365,.018,.018,.012,C.edge);for(const z of [-.15,.15])box(g,x,.07,z,.08,.12,.1,C.dark);}box(g,0,.6,0,.22,.01,.035,C.edge);if(v)for(const x of [-.21,.21])line(g,[[x,.1,-.21],[x,.55,-.21],[x,.55,.21],[x,.1,.21]],.023,C.steel);break;
    default:throw new Error(`Missing family ${k} for ${id}`);
  }
  // Some assemblies embed previously outlined components; addInk skips those shells.
  addInk(g);return g;
}
