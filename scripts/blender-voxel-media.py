"""Entertainment relics 30055..30062, names take precedence over mismatched icons."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Entertainment_Relics_32'
names=['旧U盘','旧鼠标','游戏手柄','随身听','蓝牙耳机','投影仪','VR眼镜','旧物收藏箱']
def top(x,y,w,d,z,c):rect(x,z,w,1,c,d,y)
manifest=[]
for level in range(8):
    cells={}
    if level==0:
        rect(-6,0,12,3,10,23,3);rect(-6,3,12,2,4,23,3)
        rect(-5,1,10,3,15,8,-12)
        for x in (-3,1):top(x,-13,2,2,4,10)
        top(-3,11,6,2,5,10);top(-6,-5,2,3,5,9)
        rect(-4,1,8,1,13,1,-16)
    elif level==1:
        for z in range(8):layer(z,10-z//3,12,depth=1)
        # Elongated palm rest, visible button split and repair band.
        cells={(x,round(y*1.3),z):c for (x,y,z),c in cells.items()}
        # Fill integer gaps introduced by the longer mouse body.
        for (x,y,z),c in list(cells.items()):
            if (x,y+2,z) in cells:cells.setdefault((x,y+1,z),c)
        top(0,-7,1,8,8,2);rect(-1,8,3,2,6,4,-7)
        for x in range(-9,9):
            zs=[z for xx,yy,z in cells if xx==x and yy==1]
            if zs:top(x,1,1,2,max(zs)+1,9)
        for y in range(-17,-10):rect(0,0,2,2,10,1,y)
        for x in range(0,11):rect(x,0,1,2,10,1,-17)
        rect(10,0,2,2,10,12,-12)
    elif level==2:
        rect(-13,0,26,4,10,13)
        for x in (-10,10):layer(0,5,10,x=x,y=7,depth=5)
        rect(-12,4,24,2,6,11)
        top(-10,-1,7,2,6,10);top(-8,-1,2,7,6,10)
        for x,y,c in [(8,-4,16),(11,-1,11),(8,2,13),(5,-1,0)]:top(x,y,2,2,6,c)
        for x in (-4,3):layer(6,2,10,x=x,y=4,depth=2)
        for x in (-10,6):rect(x,2,4,4,10,3,-7)
    elif level==3:
        rect(-10,0,20,6,6,22);rect(-9,6,18,1,12,18)
        top(-8,0,16,8,7,10)
        for x in (-5,5):
            layer(8,3,4,x=x);layer(9,1,10,x=x)
        top(-2,0,4,4,8,6)
        for y,c in [(-8,11),(-6,0)]:top(-9,y,18,1,7,c)
        for x in (-7,-2,3):rect(x,3,3,2,10,1,-12)
        # Headphones: open band around the cassette player.
        for x in (-14,12):rect(x,0,2,2,10,25,3);rect(x-1,1,4,5,10,7)
        rect(-14,0,28,2,10,2,16)
    elif level==4:
        rect(-11,0,22,9,15,15);rect(-10,9,20,1,6,13)
        for x in (-6,5):
            layer(10,3,10,x=x,y=-1)
            rect(x-1,10,3,8,15,3,-1);layer(18,4,15,x=x,y=-1,depth=3)
            rect(x-2,19,3,2,10,1,-5)
        rect(-11,9,22,12,15,3,7);rect(-9,11,18,8,6,1,5)
        top(-1,-8,2,1,5,16)
    elif level==5:
        rect(-14,0,28,3,10,23);rect(-14,3,28,10,15,23)
        rect(-13,4,26,7,6,1,-12)
        disc(6,7,5,10,3)
        # Move lens from the default center plane onto the projector front.
        for x in range(1,12):
            for z in range(2,13):
                if (x-6)**2+(z-7)**2<=25:rect(x,z,1,1,10,3,-13)
                if (x-6)**2+(z-7)**2<=9:rect(x,z,1,1,17,1,-15)
        for z in (5,7,9):rect(-11,z,10,1,10,1,-13)
        for y in (-7,-3,1,5):rect(13,5,1,6,10,1,y)
        top(3,-6,6,3,13,6);top(5,-6,2,3,14,10)
    elif level==6:
        rect(-14,0,28,12,15,13,-5);rect(-12,2,24,8,14,1,-12)
        for x in (-15,13):rect(x,3,2,6,6,16,5)
        rect(-15,3,30,3,10,2,13)
        rect(-2,12,4,2,10,19,3)
        rect(-2,6,4,7,10,2,13)
        top(-3,-6,6,2,12,10)
    else:
        rect(-15,0,30,11,1,24)
        rect(-13,2,26,9,2,20)
        for x in (-15,12):rect(x,0,3,12,6,25)
        rect(-15,0,30,2,6,25)
        rect(-15,11,30,13,1,3,10);rect(-13,13,26,9,2,1,8)
        rect(-3,6,6,4,0,1,-13)
        # Recognizable packed media: blue cassette, red controller, pale headset.
        rect(-11,11,10,7,13,7,1);top(-10,1,8,5,18,12)
        for x in (-9,-4):top(x,1,2,2,19,10)
        rect(1,11,11,4,11,8,-3);top(2,-3,3,1,15,10);top(3,-3,1,3,15,10)
        top(9,-3,2,2,15,0)
        for x in (0,10):rect(x,13,2,9,15,2,5)
        rect(0,21,12,2,15,2,5)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30055+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-media.blend'),copy=True)
(OUT/'media-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('MEDIA_COMPLETE')
