"""Access keys 30019..30023, 32-grid voxel models."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
scene.name='Access_Keys_32';names=['钥匙','钥匙串','感应钥匙','自动感应钥匙','感应手环']
def top_ring(x,y,z,r,inner,c):
    for i in range(-r,r+1):
        for j in range(-r,r+1):
            if inner*inner<=i*i+j*j<=r*r:rect(x+i,z,1,1,c,1,y+j)
manifest=[]
for level in range(5):
    cells={}
    if level==0:
        ring(0,23,7,4,9,3);rect(-2,0,4,18,9,3)
        rect(1,1,7,3,9,3);rect(1,7,5,3,9,3);rect(-3,15,6,2,0,4)
        cells={(x,z-15,y+2):c for (x,y,z),c in cells.items()}
    elif level==1:
        ring(0,23,7,5,4,3)
        for x,z,c in [(-7,16,13),(0,13,4),(6,16,9)]:
            ring(x,z,4,2,c,4);rect(x-1,1,3,z-3,c,3)
            for zz in (2,6):rect(x+1,zz,3,2,c,3)
        rect(9,12,5,9,11,4);rect(10,14,3,5,17,5)
        cells={(x,z-15,y+3):c for (x,y,z),c in cells.items()}
    elif level==2:
        rect(-9,0,18,2,3,29);rect(-10,2,20,3,10,28);rect(-8,5,16,1,10,26)
        rect(-5,6,7,1,9,7,-6)
        for x in (-3,0):rect(x,7,1,1,2,6,-6)
        rect(-5,7,7,1,2,1,-6)
        rect(-6,6,2,1,11,5,8);rect(3,6,4,1,11,2,8)
    elif level==3:
        rect(-10,0,20,2,10,28);rect(-11,2,22,3,4,25);rect(-8,5,16,2,6,23)
        top_ring(0,0,7,7,0,14);top_ring(0,0,8,6,4,17);top_ring(0,0,8,3,0,13)
        for x in (-10,8):rect(x,5,2,1,17,16)
        for y in (-10,10):rect(-3,7,6,1,10,2,y)
    else:
        # Open wrist band and a thick sensor face on top.
        ring(0,12,12,9,10,12);ring(0,12,12,11,4,13)
        rect(-9,21,18,4,4,18);rect(-8,25,16,1,10,16)
        top_ring(0,0,26,7,0,14);top_ring(0,0,27,6,4,17)
        for x in (-6,4):rect(x,26,2,1,17,2,-7)
        rect(9,19,2,5,6,5);rect(-11,19,2,4,6,4)
    exporter='    lo=[min(p[a]'+source.split('    lo=[min(p[a]')[1].split('bpy.ops.wm.save_as_mainfile')[0]
    exporter=exporter.replace('id=10012+level','id=30019+level').replace('    o=bpy.data.objects.new', "    bm=bmesh.new();bm.from_mesh(me)\n    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)\n    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})\n    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()\n    o=bpy.data.objects.new").replace("'triangles':len(faces)*2","'triangles':len(me.loop_triangles)")
    exec(compile('\n'.join(line[4:] if line.startswith('    ') else line for line in exporter.splitlines()),'<key-export>','exec'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-keys.blend'),copy=True)
(OUT/'keys-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('KEYS_COMPLETE')
