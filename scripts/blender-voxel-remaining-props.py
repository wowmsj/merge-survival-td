"""Approved voxel props for remaining chains 31..48; run with -- chainNN."""
from pathlib import Path
import bmesh

base = Path(__file__).resolve().parent
source = (base / 'blender-voxel-tools.py').read_text(encoding='utf8')
exec(compile(source.split('\nmanifest=[]')[0], str(base / 'blender-voxel-tools.py'), 'exec'))
meta = json.loads((base.parent / 'assets/models/blender-samples/remaining-chains.json').read_text(encoding='utf8'))
key = sys.argv[sys.argv.index('--') + 1]
chain = next(c for c in meta if c['key'] == key and 31 <= c['seq'] <= 48)
items = chain['items']
scene.name = 'Voxel_' + key

for mat_name, color in [('leaf2','4f8739'),('mint','74d5a3'),('cyan','42cadd'),('blue','3974c4'),
                        ('navy','253557'),('orange','e57b32'),('cream','f4e0a2'),('gray2','69747f'),
                        ('black2','20252c'),('white2','e8eef0'),('lime','a6e34d'),('red2','d84a43'),
                        ('purple','8f55c7')]:
    m=bpy.data.materials.new(mat_name);m.use_nodes=True
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    c=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=c;bs.inputs['Roughness'].default_value=.82;m.diffuse_color=c;materials.append(m)
LEAF,MINT,CYAN,BLUE,NAVY,ORANGE,CREAM,GRAY,BLACK,WHITE,LIME,RED,PURPLE=17,18,19,20,21,22,23,24,25,26,27,28,29

def blob(x,y,z,rx,ry,rz,c):
    for i in range(x-rx,x+rx+1):
        for j in range(y-ry,y+ry+1):
            for k in range(z-rz,z+rz+1):
                if ((i-x)/max(1,rx))**2+((j-y)/max(1,ry))**2+((k-z)/max(1,rz))**2<=1:cells[i,j,k]=c
def box(x,y,z,w,d,h,c): rect(x,z,w,h,c,d,y)
def layer(z,r,c,x=0,y=0,d=1):
    for xx in range(-r,r):
        for yy in range(-r,r):
            if abs(xx+.5)+abs(yy+.5)<=r*1.5:
                for zz in range(d):cells[x+xx,y+yy,z+zz]=c
def front_bar(x1,z1,x2,z2,r,c,y):
    for x in range(min(x1,x2)-r,max(x1,x2)+r+1):
        for z in range(min(z1,z2)-r,max(z1,z2)+r+1):
            t=max(0,min(1,((x-x1)*(x2-x1)+(z-z1)*(z2-z1))/max(1,(x2-x1)**2+(z2-z1)**2)))
            if (x-x1-t*(x2-x1))**2+(z-z1-t*(z2-z1))**2<=r*r:cells[x,y,z]=c
def front_ring(x,z,r,inner,c,y):
    for xx in range(x-r,x+r+1):
        for zz in range(z-r,z+r+1):
            if inner**2<=(xx-x)**2+(zz-z)**2<=r*r:cells[xx,y,zz]=c
