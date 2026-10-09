"""Convertit Casual_Male.gltf (Quaternius, Ultimate Animated Character Pack, CC0) en sim.glb.

    blender --background --python tools/blender/sim_avatar.py -- <Casual_Male.gltf> app/public/gltf/avatars/sim.glb

- garde seulement les clips Idle et Walk, renommés `idle` et `walk` ;
- met à l'échelle 1,7 m (échelle appliquée, translations animées corrigées) ;
- ramène la marche à 1,2 m/s en accélérant le clip ;
- trois matériaux : `Skin` (peau, teinte unie), `Outfit` (haut, teinté par sim) et `Details`
  (couleurs par sommet : cheveux, yeux, pantalon, ceinture) ;
- dissout les faces coplanaires puis décime légèrement pour rester sous 6 000 triangles ;
- origine aux pieds, face avant -Y Blender (= +Z glTF).
"""
import sys

import bmesh
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
SRC, DST = args[0], args[1]
TARGET_H = 1.7
NATURAL_SPEED = 2.06  # unités source/s mesurées sur la phase d'appui du pied (cycle de 30 i/s à 24 i/s)
TARGET_SPEED = 1.2

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene

for o in list(bpy.data.objects):
    if o.type == "MESH" and o.parent is None:  # Icosphere parasite du fichier source
        bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = next(o for o in bpy.data.objects if o.type == "MESH")
arm.name, arm.data.name = "Sim", "SimRig"
body.name, body.data.name = "Body", "SimBody"

# --- Clips : idle et walk uniquement.
keep = {"Idle_CharacterArmature": "idle", "Walk_CharacterArmature": "walk"}
for a in list(bpy.data.actions):
    if a.name in keep:
        a.name = keep[a.name]
        a.use_fake_user = True
    else:
        bpy.data.actions.remove(a)
if arm.animation_data:
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)

# --- Échelle : hauteur au repos -> 1,7 m, appliquée aux objets et aux translations animées.
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
k = TARGET_H / (max(zs) - min(zs))
bpy.ops.object.select_all(action="DESELECT")
arm.scale = (k, k, k)
arm.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
for a in bpy.data.actions:
    for fc in a.fcurves:
        if fc.data_path.endswith(".location"):
            for kp in fc.keyframe_points:
                kp.co.y *= k
                kp.handle_left.y *= k
                kp.handle_right.y *= k

# --- Marche à 1,2 m/s : on compresse le temps du clip.
walk = bpy.data.actions["walk"]
t = (NATURAL_SPEED * k) / TARGET_SPEED  # facteur de durée (< 1 accélère si la vitesse naturelle est plus lente)
for fc in walk.fcurves:
    for kp in fc.keyframe_points:
        kp.co.x *= t
        kp.handle_left.x *= t
        kp.handle_right.x *= t

# --- Matériaux : Skin (teinte unie) + Outfit (haut) + Details (couleurs par sommet).
# La peau source est noire (style Quaternius) : on lui donne un ton chair par défaut et on passe
# les yeux (blancs dans la source) en sombre pour qu'ils restent lisibles sur peau claire.
SKIN_DEFAULT = (0.62, 0.38, 0.25, 1.0)  # linéaire
EYES = (0.02, 0.02, 0.025, 1.0)
mesh = body.data
src_mats = [m for m in mesh.materials]
names = [m.name.split(".")[0] for m in src_mats]
colors = [tuple(m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value) for m in src_mats]
skin_idx, shirt_idx = names.index("Skin"), names.index("Shirt")
detail_color = {i: (EYES if names[i] == "Face" else colors[i]) for i in range(len(src_mats))}
attr = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
for p in mesh.polygons:
    c = (1.0, 1.0, 1.0, 1.0) if p.material_index in (skin_idx, shirt_idx) else detail_color[p.material_index]
    for li in p.loop_indices:
        attr.data[li].color = c
mesh.color_attributes.active_color = attr


def flat(name, rgba, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = roughness
    return m


skin = flat("Skin", SKIN_DEFAULT, 0.7)
outfit = flat("Outfit", colors[shirt_idx], 0.85)
details = flat("Details", (1, 1, 1, 1), 0.8)
nt = details.node_tree
vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Color"
nt.links.new(vc.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])

new_index = [0 if i == skin_idx else 1 if i == shirt_idx else 2 for i in range(len(src_mats))]
for p in mesh.polygons:
    p.material_index = new_index[p.material_index]
# Remplacement en place des emplacements (materials.clear() remettrait tous les index à 0).
for i, m in enumerate((skin, outfit, details)):
    mesh.materials[i] = m
while len(mesh.materials) > 3:
    mesh.materials.pop(index=len(mesh.materials) - 1)
for m in src_mats:
    bpy.data.materials.remove(m)
skin.name = "Skin"  # libéré par la suppression du matériau source homonyme

# --- Simplification sans perte de forme : dissolution des faces coplanaires.
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.dissolve_limit(bm, angle_limit=0.0175, verts=bm.verts, edges=bm.edges,
                         delimit={"MATERIAL", "UV"})
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
bm.to_mesh(mesh)
bm.free()
# Puis décimation légère (avant l'armature dans la pile) jusqu'à ~5 600 triangles.
tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
if tris > 5600:
    dec = body.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = 5600 / tris
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_move_to_index(modifier=dec.name, index=0)
    bpy.ops.object.modifier_apply(modifier=dec.name)
tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
print(f"[sim_avatar] scale={k:.4f} walk_time_factor={t:.4f} tris={tris}")

# --- Export : clips en actions (pas de NLA), sans lumière ni caméra.
arm.animation_data_create()
arm.animation_data.action = bpy.data.actions["idle"]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=DST, export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
    export_def_bones=False, export_lights=False, export_cameras=False,
    export_yup=True, export_apply=False, export_vertex_color="MATERIAL",
)
print(f"[sim_avatar] wrote {DST}")
