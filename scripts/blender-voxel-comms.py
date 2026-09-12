"""Communication chain 20059..20064, 32-grid voxel samples."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Communication_32';names=['手绘告示','手摇喇叭','破旧收音机','堡垒电台','短波电台','无线电发射塔']
def front(x,z,w,h,c,y=-7):rect(x,z,w,h,c,1,y)
def dial(x,z,r=2):disc(x,z,r,4,2);disc(x,z,max(1,r-1),10,3)
manifest=[]
for level in range(6):
    cells={}
    if level==0:
        rect(-2,0,4,31,1,4,2)
        for z in (9,16,23):rect(-14,z,28,6,0,3)
        # Pixel SOS is geometry, readable without external fonts or textures.
        for x,glyph in [(-11,['11111','10000','10000','11111','00001','00001','11111']),(-3,['11111','10001','10001','10001','10001','10001','11111']),(5,['11111','10000','10000','11111','00001','00001','11111'])]:
            for row,line in enumerate(glyph):
                for col,p in enumerate(line):
                    if p=='1':front(x+col,23-row,1,1,11,-2)
        front(-1,27,2,1,4,-2);front(-1,10,2,1,4,-2)
    elif level==1:
        # Hollow bell expands along X toward the gallery camera.
        for x in range(-14,9):
            r=10-max(0,(x+14)//3)
            for y in range(-r,r+1):
                for z in range(13-r,14+r):
                    d=(y*y+(z-13)**2)**.5
                    if r-2<=d<=r:cells[x,y,z]=19 if x>-13 else 7
        rect(3,1,4,10,19,4);rect(8,12,2,5,4,3,-5)
        rect(9,8,2,6,4,2,-5);rect(9,7,6,2,1,3,-5)
        rect(4,9,6,8,19,8)
    elif level==2:
        rect(-14,0,28,21,8,10);front(-13,1,26,19,7,-6)
        front(-11,15,22,4,10);front(-10,16,20,1,9,-8);front(-3,15,1,4,11,-9)
        front(-11,3,15,10,2)
        for z in (4,6,8,10):front(-10,z,13,1,10,-8)
        for z in (5,11):front(7,z,4,3,4,-8)
        bar(-9,21,8,29,1,4,2)
    elif level==3:
        rect(-11,0,22,25,19,12)
        front(-10,13,20,10,7)
        for z in (15,17,19,21):front(-9,z,11,1,10,-8)
        front(4,19,4,3,0,-8);front(4,15,3,2,4,-8)
        rect(-9,2,18,9,19,4,-8)
        for x in (-7,5):rect(x,1,2,11,12,2,-11)
        for x in (-8,6):rect(x,2,2,25,1,3,7)
        rect(6,25,2,6,10,2)
    elif level==4:
        rect(-12,0,24,21,6,12);front(-11,2,22,18,7)
        front(-9,10,11,8,10,-8);front(-8,11,9,6,0,-9)
        front(-4,12,1,4,10,-10)
        front(4,11,5,6,9,-8);front(5,12,3,4,4,-9)
        for x in (-8,-2,5):front(x,4,3,3,10,-8)
        for x in (-14,12):rect(x,9,2,8,10,5)
        rect(-13,21,2,6,10,3);rect(11,21,2,6,10,3);rect(-13,26,26,2,10,3)
        rect(-15,0,2,9,10,2,-7);rect(-14,0,10,2,10,2,-8);rect(-6,0,8,3,4,3,-8)
    else:
        rect(-12,0,24,3,10,20);rect(-10,3,20,9,9,12)
        front(-8,6,9,4,10);front(-7,7,7,2,0,-8)
        for x in (3,6):front(x,6,2,3,4,-8)
        # Four-legged tower, with cross braces and a forked aerial.
        for x in (-6,5):
            for y in (-4,4):rect(x,12,1,13,4,1,y)
        for z in (12,18,24):rect(-6,z,12,1,4,9)
        for y in (-4,4):
            for n in range(12):
                rect(-6+n,12+n,1,1,6,1,y)
        rect(-1,25,2,7,10,2);rect(-9,28,18,1,4,1)
        for x in (-9,8):rect(x,27,1,4,11,1)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20059+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<comms-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-comms.blend'),copy=True)
(OUT/'comms-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('COMMS_COMPLETE')
