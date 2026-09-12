"""Warm-earth art sample. One-unit pitch, .925 tile, single-cell buildings.

Separate candidate exports: never replaces the formal layout or existing assets.
"""
import bpy
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets/models/blender-samples'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}
for name, color in {
    'earth': 'd2ad68', 'dust': 'e0c17f', 'sand': 'c99d55',
    'soil': '79604b', 'stratum': '8a6b50', 'stone': '9c9988',
    'stone_light': 'b4ae98', 'stone_dark': '827e70',
    'wood': '8b4d2b', 'wood_light': 'b8753b', 'wood_dark': '5d3425',
    'plaster': 'd8c79f', 'roof': 'c45d36', 'roof_light': 'e07b45',
    'iron': '535c58', 'iron_light': '858a79', 'glass': '657f7a',
    'dark': '273840', 'brass': 'e0ae3f', 'grass': '4f7f3b',
}.items():
    mat = bpy.data.materials.new('sample_' + name)
    mat.use_nodes = True
    rgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = tuple(v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb) + (1,)
    shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Base Color'].default_value = linear
    shader.inputs['Roughness'].default_value = .62 if name.startswith('iron') else .88
    mat.diffuse_color = linear
    materials[name] = mat

def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    return obj

def box(parent, name, x, y, z, w, h, d, material, angle=0):
    bpy.ops.mesh.primitive_cube_add(location=(x, -z, y))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (w/2, d/2, h/2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = angle
    obj.data.materials.append(materials[material])
    obj.parent = parent
    bevel = obj.modifiers.new('edge_highlights', 'BEVEL')
    bevel.width = min(w, h, d) * .08
    bevel.segments = 1  # Keep the faceted block silhouette, not rounded toy bricks.
    return obj

def export(root, name):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name+'.glb')), export_format='GLB', use_selection=True)

tiles = []
for variant in range(3):
    tile = group('sample_ground_' + str(variant))
    tiles.append(tile)
    rng = random.Random(17 + variant)
    box(tile, 'earth_bank', 0, -.165, 0, .925, .23, .925, 'soil')
    box(tile, 'sediment', 0, -.10, 0, .921, .04, .921, 'stratum')
    # Broad, near-coplanar terrain patches; no raised checkerboard paving.
    for row in range(4):
        for col in range(4):
            height = rng.choice([0, -.002, -.004])
            box(tile, 'packed_earth', (col-1.5)*.231, height-.022, (row-1.5)*.231,
                .231, .044, .231, rng.choice(['earth','earth','earth','dust']))
    for x, z, w in [(-.32,.24,.15),(.24,-.27,.12),(.34,.30,.06)]:
        box(tile, 'dust_patch', x, .0005, z, w, .002, w*.38, 'sand', rng.uniform(-.3,.3))
    for x, z in [(-.32,-.27),(.24,.32)]:
        box(tile, 'buried_stone', x, .012, z, .063, .027, .042, 'stone', .25)
    for side in [-1,1]:
        box(tile, 'bank_stone', side*.446, -.17, -.22+variant*.14, .025, .053, .13, 'stone_dark')
    export(tile, tile.name)

core = group('sample_core')
def b(name,x,y,z,w,h,d,m,angle=0):
    return box(core,name,x,y,z,w,h,d,m,angle)
b('foundation',0,.04,0,.89,.08,.86,'stone_dark')
b('foundation_cap',0,.085,0,.84,.035,.80,'stone')
b('plaster',0,.32,0,.70,.45,.62,'plaster')
for x in [-.35,.35]:
    for z in [-.31,.31]:
        b('structural_post',x,.32,z,.066,.48,.07,'wood_dark')
        b('post_shoe',x,.14,z,.075,.12,.078,'iron')
for z in [-.323,.323]:
    for y in [.20,.53]: b('horizontal_beam',0,y,z,.74,.055,.042,'wood')
for x in [-.357,.357]:
    for y in [.20,.53]: b('side_beam',x,y,0,.04,.05,.64,'wood')
b('door_recess',-.075,.275,-.333,.26,.35,.035,'dark')
for i in range(4):
    b('door_plank',-.166+i*.060,.264,-.359,.056,.308,.027,'wood' if i%2 else 'wood_light')
for y in [.17,.36]: b('door_strap',-.076,y,-.38,.235,.022,.017,'iron')
b('door_latch',.007,.27,-.393,.023,.042,.015,'brass')
b('step_lower',-.075,.032,-.412,.34,.064,.092,'stone')
b('step_upper',-.075,.077,-.39,.29,.026,.092,'stone_light')
for x in [-.242,.239]:
    b('front_window_frame',x,.39,-.342,.13,.16,.040,'wood_dark')
    b('front_glass',x,.40,-.365,.095,.10,.012,'glass')
    b('front_sill',x,.32,-.37,.15,.025,.055,'wood_light')
