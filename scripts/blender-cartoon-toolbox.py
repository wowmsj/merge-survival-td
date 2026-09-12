"""L3 cartoon direction test, preserving the approved assembly models."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-toolbox-progression.py').read_text(encoding='utf8').split('for build in (loose_handle,wooden_lid,simple_chest,reinforced_chest,toolbox):')[0],str(base/'blender-toolbox-progression.py'),'exec'))
scene.name='Cartoon_L3_Study'
for key,color in {'wood':'c57726','woodlight':'efa13d','wooddark':'653923','edge':'584039','chip':'ffcd75','grain':'995321','metal':'8298a0'}.items():
    M[key]=mat('Cartoon_'+key,color,.72)
simple_chest();r=roots[-1][1]
for o in list(r.children_recursive):
    if o.name.startswith(('Lid wood fibres','Side wood grain','Grip worn highlight','End cap plank seam')):
        bpy.data.objects.remove(o,do_unlink=True);continue
    if o.name.startswith('Curved carrying grip'):o.data.bevel_depth=.042
    if o.name.startswith('Handle foot'):o.scale*=1.35
    if o.name.startswith('Simple wooden latch'):o.scale*=1.65
    if o.name.startswith('Horizontal side plank'):
        o.rotation_euler.y=.012 if o.location.z<.16 else -.009
    if o.name.startswith('Wooden lid end trim'):
        o.scale.x=1.025
# Bold end battens, oversized wooden latch and sparse hand-drawn marks.
for x in (-.46,.46):
    for z in (.085,.22):
        cube('Chunky end plank',(x,0,z),(.05,.55,.12),'woodlight' if z>.1 else 'wood',.019)
    for y in (-.21,.21):
        cube('Wood end upright',(x*1.03,y,.16),(.045,.064,.27),'wooddark',.014)
        sphere('Large iron nail',(x*1.09,y,.23),(.007,.014,.014),'metal')
for y,z in [(-.272,.398),(-.197,.522),(.13,.566)]:
    path('Broad curved wood grain',[(-.28,y,z),(-.19,y-.004,z+.003),(-.07,y,z),(.04,y+.003,z-.002)],.0035,'grain')
for x,z in [(-.22,.12),(.18,.22)]:
    path('Wood knot',[(x-.03,-.291,z),(x,-.297,z+.014),(x+.04,-.291,z),(x,-.297,z-.008),(x-.03,-.291,z)],.0038,'wooddark')
poly('Chipped board corner',[(-.30,-.289,.257),(-.23,-.291,.248),(-.27,-.293,.231),(-.32,-.29,.239)],'chip')
path('Wood split',[(.28,-.289,.16),(.23,-.293,.154),(.25,-.294,.145),(.19,-.289,.141)],.0035,'wooddark')
# Low-amplitude silhouette deformation keeps joinery coherent while breaking perfect symmetry.
for o in list(r.children_recursive):
    if o.type=='CURVE':meshify(o)
bpy.context.view_layer.update()
for o in list(r.children_recursive):
    if o.type!='MESH':continue
    world=o.matrix_world.copy();inv=world.inverted()
    for v in o.data.vertices:
        p=world@v.co;p.x+=.035*(p.z/.8)**2;p.z+=.012*math.sin(p.x*5)*(p.z/.8);v.co=inv@p
finish(r)
with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
    bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
    for o in r.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=r
    bpy.ops.export_scene.gltf(filepath=str(OUT/'cartoon_10003.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cartoon-toolbox.blend'),copy=True)
print('CARTOON_COMPLETE')
