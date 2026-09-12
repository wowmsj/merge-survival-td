"""Generate compact, warm-earth runtime placeholders for KIMI integration."""
import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent; OUT=ROOT/'assets/models/blender-samples'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
for n,h in {'earth':'b09067','wood':'986c45','stone':'9c9988','iron':'535c58','plaster':'d4be95','roof':'a5654d','grass':'8c9060','zombie':'6c8d6a','fast':'4f9aa0','tank':'59645f','elite':'a66b55','boss':'8f4b4b','fly':'7b6f9e','burrow':'85694b','warning':'c68b42'}.items():
 m=bpy.data.materials.new(n);m.diffuse_color=tuple(int(h[i:i+2],16)/255 for i in (0,2,4))+(1,);M[n]=m
def make(n, parts, out):
 g=bpy.data.objects.new(n,None);bpy.context.scene.collection.objects.link(g)
 for i,(x,y,z,w,h,d,c) in enumerate(parts):
  bpy.ops.mesh.primitive_cube_add(location=(x,-z,y));o=bpy.context.object;o.name=n+'_'+str(i);o.scale=(w/2,d/2,h/2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[c]);o.parent=g
  b=o.modifiers.new('edge','BEVEL');b.width=min(w,h,d)*.06;b.segments=1
 bpy.ops.object.select_all(action='DESELECT');g.select_set(True)
 for o in g.children_recursive:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/out),export_format='GLB',use_selection=True)
 return g
for kind,c in [('1','zombie'),('2','fast'),('3','tank'),('4','elite'),('5','elite'),('6','boss'),('7','fly'),('8','burrow')]:
 s=.28 if kind in ['1','2','4','7'] else .34
 parts=[(0,.22,0,s,.44,s,c),(0,.56,0,s*.72,.22,s*.72,c),(-s*.48,.27,0,s*.35,.12,s*.35,c),(s*.48,.27,0,s*.35,.12,s*.35,c),(0,.05,0,s*.9,.08,s*.9,'warning' if kind in ['4','6'] else c)]
 if kind=='6':parts += [(0,.78,0,.18,.18,.18,'warning'),(.34,.52,0,.12,.18,.12,'warning'),(-.34,.52,0,.12,.18,.12,'warning')]
 if kind=='7':parts += [(-.28,.5,0,.55,.04,.18,'fly'),(.28,.5,0,.55,.04,.18,'fly')]
 if kind=='8':parts += [(0,.18,-.22,.5,.08,.1,'burrow')]
 make('enemy_'+kind,parts,'warm_enemy_'+kind+'.glb')
for kind,c in [('tower','iron'),('resource','wood'),('trap','warning'),('wall','stone')]:
 parts=[(0,.08,0,.86,.16,.86,'earth')]
 if kind=='tower':parts += [(0,.42,0,.28,.58,.28,'iron'),(.18,.62,0,.42,.12,.12,'warning')]
 elif kind=='resource':parts += [(0,.35,0,.62,.52,.52,'wood'),(0,.68,0,.7,.08,.56,'roof')]
 elif kind=='trap':parts += [(0,.16,0,.66,.12,.66,'warning'),(-.2,.30,0,.08,.28,.08,'iron'),(.2,.30,0,.08,.28,.08,'iron')]
 else: parts += [(0,.43,0,.78,.62,.34,'stone'),(0,.78,0,.84,.10,.40,'stone')]
 make('building_'+kind,parts,'warm_building_'+kind+'.glb')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warm-runtime-pack.blend'))
print('WARM_RUNTIME_PACK_COMPLETE')
