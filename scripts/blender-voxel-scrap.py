"""Scrap and steel chain 20041..20051, 32-grid voxel props."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Scrap_Steel_32'
names=['废橡胶带','旧绳圈','铁线圈','铁支架','废铁轮','弹簧卷','铁皮桶','废铁板','废钢架','钢梁','装甲钢板']
def oval(rx,ry,z,c,t=2,h=2):
    for x in range(-rx,rx):
        for y in range(-ry,ry):
            if ((x+.5)/rx)**2+((y+.5)/ry)**2<=1 and ((x+.5)/(rx-t))**2+((y+.5)/(ry-t))**2>=1:
                for k in range(z,z+h):cells[x,y,k]=c
def bolt(x,y,z,c=4):rect(x,z,2,2,c,2,y)
manifest=[]
for level in range(11):
    cells={}
    if level==0:
        oval(8,15,0,10,2,5);oval(8,15,5,6,1,1)
    elif level==1:
        for z in (0,3,6):
            oval(8,15,z,1 if z==3 else 0,2,2);oval(5,12,z,0,2,2)
        for y in (-3,0,3):rect(-9,0,18,9,2,2,y);rect(-8,9,16,1,12,2,y)
    elif level==2:
        for z in (0,3,6,9):oval(13,13,z,6,2,2)
        rect(-12,1,2,10,8,3,-3);rect(-12,0,9,2,8,2,-12)
    elif level==3:
        rect(-7,0,14,3,8,25);rect(-7,3,14,22,8,3,11)
        rect(-6,3,12,1,4,19,-2);rect(-6,4,12,20,6,1,9)
        for x in range(-2,2):
            for y in range(-9,-5):
                for z in range(4):cells.pop((x,y,z),None)
            for y in range(8,13):
                for z in range(17,21):cells.pop((x,y,z),None)
    elif level==4:
        # Upright spoked wheel, including a true axle hole.
        ring(0,14,14,11,6,4);ring(0,14,11,10,8,4)
        for a in range(0,360,60):
            x=round(11*math.cos(math.radians(a)));z=14+round(11*math.sin(math.radians(a)))
            bar(0,14,x,z,1,8,3)
        ring(0,14,4,2,4,5)
        for x in range(-1,2):
            for y in range(-3,4):
                for z in range(13,16):cells.pop((x,y,z),None)
    elif level==5:
        # Continuous voxel helix; gaps remain open between its four turns.
        for n in range(481):
            a=n/480*math.pi*8;x=round(9*math.cos(a));y=round(9*math.sin(a));z=2+round(n/480*25)
            rect(x-1,z-1,3,3,8 if n//30%3 else 4,3,y)
    elif level==6:
        for z in range(27):layer(z,10,6)
        for z in (0,9,18,26):layer(z,11,8,depth=2)
        layer(28,9,4);layer(29,2,10,4,3);layer(30,1,8,4,3)
        rect(-6,3,4,5,8,1,-10);rect(3,19,3,5,8,1,-10)
    elif level==7:
        rect(-13,0,26,2,2,26);rect(-13,2,26,2,8,26)
        rect(-9,4,13,1,6,12,1)
        for x in (-10,8):
            for y in (-9,9):bolt(x,y,4)
        for x in range(3,6):
            for y in range(-13,-10):
                for z in range(4):cells.pop((x,y,z),None)
    elif level==8:
        # Reinforced L channel has side flanges, unlike the small drilled bracket.
        rect(-10,0,20,3,6,28);rect(-10,3,20,24,6,3,12)
        for x in (-10,8):rect(x,3,2,5,8,28);rect(x,8,2,19,8,4,12)
        rect(-8,27,16,2,4,3,12);rect(-6,3,5,1,8,9,-5)
    elif level==9:
        rect(-8,0,16,3,8,30);rect(-2,3,4,12,6,30);rect(-8,15,16,3,4,30)
        rect(-6,18,5,1,8,12,4)
    else:
        rect(-14,0,28,28,10,5);rect(-13,1,26,26,4,2,-3);rect(-11,3,22,22,6,1,-5)
        for x in (-11,-5,1,7,10):
            for z in (3,23):rect(x,z,2,2,8,2,-6)
        for x in (-11,10):
            for z in (8,13,18):rect(x,z,2,2,8,2,-6)
        rect(-5,7,4,5,8,1,-6)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20041+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<scrap-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-scrap.blend'),copy=True)
(OUT/'scrap-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('SCRAP_COMPLETE')
