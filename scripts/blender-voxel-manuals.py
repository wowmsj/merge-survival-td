"""Training manuals 20065..20068, voxel books with geometric cover pictograms."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Training_Manuals_32';names=['体能手册','耐力手册','战术手册','精英手册']
def mark(x,y,w,d,c):rect(x,top,w,1,c,d,y)
def line(a,b,c):
    count=max(abs(b[i]-a[i]) for i in range(2))*2
    for n in range(count+1):
        x,y=[round(a[i]+(b[i]-a[i])*n/max(1,count)) for i in range(2)]
        mark(x,y,2,2,c)
manifest=[]
for level in range(4):
    cells={};cover=[1,13,19,10][level];thickness=3+level*2;top=thickness+2
    rect(-11,0,22,1,cover,28)
    for z in range(1,thickness+1):rect(-10,z,20,1,12 if z%2 else 15,26)
    rect(-11,1,2,thickness+1,cover,28);rect(-11,thickness+1,22,1,cover,28)
    if level==0:
        mark(-9,0,18,24,12)
        # Push-up silhouette on weathered loose pages.
        line((-6,5),(6,5),2);line((-6,4),(2,-2),2);line((2,-2),(5,4),2)
        mark(4,-5,3,3,2);line((2,-2),(2,4),2)
        for x,y in [(-9,10),(7,-10)]:mark(x,y,2,3,8)
        for x in range(6,10):
            for y in range(-13,-10):cells.pop((x,y,thickness+1),None)
    elif level==1:
        # Running figure plus red heart; small strokes omitted at board scale.
        mark(-1,-7,3,3,12);line((0,-3),(-2,2),12)
        line((-2,2),(-6,5),12);line((-2,2),(2,5),12);line((2,5),(2,8),12)
        line((0,-3),(-4,-3),12);line((-4,-3),(-6,0),12);line((0,-2),(4,0),12)
        mark(5,-7,2,3,11);mark(8,-7,2,3,11);mark(6,-5,3,2,11)
        mark(-7,11,14,1,7)
    elif level==2:
        for x,y,w,d in [(-9,-9,6,5),(5,-6,5,5),(-8,7,4,7),(3,9,7,5)]:mark(x,y,w,d,20)
        # Compass/divider symbol, bold enough to read on the green cover.
        line((-1,-7),(-6,7),12);line((-1,-7),(5,7),12);line((-4,2),(3,2),12)
        mark(-2,-7,3,3,0);mark(-1,-10,1,3,12)
        for x in (-10,8):mark(x,0,2,27,20)
    else:
        for x in (-10,8):mark(x,0,2,26,4)
        for y in (-12,12):mark(-10,y,20,2,4)
        # Gold shield with a broad angular bottom and bright center stripe.
        for y in range(-7,8):
            w=14 if y<2 else max(2,14-2*(y-1))
            mark(-w//2,y,w,1,9)
        mark(-5,-4,10,3,0);line((3,-2),(-1,5),0)
        rect(9,2,3,thickness-1,9,5,4)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20065+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<manual-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-manuals.blend'),copy=True)
(OUT/'manuals-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('MANUALS_COMPLETE')
