"""Five food supply props, matching original icons on the approved voxel grid."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Food_Supplies_32'
names=['干面包','硬面饼','压缩饼干','肉罐头','真空口粮']
manifest=[]
for level in range(5):
    cells={}
    if level==0:
        # Low oval loaf with three recessed cuts and a broken middle crust.
        for z in range(10):
            for x in range(-15,15):
                for y in range(-8,8):
                    if (x/15)**2+(y/8)**2+((z-2)/10)**2<1:
                        cells[x,y,z]=2 if z<2 else 1 if z<5 else 0
        for x in (-8,0,8):
            for y in range(-4,5):
                i=x+y//3
                for z in range(7,11):cells.pop((i,y,z),None)
                if (i,y,6) in cells:cells[i,y,6]=12
    elif level==1:
        for z,c in [(0,2),(1,1),(2,0),(3,0),(4,12),(5,2),(6,1),(7,0),(8,0)]:layer(z,12,c)
        for x,y in [(-5,-5),(1,-6),(6,-3),(-7,1),(-1,0),(4,3),(-3,5)]:
            for i in range(x,x+2):
                for j in range(y,y+2):cells.pop((i,j,8),None);cells[i,j,7]=2
    elif level==2:
        # Foil slab: sealed ends, dark folded sides and a broad pale face.
        rect(-9,0,18,2,10,30)
        rect(-10,2,20,2,6,30)
        rect(-8,4,16,5,4,23);rect(-6,9,12,1,7,19)
        for y in (-14,13):
            rect(-10,3,20,2,7,2,y)
            for x in range(-9,10,4):rect(x,5,2,1,6,2,y)
        for x in (-7,6):rect(x,8,1,1,15,18)
    elif level==3:
        layer(0,12,10,depth=2);layer(2,12,4)
        for z in range(3,19):layer(z,11,11 if z<7 or z>15 else 12)
        layer(19,12,10);layer(20,12,4);layer(21,10,7)
        # Top pull tab has an actual opening, no floating decoration.
        for x in range(-3,4):
            for y in range(-6,3):
                if x in (-3,3) or y in (-6,2):cells[x,y,22]=10;cells[x,y,23]=4
        rect(-6,8,12,6,2,1,-11);rect(-5,9,10,4,11,1,-12)
        rect(-2,9,2,4,12,1,-13)
    else:
        rect(-10,0,20,2,20,8);rect(-11,2,22,24,19,7)
        rect(-10,26,20,3,20,5);rect(-9,27,18,1,19,6)
        for x in (-11,9):rect(x,2,2,24,20,8)
        rect(-8,6,16,15,19,9)
        rect(-6,11,12,7,12,1,-5)
        rect(-4,13,8,3,20,1,-6)
        # Simple folded lower corners and a tear notch in the top seam.
        for x in (-8,6):rect(x,3,2,4,20,1,-5)
        for x in (5,6):
            for y in range(-5,5):cells.pop((x,y,28),None)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20021+level')
    exporter=exporter.replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new")
    exporter=exporter.replace("'triangles':len(faces)*2", "'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<food-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-food.blend'),copy=True)
(OUT/'food-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('FOOD_COMPLETE')
