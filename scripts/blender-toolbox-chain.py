"""Reference-led chain samples; run in a separate Blender process to isolate exports."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-samples.py').read_text(encoding='utf8').split('toolbox();gloves();cat()')[0],str(base/'blender-samples.py'),'exec'))
scene.name='Toolbox_Reference_Rebuild'
OUT=base.parent/'assets/models/blender-samples'
M.update({k:mat(k,c) for k,c in {'wood':'b77a42','woodlight':'d69c58','wooddark':'8b522f','grain':'945d34','metal':'a49b7f','chip':'dfb976'}.items()})

def screw(x,y,z):
    sphere('Rivet',(x,y,z),(.012,.012,.006),'edge')
    path('Screw slot',[(x-.005,y,z+.006),(x+.005,y,z+.006)],.0014,'ink')

def arc_panel(name,x1,x2,a1,a2,r,thick,ma):
    verts=[];steps=8
    for x in (x1,x2):
        for radius in (r,r-thick):
            for i in range(steps+1):
                a=a1+(a2-a1)*i/steps;verts.append((x,radius*math.cos(a),.31+radius*math.sin(a)))
    n=steps+1;faces=[]
    for i in range(steps):
        faces.extend([(i,i+1,2*n+i+1,2*n+i),(n+i,3*n+i,3*n+i+1,n+i+1),(i,n+i,n+i+1,i+1),(2*n+i,2*n+i+1,3*n+i+1,3*n+i)])
    faces.extend([(0,2*n,3*n,n),(n-1,2*n-1,4*n-1,3*n-1)])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=root;me.materials.append(M[ma])
    for p in me.polygons:p.use_smooth=True
    return o

def wood_grain_top(x1,x2,y,z,seed):
    rng=random.Random(seed)
    for j in range(5):
        start=rng.uniform(x1,x2-.08);end=min(x2,start+rng.uniform(.07,.24));yy=y+rng.uniform(-.018,.018)
        path('Fine timber grain',[(start,yy,z),(start+(end-start)*.4,yy+.002,z+.001),(end,yy-.001,z)],.0018,'grain' if j%2 else 'chip')

def chest():
    begin(10001)
    cube('Dark joinery core',(0,0,.17),(.89,.53,.28),'wooddark',.018)
    for side in (-1,1):
        for j in range(3):
            z=.079+j*.086
            cube('Horizontal side plank',(0,side*.266,z),(.89,.035,.079),'wood' if j%2 else 'woodlight',.009)
            for k in range(3):path('Side wood grain',[(-.32+k*.19,side*.285,z-.019),(-.22+k*.19,side*.286,z-.016),(-.17+k*.19,side*.285,z-.022)],.002,'grain')
        for x in (-.45,.45):
            cube('End lower boards',(x,0,.17),(.035,.52,.28),'wood',.012)
    for j in range(9):
        a1=j*math.pi/9+.011;a2=(j+1)*math.pi/9-.011
        arc_panel('Individual arched lid board',-.45,.45,a1,a2,.285,.024,'woodlight' if j%3 else 'wood')
        for k in range(3):
            a=(a1+a2)/2+(k-1)*.055;y=.287*math.cos(a);z=.31+.287*math.sin(a)
            path('Lid wood fibres',[(-.29,y,z),(-.08,y+.001,z+.001),(.17,y,z)],.0017,'grain')
    for x in (-.43,.43):
        # Solid semicircular end cap under the arch: the lid is a closed wooden shell.
        points=[(x,0,.31)]+[(x,.275*math.cos(i*math.pi/24),.31+.275*math.sin(i*math.pi/24)) for i in range(25)]
        cap=poly('Wooden arched end',points,'wood')
        cap.data.materials[0].use_backface_culling=False
        for z in (.39,.48):
            w=math.sqrt(.275**2-(z-.31)**2)
            path('End cap plank seam',[(x+(-.004 if x<0 else .004),-w,z),(x+(-.004 if x<0 else .004),w,z)],.0025,'wooddark')
        arc_panel('Metal arch strap',x-.031,x+.031,0,math.pi,.298,.012,'metal')
        for y in (-.279,.279):
            cube('Vertical strap',(x,y,.17),(.063,.019,.28),'metal',.008)
            for z in (.09,.24):sphere('Strap rivet',(x,y*1.045,z),(.012,.005,.012),'edge')
        for a in (.35,1.0,2.1,2.8):
            sphere('Arch fastener',(x,.303*math.cos(a),.31+.303*math.sin(a)),(.01,.009,.009),'edge')
    for x in (-.18,.18):
        cube('Latch backing',(x,-.301,.32),(.063,.018,.13),'edge',.012)
        cube('Latch tongue',(x,-.314,.32),(.044,.013,.103),'metal',.009)
        path('Latch hinge',[(x-.025,-.327,.354),(x+.025,-.327,.354)],.007,'edge')
    for x in (-.17,.17):cube('Handle foot',(x,0,.601),(.075,.08,.015),'metal',.013);screw(x,0,.613)
    path('Curved carrying grip',[(-.17,0,.617),(-.17,0,.705),(-.115,0,.747),(.115,0,.747),(.17,0,.705),(.17,0,.617)],.025,'edge')
    path('Grip worn highlight',[(-.12,-.02,.758),(0,-.021,.763),(.11,-.02,.758)],.003,'chip')

def shallow_box():
    begin(10002)
    cube('Recessed dark core',(0,0,.105),(.84,.61,.17),'wooddark',.018)
    for j in range(5):
        y=-.24+j*.12
        cube('Lid separate board',(0,y,.191),(.82,.112,.048),'woodlight' if j%2 else 'wood',.007)
        wood_grain_top(-.35,.35,y,.216,42+j)
    for x in (-.37,.37):
        cube('Cross grain brace',(x,0,.226),(.09,.64,.029),'wood',.01)
        for y in (-.23,.23):screw(x,y,.246)
    for side in (-1,1):
        for j in range(2):
            cube('Side joinery',(0,side*.31,.066+j*.075),(.84,.025,.069),'wood',.008)
            path('Long side grain',[(-.29,side*.324,.07+j*.075),(-.1,side*.325,.083+j*.075),(.16,side*.324,.08+j*.075)],.002,'grain')
    for x in (-.39,.39):
        for y in (-.277,.277):
            cube('Steel corner front',(x,y/abs(y)*.329,.111),(.105,.018,.20),'metal',.009)
            cube('Steel corner return',(x/abs(x)*.429,y,.111),(.018,.092,.20),'metal',.009)
            cube('Steel top corner',(x,y,.25),(.10,.095,.018),'metal',.015)
            screw(x,y,.263)
            for z in (.06,.15):sphere('Corner rivet',(x,y/abs(y)*.343,z),(.011,.005,.011),'edge')
    for x,y in [(-.18,-.12),(.2,.12)]:
        path('Small timber knot',[(x-.025,y,.219),(x,y-.011,.219),(x+.02,y,.219),(x,y+.009,.219),(x-.025,y,.219)],.0025,'grain')
    for x in (-.27,.22):poly('Edge chipped timber',[(x,-.299,.218),(x+.03,-.284,.218),(x+.044,-.297,.218)],'chip')

for build in (chest,shallow_box):
    build();r=roots[-1][1];finish(r)
    # Export only this root from this scene; never inherit selections from other scenes.
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
        for o in r.children_recursive:o.select_set(True)
        bpy.context.view_layer.objects.active=r
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'rebuilt_{roots[-1][0]}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
for i,(_,r) in enumerate(roots):r.location.x=i*1.1
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'toolbox-chain-rebuilt.blend'),copy=True)
print('CHAIN_REBUILD_COMPLETE')
