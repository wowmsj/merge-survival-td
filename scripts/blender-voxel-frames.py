"""Structural steel chain 20052..20058, voxel samples."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Structural_Steel_32';names=['弹簧零件','废铁块','铁棒','钢筋捆','钢架','加固钢架','装甲板']
def beam(a,b,c,width=2):
    steps=max(abs(b[i]-a[i]) for i in range(3))*2
    for n in range(steps+1):
        x,y,z=[round(a[i]+(b[i]-a[i])*n/max(1,steps)) for i in range(3)]
        rect(x-width//2,z,width,width,c,width,y)
def frame(w,d,h,c):
    for x in (-w,w):
        for y in (-d,d):beam((x,y,0),(x,y,h),c)
    for z in (0,h):
        for y in (-d,d):beam((-w,y,z),(w,y,z),c)
        for x in (-w,w):beam((x,-d,z),(x,d,z),c)
manifest=[]
for level in range(7):
    cells={}
    if level==0:
        # Silver horizontal spring differs from the previous chain's rusty upright coil.
        for n in range(601):
            t=n/600;a=t*math.pi*12
            x=round(5*math.cos(a));y=round(-14+t*28);z=6+round(5*math.sin(a))
            rect(x-1,z,2,2,4,2,y)
    elif level==1:
        for x,y,z,w,d,h,c in [(-10,0,0,20,18,8,10),(-12,-2,3,9,16,9,6),(-3,2,7,13,15,12,6),(-5,-6,6,9,10,9,4),(7,1,2,6,12,9,10),(-1,4,18,6,7,4,7)]:rect(x,z,w,h,c,d,y)
        rect(-7,8,3,3,10,1,-11)
    elif level in (2,3):
        rods=[(-4,2),(3,2),(0,7)] if level==2 else [(x,z) for z in (2,7,12) for x in (-6,0,6)]
        for x,z in rods:
            for y in range(-14,15):
                for i in range(-2,3):
                    for k in range(-2,3):
                        if i*i+k*k<=5:cells[x+i,y,z+k]=4 if level==2 else 6
            if level==3:
                for y in range(-12,14,5):rect(x-2,z+2,5,1,4,1,y)
        for y in ((0,) if level==2 else (-7,7)):
            rect(-7 if level==2 else -9,0,14 if level==2 else 18,10 if level==2 else 15,8,2,y)
    elif level==4:
        frame(6,14,12,4)
        for x in (-6,6):
            beam((x,-14,1),(x,0,12),6);beam((x,0,12),(x,14,1),6)
        beam((-6,0,12),(6,0,12),4)
    else:
        frame(11,11,25,13 if level==5 else 10)
        for y in (-11,11):
            beam((-11,y,1),(11,y,25),4);beam((11,y,1),(-11,y,25),4)
        for x in (-11,11):
            beam((x,-11,1),(x,11,25),4);beam((x,11,1),(x,-11,25),4)
        beam((-11,-11,25),(11,11,25),4)
        if level==6:
            # Solid front/side armor panels keep an open roof and visible frame lineage.
            rect(-10,2,20,22,6,2,-12);rect(10,2,2,22,6,22)
            for x in (-9,7):
                for z in (3,21):rect(x,z,2,2,8,1,-14)
            rect(-5,10,10,3,9,1,-14)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20052+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<frame-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-frames.blend'),copy=True)
(OUT/'frames-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('FRAMES_COMPLETE')
