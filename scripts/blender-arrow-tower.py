# -*- coding: utf-8 -*-
import bpy
import math
import random
from pathlib import Path
OUT=Path(__file__).resolve().parent.parent/'assets/models/blender-samples'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,h,texture=False):
 m=bpy.data.materials.new(n);rgb=(*[int(h[i:i+2],16)/255 for i in (0,2,4)],1);m.diffuse_color=rgb;m.use_nodes=True;shader=next(x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=rgb;shader.inputs['Roughness'].default_value=.82
 if texture:
  image=bpy.data.images.new('mat_'+n,32,32);random.seed(sum(map(ord,n)));pixels=[]
  for _ in range(32*32):
   d=(random.random()-.5)*.10;pixels.extend([max(0,min(1,c+d)) for c in rgb[:3]]+[1])
  image.pixels=pixels;image.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest';m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 return m
stone=mat('tower_stone','9b9b8d',True);stone2=mat('tower_stone_light','c5bba1',True);wood=mat('tower_wood','8f4c2b',True);metal=mat('tower_metal','34434a');rope=mat('tower_rope','b38a50');ground=mat('tower_ground','8c704b',True)
root=bpy.data.objects.new('arrow_tower',None);bpy.context.scene.collection.objects.link(root);root.rotation_euler.x=math.pi/2
def cube(n,p,s,m,bev=.02):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=root
 if bev:b=o.modifiers.new('soft_edges','BEVEL');b.width=bev;b.segments=2
def cyl(n,p,r,d,m,verts=8):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m);o.parent=root
cube('single_cell_base',(0,.04,0),(.44,.04,.44),ground)
for x in (-.30,.30):
 for z in (-.30,.30):cube('stone_corner',(x,.18,z),(.11,.14,.11),stone2)
cube('tower_body',(0,.25,0),(.30,.16,.30),stone)
for y in (.38,.48,.58):
 for x in (-.27,.27):cube('wall_block_left' if x<0 else 'wall_block_right',(x,y,0),(.07,.045,.30),stone2)
 for z in (-.27,.27):cube('wall_block_front' if z<0 else 'wall_block_back',(0,y,z),(.30,.045,.07),stone2)
for x,z in ((-.24,-.24),(.24,-.24),(-.24,.24),(.24,.24)):cube('wood_post',(x,.78,z),(.045,.23,.045),wood)
cube('platform',(0,.82,0),(.34,.045,.34),wood)
cyl('tower_pole',(0,1.08,0),.045,.50,wood,8);bpy.context.object.rotation_euler.x=1.5708
cube('crossbow_stock',(0,1.08,-.08),(.055,.055,.22),wood)
cube('crossbow_arm',(0,1.16,-.08),(.22,.035,.035),metal)
cube('bowstring',(0,1.16,.14),(.005,.005,.22),rope,0)
cube('arrow_shaft',(0,1.18,-.28),(.018,.018,.24),rope,0)
cyl('arrow_head',(0,1.18,-.52),.035,.09,metal,4)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'arrow_tower_v6.glb'),export_format='GLB',use_selection=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'arrow_tower_v6.blend'));print('ARROW_TOWER_COMPLETE')


