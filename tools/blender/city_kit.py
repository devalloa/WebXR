"""Kit de ville modulaire pour le jeu WebXR (Quest 3) — v2, volumes futuristes.

Usage (sur une machine avec Blender 4.2+) :
    blender --background --python tools/blender/city_kit.py -- app/public/gltf/city-kit

Génère, de façon déterministe, des modules low-poly « réaliste stylisé » :
  - building_a/b/c.glb : immeubles de 3, 5 et 7 niveaux à angles chanfreinés (vitrage d'angle
    pleine hauteur), fenêtres en creux, rez-de-chaussée commercial avec casquette d'entrée,
    toit débordant à sous-face lumineuse. Chaque immeuble a son relief propre :
      a : casquettes horizontales au-dessus de chaque rangée de fenêtres (avant et arrière) ;
      b : lames verticales brise-soleil sur les façades avant et arrière ;
      c : balcons filants en façade avant et deux derniers niveaux en retrait sur terrasse.
  - tower_d.glb : tour de 12 étages en trois gradins, mur-rideau, meneaux, dalles saillantes
    (une sur trois émissive), ailettes d'angle, hall en retrait avec auvent, couronne avec
    enseigne lumineuse, antenne et balise.
  - lamppost.glb, bench.glb, tree.glb : mobilier urbain.
Origine au sol, face avant vers -Y Blender (= +Z glTF après conversion Y-up).
Au plus trois matériaux par fichier : façade, vitrage, accent émissif. Aucune lumière exportée.
Direction artistique : ville futuriste « réaliste stylisé » (tons froids, verre, accents lumineux).
Budget : < 2 500 triangles par immeuble, < 300 par objet de mobilier.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT_DIR = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("app/public/gltf/city-kit")
FLOOR_H = 3.2
GROUND_H = 4.0  # rez-de-chaussée commercial
UP = Vector((0, 0, 1))
ACCENT = (0.2, 0.8, 1.0, 1.0)  # cyan des accents lumineux

# Marges des fenêtres dans leur cellule : (horizontale, allège, linteau), en fraction de la cellule
# sauf l'allège des vitrines (mètres).
MARGINS = {
    "floor": lambda cw, ch: (0.2 * cw, 0.3 * ch, 0.14 * ch),
    "shop": lambda cw, ch: (0.07 * cw, 0.35, 0.22 * ch),
    "strip": lambda cw, ch: (0.2 * cw, 0.06 * ch, 0.06 * ch),  # vitrage d'angle quasi continu
    "door": lambda cw, ch: (0.28 * cw, 0.0, 0.25 * ch),
}


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


def facade(bm, p0, u, width, rows, cols, recess=0.18, door_col=None):
    """Façade plane quadrillée (une cellule par fenêtre et par niveau), chaque cellule percée
    d'une fenêtre en creux : cadre, quatre embrasures et vitre en retrait de `recess`.
    `p0` = coin bas-gauche vu de l'extérieur, `u` = direction vers la droite ; la normale est u × Z.
    `rows` = liste de (z0, z1, sorte), sorte étant une clé de MARGINS."""
    n = u.cross(UP)
    zs = [rows[0][0]] + [r[1] for r in rows]
    cw = width / cols
    grid = [[bm.verts.new(p0 + u * (i * cw) + UP * z) for z in zs] for i in range(cols + 1)]
    for j, (z0, z1, kind) in enumerate(rows):
        ch = z1 - z0
        for i in range(cols):
            door = kind == "shop" and i == door_col
            mx, mb, mt = MARGINS["door" if door else kind](cw, ch)
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


def floor_rows(z0, levels, shop=True):
    rows = [(z0, z0 + GROUND_H, "shop")] if shop else []
    z = rows[-1][1] if rows else z0
    rows += [(z + k * FLOOR_H, z + (k + 1) * FLOOR_H, "floor") for k in range(levels - (1 if shop else 0))]
    return rows


def volume(bm, width, depth, rows, cols_x, cols_y, chamfer=0.0, door=False):
    """Volume prismatique à façades percées sur une emprise rectangulaire, angles chanfreinés
    de `chamfer` mètres. Les pans coupés reçoivent, au-dessus du rez-de-chaussée, un vitrage
    vertical quasi continu (une vitre par niveau, mêmes lignes d'étage que les façades voisines
    pour éviter les jonctions en T). Porte au centre de la face avant si `door`."""
    hw, hd, c = width / 2, depth / 2, chamfer
    s2 = math.sqrt(0.5)
    sides = [
        (Vector((-hw + c, -hd, 0)), Vector((1, 0, 0)), width - 2 * c, cols_x, True),     # avant (-Y)
        (Vector((hw, -hd + c, 0)), Vector((0, 1, 0)), depth - 2 * c, cols_y, False),     # droite (+X)
        (Vector((hw - c, hd, 0)), Vector((-1, 0, 0)), width - 2 * c, cols_x, False),     # arrière (+Y)
        (Vector((-hw, hd - c, 0)), Vector((0, -1, 0)), depth - 2 * c, cols_y, False),    # gauche (-X)
    ]
    corners = []
    if c > 0:
        corners = [
            (Vector((hw - c, -hd, 0)), Vector((s2, s2, 0))),
            (Vector((hw, hd - c, 0)), Vector((-s2, s2, 0))),
            (Vector((-hw + c, hd, 0)), Vector((-s2, -s2, 0))),
            (Vector((-hw, -hd + c, 0)), Vector((s2, -s2, 0))),
        ]
    for p0, u, w, cols, front in sides:
        facade(bm, p0, u, w, rows, cols, door_col=cols // 2 if (door and front) else None)
    for p0, u in corners:
        strip = [(z0, z1, "shop" if kind == "shop" else "strip") for z0, z1, kind in rows]
        facade(bm, p0, u, c * math.sqrt(2), strip, 1)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)


def roof(bm, width, depth, z, overhang=0.5, parapet=True):
    """Toit débordant : dalle mince en porte-à-faux, sous-face lumineuse en retrait, acrotère."""
    hw, hd, o = width / 2, depth / 2, overhang
    box(bm, (-hw - o + 0.12, -hd - o + 0.12, z - 0.05), (hw + o - 0.12, hd + o - 0.12, z), mat=2)
    slab = box(bm, (-hw - o, -hd - o, z), (hw + o, hd + o, z + 0.45), mat=0)
    if parapet:
        top = [f for f in slab if f.normal.z > 0.5]
        bmesh.ops.inset_individual(bm, faces=top, thickness=0.25, depth=-0.3)


def entrance_canopy(bm, width, depth):
    """Casquette d'entrée profonde au-dessus des vitrines de la face avant, sous-face lumineuse."""
    hw, hd = width / 2, depth / 2
    box(bm, (-hw + 0.4, -hd - 1.5, GROUND_H - 0.25), (hw - 0.4, -hd, GROUND_H - 0.05), mat=0)
    box(bm, (-hw + 0.6, -hd - 1.4, GROUND_H - 0.27), (hw - 0.6, -hd - 1.25, GROUND_H - 0.25), mat=2)


