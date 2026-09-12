"""Repair tools 10012..10025. Integer voxel authoring, exposed surfaces only."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-toolbox.py').read_text(encoding='utf8').split('manifest=[]')[0],str(base/'blender-voxel-toolbox.py'),'exec'))
scene.name='Repair_Tools_32'
names=['螺丝刀','锤子','六角扳手','起钉器','夹子','木工锯','电工钳','电钻','抛光机','铆钉枪','木工电锯','管钳子','打磨机','气动枪']
def rect(x,z,w,h,c,d=4,y=0):
    for i in range(x,x+w):
        for k in range(z,z+h):
            for j in range(y-d//2,y+(d+1)//2):cells[i,j,k]=c
def bar(x1,z1,x2,z2,r,c,d=4):
    for i in range(min(x1,x2)-r,max(x1,x2)+r+1):
        for k in range(min(z1,z2)-r,max(z1,z2)+r+1):
            t=max(0,min(1,((i-x1)*(x2-x1)+(k-z1)*(z2-z1))/max(1,(x2-x1)**2+(z2-z1)**2)))
            if (i-x1-t*(x2-x1))**2+(k-z1-t*(z2-z1))**2<=r*r:rect(i,k,1,1,c,d)
def disc(x,z,r,c,d=4):bar(x,z,x,z,r,c,d)
def ring(x,z,r,inner,c,d=4):
    for i in range(x-r,x+r+1):
        for k in range(z-r,z+r+1):
            if inner**2<=(i-x)**2+(k-z)**2<=r*r:rect(i,k,1,1,c,d)
def gun(color):
    rect(-9,16,18,8,color,7);rect(-6,4,6,13,3,6);rect(-8,2,12,4,color,8)
    rect(1,12,6,2,3);rect(5,12,2,5,3)
manifest=[]
for level in range(14):
    cells={}
    if level==0:
        rect(-3,0,6,12,11,6);rect(-4,10,8,3,3,6);rect(-1,13,2,14,4,2);rect(-2,26,4,3,7,2)
    elif level==1:
        rect(-2,0,4,23,1);rect(-3,1,6,10,2,5);rect(-10,21,20,7,4,7);rect(-12,20,4,9,10,8)
    elif level==2:
        bar(-5,1,-5,26,2,4);bar(-5,26,10,26,2,4);rect(-8,2,6,9,14,5)
    elif level==3:
        bar(-7,1,-1,21,2,11);bar(-1,21,7,26,2,4);rect(5,24,7,3,4);rect(8,24,2,3,3);bar(-7,1,-11,1,2,4)
    elif level==4:
        rect(-10,3,4,25,13,6);rect(-10,25,17,4,13,6);rect(-10,3,17,4,13,6);rect(4,1,2,19,4,2);rect(1,17,8,3,10,6);rect(-1,0,12,2,4,2)
    elif level==5:
        ring(-8,10,6,3,9,5)
        for x in range(-4,15):
            rect(x,6,1,12-(x+4)//3,4,2)
            if x%3==0:rect(x,4,2,3,7,2)
    elif level==6:
        bar(-8,1,0,16,2,16,5);bar(8,1,0,16,2,16,5);disc(0,16,4,4,6);bar(-1,17,-5,26,2,4);bar(1,17,5,26,2,4);rect(-3,12,6,4,10,2,-4)
    elif level==7:
        gun(13);rect(9,17,5,6,10,7);rect(14,19,7,2,4,2);rect(-7,18,5,2,14,2,-4)
    elif level==8:
        disc(0,7,9,3,9);disc(0,7,7,7,10);rect(-6,11,12,8,8,8);bar(-5,20,-5,25,2,3);bar(-5,25,5,25,2,3);bar(5,25,5,20,2,3)
    elif level==9:
        bar(-9,0,0,17,2,11,5);bar(9,0,2,17,2,11,5);rect(-3,16,8,7,10,6);rect(-1,22,4,6,4);rect(-2,28,6,2,4)
    elif level==10:
        disc(5,11,9,4,3);disc(5,11,4,10,4);rect(-10,3,26,3,10,10);rect(-10,12,18,8,9,8);rect(-7,19,4,7,3);rect(-7,24,13,3,3);rect(3,19,3,7,3)
    elif level==11:
        rect(-3,0,6,21,8,6);rect(-5,17,10,6,8,7);rect(-5,23,4,7,4);rect(-5,28,15,3,4);rect(4,23,6,3,10,6);disc(0,20,3,3,8)
    elif level==12:
        rect(-9,5,10,7,16,7);rect(0,6,10,5,4,6);disc(10,8,7,3,3);disc(10,8,4,4,4);rect(-14,6,6,5,3,6);rect(-5,12,3,8,3)
    else:
        gun(15);rect(9,17,7,6,4,6);rect(16,19,4,3,3);rect(-5,0,4,3,4);bar(-3,0,-3,-5,1,16,2);bar(-3,-5,5,-5,1,16,2);rect(-9,19,6,3,16,2,-4)
    lo=[min(p[a] for p in cells) for a in range(3)];hi=[max(p[a] for p in cells)+1 for a in range(3)]
    # Tool outlines retain a shared 32-unit budget even for wide saws.
    scale=.83/max(32,max(hi[a]-lo[a] for a in range(3)));cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2
    verts=[];faces=[];colors=[]
    for (i,j,k),color in cells.items():
        for (dx,dy,dz),corners in directions:
            if (i+dx,j+dy,k+dz) in cells:continue
            start=len(verts);verts.extend([((i+x-cx)*scale,(j+y-cy)*scale,(k+z-lo[2])*scale) for x,y,z in corners]);faces.append(tuple(range(start,start+4)));colors.append(color)
    id=10012+level;me=bpy.data.meshes.new(f'Tool_{id}');me.from_pydata(verts,[],faces);me.update()
    for m in materials:me.materials.append(m)
    for p,c in zip(me.polygons,colors):p.material_index=c
    o=bpy.data.objects.new(f'prop_{id}',me);scene.collection.objects.link(o)
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'voxel_32_{id}.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    manifest.append({'id':id,'name':names[level],'triangles':len(faces)*2});o.location.x=level*1.1
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-repair-tools.blend'),copy=True)
(OUT/'repair-tools-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('TOOLS_COMPLETE')
