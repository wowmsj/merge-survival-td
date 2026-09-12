"""Three reference-led Blender samples. Run inside Blender; preserve existing scenes."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

OUT=Path(r'D:\小程序和小游戏\二合+生存建造\assets\models\blender-samples')
OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.new('ArtSamples_Refined')
bpy.context.window.scene=scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.view_settings.view_transform='Standard'
scene.world=bpy.data.worlds.new('Samples_World');scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background') or scene.world.node_tree.nodes.new('ShaderNodeBackground')
wo=scene.world.node_tree.nodes.get('World Output') or scene.world.node_tree.nodes.new('ShaderNodeOutputWorld')
scene.world.node_tree.links.new(bg.outputs[0],wo.inputs['Surface'])
bg.inputs['Color'].default_value=(.65,.72,.8,1)
bg.inputs['Strength'].default_value=.45

def linear(hex):
    a=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a)
def mat(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;c=(*linear(color),1)
    m.diffuse_color=c;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=c;p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
M={k:mat(k,c) for k,c in dict(ink='493329',steel='9ca99d',lid='c3c2a2',rust='99623d',rustlight='b47d50',edge='776753',brass='b6a16d',gold='d6a650',cloth='ba8d42',clothlight='dab772',pad='73694a',padlight='a99b70',thread='e7d0a2',inside='493f33',orange='e8a443',stripe='b76d32',cream='f7e6b5',pink='da9484',eye='402b27',white='fff4da').items()}
next(n for n in M['steel'].node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Metallic'].default_value=.18
M['ink'].node_tree.nodes.clear();o=M['ink'].node_tree.nodes.new('ShaderNodeOutputMaterial');e=M['ink'].node_tree.nodes.new('ShaderNodeEmission');e.inputs[0].default_value=(*linear('493329'),1);M['ink'].node_tree.links.new(e.outputs[0],o.inputs[0]);M['ink'].use_backface_culling=True
roots=[];root=None
def register(o,name,material):
    o.name=name
    for col in list(o.users_collection):col.objects.unlink(o)
    scene.collection.objects.link(o)
    if root:o.parent=root
    if material:o.data.materials.append(M[material] if isinstance(material,str) else material)
    return o
def apply(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def cube(name,loc,size,material,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=register(bpy.context.object,name,material);o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:m=o.modifiers.new('Soft worked edges','BEVEL');m.width=bevel;m.segments=3
    apply(o)
    for p in o.data.polygons:p.use_smooth=True
    m=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');m.keep_sharp=True
    return apply(o)
def sphere(name,loc,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc);o=register(bpy.context.object,name,material);o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o
def path(name,points,r,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=3;c.resolution_u=12
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.parent=root;c.materials.append(M[material]);return o
def poly(name,points,material):
    me=bpy.data.meshes.new(name);me.from_pydata(points,[],[tuple(range(len(points)))]);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=root;me.materials.append(M[material]);return o
def rivet(x,y,z,face='front'):
    s=(.012,.004,.012) if face=='front' else (.012,.012,.004)
    sphere('Recessed rivet',(x,y,z),s,'edge')
    if face=='front':path('Screw slot',[(x-.004,y-.004,z),(x+.004,y-.004,z)],.0015,'ink')
def begin(id):
    global root
    root=bpy.data.objects.new('prop_'+str(id),None);scene.collection.objects.link(root);roots.append((id,root));return root
def surface_patch(name,xz,center,scale,material,offset=.003):
    # Triangulated surface patches follow the host ellipsoid instead of floating rectangular decals.
    cx,cy,cz=center;sx,sy,sz=scale
    def pos(x,z):return (x,cy-sy*math.sqrt(max(.015,1-((x-cx)/sx)**2-((z-cz)/sz)**2))-offset,z)
    mx=sum(p[0] for p in xz)/len(xz);mz=sum(p[1] for p in xz)/len(xz)
    points=[pos(mx,mz)]+[pos(*p) for p in xz]
    me=bpy.data.meshes.new(name);me.from_pydata(points,[],[(0,i+1,(i+1)%len(xz)+1) for i in range(len(xz))]);me.update()
    import bmesh
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=6,use_grid_fill=True)
    for v in bm.verts:v.co=pos(v.co.x,v.co.z)
    bm.to_mesh(me);bm.free();me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=root;me.materials.append(M[material]);return o

def toolbox():
    begin(10005)
    cube('Folded metal case',(0,0,.29),(1,.57,.52),'steel',.045)
    cube('Dark lid seam',(0,0,.552),(1.035,.60,.037),'ink',.014)
    cube('Overhanging lid',(0,0,.598),(1.06,.63,.08),'lid',.035)
    cube('Lid raised center',(0,0,.643),(.91,.48,.022),'lid',.018)
    for x in [-.46,.46]:
        for z in [.115,.47]:
            # Rounded corner protectors wrap the front and sides.
            cube('Corner guard',(x,-.292,z),(.105,.022,.125),'edge',.022)
            rivet(x,-.31,z)
        for y in [-.24,.24]:
            cube('Lid corner patch',(x,y,.647),(.105,.10,.008),'brass',.025);rivet(x,y,.656,'top')
    for y in [-.18,.18]:
        cube('Handle mounting plate',(-.19,y,.665),(.095,.08,.012),'edge',.012);rivet(-.19,y,.678,'top')
    path('Bent steel carrying handle',[(-.19,-.18,.683),(-.13,-.18,.747),(.06,-.18,.765),(.12,-.11,.765),(.12,.11,.765),(.06,.18,.765),(-.13,.18,.747),(-.19,.18,.683)],.022,'edge')
    cube('Latch backing',(0,-.313,.482),(.115,.028,.21),'edge',.026)
    cube('Latch silver tongue',(0,-.337,.505),(.07,.018,.155),'brass',.015)
    path('Latch roll',[(-.046,-.356,.557),(.046,-.356,.557)],.012,'edge')
    sphere('Latch keyhole',(0,-.351,.457),(.012,.003,.018),'ink')
    for x in [-.30,.30]:cube('Back hinge',(x,.302,.54),(.15,.035,.055),'edge',.012)
    rng=random.Random(28)
    # Local edge corrosion, not uniform speckle over every surface.
    for i in range(34):
        x=rng.uniform(-.45,.45);z=rng.choice([.075,.515])+rng.uniform(-.018,.017);w=rng.uniform(.018,.065);h=rng.uniform(.008,.032)
        pts=[(x-w,-.288,z),(x-w*.5,-.29,z+h),(x,-.292,z+h*.65),(x+w,-.29,z+h*.9),(x+w*.7,-.291,z-h),(x,-.291,z-h*.55)]
        poly('Irregular rust flake',pts,'rust' if i%3 else 'rustlight')
    for i in range(23):
        x=rng.uniform(-.47,.47);y=rng.choice([-.24,.24])+rng.uniform(-.03,.02);w=rng.uniform(.012,.06)
        poly('Lid chipped paint',[(x-w,y,.658),(x-w*.4,y+.026,.658),(x+w,y+.017,.658),(x+w*.5,y-.015,.658)],'rustlight')
    for x in [-.33,.26]:path('Short scraped metal',[(x,-.294,.32),(x+.065,-.294,.36)],.002,'brass')

def fuse(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=name
    m=o.modifiers.new('Continuous sculpt surface','REMESH');m.mode='VOXEL';m.voxel_size=.008;m.use_smooth_shade=True;apply(o)
    m=o.modifiers.new('Relax skin','SMOOTH');m.factor=.8;m.iterations=5;apply(o)
    m=o.modifiers.new('Sculpt subdivision','SUBSURF');m.levels=1;apply(o)
    m=o.modifiers.new('Web geometry reduction','DECIMATE');m.ratio=.45;apply(o)
    return o
def glove(back=False):
    before=set(scene.objects)
    palm=sphere('Anatomical palm',(0,0,.36),(.185,.085,.25),'clothlight' if back else 'cloth')
    parts=[palm]
    fingers=[(-.142,.84,.041),(-.049,.96,.047),(.051,.92,.045),(.143,.80,.038)]
    for i,(x,tip,r) in enumerate(fingers):
        start=.48;parts.append(sphere('Finger',(x,-.003,(start+tip)/2),(r,r*.91,(tip-start)/2),'cloth'))
    thumb=sphere('Opposing thumb',(-.23,-.013,.42),(.058,.06,.17),'cloth');thumb.rotation_euler.y=-.52;parts.append(thumb)
    fuse(parts,'Unified glove leather')
    cube('Open cuff outer',(0,.003,.14),(.34,.15,.14),'pad',.032)
    cube('Cuff interior',(0,-.005,.077),(.275,.1,.012),'inside',.016)
    cube('Wrist closure',(0,-.084,.15),(.275,.026,.09),'clothlight',.028)
    # Finger pads and knuckle protectors have shaped edges and stitched borders.
    for i,(x,tip,r) in enumerate(fingers):
        center=(tip+.51)/2
        cube('Finger reinforcement',(x,-r*.91-.004,center),(.061,.015,(tip-.5)*.58),'pad',.021)
        path('Finger side seam',[(x-r*.82,-r*.55,.55),(x-r*.82,-r*.55,tip-.03)],.002,'thread')
        for j in range(4):
            z=center-.04+j*.025;path('Pad stitching',[(x-.018,-r-.012,z),(x-.008,-r-.012,z+.008)],.0015,'thread')
    cube('Broad palm grip' if back else 'Knuckle guard',(0,-.084,.38),(.265,.023,.25 if back else .14),'pad',.036)
    for i in range(9):
        for j in range(4 if back else 2):
            x=-.102+i*.025;z=.305+j*.039 if back else .35+j*.045
            sphere('Grip fabric weave',(x,-.1,z),(.006,.002,.009),'padlight')
    for x in [-.144,.144]:
        for j in range(8):path('Palm edge stitching',[(x,-.047,.2+j*.027),(x*.96,-.052,.21+j*.027)],.0017,'thread')
    for z in [.223,.263]:path('Leather flex crease',[(-.10,-.073,z),(0,-.086,z-.012),(.095,-.073,z)],.0025,'edge')
    created=set(scene.objects)-before
    pivot=bpy.data.objects.new('Left glove' if back else 'Right glove',None);scene.collection.objects.link(pivot);pivot.parent=root
    for o in created:o.parent=pivot
    pivot.rotation_euler.y=.18 if back else -.16;pivot.rotation_euler.z=-.10 if back else .1
    pivot.location=(-.17,.07,.06) if back else (.18,-.07,0)
def gloves():begin(10028);glove(True);glove(False)

def cat():
    begin(50025)
    body=(0,.055,.38);bs=(.205,.155,.29);head=(0,-.015,.77);hs=(.27,.202,.235)
    sphere('Pear shaped sitting torso',body,bs,'orange')
    sphere('Seated right haunch',(.145,.07,.22),(.145,.16,.19),'orange')
    sphere('Seated left haunch',(-.14,.07,.22),(.12,.15,.18),'orange')
    sphere('Broad kitten head',head,hs,'orange')
    for s in [-1,1]:
        x=s*.185
        # Closed extruded ear wedge with softened corners.
        pts=[(x-s*.095,-.06,.90),(x+s*.065,-.02,1.105),(x+s*.11,.005,.9),(x-s*.08,.075,.90),(x+s*.065,.08,1.105),(x+s*.1,.10,.9)]
        me=bpy.data.meshes.new('Ear');me.from_pydata(pts,[],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]);me.update();o=bpy.data.objects.new('Soft pointed ear',me);scene.collection.objects.link(o);o.parent=root;me.materials.append(M['orange']);m=o.modifiers.new('Ear soft edges','BEVEL');m.width=.018;m.segments=3;apply(o)
        poly('Pink inner ear',[(x-s*.047,-.071,.916),(x+s*.059,-.027,1.068),(x+s*.072,-.01,.92)],'pink')
    surface_patch('Cream chest',[(-.115,.56),(-.14,.47),(-.1,.33),(-.055,.23),(.065,.23),(.12,.35),(.14,.47),(.11,.56)],body,bs,'cream',.005)
    for x in [-.09,.09]:
        sphere('Front leg',(x,-.073,.24),(.061,.068,.195),'orange')
        sphere('Cream paw',(x,-.097,.065),(.068,.075,.046),'cream')
        for dx in [-.016,.016]:path('Toe separation',[(x+dx,-.167,.052),(x+dx,-.17,.072)],.0018,'stripe')
    # Smile and muzzle stay on the front of the head, not on a flat card.
    for x in [-.053,.053]:sphere('Cream muzzle',(x,-.204,.697),(.068,.027,.052),'cream')
    sphere('Cream chin',(0,-.194,.654),(.065,.028,.036),'cream')
    for x in [-.102,.102]:
        sphere('Dark chocolate eye',(x,-.202,.798),(.034,.017,.043),'eye')
        sphere('Eye glint',(x-.008,-.216,.814),(.006,.003,.008),'white')
    sphere('Nose',(0,-.24,.728),(.024,.01,.014),'pink')
    path('Nose edge',[(-.02,-.25,.732),(0,-.252,.718),(.02,-.25,.732)],.003,'eye')
    path('Kitten smile',[(-.037,-.239,.694),(-.021,-.244,.682),(0,-.246,.699),(.021,-.244,.682),(.037,-.239,.694)],.003,'eye')
    for s in [-1,1]:
        for j in range(2):path('Short whisker',[(s*.16,-.17,.72-j*.034),(s*.235,-.15,.714-j*.04)],.0027,'eye')
    for x in [-.09,0,.09]:surface_patch('Tapered forehead stripe',[(x-.025,.968),(x+.022,.965),(x+.012,.904),(x-.002,.864),(x-.018,.915)],head,hs,'stripe')
    for s in [-1,1]:
        for j in range(2):surface_patch('Cheek tabby stripe',[(s*.239,.79-j*.07),(s*.265,.785-j*.07),(s*.228,.755-j*.07),(s*.178,.754-j*.07)],head,hs,'stripe')
    for s in [-1,1]:
        for j in range(3):surface_patch('Flank tabby stripe',[(s*.176,.53-j*.09),(s*.193,.50-j*.09),(s*.159,.47-j*.09),(s*.12,.476-j*.09)],body,bs,'stripe')
    tail=path('Upright curved tail',[(.15,.17,.16),(.30,.13,.24),(.355,.09,.38),(.33,.08,.56),(.345,.075,.72),(.395,.07,.785)],.039,'orange')
    path('Cream tail tip',[(.345,.075,.72),(.36,.073,.765),(.395,.07,.785)],.0395,'cream')
    for p in [[(.326,.08,.50),(.334,.08,.555)],[(.35,.083,.36),(.347,.08,.411)]]:path('Tail stripe band',p,.04,'stripe')

def meshify(o):
    if o.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return o
def finish(r):
    objects=[o for o in r.children_recursive if o.type in {'MESH','CURVE'}]
    for o in objects:meshify(o)
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    scale=.83/max(hi-lo);shift=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))
    # Bake all hierarchy transforms and normalization; GLB root remains unit scale.
    for o in objects:
        world=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
        for v in o.data.vertices:v.co=(world@v.co+shift)*scale
        o.parent=r
    for o in list(r.children):
        if o.type=='EMPTY' and not o.children:bpy.data.objects.remove(o,do_unlink=True)
    # Portable inverted-hull outline. Only closed volume meshes receive a shell.
    for o in list(objects):
        if len(o.data.polygons)<20 or min(o.dimensions)<.012:continue
        me=o.data.copy();shell=bpy.data.objects.new('Ink silhouette',me);scene.collection.objects.link(shell);shell.parent=r;me.materials.clear();me.materials.append(M['ink'])
        for v in me.vertices:v.co+=v.normal*.0015
        import bmesh
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    # Join by material for static display, keeping the hand-authored shape and normals.
    buckets={}
    for o in list(r.children_recursive):
        if o.type=='MESH':buckets.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
    for key,obs in buckets.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:o.select_set(True)
        bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name='Surface_'+key[0];obs[0].parent=r

def render_outline(enabled):
    # Cycles needs explicit backface transparency to match the single-sided GLB hull.
    for o in scene.objects:
        if o.type=='MESH' and any(m and m.name.startswith('ink') for m in o.data.materials):
            o.visible_shadow=False;o.visible_diffuse=False;o.visible_glossy=False
    nodes=M['ink'].node_tree.nodes;links=M['ink'].node_tree.links
    output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');emission=next(n for n in nodes if n.type=='EMISSION')
    if not enabled:links.new(emission.outputs[0],output.inputs[0]);return
    geometry=nodes.new('ShaderNodeNewGeometry');transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader')
    links.new(geometry.outputs['Backfacing'],mix.inputs[0]);links.new(emission.outputs[0],mix.inputs[1]);links.new(transparent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])

def camera(loc,target,ortho):
    bpy.ops.object.camera_add(location=loc);o=bpy.context.object
    for col in list(o.users_collection):col.objects.unlink(o)
    scene.collection.objects.link(o);o.name='Sample camera';o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.type='ORTHO';o.data.ortho_scale=ortho;scene.camera=o;return o
def light(name,loc,power,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.35))-o.location).to_track_quat('-Z','Y').to_euler()
toolbox();gloves();cat()
for id,r in roots:finish(r)
root=None
cam=camera((1.8,-3,2.15),(0,0,.39),1.16)
light('Large warm key',(-3,-4,6),350,5);light('Soft fill',(3,-2,3),130,4);light('Rim',(.5,3,4),180,3)
manifest=[]
for id,r in roots:
    for other_id,other in roots:
        for o in other.children_recursive:o.hide_render=other!=r;o.hide_set(other!=r)
    bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
    for o in r.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=r
    render_outline(False)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'prop_{id}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    manifest.append({'id':id,'file':f'prop_{id}.glb','preview':f'prop_{id}.png','status':'Blender sample','bytes':(OUT/f'prop_{id}.glb').stat().st_size})
    render_outline(True)
    scene.render.filepath=str(OUT/f'prop_{id}.png');bpy.ops.render.render(write_still=True)
for i,(id,r) in enumerate(roots):
    for o in r.children_recursive:o.hide_render=False;o.hide_set(False)
    r.location.x=(i-1)*1.05
cam.location=(1.8,-4.8,2.5);cam.rotation_euler=(Vector((0,0,.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.5
scene.render.resolution_x=1440;scene.render.resolution_y=700;scene.render.filepath=str(OUT/'lineup.png');bpy.ops.render.render(write_still=True)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'refined-samples.blend'),copy=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('SAMPLES_COMPLETE',json.dumps(manifest))