def building(name, width, depth, floors, facade_rgba, cols_x, relief,
             glass_rgba=(0.14, 0.22, 0.32, 1.0), chamfer=0.9):
    """Immeuble chanfreiné à `floors` niveaux dont un rez-de-chaussée commercial.
    `relief` choisit le dispositif d'ombre : "visors", "fins" ou "setback"."""
    hw, hd = width / 2, depth / 2
    cols_y = max(2, round(cols_x * depth / width))
    bm = bmesh.new()
    if relief == "setback":
        low = floors - 2
        rows = floor_rows(0.0, low)
        volume(bm, width, depth, rows, cols_x, cols_y, chamfer, door=True)
        h1 = rows[-1][1]
        # Terrasse : dalle débordante à nez lumineux, puis deux niveaux en retrait.
        roof(bm, width, depth, h1, overhang=0.25, parapet=False)
        sw, sd = width - 2.4, depth - 2.4
        upper = [(h1 + 0.45 + k * FLOOR_H, h1 + 0.45 + (k + 1) * FLOOR_H, "floor") for k in range(2)]
        top_bm = bmesh.new()
        volume(top_bm, sw, sd, upper, max(2, cols_x - 1), max(2, cols_y - 1), 0.0)
        _merge(bm, top_bm)
        roof(bm, sw, sd, upper[-1][1], overhang=0.6)
        height = upper[-1][1]
        # Balcons filants en façade avant (dalle mince + garde-corps plein bas).
        for k in range(1, low):
            z = GROUND_H + k * FLOOR_H - FLOOR_H
            if k == 1:
                continue  # le premier niveau est abrité par la casquette d'entrée
            box(bm, (-hw + chamfer, -hd - 1.0, z), (hw - chamfer, -hd, z + 0.12), mat=0)
            box(bm, (-hw + chamfer, -hd - 1.0, z + 0.12), (hw - chamfer, -hd - 0.94, z + 1.0), mat=0, bottom=False)
    else:
        rows = floor_rows(0.0, floors)
        volume(bm, width, depth, rows, cols_x, cols_y, chamfer, door=True)
        height = rows[-1][1]
        roof(bm, width, depth, height)
        mw = width - 2 * chamfer
        if relief == "visors":
            # Casquettes horizontales au-dessus de chaque rangée de fenêtres d'étage.
            for z0, z1, kind in rows[1:]:
                zt = z1 - 0.14 * FLOOR_H + 0.05
                box(bm, (-mw / 2, -hd - 0.7, zt), (mw / 2, -hd, zt + 0.1), mat=0)
                box(bm, (-mw / 2, hd, zt), (mw / 2, hd + 0.7, zt + 0.1), mat=0)
        elif relief == "fins":
            # Lames verticales brise-soleil aux limites de colonnes, avant et arrière.
            cw = mw / cols_x
            for i in range(cols_x + 1):
                x = -mw / 2 + i * cw
                x0, x1 = x - 0.06, x + 0.06
                box(bm, (x0, -hd - 0.6, GROUND_H), (x1, -hd, height), mat=0)
                box(bm, (x0, hd, GROUND_H), (x1, hd + 0.6, height), mat=0)
    entrance_canopy(bm, width, depth)
    # Édicule technique sur le toit (du volume supérieur le cas échéant), côté arrière droit.
    rw, rd = ((width - 2.4) / 2, (depth - 2.4) / 2) if relief == "setback" else (hw, hd)
    box(bm, (rw - 2.0, rd - 1.8, height + 0.15), (rw - 0.6, rd - 0.6, height + 1.2), mat=0, bottom=False)

    facade_mat = material(f"{name}_facade", facade_rgba, roughness=0.8)
    glazing = material(f"{name}_glass", glass_rgba, roughness=0.12, metallic=0.4)
    return new_object(name, bm, [facade_mat, glazing, accent_material(f"{name}_accent")])


