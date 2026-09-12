"""Five-stage assembly proposal; separate from production prop configuration."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-toolbox-chain.py').read_text(encoding='utf8').split('for build in (chest,shallow_box):')[0],str(base/'blender-toolbox-chain.py'),'exec'))
scene.name='Toolbox_Assembly_Progression'

def handle(z):
    for x in (-.17,.17):
        cube('Handle mounting foot',(x,0,z),(.078,.09,.025),'metal',.014)
        screw(x,0,z+.018)
    path('Bent iron handle',[(-.17,0,z+.025),(-.17,0,z+.11),(-.11,0,z+.155),(.11,0,z+.155),(.17,0,z+.11),(.17,0,z+.025)],.025,'edge')
    path('Worn grip edge',[(-.12,-.023,z+.163),(0,-.023,z+.17),(.11,-.023,z+.163)],.0025,'chip')
    for x in (-.08,.04):
        path('Rust wear on grip',[(x,-.025,z+.154),(x+.024,-.025,z+.158)],.003,'rust')

def loose_handle():
    begin(10001);handle(.015)

def wooden_lid():
    begin(10002)
    for j in range(5):
        y=-.22+j*.11
        cube('Thin lid plank',(0,y,.04),(.88,.104,.055),'woodlight' if j%2 else 'wood',.008)
        wood_grain_top(-.4,.4,y,.069,83+j)
    for x in (-.35,.35):
        cube('Underside cross brace',(x,0,.013),(.08,.55,.025),'wooddark',.006)
        for y in (-.2,.2):screw(x,y,.072)
    handle(.081)

def simple_chest():
    chest();r=roots[-1][1];r.name='prop_10003';roots[-1]=(10003,r)
    # Keep the same wood body and lid, reserve metal reinforcement for L4.
    for o in list(r.children_recursive):
        if o.name.startswith(('Metal arch strap','Vertical strap','Strap rivet','Arch fastener','Latch backing','Latch tongue','Latch hinge')):
            bpy.data.objects.remove(o,do_unlink=True)
    for x in (-.43,.43):
        arc_panel('Wooden lid end trim',x-.018,x+.018,0,math.pi,.294,.012,'wooddark')
    cube('Simple wooden latch',(0,-.299,.31),(.08,.026,.10),'wooddark',.013)

def reinforced_chest():
    chest();r=roots[-1][1];r.name='prop_10004';roots[-1]=(10004,r)
    for x in (-.41,.41):
        for y in (-.28,.28):
            cube('Lower corner protector',(x,y,.065),(.115,.043,.105),'metal',.012)

for build in (loose_handle,wooden_lid,simple_chest,reinforced_chest,toolbox):
    build();id,r=roots[-1];finish(r)
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
        for o in r.children_recursive:o.select_set(True)
        bpy.context.view_layer.objects.active=r
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'assembly_{id}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
for i,(_,r) in enumerate(roots):r.location.x=i*1.05
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'toolbox-assembly.blend'),copy=True)
print('ASSEMBLY_COMPLETE')
