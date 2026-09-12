"""Scavenging transport chain 30001..30007, voxel samples."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-carts.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-carts.py'),'exec'))
scene.name='Scavenging_Transport_32';names=['旧车轮','一对旧车轮','旧车架','空推车','拾荒推车','大型推车','满载推车']
def tire(cx,y,r,hollow=False):
    for x in range(-r,r+1):
        for z in range(-r,r+1):
            d=(x*x+z*z)**.5
            if d>r or hollow and d<r*.55:continue
            c=10 if d>r*.7 else 8 if d>2 else 10
            rect(cx+x,r+z,1,1,c,6,y)
            if d>r-1 and int((math.atan2(z,x)+math.pi)*6/math.pi)%2==0:rect(cx+x,r+z,1,1,3,8,y)
def chassis(heavy=False):
    for x in (-11,11):
        for y in (-8,8):wheel(x,y,5 if heavy else 3,5 if heavy else 3)
    box(-11,0,9 if heavy else 6,22,28,3,10)
manifest=[]
for level in range(7):
    cells={}
    if level==0:tire(0,0,14)
    elif level==1:tire(-6,3,10,True);tire(6,-3,10,True)
    elif level==2:
        for x in (-10,10):wheel(x,1,7,7)
        for x in (-9,7):
            box(x,0,6,2,24,2,8);box(x,0,15,2,23,2,8)
            for y in (-11,10):box(x,y,6,2,2,10,8)
            box(x,10,15,2,2,13,8)
        for y in (-11,10):box(-9,y,6,18,2,2,8)
        box(-9,10,28,18,3,2,3)
    elif level in (3,4):
        chassis();crate(-11,0,9,22,27,4 if level==3 else 12,13 if level==3 else 6)
        for x in (-10,8):box(x,12,13,2,2,14,4)
        box(-10,12,27,20,3,2,3)
        if level==3:
            for x in (-10,8):box(x,-12,13,2,2,5,4)
            box(-10,-12,18,20,2,2,4)
        else:
            box(-8,-3,11,5,5,16,0);box(-7,-3,27,2,2,4,4)
            box(3,5,12,3,3,17,4);box(0,5,27,9,3,3,4)
            box(3,5,29,3,3,2,10)
            box(-1,-4,12,7,7,12,8);bottle(6,-7,12,3,15,6)
            box(-8,6,11,6,5,12,10)
            for x in (-7,5):box(x,-14,11,3,1,4,8)
    else:
        chassis(True);crate(-12,0,12,24,29,4,9 if level==5 else 6)
        # L6 is a reinforced cargo wagon; L7 uses the same chassis fully loaded.
        for x in (-12,10):
            box(x,0,15,2,28,3,9)
            for y in (-12,0,12):box(x,y,18,2,2,8,4)
            box(x,0,25,2,28,2,9)
            for y in (-8,8):box(x-1,y,10,4,10,2,9)
        for y in (-13,13):
            box(-12,y,17,24,2,2,9);box(-12,y,25,24,2,2,4)
        for x in (-11,11):
            for y in (-8,8):
                for offset in (-3,0,3):box(x,y+offset,9,4,1,1,3)
        for x in (-8,6):box(x,-15,10,2,2,2,0)
        box(-4,-15,10,8,2,2,4)
        if level==6:
            cargo(-10,-7,14,10,12,9,16);cargo(1,-7,14,9,12,10,1)
            cargo(-10,6,14,20,12,9,1)
            cargo(-8,5,24,9,10,7,19);cargo(2,5,24,7,10,6,0)
            cargo(-7,-7,24,8,8,6,0)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30001+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<hauler-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-haulers.blend'),copy=True)
(OUT/'haulers-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('HAULERS_COMPLETE')
