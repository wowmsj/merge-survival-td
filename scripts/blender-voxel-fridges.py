"""Cold storage chain 20001..20010, 32-grid static voxel props."""
from pathlib import Path
base=Path(__file__).resolve().parent
source=(base/'blender-voxel-tools.py').read_text(encoding='utf8')
exec(compile(source.split('\nmanifest=[]')[0],str(base/'blender-voxel-tools.py'),'exec'))
scene.name='Cold_Storage_32'
names=['旧保温箱','手提保温箱','迷你冷藏箱','翻修冷藏箱','旧冷藏箱','保鲜冷藏箱','双层冷藏箱','加固冷藏箱','大型冷藏箱','双门冷藏库']
def feet(w):
    for x in (-w//2+1,w//2-4):rect(x,0,3,2,10,4)
def door(x,z,w,h,color,y=-9):
    rect(x,z,w,h,10,2,y);rect(x+1,z+1,w-2,h-2,color,2,y-1)
def grip(x,z,h,y=-11):rect(x,z,2,h,7,3,y)
manifest=[]
for level in range(10):
    cells={}
    if level<2:
        c=12 if level==0 else 13
        rect(-13,1,26,13,c,18);rect(-14,14,28,2,10,20);rect(-14,16,28,3,7 if level else 2,20)
        rect(-2,11,4,6,4,2,-10)
        if level==0:rect(6,2,5,3,8,2,-10)
        else:
            rect(-10,18,3,8,3,3);rect(7,18,3,8,3,3);rect(-10,25,20,3,3,3)
    elif level<4:
        c=16 if level==2 else 11
        feet(22);rect(-11,2,22,25,c,18);door(-10,3,20,23,7 if level==2 else 12);grip(5,13,8)
        if level==3:
            rect(-12,26,24,3,10,20);rect(-8,5,7,2,8,2,-11)
            for x in (-7,-3,1,5):rect(x,8,2,1,10,2,-11)
    elif level<6:
        c=9 if level==4 else 16
        feet(30);rect(-15,2,30,16,c,20);rect(-16,18,32,2,10,22);rect(-16,20,32,3,12 if level==4 else 7,22)
        rect(-5,21,10,2,3,3,-12)
        if level==4:rect(-12,3,4,2,8,2,-11);rect(9,5,4,3,8,2,-11)
        else:
            # Sliding glass panels read as two dark-blue insets from the board camera.
            for x in (-14,1):rect(x,23,13,1,14,17)
            rect(-1,23,2,2,4,22);rect(8,13,4,3,14,2,-11)
    elif level<8:
        c=13 if level==6 else 10
        feet(24);rect(-12,2,24,29,c,18)
        door(-11,3,22,15,13 if level==6 else 9);door(-11,18,22,12,7 if level==6 else 9)
        grip(6,8,7);grip(6,21,6)
        if level==7:
            for x in (-12,10):rect(x,2,2,29,4,21)
            rect(-12,15,24,2,10,22)
    elif level==8:
        feet(30);rect(-15,2,30,29,15,20);door(-14,3,28,25,16,-11);grip(9,9,12,-13)
        for x in range(-10,11,4):rect(x,29,2,2,10,2,-12)
        rect(-8,8,10,12,14,2,-13);rect(-7,9,2,10,4,2,-14)
    else:
        feet(30);rect(-15,2,30,29,6,20)
        for x in (-14,1):door(x,3,13,24,7,-11)
        grip(-3,10,10,-13);grip(1,10,10,-13)
        rect(-15,28,30,3,10,22)
        for x in (-11,-7,-3,1,5):rect(x,29,2,1,4,2,-12)
        rect(10,29,3,1,16,2,-12)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=20001+level')
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<fridge-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-fridges.blend'),copy=True)
(OUT/'fridges-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('FRIDGES_COMPLETE')
