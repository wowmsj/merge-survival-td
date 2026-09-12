import bpy
import math
from pathlib import Path
OUT=Path(__file__).resolve().parent.parent/'assets/models/blender-samples'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.roughness=.9;rgb=(*[int(color[i:i+2],16)/255 for i in (0,2,4)],1);m.diffuse_color=rgb
 bsdf=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if bsdf: bsdf.inputs['Base Color'].default_value=rgb
 return m
bark=mat('tree_bark','71452f');bark2=mat('tree_bark_light','a06a43');leaf=mat('leaf_deep','285139');leaf2=mat('leaf_mid','3d7042');leaf3=mat('leaf_light','78934e');stone=mat('tree_soil','856847')
root=bpy.data.objects.new('reference_tree',None);bpy.context.scene.collection.objects.link(root);root.rotation_euler.x=math.pi/2
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=root;b=o.modifiers.new('soft_edges','BEVEL');b.width=min(s)*.12;b.segments=2
def crown(n,p,s,m):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=root
cube('soil_root',(0,.045,0),(.30,.045,.30),stone);cube('trunk_base',(0,.24,0),(.09,.20,.09),bark);cube('trunk_upper',(0,.49,0),(.07,.25,.07),bark2);cube('branch_left',(-.10,.68,0),(.14,.045,.045),bark2);cube('branch_right',(.10,.73,.02),(.14,.045,.045),bark)
crown('crown_center',(0,.88,0),(.32,.27,.31),leaf);crown('crown_left',(-.20,.86,-.01),(.20,.19,.22),leaf2);crown('crown_right',(.20,.91,.02),(.21,.20,.21),leaf);crown('crown_top',(0,1.12,.01),(.20,.19,.20),leaf3)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'tree_lowpoly_v3.glb'),export_format='GLB',use_selection=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tree_lowpoly_v3.blend'));print('TREE_LOWPOLY_V3_COMPLETE')
