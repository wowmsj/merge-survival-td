"""Two voxel resolutions of the same L3 silhouette, with exposed faces only."""
import bpy, math, json, sys
from pathlib import Path
OUT=Path(__file__).resolve().parent.parent/'assets/models/blender-samples'
scene=bpy.data.scenes.new('Voxel_Toolbox_Study');bpy.context.window.scene=scene
materials=[]
for name,color in [('honey','e7a03e'),('wood','c27c2e'),('seam','724322'),('handle','493b35'),('metal','8faaa9'),('latch','89502b'),('steel','64828b'),('lid','b5c6b8'),('rust','b76b39'),('ochre','c18b32'),('charcoal','414651'),('red','bb5140'),('cream','e4d5ac'),('blue','416ca6'),('navy','2d425e'),('ivory','dbd8bd'),('teal','338983')]:
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    c=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=c;bs.inputs['Roughness'].default_value=.85;m.diffuse_color=c;materials.append(m)

def sample(x,y,z):
    # Shared physical silhouette: grid resolution changes steps, not the design.
    if abs(y)<.0625 and .60<z<.875 and abs(x)<.25:
        if z>.79 or abs(x)>.16:return 3
    if .56<z<.635 and .12<abs(x)<.27 and abs(y)<.09375:return 4
    if abs(x)<.50 and abs(y)<.3125 and 0<z<.61:
        if z>.32 and y*y+(z-.32)**2>.29**2:return None
        if abs(x)>.435:return 2
        if .28<z<.325:return 2
        if z<.28:return 0 if z<.125 else 1
        return 0
    if abs(x)<.09375 and -.375<y<-.29 and .22<z<.405:return 5
    return None

def assembly(stage,x,y,z):
    if stage>=6:
        return advanced(stage,x,y,z)
    if stage==3:return sample(x,y,z)
    if stage in (1,2):
        offset=.08 if stage==2 else 0
        if abs(y)<.0625 and offset+.03125<z<offset+.3125 and abs(x)<.25:
            if z>offset+.225 or abs(x)>.16:return 3
        if 0<z-offset<.0625 and .12<abs(x)<.28 and abs(y)<.09375:return 4
        if stage==2 and abs(x)<.5 and abs(y)<.3125 and 0<z<.09375:
            if abs(x)>.435:return 2
            return 0 if int((y+.3125)*32)//3%2==0 else 1
        return None
    if stage==4:
        if .375<abs(x)<.46875 and abs(y)<.34 and 0<z<.64:
            if z<.32 or y*y+(z-.32)**2<.315**2:return 4
        if abs(x)>.375 and .28<abs(y)<.36 and z<.125:return 4
        if abs(x)<.09375 and -.395<y<-.31 and .20<z<.42:return 4 if z>.25 else 3
        return sample(x,y,z)
    if stage==5:
        if abs(y)<.0625 and .5625<z<.84 and abs(x)<.25:
            if z>.75 or abs(x)>.16:return 3
        if .53125<z<.59375 and .12<abs(x)<.28 and abs(y)<.09375:return 4
        if abs(x)<.09375 and -.39<y<-.30 and .28<z<.50:return 4 if z>.34 else 3
        if abs(x)<.5 and abs(y)<.34 and 0<z<.56:
            if z>.46875:return 7
            if z>.4375:return 3
            if abs(x)>.40625 and abs(y)>.25 and (z<.125 or z>.34):return 4
            if z<.0625 and ((.18<x<.28) or (-.375<x<-.25)):return 8
            return 6
    return None

