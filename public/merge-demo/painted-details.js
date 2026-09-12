import * as THREE from 'three';

const textures=new Map();
function paint(kind){
  if(textures.has(kind))return textures.get(kind);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d');
  const shape=(points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
  const stroke=(points,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
  if(kind==='door'){
    stroke([[12,493],[8,60],[19,18],[100,10],[464,13]],'#66503e',5);
    stroke([[22,475],[20,55],[31,27],[153,23]],'#fff0ca',7);
    const chips=[[[28,18],[83,13],[72,27],[59,30],[63,40],[37,36]],[[444,21],[495,25],[494,86],[480,77],[486,56],[468,63],[472,33]],[[489,387],[494,477],[473,487],[470,462],[458,455],[477,430]],[[114,472],[138,464],[155,478],[143,491],[117,489]],[[316,93],[325,80],[338,87],[331,108],[318,113]]];
    chips.forEach(p=>shape(p,'#b69265'));
    stroke([[481,79],[474,109],[477,136]],'#af8058',5);
    stroke([[463,67],[459,90]],'#c4a57a',4);
    stroke([[350,401],[378,378]],'#b39c77',3);
    stroke([[354,405],[380,382]],'#f5e6bc',2);
  }else{
    stroke([[12,13],[501,17],[497,495],[15,499],[12,13]],'#594637',9);
    stroke([[26,30],[483,33]],'#e3d8b8',7);
    const chips=[[[18,30],[134,26],[110,41],[79,43],[93,60],[61,54],[34,69]],[[481,23],[491,165],[475,150],[480,121],[463,133],[469,68]],[[19,422],[39,433],[32,471],[86,479],[93,496],[18,495]],[[411,484],[474,475],[484,489],[455,499],[406,497]]];
    chips.forEach(p=>shape(p,'#a67748'));
    for(const [x,y,dx,dy] of [[100,135,42,-35],[328,173,52,-40],[230,304,31,-29],[371,406,32,-50],[71,341,19,-45]]){
      shape([[x,y],[x+dx*.25,y+dy*.45],[x+dx,y+dy],[x+dx*.65,y+dy*.18],[x+9,y+10]],'#a4774c');
      stroke([[x+7,y+11],[x+dx,y+dy+8]],'#e1d0a8',3);
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;textures.set(kind,texture);return texture;
}
export function paintedPanel(g,kind,x,y,z,w,h,floor=false){
  const material=new THREE.MeshBasicMaterial({map:paint(kind),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);panel.position.set(x,y,z);if(floor)panel.rotation.x=-Math.PI/2;panel.renderOrder=3;panel.userData.paintedDetail=true;g.add(panel);
}
const ink=new THREE.MeshBasicMaterial({color:'#49362b'});
export function addInk(g){
  const surfaces=[];g.traverse(m=>{if(m.isMesh&&!m.userData.ink&&!m.userData.outlined&&!m.userData.paintedDetail&&!m.material.transparent)surfaces.push(m);});
  for(const m of surfaces){
    m.geometry.computeBoundingBox();if(m.geometry.boundingBox.getSize(new THREE.Vector3()).length()<.16)continue;
    m.userData.outlined=true;
    const geometry=m.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
    for(let i=0;i<p.count;i++){const width=.0045*(1+.13*Math.sin(p.getY(i)*23));p.setXYZ(i,p.getX(i)+n.getX(i)*width,p.getY(i)+n.getY(i)*width,p.getZ(i)+n.getZ(i)*width);}
    // glTF has no BackSide material: reverse the shell winding so exports preserve the outline.
    const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i);
    for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    geometry.setIndex(indices);
    for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
    p.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();const outline=new THREE.Mesh(geometry,ink);outline.position.copy(m.position);outline.quaternion.copy(m.quaternion);outline.scale.copy(m.scale);outline.userData.ink=true;m.parent.add(outline);
  }
}
