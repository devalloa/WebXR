"""Kit de ville modulaire pour le jeu WebXR (Quest 3).

Usage (sur une machine avec Blender 4.2+) :
    blender --background --python tools/blender/city_kit.py -- app/public/gltf/city-kit

Génère, de façon déterministe, des modules low-poly « réaliste stylisé » :
  - building_a/b/c.glb : immeubles de 3, 5 et 7 niveaux (rez-de-chaussée commercial plus haut),
    fenêtres en creux (cadre + embrasures + vitre en retrait), bandeau lumineux au-dessus des
    vitrines, corniche avec acrotère, édicule technique sur le toit. Porte au centre de la face avant.
  - tower_d.glb : tour de 12 étages en mur-rideau vitré, meneaux verticaux, dalles saillantes
    dont une sur trois (hors toit) est émissive, ailettes d'angle, couronne en retrait avec enseigne lumineuse
    et antenne.
  - lamppost.glb, bench.glb, tree.glb : mobilier urbain.
Origine au sol, face avant vers -Y Blender (= +Z glTF après conversion Y-up).
Au plus trois matériaux par fichier : façade, vitrage, accent émissif.
Direction artistique : ville futuriste « réaliste stylisé » (tons froids, verre, accents lumineux).
Budget : < 2 500 triangles par immeuble, < 300 par objet de mobilier.
"""
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

OUT_DIR = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("app/public/gltf/city-kit")
FLOOR_H = 3.2
GROUND_H = 4.0  # rez-de-chaussée commercial
UP = Vector((0, 0, 1))
ACCENT = (0.2, 0.8, 1.0, 1.0)  # cyan des accents lumineux


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


def accent_material(name):
    return material(name, ACCENT, roughness=0.4, emission=ACCENT, strength=3.0)


