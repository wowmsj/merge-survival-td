"""Map restoration 30024..30036: 32-grid solid-color voxel props."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Map_Restoration_32'
names=['碎纸堆','碎纸片','地图残片','拼接残片','小块地图','大块地图','地图一角','城区地图','半张地图','地图轮廓','缺角地图','旧世界地图','完整藏点图']
def paper(x,y,w,h,color=12,fold=False,torn=False):
    for i in range(w):
        for j in range(h):
            if torn and ((i<3 and j<3) or (i>w-5 and j>h-5)):continue
            z=abs(i-w//2)//4 if fold else 0
            for k in range(z+2):cells[x+i,y+j,k]=color if k==z+1 else 9
def ink(x,y,c):
    zs=[z for xx,yy,z in cells if xx==x and yy==y]
    if zs:cells[x,y,max(zs)]=c
def line(points,c,width=1):
    for (x,y),(u,v) in zip(points,points[1:]):
        n=max(abs(u-x),abs(v-y),1)
        for t in range(n+1):
            for dx in range(width):
                for dy in range(width):ink(round(x+(u-x)*t/n)+dx,round(y+(v-y)*t/n)+dy,c)
def land(x,y,w,h,c):
    for i in range(w):
        for j in range(h):
            if abs(i-w/2)+abs(j-h/2)<(w+h)*.33:ink(x+i,y+j,c)
def city():
    line([(-12,-5),(-4,-5),(1,1),(12,1)],17,3)
    for x in (-8,3):line([(x,-10),(x,10)],15,2)
    for y in (-8,6):line([(-12,y),(12,y)],15,2)
    for x,y,c in [(-5,-2,19),(6,3,19),(-11,0,8),(6,-6,9),(-4,8,8)]:land(x,y,4,4,c)
manifest=[]
for level in range(13):
    cells={}
    if level<2:
        pieces=[(-11,-8,7,6),(-1,-5,8,8),(-8,4,8,6),(7,5,6,7)] if level==0 else [(-12,-10,11,9),(2,-10,11,9),(-12,2,11,9),(2,2,11,9)]
        for x,y,w,h in pieces:paper(x,y,w,h,12,level==0,True)
    elif level<6:
        w=[18,25,24,30][level-2];h=[18,19,24,24][level-2]
        paper(-w//2,-h//2,w,h,12,level in (4,5),True)
        land(-9,-7,12,10,1);land(0,0,9,9,9)
        line([(-8,6),(-3,3),(1,-3),(8,-6)],2)
        if level==3:
            line([(0,-8),(0,8)],2)
            for y in (-6,0,6):line([(-3,y),(3,y)],15,2)
        if level==4:line([(-8,-9),(8,-9),(8,8)],8,2)
        if level==5:
            for x in (-15,13):rect(x,0,2,5,9,24);rect(x,5,2,1,12,22)
    elif level<9:
        paper(-14,-12,28,24,7,level==8)
        city()
        if level==6:
            # A surveyed district corner, then a full city, then a folded regional half.
            for x,y in [(-9,-4),(4,3),(-3,7)]:rect(x,2,4,4,6,4,y);rect(x,6,4,1,8,4,y)
            line([(-14,11),(13,11),(13,-12)],8,2)
        elif level==7:
            line([(-14,-12),(13,-12),(13,11),(-14,11),(-14,-12)],13,2)
        else:
            line([(0,-12),(0,11)],6)
            line([(-14,-12),(13,-12)],16,2)
            land(5,7,6,4,19)
    else:
        paper(-15,-12,30,24,17 if level==11 else 12,level==9,level==10)
        if level==9:
            line([(-12,8),(-6,3),(0,6),(5,0),(12,-8)],17,2)
            for x,y in [(-8,-7),(0,-5),(7,5)]:
                land(x-3,y-2,7,6,19)
                rect(x-1,3,3,3,6,3,y);rect(x,6,1,1,15,1,y)
        else:
            land(-12,-8,12,10,9 if level==10 else 0);land(-7,0,8,10,1 if level==10 else 19)
            land(1,-7,12,10,9 if level==10 else 0);land(5,4,6,5,19)
            line([(-14,-11),(13,-11),(13,10),(-14,10),(-14,-11)],1 if level==10 else 9,2)
            if level==12:
                for x,y in [(-9,6),(-6,4),(-3,2),(0,0),(3,-2)]:line([(x,y),(x+1,y)],2)
                line([(5,-6),(9,-2)],11,2);line([(5,-2),(9,-6)],11,2)
                for x in (-15,13):rect(x,0,2,5,9,24);rect(x,5,2,1,0,22)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30024+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<map-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-maps.blend'),copy=True)
(OUT/'maps-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('MAPS_COMPLETE')
