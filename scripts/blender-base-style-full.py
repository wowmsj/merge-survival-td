"""Extend approved warm-earth sample to the actual initial 13x13 base.

Candidate art only. Runtime terrain/building data remain unchanged.
"""
import bpy
import json
import math
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ns = runpy.run_path(str(ROOT/'scripts/blender-base-style-sample.py'))
OUT, box, group, export = (ns[k] for k in ['OUT', 'box', 'group', 'export'])
small = ns['sample']

def clone(source, name, x=0, z=0, parent=None):
    root = group(name)
    root.location = (x, -z, 0)
    root.parent = parent
    for child in source.children:
        obj = child.copy()
        obj.data = child.data
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = root
    return root

modules = {'core': clone(next(o for o in small.children if o.name=='core_center'), 'warm_core')}
for i, name in enumerate(['tile_0_0', 'tile_0_1', 'tile_1_1']):
    modules['ground_'+str(i)] = clone(next(o for o in small.children if o.name==name), 'warm_ground_'+str(i))
for kind in ['grass','woods','rubble','shack','pond','ruin','ruin_1','ruin_2']:
    g = group('warm_'+kind)
    modules[kind] = g
    def b(n,x,y,z,w,h,d,m,a=0): return box(g,n,x,y,z,w,h,d,m,a)
    if kind == 'grass':
        for i,(x,z) in enumerate([(-.23,-.18),(.21,.16),(-.14,.26)]):
            b('dry_earth',x,.006,z,.20,.012,.16,'dust')
            for j in range(3):
                b('dry_blade',x+(j-1)*.046,.07+j*.022,z,.026,.14+j*.044,.025,'grass' if j%2 else 'sand',j*.2)
    elif kind == 'woods':
        for i,(x,z) in enumerate([(-.18,.12),(.22,-.19)]):
            b('roots',x,.025,z,.24,.05,.20,'wood_dark')
            b('trunk',x,.31,z,.085,.60,.085,'wood')
            for y,w,h in [(.41,.36,.17),(.58,.29,.18),(.74,.19,.13)]:
                b('dry_crown',x,y+i*.09,z,w,h,w,'grass' if y<.6 else 'sand')
            b('exposed_branch',x-.09,.32,z,.16,.045,.06,'wood_dark')
    elif kind == 'rubble':
        for i,(x,z,w,h) in enumerate([(-.22,.16,.28,.17),(.14,.17,.32,.23),(-.13,-.20,.22,.13),(.22,-.20,.26,.11)]):
            b('concrete_slab',x,h/2,z,w,h,w*.72,'stone' if i%2 else 'stone_dark',i*.17)
            b('fracture_face',x+.02,h+.008,z,.13,.02,.08,'stone_light',i*.17)
        b('exposed_rod',.17,.32,.16,.023,.24,.023,'iron')
        b('broken_timber',-.17,.10,-.02,.35,.055,.07,'wood',.30)
    elif kind == 'shack':
        b('slab',0,.035,0,.82,.07,.77,'stone_dark')
        for x in [-.33,.33]:
            for z in [-.30,.30]: b('post',x,.29,z,.065,.50,.065,'wood_dark')
        for i in range(4):
            b('back_plank',0,.15+i*.095,.30,.68,.083,.04,'wood_light' if i%2 else 'wood')
            b('side_plank',-.33,.15+i*.095,0,.042,.083,.60,'wood')
        b('header',0,.50,-.30,.71,.065,.055,'wood_dark')
        b('door_remnant',-.23,.23,-.30,.14,.30,.036,'wood_light')
        for i in range(3):
            roof=b('roof_sheet',-.20+i*.16,.57+i*.018,.03,.151,.036,.72,'roof' if i%2 else 'roof_light')
            roof.rotation_euler.y=-.12
        b('roof_hole_beam',.29,.57,.16,.06,.05,.40,'wood_dark')
        b('fallen_plank',.16,.10,-.15,.34,.04,.10,'wood_light',.28)
        b('fallen_block',-.15,.11,.10,.17,.12,.14,'stone')
    elif kind == 'pond':
        b('mud',0,.012,0,.88,.024,.85,'soil')
        b('still_water',0,.03,0,.74,.023,.71,'glass')
        for x,z,w,d in [(-.4,0,.075,.76),(.4,.06,.075,.70),(0,-.39,.76,.075),(.04,.39,.67,.075)]:
            b('dry_bank',x,.035,z,w,.07,d,'dust')
        for x,z,w in [(-.12,-.15,.17),(.18,.12,.20)]: b('muted_ripple',x,.043,z,w,.004,.013,'stone_light')
        for z in [-.16,.12]: b('bank_stone',-.37,.075,z,.11,.08,.13,'stone')
        for i in range(3): b('reed',.32,.10+i*.025,.29-i*.025,.022,.20+i*.05,.025,'grass')
    else:
        variant = 0 if kind=='ruin' else int(kind[-1])
        b('footing',0,.042,0,.90,.084,.48,'stone_dark')
        for row in range(3):
            for col in range(3):
                if row==2 and col==(variant%3): continue
                if row==1 and variant==2 and col==2: continue
                b('broken_masonry',(col-1)*.275,.155+row*.14,0,.261,.13,.29,
                  'stone' if (row+col)%2 else 'stone_light')
        b('surviving_cap',(-.275 if variant else .275),.53,0,.26,.05,.34,'stone_light')
        for x in [-.33,.33]: b('exposed_rebar',x,.32,.06,.024,.48,.024,'iron')
        b('fallen_cap',.20,.09,-.27,.27,.095,.13,'stone',.21)

