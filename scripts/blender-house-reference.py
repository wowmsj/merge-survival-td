import bpy, random
from pathlib import Path
OUT=Path(__file__).resolve().parent.parent/'assets/models/blender-samples'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
for n,h in {'stone':'9b9b8d','stone2':'c5bba1','wood':'8f4c2b','wood2':'bd783e','roof':'b84f31','roof2':'dd7640','dark':'34434a','glass':'4c8990','gold':'d2a53c'}.items():
 m=bpy.data.materials.new(n);rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];m.diffuse_color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,);m.use_nodes=True;m.roughness=.78 if n.startswith('roof') else .88
 if n in {'stone','stone2','wood','wood2','roof','roof2'}:
  image=bpy.data.images.new('mat_'+n,32,32)
  pixels=[];random.seed(sum(map(ord,n)))
  for y in range(32):
   for x in range(32):
    grain=(random.random()-.5)*.11 + (.035 if n.startswith('wood') and (x//4)%2 else 0)
    pixels.extend([max(0,min(1,rgb[0]+grain)),max(0,min(1,rgb[1]+grain)),max(0,min(1,rgb[2]+grain)),1])
  image.pixels= pixels;image.pack();nodes=m.node_tree.nodes;links=m.node_tree.links;shader=next(x for x in nodes if x.type=='BSDF_PRINCIPLED');tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest';links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 M[n]=m
g=bpy.data.objects.new('reference_house',None);bpy.context.scene.collection.objects.link(g)
def box(n,x,y,z,w,h,d,c,rot=0):
 bpy.ops.mesh.primitive_cube_add(location=(x,-z,y));o=bpy.context.object;o.name=n;o.scale=(w/2,d/2,h/2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.rotation_euler.y=rot;o.data.materials.append(M[c]);o.parent=g;b=o.modifiers.new('edge','BEVEL');b.width=min(w,h,d)*.08;b.segments=2;return o
box('stone_foundation',0,.06,0,.88,.12,.84,'stone');box('wall_body',0,.32,0,.70,.48,.62,'wood')
for x in [-.34,.34]:
 for z in [-.30,.30]:box('stone_corner',x,.31,z,.10,.52,.10,'stone2')
box('door_shadow',0,.29,-.335,.25,.36,.035,'dark')
for i in range(4):box('door_plank',-.14+i*.075,.29,-.36,.068,.31,.025,'wood2' if i%2 else 'wood')
for y in [.18,.39]:box('door_band',0,y,-.38,.25,.025,.018,'gold')
for x in [-.23,.23]:box('window_frame',x,.39,-.34,.15,.16,.035,'wood2');box('window_glass',x,.40,-.36,.10,.10,.012,'glass');box('window_sill',x,.31,-.38,.18,.035,.06,'stone2')
mesh=bpy.data.meshes.new('gable');mesh.from_pydata([(-.35,-.31,.56),(.35,-.31,.56),(0,-.31,.86),(-.35,.31,.56),(.35,.31,.56),(0,.31,.86)],[],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]);o=bpy.data.objects.new('gable',mesh);bpy.context.scene.collection.objects.link(o);o.parent=g;mesh.materials.append(M['wood2'])
for side in [-1,1]:
 for row in range(4):
  x=.065+row*.102;y=.875-x*.85
  for i in range(7):
   z=-.348+i*.116;box('individual_clay_tile',side*x,y,z,.154,.037,.112,'roof2' if (i+row)%3==0 else 'roof',side*.704)
 for z in [-.413,.413]:box('thick_eave',side*.215,.68,z,.54,.055,.033,'wood',side*.704)
for z in [-.34,-.225,-.11,.005,.12,.235,.35]:box('ridge_cap',0,.909,z,.092,.047,.109,'roof2')
for z in [-.16,.14]:
 box('side_frame',-.364,.37,z,.034,.21,.20,'wood2');box('side_recess',-.385,.38,z,.012,.145,.14,'dark');box('side_glass',-.392,.39,z,.01,.105,.11,'glass');box('side_mullion',-.402,.39,z,.016,.12,.018,'wood2')
for j in range(4):
 for i in range(2):box('corner_masonry',-.34,.14+j*.11,(-.30 if i==0 else .30),.107,.103,.105,'stone2' if j%2 else 'stone')
box('chimney',.20,.85,.16,.13,.30,.14,'stone');box('chimney_cap',.20,1.01,.16,.17,.04,.18,'stone2');box('chimney_hole',.20,1.035,.16,.09,.008,.10,'dark');box('step',0,.055,-.413,.34,.07,.09,'stone2')
bpy.ops.object.select_all(action='DESELECT');g.select_set(True)
for o in g.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'reference_house.glb'),export_format='GLB',use_selection=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'reference_house.blend'));print('REFERENCE_HOUSE_COMPLETE')
