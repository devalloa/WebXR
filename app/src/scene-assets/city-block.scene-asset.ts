// Sol de la ville : chaussée, place centrale et trottoirs (maillages simples,
// lus tels quels par la locomotion). Les bâtiments viennent du kit Blender (GLB).
// Module évalué par le runtime ET l'éditeur : déterministe, sans World ni DOM.

import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry } from '@iwsdk/core';
import { BLOCK_CENTERS, BLOCK_SIZE, PITCH, SIDEWALK_HEIGHT } from '../city-layout.js';

const CITY_EXTENT = PITCH * 3 + 12; // 78 m de côté, marge comprise

export function createCityBlock(): Object3D {
  const root = new Group();
  root.name = 'CityBlock';

  // Chaussée : un seul plan, origine au niveau du sol.
  const asphalt = new MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.95 });
  const ground = new Mesh(new PlaneGeometry(CITY_EXTENT, CITY_EXTENT), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'Ground';
  root.add(ground);

  // Place centrale : pelouse légèrement surélevée, dégagée pour le spawn du joueur.
  const grass = new MeshStandardMaterial({ color: 0x5f8f47, roughness: 1 });
  const plaza = new Mesh(new BoxGeometry(BLOCK_SIZE, SIDEWALK_HEIGHT, BLOCK_SIZE), grass);
  plaza.position.y = SIDEWALK_HEIGHT / 2;
  plaza.name = 'Plaza';
  root.add(plaza);

  // Trottoirs : une dalle par îlot (Mesh ordinaires : la locomotion ignore les instances).
  const concrete = new MeshStandardMaterial({ color: 0xb9b5ad, roughness: 0.9 });
  const slab = new BoxGeometry(1, SIDEWALK_HEIGHT, 1);
  slab.translate(0, SIDEWALK_HEIGHT / 2, 0);
  for (const b of BLOCK_CENTERS) {
    const m = new Mesh(slab, concrete);
    m.position.set(b.x, 0, b.z);
    m.scale.set(BLOCK_SIZE, 1, BLOCK_SIZE);
    m.name = 'Sidewalk';
    root.add(m);
  }

  // Marquages au sol : pointillés d'axe sur chaque rue et passages piétons autour de la place,
  // en une seule géométrie (un draw call), posés 1 cm au-dessus de la chaussée.
  const paint = new MeshBasicMaterial({ color: 0xe8e8e0 });
  const marks = new Mesh(buildRoadMarkings(), paint);
  marks.name = 'RoadMarkings';
  root.add(marks);

  // Bâtiments, lampadaires et mobilier : GLB du kit Blender placés par la scène JSON.
  return root;
}

/** Quads plats (deux triangles) empilés dans une BufferGeometry : pas de merge utilitaire nécessaire. */
function buildRoadMarkings(): BufferGeometry {
  const verts: number[] = [];
  const y = 0.01;
  const quad = (x0: number, z0: number, x1: number, z1: number) => {
    verts.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
  };
  const half = (PITCH * 3 + 12) / 2;
  const axes = [-PITCH * 1.5, -PITCH / 2, PITCH / 2, PITCH * 1.5];
  // Pointillés d'axe : 2 m peints, 2 m vides, largeur 0,15 m.
  for (const a of axes) {
    for (let s = -half + 1; s < half - 1; s += 4) {
      quad(a - 0.075, s, a + 0.075, s + 2); // rue verticale (x = a)
      quad(s, a - 0.075, s + 2, a + 0.075); // rue horizontale (z = a)
    }
  }
  // Passages piétons : bandes de 0,5 m, aux quatre entrées de la place (milieu de chaque côté).
  const edge = BLOCK_SIZE / 2 + 0.3; // juste au bord du trottoir de la place
  for (let i = -2; i <= 2; i++) {
    const c = i * 1.0;
    quad(c - 0.25, edge, c + 0.25, edge + 3); // sud
    quad(c - 0.25, -edge - 3, c + 0.25, -edge); // nord
    quad(edge, c - 0.25, edge + 3, c + 0.25); // est
    quad(-edge - 3, c - 0.25, -edge, c + 0.25); // ouest
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  geometry.computeVertexNormals();
  return geometry;
}
