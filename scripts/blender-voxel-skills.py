"""Survival skill badges 20069..20077, voxel relief models."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Survival_Skills_32'
names=['拾荒入门','搜索技巧','潜行技巧','格斗技巧','射击技巧','急救技巧','防御工事','陷阱制作','生存大师']
def tile(x,z,w,h,c):rect(x,z,w,h,c,2,-4)
def stroke(a,b,c,w=2):
    steps=max(abs(b[i]-a[i]) for i in range(2))*2
    for n in range(steps+1):
        x,z=[round(a[i]+(b[i]-a[i])*n/max(steps,1)) for i in range(2)]
        tile(x-w//2,z-w//2,w,w,c)
def circle(x,z,r,inner,c):
    for i in range(x-r,x+r+1):
        for k in range(z-r,z+r+1):
            if inner*inner<=(i-x)**2+(k-z)**2<=r*r:tile(i,k,1,1,c)
manifest=[]
for level in range(9):
    cells={}
    disc(0,14,14,10,4);disc(0,14,13,[8,13,20,11,10,15,19,2,9][level],5)
    disc(0,14,11,[1,14,6,2,6,11,2,19,10][level],6)
    if level==0:
        tile(-7,6,10,9,12);tile(-4,15,5,5,12)
        circle(-1,16,6,0,17);circle(-1,16,6,4,4);stroke((3,12),(8,7),8,3)
    elif level==1:
        stroke((-6,7),(1,15),4,5);stroke((0,14),(4,19),7,7)
        stroke((2,17),(5,20),0,5);tile(-5,9,2,3,10)
        for x,z in [(6,23),(9,20),(2,25)]:tile(x,z,1,2,0)
    elif level==2:
        tile(-8,6,15,3,10);tile(-8,9,10,5,9);tile(0,9,7,13,9)
        tile(-7,13,6,2,0)
        for z in (12,15,18):tile(0,z,5,1,12)
    elif level==3:
        tile(-5,6,10,6,15);tile(-7,12,14,7,12)
        for x,z in [(-7,18),(-3,20),(1,21),(5,19)]:tile(x,z,3,4,8)
        tile(4,13,5,7,8)
        for z in (8,11,14):tile(-5,z,9,1,7)
    elif level==4:
        circle(0,14,8,6,11);circle(0,14,2,0,0)
        for a,b in [((-10,14),(-5,14)),((5,14),(10,14)),((0,4),(0,9)),((0,19),(0,24))]:stroke(a,b,0)
    elif level==5:
        tile(-4,5,8,18,15);tile(-9,10,18,8,15)
        tile(-2,7,4,14,7)
    elif level==6:
        for z in (6,12,18):
            for x in ((-9,1) if z!=12 else (-10,-3,4)):
                tile(x,z,8 if z!=12 else 6,5,12);tile(x+1,z,6 if z!=12 else 4,1,1)
    elif level==7:
        circle(0,11,8,6,0);circle(1,14,4,2,12)
        stroke((1,14),(2,23),0,3);stroke((2,23),(7,25),0,3)
        for z in (18,21):tile(0,z,5,1,2)
    else:
        # Filled five-point star, flanked by a stepped gold laurel.
        points=[]
        for n in range(10):
            angle=math.pi/2+n*math.pi/5;r=8 if n%2==0 else 3.5
            points.append((r*math.cos(angle),15+r*math.sin(angle)))
        for x in range(-8,9):
            for z in range(7,24):
                inside=False
                for n in range(10):
                    a,b=points[n],points[(n+1)%10]
                    if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:inside=not inside
                if inside:tile(x,z,1,1,0 if x<0 else 9)
        for sign in (-1,1):
            for x,z in [(5,5),(8,8),(10,12),(10,16),(8,21)]:tile(sign*x-1,z,3,3,0)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20069+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<skill-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-skills.blend'),copy=True)
(OUT/'skills-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('SKILLS_COMPLETE')
