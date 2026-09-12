"""Water chain 20011..20020, reference-based 32-grid voxel silhouettes."""
from pathlib import Path
import bmesh
base=Path(__file__).resolve().parent
source=(base/'blender-voxel-tools.py').read_text(encoding='utf8')
exec(compile(source.split('\nmanifest=[]')[0],str(base/'blender-voxel-tools.py'),'exec'))
scene.name='Water_Supplies_32'
names=['脏水','沉淀水','煮沸水','过滤水','蒸馏水','纯净水','瓶装净水','电解质水','营养冲剂','行军水壶']
for name,color in [('water','65c5df'),('glass_edge','b4e5e9'),('canvas','788244'),('canvas_dark','4c5835')]:
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    c=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=c;bs.inputs['Roughness'].default_value=.65;m.diffuse_color=c;materials.append(m)

def layer(z,r,c,x=0,y=0,depth=1):
    # Stepped octagons keep the voxel shape readable without tiny surface noise.
    for i in range(-r,r):
        for j in range(-r,r):
            if abs(i+.5)+abs(j+.5)<=r*1.5:
                for k in range(depth):cells[x+i,y+j,z+k]=c

def bottle(x,y,z,r,h,color,cap=13):
    layer(z,r,18,x,y)
    for k in range(1,h-5):layer(z+k,r,color,x,y)
    layer(z+h-5,r-1,18,x,y);layer(z+h-4,max(2,r-2),18,x,y)
    layer(z+h-3,max(2,r-2),cap,x,y,3)

manifest=[]
for level in range(10):
    cells={}
    if level<2:
        bottle(0,0,0,8,28,9 if level==0 else 17,2 if level==0 else 6)
        for z in range(1,6 if level else 19):layer(z,8,2 if level==0 else 9)
        rect(-5,7,2,14,18,1,-8)
        for x,z in [(-3,3),(3,5),(2,12)][:3 if level==0 else 2]:rect(x,z,2,2,8,1,-8)
    elif level==2:
        layer(0,10,10,depth=2)
        for z in range(2,15):layer(z,10 if z<10 else 9,4)
        layer(15,8,7);layer(16,6,4);layer(17,2,3,depth=3)
        bar(-8,14,-8,25,1,4,3);bar(-8,25,8,25,1,3,3);bar(8,25,8,14,1,4,3)
        bar(-8,7,-14,14,2,7,5);rect(-16,14,5,2,10,5)
    elif level==3:
        rect(-13,0,27,2,10,19);rect(11,2,2,25,4,3,3)
        for z in range(2,11):layer(z,max(4,9-(z-2)//2),17,-3)
        layer(11,5,18,-3);rect(-4,12,2,5,6,2)
        rect(-3,17,16,2,10,3,3)
        for z in range(16,27):
            r=3+(z-16)//2
            layer(z,r,4,-3)
        # Open paper funnel: only a rim above its recessed tan interior.
        layer(27,8,12,-3)
        for i in range(-9,3):
            for j in range(-6,6):cells.pop((i,j,27),None)
        layer(26,6,0,-3)
    elif level==4:
        for z in range(0,18):layer(z,max(3,11-z//2),17)
        layer(18,3,18,depth=5);layer(23,4,1,depth=3)
        bar(0,25,0,30,1,18,2);bar(0,30,12,30,1,18,2);bar(12,30,12,8,1,18,2)
        rect(-4,4,2,10,18,1,-7)
    elif level==5:
        for z in range(0,21):layer(z,10,17)
        for z in range(21,25):layer(z,10-(z-20),18)
        layer(25,4,13,depth=4)
        # Handle is a real opening cut through the jug's upper right corner.
        for x in range(4,8):
            for z in range(15,23):
                for y in range(-11,11):cells.pop((x,y,z),None)
        rect(-6,4,2,15,18,1,-10);rect(-3,8,7,5,13,1,-10)
    elif level==6:
        rect(-15,0,30,2,2,23)
        for x in (-10,0,10):
            for y in (-5,5):bottle(x,y,2,4,20,17)
        rect(-15,2,30,8,0,2,-12);rect(-15,2,30,8,1,2,12)
        rect(-16,2,2,8,1,25);rect(14,2,2,8,1,25)
        rect(-6,4,12,4,12,1,-14)
    elif level==7:
        bottle(0,0,0,8,31,17,10)
        for z in range(10,19):layer(z,8,13)
        rect(-1,12,3,5,18,1,-8);rect(-2,12,5,2,18,1,-8)
        rect(-5,21,2,4,18,1,-8)
    elif level==8:
        layer(0,11,7,depth=2)
        for z in range(2,23):layer(z,10,0)
        layer(23,11,12,depth=3);layer(26,9,7)
        rect(-6,7,12,11,12,1,-10)
        for z in range(9,16):rect(-(16-z),z,2*(16-z),1,9,1,-11)
        # Attached scoop reads as a secondary silhouette at board size.
        rect(8,3,8,2,4,4,-12);rect(14,4,3,9,4,3,-12)
        layer(3,4,7,8,-12,2);layer(5,3,12,8,-12)
    else:
        for z in range(0,23):layer(z,10 if 3<z<19 else 8,19,depth=1)
        layer(23,5,20,depth=2);layer(25,4,19,depth=5)
        for x in (-8,6):rect(x,3,2,18,20,2,-9)
        for x in (-7,2):
            rect(x,5,6,8,20,2,-10);rect(x,7,6,6,19,2,-11);rect(x+2,10,2,2,4,1,-12)
        rect(-1,3,2,19,4,1,-10)
        bar(7,20,12,27,1,20,3);bar(12,27,3,27,1,20,3)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20011+level')
    # Merge coplanar voxel faces, keeping material borders and the stepped outline.
    exporter=exporter.replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new")
    exporter=exporter.replace("'triangles':len(faces)*2", "'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<water-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-drinks.blend'),copy=True)
(OUT/'drinks-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('DRINKS_COMPLETE')
