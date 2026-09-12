"""Modular assets from actual base snapshot; authored Y-up, exported with Blender axis conversion."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'assets/models/blender-samples'
runtime=json.loads((OUT/'base-runtime-snapshot.json').read_text(encoding='utf8'));base=runtime['base']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
for name,h in {'earth':'b09067','floor_wear':'c2a57b','soil':'79604b','sand':'8b7657','edge':'1d3039','rock':'7f8581','dark':'202a30','light':'d0c19d','rust':'c9653b','wood':'a56a38','grass':'b2c84c','leaf':'4f7d39','water':'2493b0','foam':'72d5d0','yellow':'f0b83e','red':'d84d3b','blue':'347f91'}.items():
 m=bpy.data.materials.new(name);m.use_nodes=True;rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
 m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=color
 m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value={'water':.28,'foam':.35,'blue':.6,'rust':.75}.get(name,.9);m.diffuse_color=color;M[name]=m
def group(name):
 o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o);return o
def cube(g,n,x,y,z,w,h,d,c):
 bpy.ops.mesh.primitive_cube_add(location=(x,-z,y));o=bpy.context.object;o.name=n;o.scale=(w/2,d/2,h/2)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[c]);o.parent=g
 if min(w,h,d)>=.04:
  bevel=o.modifiers.new('soft_voxel_edges','BEVEL');bevel.width=min(w,h,d)*.055;bevel.segments=2
 return o
def export(g,file):
 bpy.ops.object.select_all(action='DESELECT');g.select_set(True)
 for o in g.children_recursive:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/file),export_format='GLB',use_selection=True)
def clone(src,name,x,z):
 g=group(name);g.location=(x,-z,0)
 for child in src.children:
  o=child.copy();o.data=child.data;bpy.context.scene.collection.objects.link(o);o.parent=g
 return g
modules={}
for kind in ['ground','core','grass','woods','rubble','shack','pond','ruin']:
 g=group('module_'+kind);modules[kind]=g
 def b(n,x,y,z,w,h,d,c):return cube(g,n,x,y,z,w,h,d,c)
 if kind=='ground':
  b('underside',0,-.155,0,.925,.21,.925,'soil');b('earth_top',0,-.025,0,.925,.05,.925,'earth')
  for x,z,w in [(-.35,-.31,.13),(.31,.32,.09),(-.26,.35,.05)]:b('wear',x,.001,z,w,.002,.035,'floor_wear')
  b('soil_stratum',0,-.12,0,.925,.035,.925,'earth')
  for x,z in [(-.36,-.40),(.30,.40)]:b('embedded_stone',x,-.19,z,.12,.07,.09,'sand')
 elif kind=='core':
  b('foundation',0,.045,0,.88,.09,.88,'rock');b('bunker',0,.30,0,.72,.43,.64,'light')
  for x in [-.36,.36]:
   for z in [-.32,.32]:b('pillar',x,.29,z,.075,.46,.075,'wood')
  b('door_frame',0,.24,-.344,.25,.34,.045,'dark');b('door',0,.21,-.374,.17,.27,.025,'yellow')
  for x in [-.25,.25]:b('window',x,.36,-.337,.13,.10,.026,'dark');b('glass',x,.37,-.353,.085,.047,.012,'foam')
  b('roof_lower',0,.535,0,.86,.055,.78,'dark')
  for j in range(5):b('gable',0,.56+j*.039,0,.70-j*.13,.04,.64,'wood')
  for side in [-1,1]:
   for j in range(4):
    roof=b('roof_tiles',side*.22,.66,-.30+j*.20,.49,.055,.194,'red' if j%2 else 'rust');roof.rotation_euler.y=side*.43
   trim=b('roof_fascia',side*.22,.637,-.414,.49,.07,.035,'wood');trim.rotation_euler.y=side*.43
  b('ridge',0,.785,0,.075,.065,.86,'dark')
  b('chimney',.24,.78,.19,.125,.28,.145,'rock');b('chimney_cap',.24,.927,.19,.165,.04,.18,'light');b('chimney_hole',.24,.951,.19,.09,.009,.10,'dark')
  for z in [-.18,.18]:
   b('side_window',-.367,.34,z,.025,.15,.14,'dark');b('side_glass',-.382,.35,z,.012,.105,.09,'foam')
  b('door_handle',.045,.24,-.396,.025,.018,.018,'dark')
  b('step',0,.06,-.40,.32,.06,.08,'light')
 elif kind=='grass':
  for x,z in [(-.22,-.15),(.20,.12),(-.09,.23),(.25,-.24)]:
   b('clump',x,.022,z,.18,.044,.15,'leaf')
   for j in range(3):b('blade',x+(j-1)*.055,.10+(j%2)*.035,z,.033,.18+(j%2)*.07,.04,'grass')
 elif kind=='woods':
  for i,(x,z) in enumerate([(-.20,.12),(.19,-.16)]):
   b('root',x,.045,z,.23,.09,.23,'wood');b('trunk',x,.27,z,.10,.50,.10,'wood')
   for h,w in [(.42,.38),(.61,.30),(.76,.20)]:b('canopy',x,h+i*.05,z,w,.18,w,'leaf' if h<.6 else 'grass')
 elif kind=='rubble':
  for i,(x,z,w,h) in enumerate([(-.23,.14,.26,.24),(.13,.20,.33,.16),(.19,-.17,.25,.32),(-.17,-.21,.22,.12)]):
   b('concrete',x,h/2,z,w,h,w,'rock' if i%2 else 'sand');b('brick',x,h+.015,z,.13,.03,.085,'rust')
 elif kind=='shack':
  b('floor',0,.035,0,.80,.07,.76,'rock')
  for j in range(4):
   b('rear_plank',0,.13+j*.10,.30,.68,.075,.06,'wood' if j%2 else 'sand');b('side_plank',-.32,.13+j*.10,0,.06,.075,.64,'wood')
  for x in [-.32,.32]:b('post',x,.30,-.30,.07,.60,.07,'dark')
  b('lintel',0,.53,-.30,.70,.09,.09,'wood');b('broken_roof',-.19,.61,.04,.39,.05,.78,'rust');b('roof_patch',.11,.57,.18,.24,.05,.45,'rock')
  for z in [-.2,0,.2]:b('roof_ridge',-.20,.65,z,.37,.035,.026,'sand')
  b('debris',.20,.09,-.20,.21,.12,.17,'wood')
 elif kind=='pond':
  b('mud',0,.012,0,.91,.024,.91,'dark');b('water',0,.033,0,.77,.018,.77,'water')
  for x,z,w,d in [(-.40,0,.08,.84),(.40,.03,.08,.78),(0,.40,.75,.08),(0,-.40,.8,.08)]:b('bank',x,.045,z,w,.075,d,'sand')
  for x,z,w in [(-.15,-.15,.19),(.14,.11,.23),(-.18,.21,.1)]:b('ripple',x,.044,z,w,.004,.022,'foam')
 else:
  b('footing',0,.055,0,.9,.11,.72,'rock')
  for j in range(3):
   for i in range(3 if j<2 else 2):b('masonry',-.27+i*.27+(j%2)*.03,.17+j*.17,0,.24,.15,.30,'rock' if (i+j)%2 else 'sand')
  b('broken_cap',-.18,.58,.02,.36,.08,.12,'rust');b('broken_cap',.24,.49,.10,.18,.08,.20,'rock')
  for x in [-.30,.30]:b('rebar',x,.48,.04,.026,.64,.026,'rust')
  b('fallen_stone',.27,.13,-.24,.28,.16,.18,'rock')
 export(g,'base_'+kind+'.glb')
for v in [1,2]:
 g=clone(modules['ruin'],'module_ruin_'+str(v),0,0)
 for o in list(g.children):
  if 'masonry' in o.name and o.location.z>(.32 if v==1 else .48) and (o.location.x<0 if v==1 else o.location.x>-.2):bpy.data.objects.remove(o,do_unlink=True)
  elif 'rebar' in o.name:o.scale.z=.65 if v==1 else 1.1
 cube(g,'loose_brick',-.22,.10,-.25,.24,.11,.19,'rust')
 modules['ruin_'+str(v)]=g;export(g,'base_ruin_'+str(v)+'.glb')
assembled=group('base_13x13')
layout={'rows':base['rows'],'cols':base['cols'],'cellPixels':74,'gapPixels':6,'cellPitch':1,'surfaceY':0,'origin':'center, glTF Y-up','eastGapRows':runtime['eastGapRows'],'ruinCollapseOrder':runtime['ruinCollapseOrder'],'modules':{k:'base_'+k+'.glb' for k in modules},'tiles':[],'buildings':[]}
for r in range(base['rows']):
 for c in range(base['cols']):
  tile=base['tiles'][r][c];o=clone(modules['ground'],f'tile_{r}_{c}',c-6,r-6);o.parent=assembled;layout['tiles'].append({'row':r,'col':c,**tile})
  if tile.get('terrain'):
   o=clone(modules[tile['terrain']],f'terrain_{r}_{c}',c-6,r-6);o.parent=assembled
seen=set()
for bld in base['buildings']:
 key=(bld['row'],bld['col'])
 if key in seen:continue # Deduplicate repeated runtime corner ruins for rendering only.
 seen.add(key);variant=(key[0]+key[1])%3;kind='core' if bld['cfgId']==1 else ('ruin' if variant==0 else 'ruin_'+str(variant))
 o=clone(modules[kind],f'building_{key[0]}_{key[1]}',key[1]-6,key[0]-6);o.parent=assembled
 layout['buildings'].append({**bld,'model':layout['modules'][kind]})
export(assembled,'base_13x13_voxel.glb')
for g in modules.values():
 for o in list(g.children):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.objects.remove(g,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'base_13x13_voxel.blend'),copy=True)
(OUT/'base_13x13-layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf8')
print('BASE_13X13_COMPLETE',len(layout['tiles']),len(layout['buildings']))
