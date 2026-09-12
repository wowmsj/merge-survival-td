import * as THREE from 'three';
import { recipes, buildFullModel } from './all-models.js';

export const modelIds=new Set(recipes.keys());
export const VIEW_SLOPE=Math.tan(Math.PI/6);
export function createItemModel(id,{upright=false}={}){
  if(!modelIds.has(id))throw new Error('No model for prop '+id);
  const tilt=buildFullModel(id);
  if(!upright)tilt.rotation.set(-.3,.35,-.04);
  tilt.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(tilt,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=.83/Math.max(size.x,size.z,upright?size.y:size.z*Math.cos(Math.PI/6)+size.y*.5);
  tilt.scale.multiplyScalar(scale);
  tilt.position.set(-center.x*scale,-bounds.min.y*scale,(-center.z+(upright?0:(center.y-bounds.min.y)*VIEW_SLOPE))*scale);
  const root=new THREE.Group();root.add(tilt);return root;
}
