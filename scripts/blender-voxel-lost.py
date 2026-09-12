"""Lost property 30049..30054, 32-grid voxel samples."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Lost_Property_32'
names=['遗失的眼镜','遗失的遮阳帽','遗失的拳套','失物篮','大型失物篮','失物招领处']
manifest=[]
for level in range(6):
    cells={}
    if level==0:
        for x in (-8,8):
            ring(x,7,6,4,10,2)
        rect(-3,8,6,2,10,2);rect(-2,8,3,2,12,3)
        for x in (-14,13):
            rect(x,9,2,2,10,18,8);rect(x,6,2,4,10,3,16)
    elif level==1:
        layer(0,15,9,depth=2);layer(2,14,12)
        for z in range(3,13):layer(z,10 if z<10 else 9,12)
        for z in (3,4,5):layer(z,10,1)
        rect(4,7,4,4,1,1,-9);rect(5,8,2,2,9,1,-10)
        for x,y in [(-13,-5),(10,6),(0,-14)]:
            for k in range(3):cells.pop((x,y,k),None)
    elif level==2:
        for z in range(5,25):layer(z,6 if z<10 else 8 if z<14 else 10 if z<21 else 10-(z-20),11)
        layer(0,6,10,depth=2);layer(2,7,11,depth=4)
        for z in range(8,18):layer(z,3 if z in (8,17) else 4,11,x=-8,y=-1)
        rect(-5,3,10,2,2,1,-8);rect(-2,10,4,4,12,1,-8)
        rect(2,18,3,3,12,1,-7);rect(-5,0,10,2,10,7)
    elif level==3:
        for z in range(10):
            layer(z,11 if z<3 else 13,1 if z%3==0 else 9)
            if z>1:
                # Open basket; contents rest on its floor.
                inner=9 if z<3 else 11
                for x in range(-inner,inner):
                    for y in range(-inner,inner):cells.pop((x,y,z),None)
        layer(10,14,0)
        for x in range(-11,11):
            for y in range(-11,11):cells.pop((x,y,10),None)
        # Back handle connects directly to the rim.
        for x in (-12,10):rect(x,9,2,15,9,3,4)
        rect(-12,23,24,2,0,3,4)
        # Bear and bottle, tall enough to show above the rim.
        layer(2,4,1,x=-5,y=-3,depth=11)
        layer(13,4,9,x=-5,y=-3,depth=6)
        for x in (-8,-2):layer(18,2,9,x=x,y=-3,depth=2)
        for x in (-7,-4):rect(x,16,1,1,10,1,-7)
        rect(-6,14,2,1,2,1,-7)
        for z in range(2,17):layer(z,3,17,x=6,y=1)
        layer(17,3,9,x=6,y=1,depth=2)
        rect(-1,2,4,11,11,6,-5)
    elif level==4:
        rect(-14,0,28,13,12,23);rect(-15,11,30,3,1,25)
        rect(-13,14,26,2,12,23)
        for z,c,w,y in [(16,11,23,0),(19,19,21,1),(22,13,23,0),(25,0,20,1)]:
            rect(-w//2,z,w,3,c,17,y)
            rect(-w//2+2,z+1,w-4,1,2 if c==0 else 6,1,y-9)
        # A hanging blue scarf breaks the basket silhouette.
        rect(-10,6,6,13,13,2,-13);rect(-10,5,6,2,14,2,-13)
        rect(5,9,6,10,0,2,-13)
    else:
        rect(-15,0,30,10,1,19);rect(-15,0,30,2,2,19)
        for x in range(-13,15,6):rect(x,2,4,7,9,1,-10)
        rect(-3,2,6,7,13,1,-11);rect(-16,10,32,2,0,22)
        for x in (-14,12):rect(x,12,2,16,1,3,-7);rect(x,12,2,12,1,3,7)
        rect(-15,26,30,6,9,4,-7);rect(-15,24,30,2,2,18,1)
        rect(-5,27,10,4,12,1,-10)
        rect(-1,29,2,2,10,1,-11);rect(-3,27,6,2,10,1,-11)
        rect(-11,12,6,3,8,5,-3)
        for x in (-10,-8):rect(x,15,1,4,4,1,-3)
        rect(4,12,6,4,10,5,-3)
        rect(6,12,5,9,13,4,5)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30049+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-lost.blend'),copy=True)
(OUT/'lost-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('LOST_COMPLETE')
