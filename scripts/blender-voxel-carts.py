"""Supply transport chain 20030..20040, 32-grid voxel samples."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Supply_Carts_32'
names=['废塑料板','一捆塑料板','旧塑料篮','杂物盒','拾荒篮','物资推车','轻便推车','建材推车','运货推车','满载推车','改装铲车']
def box(x,y,z,w,d,h,c):rect(x,z,w,h,c,d,y)
def crate(x,y,z,w,d,h,c):
    box(x,y,z,w,d,2,c)
    for yy in (y-d//2+1,y+d//2-1):box(x,yy,z+2,w,2,h-2,c)
    for xx in (x,x+w-2):box(xx,y,z+2,2,d,h-2,c)
def wheel(x,y,z,r=3):
    for i in range(x-1,x+2):
        for j in range(y-r,y+r+1):
            for k in range(z-r,z+r+1):
                if (j-y)**2+(k-z)**2<=r*r:cells[i,j,k]=4 if (j-y)**2+(k-z)**2<=2 else 10
def cart(c,tall=False):
    for x in (-10,10):
        for y in (-8,8):wheel(x,y,3)
    box(-10,0,6,20,23,2,c)
    for x in (-9,7):box(x,9,8,2,2,21 if tall else 17,4)
    box(-9,9,27 if tall else 23,18,3,2,10)
def cargo(x,y,z,w,d,h,c):
    box(x,y,z,w,d,h,c);box(x+w//2-1,y,z,2,d+1,h+1,12)
    box(x+2,y-d//2-1,z+2,max(2,w-4),1,3,7)
manifest=[]
for level in range(11):
    cells={}
    if level==0:
        box(-7,0,0,14,30,2,6);box(-7,0,2,14,30,1,7)
        for x,y,w,d in [(-7,-13,4,5),(3,13,4,5),(-7,1,3,5),(5,-3,2,4)]:
            for i in range(x,x+w):
                for j in range(y-d//2,y+(d+1)//2):
                    for z in range(3):cells.pop((i,j,z),None)
        box(-3,-5,3,1,9,1,6)
    elif level==1:
        for z,c in enumerate([13,1,16,0,11]):box(-10,z%2,3*z,20,27,2,c)
        for x in (-7,5):box(x,0,0,2,29,15,2)
    elif level==2:
        crate(-12,0,0,24,22,18,9)
        for y in (-10,10):
            box(-13,y,17,26,3,2,0)
            for x in range(-4,4):
                for yy in range(y-2,y+3):
                    for z in range(12,15):cells.pop((x,yy,z),None)
        for x in (-12,10):box(x,0,2,2,24,15,0)
    elif level==3:
        crate(-12,0,0,24,18,12,6);box(-12,9,12,24,2,14,7)
        box(-10,7,14,20,1,10,6);box(-3,-10,8,6,2,5,0)
        box(-8,-1,2,4,4,18,0);box(-7,-1,20,2,2,4,4)
        box(-1,0,2,7,7,13,11);box(7,1,2,3,3,17,4)
        box(5,1,18,7,3,3,4);box(7,1,19,3,3,3,10)
    elif level==4:
        crate(-10,0,0,20,16,19,6)
        box(-11,0,12,22,18,2,2);box(-7,-10,3,14,5,9,12)
        for x in (-6,4):box(x,-13,3,2,1,10,2)
        for x in (-8,6):box(x,9,2,2,3,25,1)
        bottle(-5,0,6,3,24,16,0);bottle(4,2,5,3,23,17)
    elif level==5:
        cart(1,True);cargo(-8,-2,8,16,16,10,1);cargo(-6,-1,19,12,12,8,0)
    elif level==6:
        cart(13,True)
        # Open tubular hand truck with ladder braces and a short loading nose.
        for y in range(-10,7):
            for x in range(-7,7):
                for z in range(6,8):cells.pop((x,y,z),None)
        for z in (12,18,23):box(-8,9,z,16,2,2,4)
        box(-8,-9,6,16,3,2,13)
    elif level==7:
        cart(6)
        for z in (8,11,14,17):
            for x in (-8,-2,4):box(x,-1,z,5,22,2,1 if z%2 else 0)
    elif level==8:
        cart(11);box(-9,-1,8,18,21,1,4);box(-8,9,16,16,2,6,11)
        box(-5,-4,9,7,7,1,8)
    elif level==9:
        cart(16);cargo(-9,-5,8,9,10,11,0);cargo(1,-5,8,8,10,11,1)
        cargo(-8,5,8,16,9,16,1);cargo(-8,-5,20,15,10,8,16)
    else:
        for x in (-9,9):
            for y in (-5,7):wheel(x,y,4,4)
        box(-8,2,5,16,18,6,0);box(-8,8,11,16,6,6,0)
        box(-4,4,11,8,7,2,10);box(-4,7,13,8,2,7,3)
        for x in (-8,6):
            for y in (-4,9):box(x,y,11,2,2,17,6)
        box(-9,3,28,18,16,2,4)
        for x in (-6,4):box(x,-8,4,2,3,21,10);box(x,-13,2,2,13,2,9)
        box(-7,-9,9,14,2,2,4);box(-7,-8,23,14,3,2,4)
        box(-3,-3,15,6,2,2,10)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20030+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<cart-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-carts.blend'),copy=True)
(OUT/'carts-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('CARTS_COMPLETE')
