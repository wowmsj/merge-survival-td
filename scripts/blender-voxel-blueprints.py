"""Blueprint groups49..68: distinct building glyphs, reference-style stage silhouettes."""
from pathlib import Path
base=Path(__file__).resolve().parent
exec(compile((base/'blender-voxel-drinks.py').read_text(encoding='utf8').split('\nmanifest=[]')[0],str(base/'blender-voxel-drinks.py'),'exec'))
key=sys.argv[sys.argv.index('--')+1]
chain=next(c for c in json.loads((OUT/'remaining-chains.json').read_text(encoding='utf8')) if c['key']==key)
assert 49<=chain['seq']<=68
entries=chain['items'] if chain['seq']<66 else chain['items'][1:]+chain['items'][:1]
names=[p['name'] for p in entries];scene.name='Blueprint_'+key
def glyph(kind):
    """Small building pictograms in XZ, transformed onto paper or a crate badge."""
    if kind==0:
        rect(-4,0,8,12,0,2);rect(-6,10,12,3,0,2)
        for x in (-6,-1,4):rect(x,13,2,3,0,2)
        rect(-1,3,2,4,14,3)
    elif kind==1:
        rect(-5,0,10,3,0,2);rect(-3,3,6,6,0,2)
        rect(-3,8,11,4,0,2);rect(7,7,2,6,0,2)
    elif kind==2:
        rect(-4,0,8,9,0,2)
        for z in (4,7,10):rect(-6,z,12,1,0,2)
        bar(-1,9,3,13,1,0,2);bar(3,13,0,16,1,0,2)
    elif kind==3:
        for x,z,u,v in [(-7,8,7,8),(0,1,0,15),(-5,3,5,13),(-5,13,5,3)]:bar(x,z,u,v,0 if x==u or z==v else 1,0,2)
    elif kind==4:
        for z in (0,3,6):rect(-7,z,14,1,0,2)
        for x in (-4,3):
            rect(x,7,1,8,0,2);rect(x-3,11,3,2,0,2);rect(x+1,13,3,2,0,2)
    elif kind==5:
        rect(-2,2,4,12,0,2);rect(-6,6,12,4,0,2)
    elif kind==6:
        rect(-1,0,2,12,0,2)
        bar(0,11,-6,16,1,0,2);bar(0,11,7,14,1,0,2);bar(0,11,1,5,1,0,2)
    elif kind==7:
        rect(-6,0,12,10,0,2);bar(-7,10,0,16,1,0,2);bar(0,16,7,10,1,0,2)
        rect(-2,0,4,6,14,3);rect(-5,7,3,2,14,3)
    elif kind==8:
        rect(-7,0,14,11,0,2);rect(-5,11,10,3,0,2)
        for z in (2,5,8):rect(-5,z,10,1,14,3)
    elif kind==9:
        bar(-5,1,4,11,1,0,2);ring(4,12,4,2,0,2)
    elif kind==10:
        rect(-5,0,10,5,0,2);rect(-1,6,2,9,0,2)
        bar(-5,9,0,5,1,0,2);bar(5,9,0,5,1,0,2)
    elif kind==11:
        rect(-7,0,14,2,0,2)
        for x in (-5,0,5):rect(x-1,2,2,8,0,2);rect(x,10,1,3,0,2)
    elif kind==12:
        disc(0,6,6,0,2);rect(-2,12,4,3,0,2);rect(-2,4,4,4,14,3)
    elif kind==13:
        for z in (1,5,9):bar(-7,z,0,z+2,1,0,2);bar(0,z+2,7,z,1,0,2)
    elif kind==14:
        for x in (-6,-2,2,6):rect(x,0,2,13,0,2)
        rect(-7,3,16,2,0,3);rect(-7,9,16,2,0,3)
    elif kind==15:
        for z in range(0,13,4):
            for x in (-6,1):rect(x+(2 if z==4 else 0),z,6,3,0,2)
    elif kind==16:
        rect(-7,0,14,14,0,2);rect(-4,2,8,10,14,3)
        bar(-4,2,4,12,1,0,4)
    elif kind==17:
        for x in (-5,0,5):rect(x-1,0,3,11,0,2);rect(x,11,1,3,0,2)
    elif kind==18:
        rect(-1,0,2,7,0,2);bar(-6,8,3,14,1,0,2)
        bar(-6,8,2,7,1,0,2);bar(2,7,3,14,1,0,2)
        rect(5,13,2,2,0,2);rect(7,15,2,2,0,2)
    else:
        bar(-5,1,4,11,1,0,2);ring(4,12,4,2,0,2)
        rect(-6,10,3,5,0,2);rect(-8,11,7,2,0,2)
