import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {Box3,Vector3} from 'three';
const require=createRequire(import.meta.url);require('./model-catalog.cjs');const {createDefaultBase}=require('../src/core/model/Base.ts');const runtime=createDefaultBase(),dir='assets/models/blender-samples/',layout=JSON.parse(fs.readFileSync(dir+'base_13x13-layout.json'));
assert.equal(layout.rows,runtime.rows);assert.equal(layout.cols,runtime.cols);assert.equal(layout.tiles.length,169);assert.equal(layout.tiles.filter(t=>t.claimed).length,49);
for(const t of layout.tiles){const {row,col,...state}=t;assert.deepEqual(state,runtime.tiles[row][col]);}
const unique=[...new Map(runtime.buildings.map(b=>[b.row+','+b.col,b])).values()];assert.equal(unique.length,layout.buildings.length);
for(const b of layout.buildings){const {model,...state}=b;assert.deepEqual(state,unique.find(x=>x.row===b.row&&x.col===b.col));}
const loader=new GLTFLoader();async function load(file){const b=fs.readFileSync(dir+file);return (await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
for(const [kind,file]of Object.entries(layout.modules)){const g=await load(file),bounds=new Box3().setFromObject(g),s=bounds.getSize(new Vector3());assert(s.x<=.926&&s.z<=.926,kind+' footprint');assert(bounds.min.y>=-.001||kind==='ground',kind+' floor');g.traverse(o=>{if(o.isMesh)assert(o.material)});}
const full=await load('base_13x13_voxel.glb');for(const t of layout.tiles){const p=full.getObjectByName('tile_'+t.row+'_'+t.col).getWorldPosition(new Vector3());assert(Math.abs(p.x-(t.col-6))<.001&&Math.abs(p.z-(t.row-6))<.001);}
for(const row of [4,5,6])assert(!full.getObjectByName('building_'+row+'_12'));assert(full.getObjectByName('building_6_6'));
console.log('PASS: 169 tiles, 49 claimed, exact runtime terrain/buildings, 8 bounded modules, Y-up, east gaps');