def _merge(bm, other):
    """Ajoute le contenu de `other` dans `bm` (matériaux conservés) puis libère `other`."""
    mesh = bpy.data.meshes.new("_tmp")
    other.to_mesh(mesh)
    other.free()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)


def tower(name, width, floors, frame_rgba=(0.14, 0.16, 0.2, 1.0), glass_rgba=(0.08, 0.16, 0.26, 1.0)):
    """Tour vitrée en trois gradins : mur-rideau, meneaux, dalles saillantes (une sur trois
    émissive, hors toit), ailettes d'angle, hall en retrait avec auvent, couronne + enseigne
    lumineuse, antenne et balise."""
    h = floors * FLOOR_H
    hw = width / 2
    bm = bmesh.new()
    tiers = [(0, 6, 0.0), (6, 10, 0.6), (10, floors, 1.2)]  # (étage bas, étage haut, retrait)
    for f0, f1, inset in tiers:
        tw = hw - inset
        z0, z1 = f0 * FLOOR_H, f1 * FLOOR_H
        zc = max(z0, FLOOR_H)
        if f0 == 0:
            lobby = tw - 0.9
            box(bm, (-lobby, -lobby, 0), (lobby, lobby, FLOOR_H), mat=1, bottom=False)
        core = tw - 0.3
        box(bm, (-core, -core, zc), (core, core, z1), mat=1, bottom=False)
        mw, mo = 0.08, 0.1
        for k in (1, 2, 3):
            t = -core + k * (2 * core) / 4
            box(bm, (t - mw, -core - mo, zc), (t + mw, -core, z1), bottom=False)
            box(bm, (t - mw, core, zc), (t + mw, core + mo, z1), bottom=False)
            box(bm, (-core - mo, t - mw, zc), (-core, t + mw, z1), bottom=False)
            box(bm, (core, t - mw, zc), (core + mo, t + mw, z1), bottom=False)
        for i in range(f0 + 1, f1 + 1):
            z = i * FLOOR_H
            box(bm, (-tw, -tw, z - 0.22), (tw, tw, z), mat=2 if i % 3 == 0 and i < floors else 0)
        f = 0.45
        for sx in (-1, 1):
            for sy in (-1, 1):
                x0, x1 = sorted((sx * tw, sx * (tw - f)))
                y0, y1 = sorted((sy * tw, sy * (tw - f)))
                box(bm, (x0, y0, z0), (x1, y1, z1 + 0.4), bottom=False)
    # Auvent d'entrée (face avant -Y), sous-face lumineuse.
    lobby = hw - 0.9
    box(bm, (-2.0, -hw - 1.4, FLOOR_H - 0.55), (2.0, -lobby, FLOOR_H - 0.35), mat=0)
    box(bm, (-1.8, -hw - 1.3, FLOOR_H - 0.58), (1.8, -hw - 0.2, FLOOR_H - 0.55), mat=2)
    # Couronne, enseigne lumineuse en façade avant, antenne et balise.
    cr = hw - 1.9
    box(bm, (-cr, -cr, h), (cr, cr, h + 2.6), mat=0, bottom=False)
    box(bm, (-1.4, -cr - 0.12, h + 0.8), (1.4, -cr, h + 1.9), mat=2, bottom=False)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.12, radius2=0.04, depth=5.0,
                          matrix=Matrix.Translation((0, 0, h + 2.6 + 2.5)))
    box(bm, (-0.1, -0.1, h + 7.55), (0.1, 0.1, h + 7.85), mat=2)  # balise

    frame = material(f"{name}_frame", frame_rgba, roughness=0.6, metallic=0.5)
    glazing = material(f"{name}_glass", glass_rgba, roughness=0.08, metallic=0.6)
    return new_object(name, bm, [frame, glazing, accent_material(f"{name}_accent")])


