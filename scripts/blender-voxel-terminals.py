"""Handheld terminals 30063..30066, four distinct 32-grid silhouettes."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Handheld_Terminals_32'
names=['旧掌机','便携终端','数据终端','军用终端']
def top(x,y,w,d,z,c):rect(x,z,w,1,c,d,y)
def screen(w,d,y,z,color):
    top(-w//2-1,y,w+2,d+2,z,10);top(-w//2,y,w,d,z+1,color)
manifest=[]
for level in range(4):
    cells={}
    if level==0:
        rect(-9,0,18,3,6,30);rect(-9,3,18,2,7,30)
        screen(12,12,6,5,20)
        top(-5,8,9,1,7,19)
        top(-7,-5,6,2,5,10);top(-5,-5,2,6,5,10)
        for x,y in [(3,-7),(6,-4)]:layer(5,2,11,x=x,y=y,depth=2)
        for x in (-2,2):top(x,-11,2,1,5,10)
        for x in (4,6):top(x,-12,1,3,5,6)
        top(-9,1,2,3,5,1)
    elif level==1:
        rect(-11,0,22,4,10,28);rect(-10,4,20,2,4,28)
        for x in (-12,9):
            rect(x,2,3,4,9,22)
            for y in (-8,-3,2,7):top(x,y,3,2,6,10)
        screen(14,12,5,6,13)
        top(-6,8,11,2,8,17);top(-6,6,6,1,8,18)
        for x,c in [(-7,0),(-1,6),(5,6)]:top(x,-6,4,3,6,c)
        top(-5,-12,10,3,6,10);top(-2,-12,4,1,7,9)
        for x in (-9,8):
            for y in (-12,12):top(x,y,2,2,6,10)
    elif level==2:
        rect(-13,0,26,4,10,28);rect(-12,4,24,2,6,28)
        for x in (-13,10):
            for y in (-11,11):rect(x,1,3,6,4,6,y)
        screen(18,17,3,6,16)
        for x,y,w,d,c in [(-8,6,7,6,19),(3,1,5,7,20),(-6,-2,6,3,19)]:top(x,y,w,d,8,c)
        top(-2,4,2,15,9,17);top(-8,1,16,1,9,17);top(0,6,8,1,9,17)
        top(3,1,3,3,10,8)
        top(-3,-10,6,2,6,4);top(-1,-10,2,6,6,4)
        top(-9,-10,3,3,6,19);top(7,-10,3,3,6,8)
        top(12,0,1,6,5,10)
    else:
        rect(-11,0,22,5,10,25);rect(-10,5,20,2,19,25)
        for x in (-12,9):
            rect(x,2,3,6,20,23)
            for y in (-8,-3,2,7):top(x,y,3,2,7,10)
        screen(14,10,3,7,14)
        for i in range(5):top(-6+i*2,3,1,2+i%3,9,17)
        for x in (-6,3):top(x,6,3,1,9,18)
        for x in (-6,-1,4):top(x,-5,3,3,7,6)
        top(-6,-10,12,3,7,20);top(-3,-10,6,1,8,10)
        # Short thick antenna base and stepped mast make the final silhouette unique.
        rect(4,2,5,5,10,5,14);rect(5,3,3,3,6,10,20)
        rect(5,3,3,3,10,2,25)
        for x in (-9,8):
            for y in (-10,10):top(x,y,2,2,7,10)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30063+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-terminals.blend'),copy=True)
(OUT/'terminals-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('TERMINALS_COMPLETE')
