// Sol de la ville : chaussée, place centrale et trottoirs (maillages simples,
// lus tels quels par la locomotion). Les bâtiments viennent du kit Blender (GLB).
// Module évalué par le runtime ET l'éditeur : déterministe, sans World ni DOM.

import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry } from '@iwsdk/core';
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

  // Bâtiments, lampadaires et mobilier : GLB du kit Blender placés par la scène JSON.
  return root;
}
