"""Virus clues 30037..30048. Reference-based 32-grid voxel chain."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Virus_Clues_32'
names=['旧斗篷','破碎烧杯','实验笔记','病毒样本','泄漏警报','空荡街道照片','废弃医院钥匙','隔离区通行证','零号病人档案','研究员加密硬盘','实验日志残页','病毒真相']
m=bpy.data.materials.new('sample_lime');m.diffuse_color=(.35,.8,.025,1);m.use_nodes=True
m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=m.diffuse_color
m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.65
materials.append(m);lime=len(materials)-1
def flat():
    global cells
    cells={(x,z-14,-y+5):c for (x,y,z),c in cells.items()}
def cross(x,z,c=13):
    rect(x-1,z-4,3,9,c,1,-4);rect(x-4,z-1,9,3,c,1,-4)
manifest=[]
for level in range(12):
    cells={}
    if level==0:
        for z in range(21):
            w=13-z//3
            for x in range(-w,w+1):
                if z<3 and (x+15)%6<2:continue
                rect(x,z,1,1,6 if (x//3)%2 else 10,9)
        for z in range(18,31):
            w=8-max(0,z-25)
            rect(-w,z,w*2+1,1,6,11)
            if z<28:rect(-w+2,z,max(1,w*2-3),1,10,3,-5)
        rect(-1,17,3,3,9,1,-6)
    elif level==1:
        for z in range(23):
            r=10-z//2 if z<14 else 4
            layer(z,r,lime if 1<z<8 else 18)
            if z<8:layer(z,r-1,lime)
            elif z<14:layer(z,r-1,6)
        for z in (23,24):layer(z,5,18)
        for z in range(25):
            x=2 if z<10 else 0 if z<16 else 1
            y=-max(4,10-z//2)
            rect(x,z,1,1,10,1,y)
        rect(-10,0,3,1,18,4,-8)
    elif level==2:
        rect(-15,0,30,23,1,4)
        rect(-14,1,13,21,12,3,-2);rect(1,1,13,21,12,3,-2)
        rect(-1,0,2,23,2,3,-2)
        for x in (-11,4):
            for z in (5,9,13,18):rect(x,z,7 if z!=13 else 5,1,2,1,-4)
        rect(8,0,2,6,11,1,-4);flat()
    elif level==3:
        for z in range(25):layer(z,5 if z>2 else 3+z,lime if 2<z<18 else 18)
        for z in range(3,18):layer(z,4,lime)
        for z in range(25,29):layer(z,6,9)
        rect(-3,18,6,5,0,1,-5);rect(-1,19,2,3,10,1,-6)
        rect(-4,4,1,13,15,1,-5)
    elif level==4:
        rect(-13,0,26,3,10,12)
        for z in range(3,27):
            w=max(1,13-(z-3)//2)
            rect(-w,z,w*2,1,10,4)
            if w>2:rect(-w+2,z,w*2-4,1,0,1,-3)
        rect(-1,9,2,9,10,1,-4);rect(-1,5,2,2,10,1,-4)
        for z in range(26,31):layer(z,3,11)
    elif level==5:
        rect(-12,0,24,29,15,3);rect(-10,5,20,22,18,1,-2)
        for z in range(5,22):
            w=max(1,9-(z-5)//2);rect(-w,z,w*2,1,6,1,-3)
        for x in (-10,5):
            rect(x,9,5,15,1,1,-3)
            for z in (12,18):rect(x+1,z,2,3,10,1,-4)
        for z in (7,12,17):rect(0,z,1,3,9,1,-4)
        flat()
    elif level==6:
        ring(-5,22,6,3,4,3);rect(-7,0,4,18,4,3)
        rect(-3,2,3,3,4,3);rect(-3,8,3,3,4,3)
        ring(3,25,4,2,6,3)
        rect(2,5,11,17,13,4);rect(3,6,9,14,15,1,-3)
        cross(7,14);flat()
    elif level==7:
        rect(-15,2,30,21,13,3);rect(-13,4,26,17,15,1,-2)
        rect(-13,17,26,4,0,1,-3)
        rect(-11,6,8,7,6,1,-3);rect(-9,13,4,3,6,1,-3)
        for z in (8,12):rect(0,z,10,1,6,1,-3)
        for x in range(0,11,2):rect(x,5,1,2,10,1,-3)
        rect(-2,22,4,6,4,3);flat()
    elif level==8:
        rect(-14,0,28,24,1,2);rect(-12,22,10,5,9,2)
        rect(-12,1,24,22,12,1,-2);rect(-14,0,28,21,9,1,-3)
        for x in range(-2,11):
            for z in range(4,17):
                if 16<=(x-4)**2+(z-10)**2<=36:rect(x,z,1,1,11,1,-4)
        for x in range(-2,11):rect(x,10,1,2,11,1,-4)
        flat()
    elif level in (9,11):
        rect(-10,0,20,30,10,6);rect(-9,1,18,28,4,2,-4)
        rect(-7,3,14,24,14 if level==11 else 3,1,-6)
        for x in (-8,7):
            for z in (2,26):rect(x,z,2,2,6,1,-6)
        if level==9:
            rect(-4,10,8,9,6,1,-7);rect(-2,13,4,4,10,1,-8)
            rect(-3,1,6,2,17,1,-6);rect(-5,28,10,2,10,2)
        else:
            rect(-3,11,6,7,17,1,-7);rect(-2,12,4,5,18,1,-8)
            for x,z in [(-6,6),(5,22),(-5,23),(6,7)]:
                rect(x,z,1,abs(14-z)+1,17,1,-7) if z<14 else rect(x,14,1,z-13,17,1,-7)
                rect(min(x,0),14,abs(x)+1,1,17,1,-7)
            for z in (4,25):rect(-7,z,14,1,17,1,-7)
            rect(-10,1,20,1,17,7)
        flat()
    else:
        rect(-11,0,22,28,1,5);rect(-10,1,20,26,12,2,-3)
        for z in (4,8,12,16,20,24):
            rect(-7,z,12 if z%8 else 8,1,2,1,-5)
        for x,z in [(-11,24),(8,0),(-11,0)]:
            rect(x,z,3,4,2,3,-3)
        rect(5,19,4,5,11,1,-5);flat()
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30037+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-clues.blend'),copy=True)
(OUT/'clues-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('CLUES_COMPLETE')