def place_glyph(kind,z,color,crate=False):
    global cells
    saved=cells;cells={};glyph(kind);mark=cells;cells=saved
    for (x,y,h),c in mark.items():
        if crate:
            if h%2==0 and x%2==0:cells[x//2,-10,4+h//2]=color
        else:cells[x,h-7,z]=color if c==0 else 14
manifest=[]
for level,entry in enumerate(entries):
    cells={};kind=chain['seq']-49
    emitter='发射器' in entry['name'];stage=level if chain['seq']<66 else level+1
    accent=[9,6,16,17,19,11,0,8,13,6,16,4,11,19,1,6,10,9,17,16][kind]
    if emitter:
        rect(-11,0,22,15,1,19)
        for x in (-11,8):rect(x,0,3,16,2,20)
        for z in (1,12):rect(-12,z,24,2,6,21)
        rect(-8,15,16,1,2,13)
        for x,y,h in [(-5,-3,25),(1,2,28),(6,-1,23)]:
            rect(x-2,15,4,h-15,12,4,y);rect(x-3,h,6,1,9,6,y)
            rect(x-1,h+1,2,1,2,2,y)
        rect(-6,4,12,8,accent,1,-10)
        place_glyph(kind,0,12,True)
    else:
        w=22 if stage==1 else 26;d=24 if stage<3 else 28
        rect(-w//2,0,w,2,14 if stage==1 else 6,d)
        rect(-w//2,2,w,1,13 if stage<3 else 15 if stage==3 else 14,d)
        if stage==1:
            for x,y,z in list(cells):
                if (x<-7 and y<-8) or (x>6 and y>8):del cells[x,y,z]
        if stage==2:
            rect(-w//2-1,0,3,5,17,d)
        if stage>=3:
            for x in (-w//2,w//2-2):rect(x,2,2,2,6 if stage==3 else 0,d)
            for y in (-d//2,d//2-1):rect(-w//2,2,w,2,6 if stage==3 else 0,2,y)
        if stage==4:
            for x in (-15,13):rect(x,0,3,5,0,32)
            for x in (-15,13):
                for y in (-16,15):rect(x-1,0,5,6,9,3,y)
        place_glyph(kind,3,17 if stage==1 else 12 if stage==2 else accent if stage==3 else 0)
        if stage>=2:
            for y in (-10,-8):rect(-8,3,6+(y%3),1,6 if stage==3 else 17,1,y)
        if stage>=3:
            rect(7,3,3,1,accent,3,-8);rect(8,4,1,1,0,1,-8)
    assert all(0<=c<len(materials) for c in cells.values()), 'Invalid palette index'
    lo=[min(p[a] for p in cells) for a in range(3)];hi=[max(p[a] for p in cells)+1 for a in range(3)]
    scale=.83/max(32,max(hi[a]-lo[a] for a in range(3)));cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2
    verts=[];faces=[];colors=[]
    for (i,j,k),color in cells.items():
        for (dx,dy,dz),corners in directions:
            if (i+dx,j+dy,k+dz) in cells:continue
            offset=len(verts);verts.extend([((i+x-cx)*scale,(j+y-cy)*scale,(k+z-lo[2])*scale) for x,y,z in corners]);faces.append(tuple(range(offset,offset+4)));colors.append(color)
    id=entry['id'];me=bpy.data.meshes.new(f'Blueprint_{id}');me.from_pydata(verts,[],faces);me.update()
    for m in materials:me.materials.append(m)
    for p,c in zip(me.polygons,colors):p.material_index=c
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),delimit={'MATERIAL'})
    bm.to_mesh(me);bm.free();me.update();me.calc_loop_triangles()
    o=bpy.data.objects.new(f'prop_{id}',me);scene.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'voxel_32_{id}.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    manifest.append({'id':id,'name':entry['name'],'triangles':len(me.loop_triangles),'role':'发射器' if emitter else '合成道具'});o.location.x=level*1.1
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'voxel-{key}.blend'),copy=True)
(OUT/f'{key}-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(key+'_COMPLETE')
