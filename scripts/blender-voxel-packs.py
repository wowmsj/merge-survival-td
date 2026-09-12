"""Expedition supplies 30067..30071, 32-grid voxel chain."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Expedition_Supplies_32'
names=['补给篮','帆布背包','远征行囊','满载行囊','探索者背包']
def pack(color,height,width=18):
    rect(-width//2,0,width,height, color,12)
    rect(-width//2+1,height,width-2,2,color,11)
    rect(-width//2, height-6,width,6,9 if color==1 else color,3,-7)
    rect(-7,2,14,8,color,4,-8);rect(-7,9,14,2,9 if color==1 else color,5,-8)
    for x in (-6,4):
        rect(x,10,2,height-8,2,1,-9);rect(x-1,12,4,3,4,1,-10)
        rect(x,13,2,1,2,1,-11)
        rect(x,3,2,height-2,2,2,9);rect(x,height,2,2,2,5,7)
    rect(-3,height+2,6,2,2,3,5)
def roll(z,color):
    for x in range(-12,12):
        for y in range(-4,4):
            for k in range(-4,4):
                if abs(y+.5)+abs(k+.5)<=6:cells[x,y,z+k]=color
    for x in (-8,7):rect(x,z-4,2,8,2,8)
    for y in range(-3,3):
        for k in range(-3,3):
            if 3<=y*y+k*k<=8:cells[12,y,z+k]=20
manifest=[]
for level in range(5):
    cells={}
    if level==0:
        rect(-13,0,26,11,9,21)
        for z in (0,4,8):rect(-13,z,26,1,1,22)
        rect(-14,11,28,2,0,23)
        rect(-11,13,22,1,12,17)
        for x in (-13,11):rect(x,12,2,12,9,3,3)
        rect(-13,24,26,2,0,3,3)
        rect(-9,14,7,6,9,5,-3);rect(-9,20,7,1,1,6,-3)
        rect(3,14,6,7,13,5,-3);rect(4,16,4,3,12,1,-6)
        for z in range(14,22):layer(z,3,19,x=0,y=4)
        layer(22,3,4,x=0,y=4,depth=2)
    elif level==1:
        pack(9,21)
        for x in (-12,9):rect(x,2,3,10,9,8);rect(x,11,3,2,1,9)
    elif level==2:
        pack(19,26)
        for x in (-12,9):
            rect(x,2,3,9,20,9);rect(x,13,3,9,19,9)
            rect(x,20,3,2,9,10)
        rect(-8,0,16,5,20,5,-9)
        for x in (-6,4):rect(x,0,2,5,9,1,-12)
        rect(-3,23,6,2,9,1,-9)
    elif level==3:
        pack(1,22)
        roll(27,19)
        for x in (-12,9):rect(x,1,3,11,9,9)
        rect(9,12,3,6,13,5);rect(10,18,1,3,4,2)
        for z in range(11,18):layer(z,2,17,x=-11)
        layer(18,2,4,x=-11,depth=2)
    else:
        pack(16,25,20)
        # Keep the bedroll, now strapped underneath the fully equipped pack.
        roll(-4,19)
        for x in (-13,11):
            rect(x-2,6,4,9,20,8)
            for z in range(15,23):layer(z,3,17,x=x)
            layer(23,2,4,x=x,depth=2)
        # Raised navigation badge attached to the front flap.
        for x in range(-4,5):
            for z in range(17,26):
                if x*x+(z-21)**2<=16:rect(x,z,1,1,4,1,-9)
                if x*x+(z-21)**2<=9:rect(x,z,1,1,14,1,-10)
        rect(-1,21,2,3,11,1,-11);rect(0,19,1,2,15,1,-11)
        for x in (-7,5):rect(x,6,2,5,9,1,-11)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30067+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-packs.blend'),copy=True)
(OUT/'packs-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('PACKS_COMPLETE')