def new_object(name, bm, materials):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    for m in materials:
        obj.data.materials.append(m)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(bm, lo, hi, mat=0, bottom=True):
    """Pavé aligné sur les axes, faces orientées vers l'extérieur. Retourne ses faces."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new(c) for c in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    quads = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if bottom:
        quads.append((0, 3, 2, 1))
    faces = [bm.faces.new([v[i] for i in q]) for q in quads]
    for f in faces:
        f.material_index = mat
    return faces


def facade(bm, p0, u, width, rows, cols, recess=0.18):
    """Façade plane quadrillée (une cellule par fenêtre et par niveau), chaque cellule percée
    d'une fenêtre en creux : cadre, quatre embrasures et vitre en retrait de `recess`.
    `p0` = coin bas-gauche vu de l'extérieur, `u` = direction vers la droite ; la normale est u × Z.
    `rows` = liste de (z0, z1, sorte) avec sorte dans {"shop", "floor"}."""
    n = u.cross(UP)
    zs = [rows[0][0]] + [r[1] for r in rows]
    cw = width / cols
    grid = [[bm.verts.new(p0 + u * (i * cw) + UP * z) for z in zs] for i in range(cols + 1)]
    for j, (z0, z1, kind) in enumerate(rows):
        ch = z1 - z0
        for i in range(cols):
            door = kind == "shop" and door_col(cols) == i and n.y < -0.5
            if door:
                mx, mb, mt = 0.28 * cw, 0.0, 0.25 * ch
            elif kind == "shop":
                mx, mb, mt = 0.07 * cw, 0.35, 0.22 * ch
            else:
                mx, mb, mt = 0.2 * cw, 0.3 * ch, 0.14 * ch
            bl, br, tr, tl = grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]
            base = p0 + u * (i * cw) + UP * z0
            a = bm.verts.new(base + u * mx + UP * mb)
            b = bm.verts.new(base + u * (cw - mx) + UP * mb)
            c = bm.verts.new(base + u * (cw - mx) + UP * (ch - mt))
            d = bm.verts.new(base + u * mx + UP * (ch - mt))
            depth = recess * (2.0 if door else 1.0)
            a2, b2, c2, d2 = (bm.verts.new(v.co - n * depth) for v in (a, b, c, d))
            frame = [(br, tr, c, b), (tr, tl, d, c), (tl, bl, a, d)]
            if mb > 0:
                frame.append((bl, br, b, a))
            for q in frame:
                bm.faces.new(q).material_index = 0
            for q in ((a, b, b2, a2), (b, c, c2, b2), (c, d, d2, c2), (d, a, a2, d2)):
                bm.faces.new(q).material_index = 0
            bm.faces.new((a2, b2, c2, d2)).material_index = 1


def door_col(cols):
    return cols // 2


def building(name, width, depth, floors, facade_rgba, windows_x, glass_rgba=(0.16, 0.24, 0.34, 1.0)):
    """Immeuble à `floors` niveaux dont un rez-de-chaussée commercial. Façades percées,
    bandeau lumineux au-dessus des vitrines, corniche + acrotère, édicule technique."""
    rows = [(0.0, GROUND_H, "shop")]
    rows += [(GROUND_H + k * FLOOR_H, GROUND_H + (k + 1) * FLOOR_H, "floor") for k in range(floors - 1)]
    height = rows[-1][1]
    hw, hd = width / 2, depth / 2
    side_cols = max(2, round(windows_x * depth / width))
    bm = bmesh.new()
    for p0, u, w, cols in (
        (Vector((-hw, -hd, 0)), Vector((1, 0, 0)), width, windows_x),   # avant (-Y)
        (Vector((hw, -hd, 0)), Vector((0, 1, 0)), depth, side_cols),    # droite (+X)
        (Vector((hw, hd, 0)), Vector((-1, 0, 0)), width, windows_x),    # arrière (+Y)
        (Vector((-hw, hd, 0)), Vector((0, -1, 0)), depth, side_cols),   # gauche (-X)
    ):
        facade(bm, p0, u, w, rows, cols)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)

    # Bandeau lumineux au-dessus des vitrines, puis corniche avec acrotère.
    o = 0.1
    box(bm, (-hw - o, -hd - o, GROUND_H - 0.1), (hw + o, hd + o, GROUND_H + 0.12), mat=2)
    o = 0.18
    cornice = box(bm, (-hw - o, -hd - o, height), (hw + o, hd + o, height + 0.6), mat=0)
    top = [f for f in cornice if f.normal.z > 0.5]
    bmesh.ops.inset_individual(bm, faces=top, thickness=0.3, depth=-0.4)
    # Édicule technique, côté arrière droit.
    box(bm, (hw - 2.2, hd - 1.8, height + 0.2), (hw - 0.6, hd - 0.6, height + 1.3), mat=0, bottom=False)

    facade_mat = material(f"{name}_facade", facade_rgba, roughness=0.85)
    glazing = material(f"{name}_glass", glass_rgba, roughness=0.15, metallic=0.3)
    return new_object(name, bm, [facade_mat, glazing, accent_material(f"{name}_accent")])


def tower(name, width, floors, frame_rgba=(0.16, 0.18, 0.22, 1.0), glass_rgba=(0.1, 0.18, 0.28, 1.0)):
    """Tour vitrée : noyau en mur-rideau, meneaux, dalles saillantes (une sur trois émissive),
    ailettes d'angle, hall d'entrée en retrait avec auvent, couronne + enseigne + antenne."""
    h = floors * FLOOR_H
    hw = width / 2
    bm = bmesh.new()
    # Hall vitré en retrait, puis mur-rideau des étages.
    lobby = hw - 0.9
    box(bm, (-lobby, -lobby, 0), (lobby, lobby, FLOOR_H), mat=1, bottom=False)
    core = hw - 0.3
    box(bm, (-core, -core, FLOOR_H), (core, core, h), mat=1, bottom=False)
    # Meneaux verticaux sur chaque face des étages.
    mw, mo = 0.08, 0.1
    for k in (1, 2, 3):
        t = -core + k * (2 * core) / 4
        box(bm, (t - mw, -core - mo, FLOOR_H), (t + mw, -core, h), bottom=False)
        box(bm, (t - mw, core, FLOOR_H), (t + mw, core + mo, h), bottom=False)
        box(bm, (-core - mo, t - mw, FLOOR_H), (-core, t + mw, h), bottom=False)
        box(bm, (core, t - mw, FLOOR_H), (core + mo, t + mw, h), bottom=False)
    # Dalles saillantes à chaque étage ; une sur trois porte la lumière.
    for i in range(1, floors + 1):
        z = i * FLOOR_H
        box(bm, (-hw, -hw, z - 0.22), (hw, hw, z), mat=2 if i % 3 == 0 and i < floors else 0)
    # Ailettes d'angle sur toute la hauteur.
    f = 0.45
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, x1 = sorted((sx * hw, sx * (hw - f)))
            y0, y1 = sorted((sy * hw, sy * (hw - f)))
            box(bm, (x0, y0, 0), (x1, y1, h + 0.4), bottom=False)
    # Auvent d'entrée (face avant -Y), sous-face lumineuse.
    box(bm, (-2.0, -hw - 1.4, FLOOR_H - 0.55), (2.0, -lobby, FLOOR_H - 0.35), mat=0)
    box(bm, (-1.8, -hw - 1.3, FLOOR_H - 0.58), (1.8, -hw - 0.2, FLOOR_H - 0.55), mat=2)
    # Couronne en retrait, enseigne lumineuse en façade avant, antenne.
    cr = hw - 1.0
    box(bm, (-cr, -cr, h), (cr, cr, h + 2.8), mat=0, bottom=False)
    box(bm, (-2.0, -cr - 0.12, h + 0.9), (2.0, -cr, h + 2.0), mat=2, bottom=False)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.12, radius2=0.04, depth=5.0,
                          matrix=_translation((0, 0, h + 2.8 + 2.5)))
    box(bm, (-0.1, -0.1, h + 7.75), (0.1, 0.1, h + 8.05), mat=2)  # balise

    frame = material(f"{name}_frame", frame_rgba, roughness=0.6, metallic=0.5)
    glazing = material(f"{name}_glass", glass_rgba, roughness=0.08, metallic=0.6)
    return new_object(name, bm, [frame, glazing, accent_material(f"{name}_accent")])


def _translation(t):
    from mathutils import Matrix
    return Matrix.Translation(t)


def lamppost():
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.09, radius2=0.06, depth=4.0,
                          matrix=_translation((0, 0, 2.0)))
    box(bm, (-0.05, -0.125, 3.96), (0.45, 0.125, 4.14))       # tête
    box(bm, (0.0, -0.09, 3.94), (0.42, 0.09, 3.96), mat=1)    # diffuseur lumineux
    return new_object("lamppost", bm, [material("lamp_metal", (0.12, 0.12, 0.13, 1), 0.5, 0.6),
                                       accent_material("lamp_light")])


def bench():
    bm = bmesh.new()
    box(bm, (-0.8, -0.225, 0.42), (0.8, 0.225, 0.48))         # assise
    box(bm, (-0.8, 0.17, 0.5), (0.8, 0.225, 0.9))             # dossier
    for x in (-0.65, 0.65):
        box(bm, (x - 0.04, -0.2, 0.0), (x + 0.04, 0.2, 0.42), mat=1, bottom=False)
    return new_object("bench", bm, [material("bench_wood", (0.45, 0.3, 0.18, 1), 0.9),
                                    material("bench_metal", (0.15, 0.16, 0.18, 1), 0.5, 0.7)])


def tree():
    bm = bmesh.new()
    for r, z in ((1.3, 2.3), (1.0, 3.1), (0.6, 3.8)):
        crown = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)["verts"]
        for v in crown:
            v.co.z = z + v.co.z * 0.8
    for f in bm.faces:
        f.material_index = 1
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.14, radius2=0.1, depth=1.6,
                          matrix=_translation((0, 0, 0.8)))  # nouvelles faces : index 0 (écorce)
    return new_object("tree", bm, [material("bark", (0.3, 0.2, 0.12, 1), 0.95),
                                   material("leaves", (0.25, 0.45, 0.2, 1), 1.0)])


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
        building("building_a", 6.0, 6.0, 3, (0.85, 0.82, 0.76, 1), windows_x=3),
        building("building_b", 6.0, 8.0, 5, (0.62, 0.68, 0.74, 1), windows_x=3),
        building("building_c", 8.0, 6.0, 7, (0.78, 0.7, 0.6, 1), windows_x=4),
        tower("tower_d", 7.0, 12),
        lamppost(), bench(), tree(),
    ]
    for obj in objs:
        export(obj, OUT_DIR / f"{obj.name}.glb")


main()
