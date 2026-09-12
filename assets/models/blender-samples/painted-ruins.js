import * as T from 'three';

function makeMap(renderer, base, light, dark) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const ctx=canvas.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,192,192);
  let seed=base.length*9983;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<140;i++){
    ctx.fillStyle=i%4?light:dark;ctx.globalAlpha=.06+rand()*.12;
    const x=rand()*192,y=rand()*192,w=3+rand()*18,h=1+rand()*5;
    ctx.fillRect(x,y,w,h);ctx.strokeStyle=dark;ctx.lineWidth=.7;ctx.strokeRect(x,y,w,h);
  }
  ctx.globalAlpha=1;
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return map;
}

export function applyPaintedRuins(root, renderer) {
  const styles={
    stone:makeMap(renderer,'#9c8765','rgba(245,222,176,1)','rgba(76,55,39,1)'),
    dark:makeMap(renderer,'#665b4b','rgba(173,154,117,1)','rgba(47,40,33,1)'),
    light:makeMap(renderer,'#c2ad83','rgba(255,237,190,1)','rgba(105,85,57,1)'),
    iron:makeMap(renderer,'#576168','rgba(154,174,177,1)','rgba(49,43,38,1)')
  };
  const styleFor=name=>name.includes('iron')?'iron':name.includes('dark')?'dark':name.includes('light')?'light':'stone';
  let count=0;
  root.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const paint=material=>{
      const name=material.name||'';
      if(!/(sample_(stone|iron)|tower_stone|ruin)/.test(name))return material;
      count++;return new T.MeshLambertMaterial({name,map:styles[styleFor(name)],side:T.DoubleSide});
    };
    o.material=Array.isArray(o.material)?o.material.map(paint):paint(o.material);
  });
  console.info('[painted-ruins] textured meshes: '+count);
}