def advanced(stage,x,y,z):
    def block(cx,cy,cz,w,d,h):return abs(x-cx)<w/2 and abs(y-cy)<d/2 and abs(z-cz)<h/2
    if stage==6:
        # Salvaged box with attached hammer and screwdriver, supported by a side holster.
        if block(-.33,-.365,.36,.25,.0625,.1875):return 5
        if block(-.38,-.37,.57,.0625,.0625,.36):return 1
        if block(-.38,-.37,.76,.22,.09375,.09375):return 4
        if block(-.25,-.37,.55,.0625,.0625,.25):return 8
        if block(-.25,-.37,.73,.03125,.03125,.14):return 4
        if block(.28,-.35,.25,.19,.03125,.13):return 8
        return assembly(5,x,y,z)
    if stage in (7,8,9):
        # Open tray and tall rear panel make the upper levels readable from above.
        top=.48 if stage==7 else .67
        if block(0,0,.04,.94,.62,.08):return 3
        if abs(x)<.47 and abs(y)<.31 and 0<z<top:
            if abs(x)>.40:return 4
            if z<top-.13:
                if stage>=8 and abs(z-.29)<.025:return 3
                return 6
            if abs(y)>.25:return 6
        if block(0,-.335,.19,.31,.0625,.0625):return 4
        if stage>=8 and block(0,-.335,.47,.31,.0625,.0625):return 4
        if block(0,0,top-.14,.8,.5,.04):return 3
        if abs(x)<.37 and abs(y)<.21 and top-.12<z<top-.025:
            if abs(x)<.025:return 4
            if block(-.18,-.05,top-.065,.22,.07,.07):return 0
            if block(.16,.04,top-.065,.06,.30,.07):return 4
        if block(0,.26,top+.13,.88,.0625,.30):return 6
        if block(0,.265,top+.28,.88,.09375,.0625):return 4
        if stage==9:
            # A broader tool panel with contrasting mounted tool silhouettes.
            if block(0,.235,top+.04,.78,.09,.47):return 3
            for tx in (-.25,0,.25):
                if block(tx,.173,top+.025,.0625,.0625,.26):return 1 if tx<0 else 4
                if block(tx,.173,top+.16,.15,.0625,.07):return 4
        return None
    if stage==10:
        # Freestanding cabinet: wheels, three drawers, side rack, flat work surface.
        if .32<abs(x)<.44 and .19<abs(y)<.29 and z<.125:return 3
        if block(0,0,.42,.82,.56,.65):
            if abs(x)>.34:return 4
            if y<-.23:
                if min(abs(z-v) for v in (.23,.42,.61))<.018:return 3
            return 6
        for z0 in (.18,.37,.56):
            if block(0,-.30,z0,.34,.0625,.0625):return 7
        if block(0,0,.79,.94,.66,.10):return 7
        if block(.44,0,.48,.0625,.5,.32):return 3
        if block(.44,0,.65,.0625,.5,.0625):return 4
        return None
    if stage==11:
        # Workbench with clear negative space, cabinet, vise and pegboard.
        if block(0,0,.54,1,.66,.09375):return 0
        if .38<abs(x)<.47 and .22<abs(y)<.31 and z<.52:return 3
        if block(0,0,.12,.86,.56,.0625):return 6
        if block(-.25,0,.32,.34,.49,.34):
            if y<-.21 and abs(z-.32)<.02:return 3
            return 6
        for zz in (.23,.40):
            if block(-.25,-.27,zz,.16,.0625,.0625):return 4
        if block(0,.275,.76,.94,.0625,.37):return 2
        for tx in (-.31,-.10,.12,.32):
            if block(tx,.22,.76,.0625,.0625,.23):return 4
            if block(tx,.22,.86,.13,.0625,.0625):return 4
        if block(.26,-.12,.615,.28,.25,.0625):return 4
        if .14<x<.39 and -.24<y<0 and .64<z<.75:
            if y<-.16 or y>-.09:return 6
        if block(.27,-.28,.65,.03125,.20,.03125):return 4
        return None

directions=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)]),((-1,0,0),[(0,1,0),(0,0,0),(0,0,1),(0,1,1)]),((0,1,0),[(1,1,0),(0,1,0),(0,1,1),(1,1,1)]),((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),((0,0,-1),[(0,1,0),(1,1,0),(1,0,0),(0,0,0)])]
manifest=[]
chain='--chain' in sys.argv
for stage,n in ([(s,32) for s in range(1,12)] if chain else [(3,16),(3,32)]):
    cells={}
    for i in range(-n//2,n//2):
        for j in range(-n//2,n//2):
            for k in range(n):
                c=assembly(stage,(i+.5)/n,(j+.5)/n,(k+.5)/n)
                if c is not None:
                    # Large painted panels distinguish similar silhouettes at board size.
                    palette={
                        6:{6:9,7:10},
                        7:{6:11,4:12},
                        8:{6:13,4:7,3:14},
                        9:{6:15,4:10,3:13},
                        10:{6:16,4:10,7:12},
                        11:{6:10,2:10},
                    }.get(stage,{})
                    cells[i,j,k]=palette.get(c,c)
    verts=[];faces=[];colors=[]
    for (i,j,k),color in cells.items():
        for (dx,dy,dz),corners in directions:
            if (i+dx,j+dy,k+dz) in cells:continue
            start=len(verts);verts.extend([((i+x)*.83/n,(j+y)*.83/n,(k+z)*.83/n) for x,y,z in corners]);faces.append(tuple(range(start,start+4)));colors.append(color)
    me=bpy.data.meshes.new(f'VoxelSurface_{n}');me.from_pydata(verts,[],faces);me.update()
    for m in materials:me.materials.append(m)
    for p,c in zip(me.polygons,colors):p.material_index=c
    o=bpy.data.objects.new(f'prop_{10000+stage}_voxel_{n}',me);scene.collection.objects.link(o)
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'voxel_{n}_{10000+stage}.glb'),export_format='GLB',use_selection=True,use_active_scene=True)
    manifest.append({'id':10000+stage,'resolution':n,'occupiedCells':len(cells),'exposedQuads':len(faces),'triangles':len(faces)*2})
    o.location.x=(stage-1)*1.1 if chain else (1.1 if n==32 else 0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('voxel-chain.blend' if chain else 'voxel-toolbox.blend')),copy=True)
(OUT/('voxel-chain-manifest.json' if chain else 'voxel-manifest.json')).write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('VOXEL_COMPLETE',manifest)
