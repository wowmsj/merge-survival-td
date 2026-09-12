"""Approved batch 24..30. Run Blender with -- <family>; exports one isolated chain."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
family=sys.argv[sys.argv.index('--')+1]
catalog={
 'birds':(30077,['小鸟精灵','小鸟游侠','小鸟法师','小鸟勇者','小鸟骑士','小鸟公主']),
 'pots':(40001,['破碎花盆','残破花盆','破损花盆','组装花盆','花盆泥胚','新漆花盆','空花盆','培养土盆','盆栽小苗','盆栽']),
 'seeds':(40011,['小种子包','加量种子包','大种子包','种子堆']),
 'sacks':(40015,['空种子袋','少量种子袋','一叠种子袋','一堆种子袋']),
 'armor':(40019,['麻袋布','缝纫布料','布艺口袋','帆布背包','防弹夹层','自制防弹衣','加固防弹衣','守卫重甲']),
 'plants':(40027,['种子','温室花苗','花苗','绿植','发财树','花树']),
 'moths':(40033,['变异幼虫','硬壳虫蛹','变异成虫','荧光飞蛾','赤翼飞蛾','变异萤后'])}
chain_start,names=catalog[family];scene.name='Voxel_'+family
for name,color in [('violet','9152b9'),('pink','e66eaa'),('leaf','78b747'),('gold','f3c454')]:
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    c=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
    m.diffuse_color=c;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=c
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85;materials.append(m)
purple,pink,leaf,gold=21,22,23,24
def blob(x,y,z,rx,ry,rz,c):
    for i in range(x-rx,x+rx+1):
        for j in range(y-ry,y+ry+1):
            for k in range(z-rz,z+rz+1):
                if ((i-x)/rx)**2+((j-y)/ry)**2+((k-z)/rz)**2<=1:cells[i,j,k]=c
def top(x,y,w,d,z,c):rect(x,z,w,1,c,d,y)
def pot(c=8,h=13,r=10,soil=False):
    for z in range(h):
        rr=r-3+min(3,z//3);layer(z,rr,c)
        if z>1:
            for x in range(-rr+2,rr-2):
                for y in range(-rr+2,rr-2):
                    if abs(x+.5)+abs(y+.5)<=(rr-2)*1.5:cells.pop((x,y,z),None)
    for z in (h,h+1):
        layer(z,r+1,c)
        for x in range(-r+2,r-2):
            for y in range(-r+2,r-2):
                if abs(x+.5)+abs(y+.5)<=(r-2)*1.5:cells.pop((x,y,z),None)
    if soil:layer(h-1,r-2,2)
def sprout(x,y,z,h=9,leaves=2):
    rect(x,z,2,h,20,2,y)
    for i in range(leaves):
        side=-1 if i%2==0 else 1
        blob(x+side*3,y,z+h-2-i*2,4,2,2,leaf if i%2 else 19)
def sack(c=9,h=17,open=False,x=0,y=0):
    blob(x,y,h//2,8,6,h//2,c)
    if open:
        rect(x-7,h-3,14,3,c,11,y)
        rect(x-5,h-1,10,1,2,7,y)
    else:
        rect(x-4,h-2,8,3,2,6,y);rect(x-5,h+1,10,3,c,7,y)
    # Put the patch directly on the curved fabric surface, never in front of it.
    for xx in range(x+1,x+6):
        for zz in range(4,8):
            surface=[yy for a,yy,b in cells if a==xx and b==zz and y-7<=yy<=y]
            if surface:cells[xx,min(surface),zz]=2 if zz in (4,7) else 1
def sheet(x,y,z,w=20,d=17,c=9):
    rect(x-w//2,z,w,2,c,d,y)
    for xx in range(x-w//2+1,x+w//2-1,3):top(xx,y-d//2,1,1,z+2,2)
def vest(c,heavy=False):
    rect(-9,0,18,23,c,7)
    for x in range(-4,5):
        for y in range(-4,4):
            for z in range(18,23):cells.pop((x,y,z),None)
    for x in (-10,7):rect(x,15,3,11,c,8)
    rect(-9,0,18,3,2,9)
    if heavy:
        for x in (-13,9):rect(x,18,4,6,4,12)
        rect(-7,9,14,10,6,2,-5);rect(-6,3,12,5,4,2,-5)
        for x in (-5,4):rect(x,12,2,2,15,1,-7)
    else:
        for x in (-7,1):rect(x,3,6,7,9 if c==19 else c,3,-5)
        rect(-7,12,14,5,c,2,-5)
def bird(c):
    for x in (-4,3):rect(x,0,3,2,0,5,-2)
    blob(0,0,11,8,6,10,c);blob(0,-1,20,7,6,7,c)
    blob(0,-5,10,5,2,6,12)
    for x in (-8,8):blob(x,0,11,3,3,6,c)
    for x in (-3,3):rect(x,20,2,3,10,1,-7);rect(x,22,1,1,15,1,-8)
    rect(-1,16,3,3,0,3,-8)
def moth(c,size=12):
    blob(0,0,5,2,10,3,10);blob(0,-9,6,3,3,3,0)
    for side in (-1,1):
        blob(side*6,-2,5,size-5,8,1,2)
        blob(side*6,-2,6,size-6,7,1,c)
        blob(side*5,7,5,4,5,1,c)
        for y in (-5,0,5):top(side*5,y,2,2,8,18 if c!=11 else gold)
        rect(side*2-1,7,2,2,10,6,-12)
manifest=[]
for level in range(len(names)):
    cells={}
    if family=='birds':
        c=[17,9,purple,11,4,pink][level];bird(c)
        if level==0:
            rect(-2,26,2,3,13,3);rect(1,26,2,2,17,3)
        elif level==1:
            rect(-7,12,14,3,19,14)
            rect(-8,6,3,9,19,7,4)
            for z in range(6,25):rect(11+(abs(z-15)//5),z,2,1,1,2)
            rect(11,6,1,19,12,1)
            rect(-10,11,3,12,2,4,4)
        elif level==2:
            rect(-9,4,18,4,purple,11)
            rect(11,1,2,25,1,2);blob(12,0,27,3,3,3,pink)
            for z in range(26,32):rect(-4+(z-26)//2,z,8-(z-26),1,purple,6)
            rect(-7,12,14,1,gold,13)
        elif level==3:
            rect(-9,1,18,2,0,9)
            rect(9,6,6,12,1,3,-3);rect(10,8,4,8,11,1,-5)
            rect(-13,5,2,17,4,2);rect(-15,7,6,2,0,3)
        elif level==4:
            rect(-8,23,16,4,6,13)
            for x in (-5,-1,3):rect(x,23,2,3,10,1,-7)
            rect(-2,27,4,4,11,8)
            rect(-7,7,14,6,6,2,-7)
            rect(11,2,2,22,4,2);rect(8,6,8,2,0,3)
        else:
            for z in range(2,9):layer(z,11-(z-2)//2,pink)
            rect(-6,26,12,2,0,8)
            for x in (-6,-1,4):rect(x,28,2,3,0,3,-2)
            rect(-1,28,2,2,purple,1,-4)
            rect(-6,6,12,1,12,14)
    elif family=='pots':
        if level==0:
            for x,y,w,d in [(-9,-6,9,7),(5,-3,8,7),(-2,6,11,6)]:
                rect(x-w//2,0,w,2,8,d,y);rect(x-w//2,2,2,4,8,d,y)
        else:
            c=11 if level==5 else 9 if level==4 else 8
            pot(c,h=16 if level==4 else 13,soil=level>=7)
            if level==1:
                for x,y,z in list(cells):
                    if x>2 and y<-3 and z>6:del cells[x,y,z]
            elif level==2:
                for z in range(3,15):rect(z//4-2,z,1,1,2,1,-10)
            elif level==3:
                for (x,y,z) in list(cells):
                    if z in (4,9) or x in (-6,5):cells[x,y,z]=4
            elif level==4:
                for z in (4,5,6):layer(z,10,9)
            elif level==5:rect(-4,4,5,6,12,1,-10)
            elif level==6:
                for z in (9,10):
                    for x,y,k in list(cells):
                        if k==z:cells[x,y,k]=0
            elif level==8:sprout(0,0,13,8,2)
            elif level==9:
                for x,y,h in [(-3,0,13),(3,2,11),(0,-3,10)]:sprout(x,y,13,h,4)
    elif family=='seeds':
        if level<2:
            rect(-8,0,16,20,12,5 if level==0 else 10)
            rect(-9,18,18,3,9,7 if level==0 else 12)
            if level==0:
                rect(-1,5,2,8,20,1,-3)
                rect(-5,11,4,3,leaf,1,-3);rect(1,13,4,3,19,1,-3)
            else:
                rect(-1,0,2,23,2,13)
                rect(-8,9,16,2,2,12)
                rect(-3,9,6,3,0,1,-7)
        else:
            sack(9,h=20 if level==2 else 18,open=level==3)
            if level==3:
                blob(0,0,18,7,5,4,1)
                for i,(x,y,z) in enumerate([(-4,-2,20),(0,-3,21),(3,-1,21),(-2,2,22),(3,3,20),(0,0,23)]):blob(x,y,z,1,1,1,leaf if i%2 else gold)
    elif family=='sacks':
        if level==0:sack(1,h=13,open=True)
        elif level in (1,2):
            for j in range(2 if level==1 else 4):
                sheet((-1)**j,0,j*4,22-j,17,9 if j%2 else 1)
            if level==2:rect(-1,0,2,16,2,20)
        else:
            sack(1,17,x=-5,y=0);sack(9,13,x=7,y=5)
    elif family=='armor':
        if level==0:
            sheet(0,0,0);sheet(1,0,2,18,15,1)
        elif level==1:
            sheet(0,0,0,24,20)
            for x in range(-11,12):
                for y in range(-4,5):
                    for z in range(2,11):
                        if y*y+(z-6)**2<=20:cells[x,y,z]=9
            for x in (-7,6):rect(x,2,2,9,2,10)
            rect(11,4,1,4,2,5)
        elif level==2:sack(12,19,open=True)
        elif level==3:
            rect(-9,0,18,23,9,11);rect(-9,18,18,5,1,13)
            rect(-7,2,14,9,9,3,-7)
            for x in (-6,4):rect(x,11,2,12,2,1,-8);rect(x-1,12,4,3,4,1,-9)
            rect(-3,23,6,2,2,3,3)
        elif level==4:
            rect(-10,0,20,23,10,4);rect(-8,23,16,3,10,4)
            rect(-8,2,16,19,6,1,-3)
            rect(-5,21,10,3,6,1,-3)
        else:
            vest(12 if level==5 else 19 if level==6 else 6,level==7)
            if level==5:
                rect(-8,7,4,5,1,1,-7);rect(4,12,3,4,2,1,-7)
    elif family=='plants':
        if level==0:
            layer(0,10,2,depth=3)
            for x,y in [(-5,-2),(1,-4),(4,3),(-3,4)]:blob(x,y,4,2,2,3,9)
        elif level==1:
            rect(-13,0,26,3,6,19)
            for x in (-8,0,8):
                for y in (-5,5):
                    rect(x-3,3,6,2,2,7,y);sprout(x,y,5,5,2)
        elif level==2:
            layer(0,6,2,depth=7);sprout(0,0,7,14,2)
            for x,z in [(-3,23),(3,23),(0,26),(0,20)]:blob(x,0,z,3,2,3,pink)
            blob(0,-2,23,2,1,2,0)
        else:
            pot(8 if level!=4 else 13,h=8,r=8,soil=True)
            if level==3:
                for x,y,h in [(-3,1,16),(3,1,14),(0,-3,12)]:sprout(x,y,8,h,4)
            else:
                rect(-1,8,3,15,1,3)
                bar(0,16,-6,23,1,1,3);bar(0,15,6,22,1,1,3)
                for x,y,z in [(-6,0,25),(5,0,25),(0,3,29),(0,-3,24)]:
                    blob(x,y,z,6,5,5,leaf if level==4 else pink)
                if level==5:
                    for x,y,z in [(-8,-3,25),(4,-4,26),(0,1,33),(8,0,27),(-3,-5,23)]:blob(x,y,z,2,2,2,12)
    else:
        if level==0:
            for i in range(5):blob((i-2)*4,abs(i-2)*2,4,3,4,4,12 if i%2 else leaf)
            blob(-10,4,4,3,3,3,9);rect(-11,4,1,2,10,1,1)
        elif level==1:
            blob(0,0,5,7,13,5,9)
            for y in (-9,-5,-1,3,7):rect(-6,6,12,1,4,1,y)
            rect(-2,10,4,1,0,13)
        elif level==2:moth(0,12)
        elif level==3:
            moth(17,14);rect(-1,7,3,2,leaf,15)
        elif level==4:
            moth(11,15);rect(-1,7,3,2,0,17)
        else:
            moth(purple,15)
            blob(0,5,8,3,6,3,gold)
            for x in (-4,3):rect(x,8,2,3,0,4,-10)
            for x in (-10,9):top(x,-3,2,3,9,pink)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=chain_start+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<batch-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('voxel-'+family+'.blend')),copy=True)
(OUT/(family+'-manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(family.upper()+'_COMPLETE')
