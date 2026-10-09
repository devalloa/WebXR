"""Kit de ville modulaire pour le jeu WebXR (Quest 3).

Usage (sur une machine avec Blender 4.2+) :
    blender --background --python tools/blender/city_kit.py -- app/public/gltf/city-kit

Génère, de façon déterministe, des modules low-poly « réaliste stylisé » :
  - building_a/b/c.glb : immeubles de 3, 5 et 7 étages, fenêtres en creux (inset),
    deux matériaux (façade, vitrage), origine au sol, face avant vers -Y Blender (= -Z glTF).
  - tower_d.glb : tour de 12 étages entièrement vitrée, bandes émissives (style futuriste).
Direction artistique : ville futuriste « réaliste stylisé » (tons froids, verre, accents lumineux).
  - lamppost.glb, bench.glb, tree.glb : mobilier urbain.
Budget : < 2 500 triangles par immeuble, < 300 par objet de mobilier.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy

OUT_DIR = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("app/public/gltf/city-kit")
FLOOR_H = 3.2


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgba, roughness=0.8, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def new_object(name, bm, materials):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    for m in materials:
        obj.data.materials.append(m)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def building(name, width, depth, floors, facade_rgba, windows_x, windows_y_per_floor=1, glass_rgba=(0.35, 0.45, 0.55, 1.0), emissive=False):
    """Boîte à `floors` étages ; chaque façade est quadrillée puis les fenêtres sont
    creusées par inset + extrusion vers l'intérieur. Toit légèrement en retrait."""
    height = floors * FLOOR_H
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(width, depth, height), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, height / 2), verts=bm.verts)

    # Quadrillage des façades : une colonne par fenêtre, une ligne par étage.
    side_faces = [f for f in bm.faces if abs(f.normal.z) < 0.5]
    for f in side_faces:
        along_x = abs(f.normal.y) > 0.5
        cols = windows_x if along_x else max(2, round(windows_x * depth / width))
        edges_v = [e for e in f.edges if abs((e.verts[0].co - e.verts[1].co).z) > 0.01]
        edges_h = [e for e in f.edges if abs((e.verts[0].co - e.verts[1].co).z) <= 0.01]
        bmesh.ops.subdivide_edges(bm, edges=edges_h, cuts=cols - 1, use_grid_fill=True)
        bmesh.ops.subdivide_edges(bm, edges=edges_v, cuts=floors * windows_y_per_floor - 1, use_grid_fill=True)
    bm.faces.ensure_lookup_table()

    # Fenêtres : inset de chaque cellule de façade, puis léger creux.
    cells = [f for f in bm.faces if abs(f.normal.z) < 0.5 and f.calc_area() < width * depth]
    res = bmesh.ops.inset_individual(bm, faces=cells, thickness=0.45, depth=0.0)
    glass = [f for f in cells if f.is_valid]
    bmesh.ops.translate(bm, vec=(0, 0, 0), verts=[])  # no-op, garde la structure claire
    for f in glass:
        f.material_index = 1
        for v in f.verts:
            v.co -= f.normal * 0.12
    # Le rez-de-chaussée garde ses « fenêtres » comme vitrines : rien de plus à faire.

    # Toit en retrait : inset de la face du dessus.
    top = [f for f in bm.faces if f.normal.z > 0.5]
    bmesh.ops.inset_individual(bm, faces=top, thickness=0.35, depth=-0.25)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    facade = material(f"{name}_facade", facade_rgba, roughness=0.85)
    glazing = material(f"{name}_glass", glass_rgba, roughness=0.15, metallic=0.1,
                       emission=(0.2, 0.8, 1.0, 1.0) if emissive else None, strength=1.5 if emissive else 0.0)
    return new_object(name, bm, [facade, glazing])


def lamppost():
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.09, radius2=0.06, depth=4.0)
    bmesh.ops.translate(bm, vec=(0, 0, 2.0), verts=bm.verts)
    head = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=(0.5, 0.25, 0.18), verts=head)
    bmesh.ops.translate(bm, vec=(0.2, 0, 4.05), verts=head)
    return new_object("lamppost", bm, [material("lamp_metal", (0.12, 0.12, 0.13, 1), 0.5, 0.6)])


def bench():
    bm = bmesh.new()
    seat = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=(1.6, 0.45, 0.06), verts=seat)
    bmesh.ops.translate(bm, vec=(0, 0, 0.45), verts=seat)
    for x in (-0.65, 0.65):
        leg = bmesh.ops.create_cube(bm, size=1.0)["verts"]
        bmesh.ops.scale(bm, vec=(0.08, 0.4, 0.42), verts=leg)
        bmesh.ops.translate(bm, vec=(x, 0, 0.21), verts=leg)
    return new_object("bench", bm, [material("bench_wood", (0.45, 0.3, 0.18, 1), 0.9)])


def tree():
    bm = bmesh.new()
    trunk = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.14, radius2=0.1, depth=1.6)["verts"]
    bmesh.ops.translate(bm, vec=(0, 0, 0.8), verts=trunk)
    for i, (r, z) in enumerate(((1.3, 2.3), (1.0, 3.1), (0.6, 3.8))):
        crown = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)["verts"]
        bmesh.ops.translate(bm, vec=(0, 0, z), verts=crown)
        for v in crown:
            v.co.z = z + (v.co.z - z) * 0.8
    obj = new_object("tree", bm, [material("bark", (0.3, 0.2, 0.12, 1), 0.95), material("leaves", (0.25, 0.45, 0.2, 1), 1.0)])
    for p in obj.data.polygons:
        p.material_index = 0 if p.center.z < 1.6 else 1
    return obj


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT",
    )
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[city_kit] {path.name}: {tris} triangles")


def main():
    reset_scene()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    objs = [
        building("building_a", 6.0, 6.0, 3, (0.85, 0.78, 0.66, 1), windows_x=3),
        building("building_b", 6.0, 8.0, 5, (0.62, 0.68, 0.74, 1), windows_x=3),
        building("building_c", 8.0, 6.0, 7, (0.78, 0.66, 0.55, 1), windows_x=4),
        building("tower_d", 7.0, 7.0, 12, (0.18, 0.2, 0.24, 1), windows_x=4,
                 glass_rgba=(0.12, 0.2, 0.3, 1.0), emissive=True),
        lamppost(), bench(), tree(),
    ]
    for obj in objs:
        export(obj, OUT_DIR / f"{obj.name}.glb")


main()
