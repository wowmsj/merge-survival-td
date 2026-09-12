"""Storage progression 30008..30018, 32-grid voxel models."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-carts.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-carts.py'),'exec'))
scene.name='Storage_32';names=['储物篮','抽屉零件','抽屉雏形','破损抽屉','储物抽屉','双层储物柜','双排储物柜','高级储物柜','豪华储物柜','防盗储物柜','密封储物柜']
def face(x,z,w,h,c,y=-11):box(x,y,z,w,1,h,c)
def handle(x,z,w=8,y=-13,c=4):
    box(x,y+1,z,2,3,3,c);box(x+w-2,y+1,z,2,3,3,c);box(x,y-1,z,w,2,2,c)
def drawer(x,z,w,h,c,y=-11):
    face(x,z,w,h,2,y);face(x+1,z+1,w-2,h-2,c,y-1);handle(x+w//2-3,z+h//2,6,y-3)
def door(x,z,w,h,c,y=-11):
    face(x,z,w,h,4,y);face(x+1,z+1,w-2,h-2,c,y-1)
def cabinet(w,h,c):
    box(-w//2,0,2,w,20,h,c);box(-w//2-1,0,h+2,w+2,22,2,c)
    for x in (-w//2+1,w//2-4):box(x,0,0,3,17,2,2)
manifest=[]
for level in range(11):
    cells={}
    if level==0:
        # A shallow slatted wood basket supplies the next stage's drawer boards.
        box(-10,0,0,20,18,2,1)
        for x in (-10,8):
            for y in (-8,8):box(x,y,2,2,2,8,2)
        for z in (3,7):
            for y in (-8,8):box(-10,y,z,20,2,2,1)
            for x in (-10,8):box(x,0,z,2,18,2,1)
        for x,y in [(-6,-2),(0,2)]:box(x,y,2,4,13,2,0)
    elif level==1:
        # Larger joined bottom and three solid sides; front board awaits fitting.
        box(-12,0,0,24,22,2,0)
        for x in (-12,10):box(x,0,2,2,22,11,1)
        box(-12,10,2,24,2,11,1)
        box(-9,-3,2,18,4,2,0)
        for x in (-10,8):box(x,-7,2,2,2,2,4)
    elif level in (2,3,4):
        c=[0,8,16][level-2];crate(-12,0,0,24,23,13,c)
        if level==2:
            for x in range(-3,3):
                for y in range(-13,-8):
                    for z in range(9,13):cells.pop((x,y,z),None)
        else:
            handle(-5,5,10,-13)
            if level==3:
                for x in range(3,7):
                    for y in range(8,12):
                        for z in range(10,13):cells.pop((x,y,z),None)
                face(-11,1,4,3,4,-12);face(7,1,4,3,4,-12)
            else:
                for x in (-12,10):box(x,0,13,2,23,1,4)
    elif level==5:
        cabinet(23,25,1)
        drawer(-10,3,20,11,0);drawer(-10,15,20,11,0)
    elif level==6:
        cabinet(30,20,11)
        for x in (-14,1):
            for z in (3,13):drawer(x,z,13,9,1)
    elif level==7:
        cabinet(25,26,13)
        for x in (-11,1):door(x,3,11,24,13)
        face(-3,11,2,9,4,-14);face(2,11,2,9,4,-14)
        box(-13,0,28,26,22,2,4)
    elif level==8:
        cabinet(16,27,2)
        for x in (-7,1):door(x,3,6,24,1)
        face(-2,12,1,8,9,-14);face(2,12,1,8,9,-14)
        for x in (-16,9):
            box(x,0,1,7,19,18,2);box(x-1,0,19,9,21,2,0)
            for z in (3,8,13):
                face(x+1,z,5,4,1);face(x+3,z+1,1,1,9,-12)
        box(-9,0,29,18,22,2,0)
    elif level==9:
        cabinet(26,25,1);door(-12,3,24,23,9)
        for x in (-13,9):
            for z in (2,24):box(x,0,z,4,23,4,4)
        for z in (7,19):face(-11,z,3,4,10,-14)
        for r,c in [(6,10),(5,4),(3,6)]:
            for x in range(-r,r+1):
                for z in range(14-r,15+r):
                    if x*x+(z-14)**2<=r*r:box(x,-14-(6-r)//2,z,1,2+(6-r),1,c)
    else:
        cabinet(27,27,6)
        face(-13,3,26,26,7);face(-11,5,22,22,10,-12);face(-9,7,18,18,19,-13)
        for z in (7,21):face(-14,z,7,4,4,-14)
        handle(7,9,3,-14);box(7,-14,10,2,5,11,4)
        face(-6,20,9,3,4,-14);face(-5,21,7,1,12,-15)
        for r,c in [(4,4),(2,10)]:
            for x in range(-r,r+1):
                for z in range(13-r,14+r):
                    if x*x+(z-13)**2<=r*r:box(x,-15-(4-r)//2,z,1,2+(4-r),1,c)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30008+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<storage-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-storage.blend'),copy=True)
(OUT/'storage-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('STORAGE_COMPLETE')
