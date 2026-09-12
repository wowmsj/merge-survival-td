export const batchChains = [
  {
    "key": "birds",
    "seq": 24,
    "start": 30077,
    "count": 6,
    "title": "小鸟手办",
    "first": "小鸟精灵",
    "detail": "精灵、游侠、法师、勇者、骑士、公主；通过主色、服饰和装备拉开等级。"
  },
  {
    "key": "pots",
    "seq": 25,
    "start": 40001,
    "count": 10,
    "title": "花盆培育",
    "first": "破碎花盆",
    "detail": "碎片、残盆、修补、泥胚、上色、空盆、培土、小苗、绿植。"
  },
  {
    "key": "seeds",
    "seq": 26,
    "start": 40011,
    "count": 4,
    "title": "种子补给",
    "first": "小种子包",
    "detail": "薄纸包、加量纸包、扎口大袋、满装种子袋。"
  },
  {
    "key": "sacks",
    "seq": 27,
    "start": 40015,
    "count": 4,
    "title": "空种子袋",
    "first": "空种子袋",
    "detail": "空袋、两袋、捆扎叠袋、成堆袋。末级在棋盘继续合成为下一条的麻袋布。"
  },
  {
    "key": "armor",
    "seq": 28,
    "start": 40019,
    "count": 8,
    "title": "布料护甲",
    "first": "麻袋布",
    "detail": "布片、布卷、布袋、背包、防弹夹层、自制衣、加固衣、重甲。"
  },
  {
    "key": "plants",
    "seq": 29,
    "start": 40027,
    "count": 6,
    "title": "绿植培育",
    "first": "种子",
    "detail": "种子、育苗盘、带花小苗、绿植、发财树、开花树。"
  },
  {
    "key": "moths",
    "seq": 30,
    "start": 40033,
    "count": 6,
    "title": "变异昆虫",
    "first": "变异幼虫",
    "detail": "幼虫、蛹、成虫、荧光飞蛾、赤翼飞蛾、萤后；后三级按正式名称制作。"
  }
];
const remainingResponse=await fetch('/models/blender-samples/remaining-chains.json');
if(!remainingResponse.ok)throw new Error('模型目录加载失败');
export const remainingChains=await remainingResponse.json();
const displayTitles=['药草篮','草药补给','机器人','废弃物','变异鼠','小猫窝','猫咪','应急电源','充电桩','拆解器','超频器','强化芯片','超级强化芯片','全能强化芯片','战术背包','老式怀表','强力清洁剂','合成核心'];
for(const c of remainingChains){
 const entries=c.seq>=66?[...c.items.slice(1),c.items[0]]:c.items;
 const ids=entries.map(p=>p.id);
 const spawn=entries.find(p=>p.next)?.id??ids[0];
 const extras=entries.filter(p=>p.next&&!ids.includes(p.next)).map(p=>p.next);
 batchChains.push({...c,title:displayTitles[c.seq-31]??c.title,items:entries,ids,loadIds:[...new Set([...ids,...extras])],start:spawn,count:ids.length,first:entries.find(p=>p.id===spawn).name,detail:c.seq>=49?'按正式名称和合成关系展示；发射器单独标注，不计作合成等级。':entries.map(p=>p.name).join(' → '),overview:'remaining.html'});
}