for z in [-.12,.15]:
    b('side_frame',-.37,.38,z,.035,.18,.18,'wood_dark')
    b('side_glass',-.391,.39,z,.012,.12,.13,'glass')
    b('side_mullion',-.40,.39,z,.014,.12,.018,'wood_light')
    b('side_sill',-.39,.29,z,.065,.027,.20,'wood')
# Gable is an actual solid wedge, not a visible pile of stair cubes.
verts=[(-.36,-.32,.545),(.36,-.32,.545),(0,-.32,.775),(-.36,.32,.545),(.36,.32,.545),(0,.32,.775)]
mesh=bpy.data.meshes.new('gable_mesh')
mesh.from_pydata(verts,[],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
obj=bpy.data.objects.new('gable',mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=core;mesh.materials.append(materials['wood'])
for side in [-1,1]:
    for strip in range(5):
        roof=b('sheet_roof',side*.216,.67,-.32+strip*.16,.49,.033,.157,'roof' if strip%2 else 'roof_light')
        roof.rotation_euler.y=side*.565
        rib=b('standing_seam',side*.216,.691,-.394+strip*.16,.495,.020,.018,'roof_light')
        rib.rotation_euler.y=side*.565
    for z in [-.41,.41]:
        fascia=b('fascia',side*.216,.65,z,.49,.054,.031,'wood_dark');fascia.rotation_euler.y=side*.565
b('ridge_cap',0,.835,0,.074,.042,.86,'iron')
b('chimney',.21,.80,.19,.12,.27,.14,'stone_dark')
for y in [.76,.83,.90]: b('chimney_course',.21,y,.19,.126,.013,.146,'stone')
b('chimney_cap',.21,.955,.19,.16,.035,.18,'stone_light')
b('chimney_opening',.21,.974,.19,.093,.004,.11,'dark')
# Deliberate, readable repairs rather than random decorative flecks.
b('repair_patch',.254,.245,-.345,.12,.04,.018,'wood_light')
b('gable_vent',0,.64,-.326,.095,.074,.013,'dark')
for y in [.62,.65,.68]: b('vent_slat',0,y,-.338,.107,.014,.020,'wood_light')
export(core,'sample_core')

wall=group('sample_wall')
box(wall,'footing',0,.05,0,.90,.10,.48,'stone_dark')
for row in range(3):
    for col in range(3):
        x=(col-1)*.276
        box(wall,'concrete_block',x,.16+row*.15,0,.264,.141,.28,
            ['stone','stone_light','stone_dark'][(row+col)%3])
for x in [-.32,.32]:
    box(wall,'brace',x,.30,-.163,.055,.49,.047,'iron')
    for y in [.12,.43]: box(wall,'bolt',x,y,-.19,.022,.022,.012,'iron_light')
for x in [-.28,0,.28]: box(wall,'cap',x,.555,0,.273,.06,.35,'stone_light')
box(wall,'chipped_cap',.37,.59,.09,.08,.022,.11,'stone_dark')
export(wall,'sample_wall')

sample=group('sample_diorama')
def instance(source,name,x,z):
    root=group(name);root.parent=sample;root.location=(x,-z,0)
    for child in source.children:
        obj=child.copy();obj.data=child.data;bpy.context.scene.collection.objects.link(obj);obj.parent=root
    return root
for row in range(-1,2):
    for col in range(-1,2): instance(tiles[(row+col)%3],f'tile_{row}_{col}',col,row)
instance(core,'core_center',0,0)
for col in [-1,0,1]: instance(wall,f'wall_{col}',col,1)
# A readable hand-built tree gives the sample a clear environment silhouette.
tree=group('sample_tree')
box(tree,'tree_root',0,.05,0,.30,.10,.26,'wood_dark')
box(tree,'tree_trunk',0,.36,0,.13,.62,.13,'wood')
for y,w,d in [(.48,.48,.40),(.68,.38,.34),(.86,.27,.25),(.99,.16,.16)]:
    box(tree,'tree_crown',0,y,0,w,.22,d,'grass')
instance(tree,'tree_-1_0',-1,0)
export(sample,'sample_diorama')
for source in [*tiles,core,wall,tree]:
    for child in list(source.children): bpy.data.objects.remove(child,do_unlink=True)
    bpy.data.objects.remove(source,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sample_diorama.blend'))
print('WARM_EARTH_SAMPLE_COMPLETE')

