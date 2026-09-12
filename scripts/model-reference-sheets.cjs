const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const props=require('../src/core/config/data/prop_prop.json');
(async()=>{
  await fs.mkdir('tmp/model-references',{recursive:true});
  for(let offset=0;offset<props.length;offset+=48){
    const entries=props.slice(offset,offset+48),layers=[];
    for(const [i,p] of entries.entries()){
      const left=(i%6)*150,top=Math.floor(i/6)*170;
      try{layers.push({input:await sharp(`assets/generated/icon_p${p.id}.png`).resize(144,144,{fit:'contain'}).png().toBuffer(),left,top:top+24});}catch{}
      layers.push({input:Buffer.from(`<svg width="150" height="24"><text x="4" y="19" font-size="17">${p.id}</text></svg>`),left,top});
    }
    await sharp({create:{width:900,height:Math.ceil(entries.length/6)*170,channels:4,background:'#d4caba'}}).composite(layers).png().toFile(`tmp/model-references/page-${offset/48+1}.png`);
  }
})();
