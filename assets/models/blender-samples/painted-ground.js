import * as T from 'three';

// Small shared texture set; deterministic strokes keep reloads visually consistent.
export function applyPaintedGround(root, renderer) {
  let seed = 1729;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const materials = Array.from({length: 4}, (_, variant) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ['#d9ae63', '#ddb56c', '#d1a25a', '#dfb569'][variant];
    ctx.fillRect(0, 0, 256, 256);
    // Broad translucent pigment patches, then broken dry-brush strokes.
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(255,228,158,.10)' : 'rgba(135,83,38,.08)';
      ctx.beginPath();
      ctx.ellipse(random()*256, random()*256, 12+random()*42, 4+random()*18, -.3+random()*.6, 0, Math.PI*2);
      ctx.fill();
    }
    for (let i = 0; i < 440; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(255,232,178,.17)' : 'rgba(116,79,43,.12)';
      ctx.lineWidth = .5+random()*1.5;
      const x=random()*256, y=random()*256;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+random()*14,y-1+random()*2);ctx.stroke();
    }
    // Painted edge dirt, not a replacement for scene lighting or contact shadows.
    for (let side=0; side<4; side++) {
      ctx.save();ctx.translate(128,128);ctx.rotate(side*Math.PI/2);ctx.translate(-128,-128);
      const wash=ctx.createLinearGradient(0,0,0,24);
      wash.addColorStop(0,'rgba(113,69,31,.32)');wash.addColorStop(1,'rgba(113,69,31,0)');
      ctx.fillStyle=wash;ctx.fillRect(0,0,256,24);ctx.restore();
    }
    const map=new T.CanvasTexture(canvas);
    map.colorSpace=T.SRGBColorSpace;
    map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    return new T.MeshLambertMaterial({map,side:T.DoubleSide});
  });
  const geometries=new Map();
  let count=0;
  root.traverse(mesh => {
    if (!mesh.isMesh || !/^ground_\d_sample_(sand|dust|earth)/.test(mesh.name)) return;
    if (!geometries.has(mesh.geometry)) {
      const geometry=mesh.geometry.clone(), p=geometry.attributes.position;
      const uv=new Float32Array(p.count*2);
      for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)+.5;uv[i*2+1]=p.getZ(i)+.5;}
      geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
      geometries.set(mesh.geometry,geometry);
    }
    mesh.geometry=geometries.get(mesh.geometry);
    const tile=mesh.parent.name.match(/tile_(\d+)_(\d+)/);
    mesh.material=materials[tile ? (Number(tile[1])*7+Number(tile[2])*3)%4 : 0];
    count++;
  });
  console.info('[painted-ground] textured meshes: '+count);
}
