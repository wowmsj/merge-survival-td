import * as THREE from 'three';

// Seeded, reusable surface maps keep the demo self-contained and stable between refreshes.
function surface(seed, grain) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#bcbcbc';ctx.fillRect(0,0,256,256);
  for(let i=0;i<8000;i++){const shade=145+Math.floor(random()*70);ctx.fillStyle=`rgba(${shade},${shade},${shade},0.22)`;ctx.fillRect(random()*256,random()*256,grain?1:2,grain?12+random()*40:2);}
  for(let i=0;i<32;i++){ctx.strokeStyle=i%2?'#ababab':'#d0d0d0';ctx.lineWidth=.4;const x=random()*256,y=random()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(grain?2:random()*25),y+random()*32);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
export const wearMap=surface(71,false);
export const grainMap=surface(17,true);