# Apply bevels and consolidate each module by material before repeating 169 cells.
# No new optimizer dependency for an art candidate; compressed delivery can follow approval.
for kind, root in modules.items():
    bpy.context.view_layer.update()
    buckets = {}
    for obj in list(root.children):
        obj.data = obj.data.copy()
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
        obj.select_set(False)
    for material, objects in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = kind+'_'+material
    export(root, 'warm_'+kind)

runtime = json.loads((OUT/'base-runtime-snapshot.json').read_text(encoding='utf8'))
base = runtime['base']
assert (base['rows'],base['cols']) == (13,13)
full = group('warm_base_13x13')
layout = {'rows':13,'cols':13,'cellPitch':1,'tileSize':.925,'surfaceY':0,
          'modules':{k:'warm_'+k+'.glb' for k in modules},'tiles':[],'buildings':[]}
for row in range(13):
    for col in range(13):
        state = base['tiles'][row][col]
        ground = 'ground_'+str((row*7+col*11)%3)
        clone(modules[ground],f'tile_{row}_{col}',col-6,row-6,full)
        layout['tiles'].append({'row':row,'col':col,**state,'model':layout['modules'][ground]})
        if state.get('terrain'):
            clone(modules[state['terrain']],f'terrain_{row}_{col}',col-6,row-6,full)
seen = set()
for building in base['buildings']:
    row,col = building['row'],building['col']
    if (row,col) in seen: continue
    seen.add((row,col))
    v = (row+col)%3
    kind = 'core' if building['cfgId']==1 else ('ruin' if not v else 'ruin_'+str(v))
    obj = clone(modules[kind],f'building_{row}_{col}',col-6,row-6,full)
    yaw = math.pi/2 if kind!='core' and col in [0,12] else 0
    obj.rotation_euler.z = yaw
    layout['buildings'].append({**building,'model':layout['modules'][kind],'rotationY':yaw})
export(full, 'warm_base_13x13')
for root in [small,*modules.values()]:
    for obj in list(root.children_recursive): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(root,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'warm_base_13x13.blend'))
(OUT/'warm-base-layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf8')
print('WARM_BASE_COMPLETE',len(layout['tiles']),len(layout['buildings']))
