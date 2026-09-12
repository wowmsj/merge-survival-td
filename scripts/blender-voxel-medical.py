"""Medical chain 20026..20029, voxel props."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Medical_Supplies_32';names=['酒精喷雾','创可贴','止痛药','医疗包'];manifest=[]
for level in range(4):
    cells={}
    if level==0:
        for z in range(19):layer(z,7 if z<14 else 7-(z-13)//2,18)
        layer(19,4,11,depth=3)
        rect(-5,22,13,5,7,6);rect(7,23,4,4,11,6);rect(10,24,1,2,10,2)
        bar(5,22,9,17,1,11,3)
        rect(-4,4,8,9,7,1,-7);rect(-2,7,4,3,6,1,-8)
    elif level==1:
        rect(-12,0,24,2,2,17)
        for y in (-8,8):rect(-12,2,24,11,1,2,y)
        for x in (-12,10):rect(x,2,2,11,0,17)
        for x,z,y in [(-8,5,3),(0,8,4),(6,4,2),(-3,4,-2)]:
            rect(x,z,5,16,8,2,y);rect(x+1,z+1,3,14,12,1,y-1)
            rect(x+1,z+6,3,4,11,1,y-2)
            rect(x+2,z+5,1,6,11,1,y-2)
        rect(-14,12,28,2,0,4,-10)
        rect(-10,0,16,2,8,5,-14);rect(-4,2,4,1,12,5,-14)
    elif level==2:
        for x in range(-14,7):
            for y in range(-7,7):
                for z in range(14):
                    if abs(y+.5)+abs(z-6.5)<=10:
                        cells[x,y,z]=12 if -9<x<-1 else 8
        for x in range(7,11):
            for y in range(-6,6):
                for z in range(1,13):
                    radius=max(abs(y+.5),abs(z-6.5))
                    if radius>=4:cells[x,y,z]=1
        for x,y in [(12,-6),(9,-11),(1,-12)]:
            layer(0,3,7,x,y,2)
            for j in range(y-2,y+2):cells[x,j,1]=6
        # Face the open neck toward the default gallery camera.
        cells={(-x-1,y,z):c for (x,y,z),c in cells.items()}
    else:
        rect(-12,0,24,2,2,13);rect(-13,2,26,19,11,14);rect(-12,21,24,3,11,13)
        rect(-13,11,26,2,2,2,-8)
        rect(-5,16,10,3,15,1,-8);rect(-2,13,4,9,15,1,-8)
        for x in (-10,7):
            rect(x,1,3,12,1,2,-8);rect(x-1,6,5,5,4,2,-9);rect(x,7,3,3,2,1,-10)
        rect(-7,24,3,4,2,3);rect(4,24,3,4,2,3);rect(-7,27,14,2,2,3)
        bar(-13,18,-16,3,1,1,3);bar(-16,3,-12,1,1,1,3)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20026+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<medical-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-medical.blend'),copy=True)
(OUT/'medical-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('MEDICAL_COMPLETE')