def basket(level):
    if level==0:
        for a in range(-12,13): box(a,-1,abs(a)//4,2,2,2,8)
        for a in range(-9,10): box(a,1,9-abs(a)//3,2,2,2,9)
        return
    r=min(12,7+level//2); h=min(18,7+level); weave=[8,9,1,22,12,23,17,20][level-1]
    for z in range(h):
        rr=r-2+z//5
        for x in range(-rr,rr):
            for y in range(-rr,rr):
                if abs(x+.5)+abs(y+.5)<=rr*1.45 and (abs(x)>rr-3 or abs(y)>rr-3):cells[x,y,z]=weave if (x+z)%3 else 9
    if level>=2:
        for z in range(h,28):
            span=max(0,10-(z-h)//2)
            box(-span,-r,z,2,2,2,9);box(span-2,-r,z,2,2,2,9)
        box(-8,-r,26,16,2,2,9)
    for n in range(max(0,level-3)):
        x=-7+(n%5)*4; blob(x,0,h+2+(n%2)*2,3,3,3,[LEAF,12,ORANGE,23][n%4])
def herb(level):
    if level==8:
        box(-11,0,0,22,12,15,RED);box(-9,-7,4,18,2,7,WHITE);box(-2,-8,6,4,2,3,RED);box(-7,0,15,14,10,3,WHITE);return
    if level in (1,3):
        layer(0,8,18,d=2)
        for z in range(2,17):layer(z,7,17 if level==1 else 8)
        layer(17,8,18,d=2)
        base_z=19
    elif level==5:
        blob(0,0,8,9,6,8,12);box(-5,-7,5,10,2,6,CREAM);base_z=16
    else: base_z=1
    count=3+level
    for n in range(count):
        x=-8+(n*5)%17;y=-2+(n%3)*2;hh=8+(n%4)*2
        box(x,y,base_z,2,2,hh,LEAF)
        for z,s in ((base_z+hh-3,-1),(base_z+hh-6,1)):blob(x+s*2,y,z,3,2,2,MINT if level<4 else LEAF)
    if level in (2,4,6,7):box(-10,1,0,20,5,3,9 if level<6 else CREAM)
    if level==7:box(-10,-4,7,20,2,3,ORANGE)
def robot(level):
    if level<2:
        box(-8,-5,0,16,10,21,NAVY if level else GRAY);box(-6,-6,5,12,2,9,LIME);box(-2,-6,22,4,2,2,ORANGE);return
    if level<4:
        if level==2:
            box(-9,-2,0,18,4,18,BLACK);box(-6,-3,5,12,2,8,NAVY)
            for x in range(-11,12,5):box(x,-1,2,2,2,3,CREAM);box(x,-1,14,2,2,3,CREAM)
        else:
            box(-13,-2,0,26,4,15,LEAF);box(-10,-3,3,20,2,9,NAVY)
            for x in range(-11,12,5):box(x,-1,-2,2,2,3,CREAM)
        return
    bot_colors=[8,WHITE,ORANGE,CREAM,BLUE,LEAF];r=8+min(4,level-4);layer(0,r,BLACK,d=3)
    for z in range(3,8+level):layer(z,r,bot_colors[level-4])
    layer(8+level,r,WHITE,d=2);blob(0,-r,10+level,3,2,2,CYAN)
    for x in (-r+2,r-4):box(x,-r,2,3,2,4,BLACK)
    if level==6:bar(-9,8,-15,20,2,ORANGE,3);box(-18,-1,18,7,3,3,GRAY)
    if level==7:bar(-10,8,-15,22,1,CREAM,2);box(-18,-1,20,7,3,3,ORANGE)
    if level>=8:box(-12,-1,8,24,3,3,NAVY)
    if level>=9:box(-2,-r-2,13,4,4,8,RED)
def trash(level):
    if level==0:
        for x,y,z in [(-8,0,0),(0,2,2),(7,-1,0)]:box(x,y,z,9,3,2,CREAM if x else 12)
    elif level==1:
        bar(-11,5,10,5,1,WHITE,3);box(7,-2,2,7,4,7,WHITE)
        for x in range(-7,8,4):bar(x,5,x-4,10,1,WHITE,2)
    elif level==2:
        for z in range(18):layer(z,7-(z//10),WHITE);box(-1,0,18,2,2,12,RED);bar(0,28,7,31,1,RED,2)
    elif level==3:
        box(-11,-7,0,22,14,7,CREAM);box(-9,-6,7,18,12,3,ORANGE);box(-5,-7,10,10,2,2,RED)
    elif level==4:
        box(-13,-8,0,26,16,18,GRAY);box(-11,-9,15,22,2,4,ORANGE)
        for x in (-8,0,7):box(x,-10,5,4,2,6,[LEAF,CREAM,RED][(x+8)//7])
    else:
        blob(0,0,12,13,9,12,BLACK);box(-8,-8,22,16,4,5,BLACK);box(-3,-9,6,6,2,6,GRAY)
def mouse(level):
    if level==5:
        layer(0,12,9,d=4);blob(0,0,5,9,7,5,CREAM);return
    if level==6:
        box(-13,-2,0,26,4,3,GRAY);box(-13,-2,19,26,4,3,GRAY)
        for x in range(-13,14,5):box(x,-3,2,2,3,17,GRAY)
        for x in (-6,6):blob(x,-4,8,5,3,4,ORANGE)
        return
    count=1 if level<3 else 2 if level==3 else 4
    for n in range(count):
        x=(n%2)*12-6;y=(n//2)*7-2;s=4+(level==2)*2
        body_color=[8,GRAY,BLACK][level] if level<3 else GRAY if n%2 else 8
        blob(x,y,6,s+2,s,5,body_color);blob(x+s+1,y-1,8,4,3,3,CREAM if level==0 else GRAY)
        for ex in (-2,2):blob(x+ex,y,12,2,2,2,9)
        box(x+s+3,y-4,8,1,1,1,BLACK);bar(x-s,6,x-s-6,2,1,8,1)
def cat(level,small_nest=False):
    if small_nest:
        layer(0,12,9,d=3);blob(0,0,4,9,7,4,CREAM);blob(0,0,8,5,4,3,12);return
    colors=[ORANGE,GRAY,GRAY,ORANGE,WHITE,BLACK,GRAY,CREAM,CYAN,ORANGE,CREAM,WHITE]
    c=colors[level];fat=2 if level in (6,7) else 0
    blob(0,0,10,7+fat,6+fat,10,c);blob(0,-1,22,7,6,6,c)
    for x in (-5,4):
        for z in range(26,31):box(x+(z-26)//2*(1 if x>0 else -1),0,z,3,3,1,c)
    for x in (-3,3):box(x,-7,22,2,2,2,BLACK);box(x,-6,2,3,3,6,c)
    box(-1,-8,19,2,2,2,ORANGE);bar(-7,9,-13,18,1,c,2)
    if level==2:box(-8,-8,16,16,2,3,RED)
    if level==8:box(-8,-7,15,16,2,3,RED);blob(0,-8,15,2,1,2,CREAM)
    if level==9:
        for x in (-5,0,5):
            for z in range(7,24):
                surface=[y for xx,y,zz in cells if xx in (x,x+1) and zz==z]
                if surface:
                    for xx in (x,x+1):cells[xx,min(surface),z]=BLACK
    if level==10:
        for x,z in [(-5,8),(4,13),(-4,20)]:box(x,-7,z,4,2,3,ORANGE)
def power(level):
    w=13+level*4;h=14+level*4
    box(-w//2,0,0,w,12,h,NAVY);box(-w//2+2,-7,3,w-4,2,h-7,BLUE)
    panel=[BLUE,CYAN,ORANGE,PURPLE][level]
    box(-w//2+3,-9,5,w-6,2,h-11,panel)
    for x in range(-w//2+4,w//2-1,5):box(x,-10,7,2,2,h-15,LIME)
    box(-4,-7,h-3,8,2,3,ORANGE)
def machine(level,kind):
    w=16+level*5;h=18+level*4
    panel=[BLUE,CYAN,ORANGE,CREAM,PURPLE][level]
    box(-w//2,0,0,w,14,h,NAVY);box(-w//2+2,-8,3,w-4,2,h-7,panel)
    if kind=='charge':
        box(-4,-10,7,8,2,8,CYAN);box(-2,-11,9,4,2,4,LIME)
        box(-2,-2,h,4,4,8,LIME);bar(0,h+7,8,h+11,1,LIME,2)
    elif kind=='split':
        for x in (-7,5):box(x,-10,7,5,2,9,ORANGE)
        box(-2,-11,10,4,2,3,CREAM);box(-1,-2,h,2,4,7,ORANGE)
    else:
        box(-7,-10,6,14,2,10,CYAN);box(-2,-11,9,4,2,4,CREAM)
        for x in range(-w//2+2,w//2-1,5):box(x,-10,h-5,3,2,3,ORANGE if level<3 else RED)
def chip(kind):
    colors=[ORANGE,CYAN,RED,CREAM,LIME];c=colors[kind]
    box(-12,0,0,24,4,20,NAVY);box(-9,-3,3,18,2,14,c);front_ring(0,10,6,2,WHITE,-4)
    for x in range(-10,11,4):box(x,-1,-2,2,2,2,CREAM);box(x,-1,20,2,2,2,CREAM)
    if kind>=3: ring(0,10,9,7,c,3)
def backpack():
    blob(0,0,13,11,7,13,LEAF);box(-8,-8,7,16,2,12,NAVY);box(-6,-9,9,12,2,7,CREAM)
    for x in (-9,7):box(x,-1,5,3,5,17,9);bar(x+1,21,x+1,29,1,9,2)
def watch():
    ring(0,12,11,2,ORANGE,5);disc(0,12,8,CREAM,4);front_bar(0,12,0,18,1,BLACK,-3);front_bar(0,12,5,9,1,BLACK,-3)
    box(-4,0,24,8,4,5,ORANGE);bar(0,29,9,34,1,ORANGE,2)
def cleaner():
    for z in range(22):layer(z,8 if z<17 else 6,LIME)
    box(-5,-9,6,10,2,10,WHITE);box(-3,0,22,6,5,7,ORANGE);box(0,0,27,11,4,4,GRAY);box(8,-1,26,7,3,2,CYAN)
def core(level):
    if level==0:
        for x,y,z in [(-8,0,0),(0,3,3),(7,-2,1)]:blob(x,y,z+4,4,3,4,GRAY if x else CYAN)
        return
    if level==1:
        for x,y,z in [(-7,0,0),(3,2,2),(0,-3,8)]:blob(x,y,z+4,5,3,4,CYAN)
        return
    layer(0,10+level//2,NAVY,d=3);ring(0,8,9,5,GRAY,5)
    if level==2:return  # Empty mounting ring before the working prototype.
    core_color={5:CYAN,6:PURPLE,7:ORANGE}.get(level,CYAN)
    blob(0,0,9,5+level//2,5+level//2,5+level//2,core_color)
    for a in (-1,1):bar(a*6,8,a*(10+level),18+level,2,ORANGE if level<5 else RED,3)
    if level>=4:
        for x in (-8,0,8):box(x,-5,2,3,3,5,CREAM)

manifest=[]
for level,item in enumerate(items):
    cells={}; seq=chain['seq']
    if seq==31:basket(level)
    elif seq==32:herb(level)
    elif seq==33:robot(level)
    elif seq==34:trash(level)
    elif seq==35:mouse(level)
    elif seq==36:cat(level,True)
    elif seq==37:cat(level)
    elif seq==38:power(level)
    elif seq==39:machine(level,'charge')
    elif seq==40:machine(level,'split')
    elif seq==41:machine(level,'boost')
    elif seq==42:chip(level)
    elif seq==43:chip(3)
    elif seq==44:chip(4)
    elif seq==45:backpack()
    elif seq==46:watch()
    elif seq==47:cleaner()
    else:core(level)
    assert all(0 <= c < len(materials) for c in cells.values()), f"invalid material in {key}/{item['id']}"
    model_id=item['id']
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=model_id').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new")
    exporter=exporter.replace("'triangles':len(faces)*2", "'triangles':len(me.loop_triangles)").replace("names[level]", "item['name']")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<remaining-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('voxel-'+key+'.blend')),copy=True)
(OUT/(key+'-manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(key.upper()+'_COMPLETE')
