"""Three glove grades, reusing voxel authoring and isolated GLB export."""
from pathlib import Path
base=Path(__file__).resolve().parent
source=(base/'blender-voxel-tools.py').read_text(encoding='utf8')
exec(compile(source.split('\nmanifest=[]')[0],str(base/'blender-voxel-tools.py'),'exec'))
scene.name='Gloves_32'
names=['单只手套','一只手套','装修手套']
def glove(grade,offset=0,depth=0,mirror=1):
    global cells
    target=cells;cells={}
    body=[12,13,0][grade];cuff=[2,14,10][grade]
    rect(-6,5,12,13,body,5)
    # Four separate stepped fingertips and a connected opposing thumb.
    for x,h in [(-6,7),(-2,10),(2,9),(6,6)]:
        rect(x,16,3,h,body,4)
        rect(x+1,16+h,1,1,body,2)
    bar(-6,9,-10,16,2,body,5)
    rect(-6,1,13,5 if grade==0 else 7,cuff,6)
    if grade>=1:
        rect(-5,2,11,3,7 if grade==1 else 0,2,-4)
        rect(-4,11,9,4,14 if grade==1 else 10,2,-3)
        for x,h in [(-6,7),(-2,10),(2,9),(6,6)]:
            rect(x,18,3,3,7 if grade==1 else 10,2,-3)
    if grade==2:rect(-4,7,9,3,9,2,-3)
    for (x,y,z),c in cells.items():target[x*mirror+offset,y+depth,z]=c
    cells=target

manifest=[]
for level in range(3):
    cells={}
    if level==2:
        glove(2,-8,3);glove(2,8,-3,-1)
    else:glove(level)
    # Share the tested surface exporter; keep current-chain naming separate.
    exporter=source.split('    lo=[min(p[a]')[1].split("bpy.ops.wm.save_as_mainfile")[0]
    exporter='    lo=[min(p[a]'+exporter
    exporter=exporter.replace('id=10012+level','id=10026+level')
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<glove-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-gloves.blend'),copy=True)
(OUT/'gloves-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('GLOVES_COMPLETE')