def lamppost():
    """Mât fin, crosse en lame avec diffuseur lumineux en sous-face, anneau lumineux au pied."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.09, radius2=0.06, depth=4.0,
                          matrix=Matrix.Translation((0, 0, 2.0)))
    box(bm, (-0.06, -0.08, 3.98), (0.95, 0.08, 4.08))         # crosse en lame
    box(bm, (0.15, -0.06, 3.96), (0.9, 0.06, 3.98), mat=1)    # diffuseur lumineux
    box(bm, (-0.13, -0.13, 0.25), (0.13, 0.13, 0.3), mat=1)   # anneau lumineux au pied
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
                          matrix=Matrix.Translation((0, 0, 0.8)))  # nouvelles faces : index 0 (écorce)
    return new_object("tree", bm, [material("bark", (0.3, 0.2, 0.12, 1), 0.95),
                                   material("leaves", (0.25, 0.45, 0.2, 1), 1.0)])


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT", export_lights=False,
    )
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"[city_kit] {path.name}: {tris} triangles")


def main():
    reset_scene()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    objs = [
        building("building_a", 6.0, 6.0, 3, (0.82, 0.85, 0.88, 1), cols_x=3, relief="visors"),
        building("building_b", 6.0, 8.0, 5, (0.34, 0.41, 0.52, 1), cols_x=3, relief="fins"),
        building("building_c", 8.0, 6.0, 7, (0.5, 0.68, 0.7, 1), cols_x=4, relief="setback", chamfer=1.0),
        tower("tower_d", 7.0, 12),
        lamppost(), bench(), tree(),
    ]
    for obj in objs:
        export(obj, OUT_DIR / f"{obj.name}.glb")


main()
