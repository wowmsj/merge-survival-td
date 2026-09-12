"""Hunting weapon game props 30072..30076, decorative 32-grid voxel models."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Hunting_Props_32'
names=['弹弓','猎弓','劲弩','猎枪','军用步枪']
def thread(x,z,u,v,c,d=1):
    steps=max(abs(u-x),abs(v-z))
    for i in range(steps+1):rect(round(x+(u-x)*i/steps),round(z+(v-z)*i/steps),1,1,c,d)
def flat():
    global cells
    cells={(x,z-15,-y+4):c for (x,y,z),c in cells.items()}
manifest=[]
for level in range(5):
    cells={}
    if level==0:
        bar(0,1,0,14,2,1,4)
        bar(0,14,-9,27,2,1,4);bar(0,14,9,27,2,1,4)
        for x in (-10,8):rect(x,24,4,2,0,5)
        thread(-9,24,-3,18,2,2);thread(9,24,3,18,2,2)
        rect(-3,16,6,3,2,2)
        rect(-2,2,4,7,9,5)
        flat()
    elif level==1:
        points=[(-7,0),(0,5),(5,11),(6,17),(3,24),(-7,30)]
        for (x,z),(u,v) in zip(points,points[1:]):bar(x,z,u,v,1,1,3)
        thread(-7,0,-7,30,12)
        rect(4,12,4,7,9,4)
        thread(-12,6,12,25,9,2)
        bar(8,25,12,25,1,4,2);bar(12,21,12,25,1,4,2)
        bar(-12,6,-12,10,1,12,2)
        flat()
    elif level==2:
        rect(-2,2,4,25,6,4);rect(-4,0,8,8,10,4)
        rect(-2,1,4,4,2,1,-3)
        for sign in (-1,1):
            bar(0,23,sign*8,23,1,10,3);bar(sign*8,23,sign*14,18,1,10,3)
            thread(sign*14,18,0,12,12)
        rect(-1,11,2,16,9,1,-3)
        bar(-2,25,0,28,1,4,1);bar(2,25,0,28,1,4,1)
        rect(2,7,3,6,10,3);rect(3,8,1,3,6,1,-2)
        flat()
    elif level==3:
        rect(-4,0,7,10,1,5);rect(-5,0,9,2,10,6)
        bar(-1,8,1,15,2,1,4)
        rect(-2,14,6,4,6,5)
        rect(-2,18,2,14,6,3);rect(1,18,2,14,4,3)
        rect(-3,18,7,6,9,1,-3)
        ring(4,12,3,2,10,2)
        rect(-2,31,5,1,10,4)
        flat()
    else:
        rect(-4,0,8,7,19,4);rect(-5,0,10,2,10,5)
        rect(-2,6,4,9,6,4);rect(-4,12,8,8,19,5)
        rect(-3,20,6,7,20,5);rect(-1,27,2,5,6,2)
        rect(-2,31,4,2,10,3)
        bar(4,13,8,6,1,10,4);bar(4,17,9,11,2,6,4)
        bar(3,22,6,19,1,19,3)
        for z in (21,23,25):rect(-3,z,6,1,6,1,-3)
        rect(-7,14,3,12,10,3);rect(-8,16,5,7,19,4)
        rect(-8,23,5,2,4,4)
        rect(-2,15,4,3,6,1,-3)
        flat()
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30072+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-hunting.blend'),copy=True)
(OUT/'hunting-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('HUNTING_COMPLETE')
