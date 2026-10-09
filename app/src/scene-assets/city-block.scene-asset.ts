// Ville procédurale « réaliste stylisé », pensée pour le Quest 3 :
// quelques InstancedMesh (un draw call par famille) et des matériaux partagés.
// Module évalué par le runtime ET l'éditeur : déterministe, sans World ni DOM.

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import {
  BLOCK_CENTERS,
  BLOCK_SIZE,
  PITCH,
  SIDEWALK_HEIGHT,
  buildLots,
  lampPositions,
  makeRandom,
} from '../city-layout.js';

const CITY_EXTENT = PITCH * 3 + 12; // 78 m de côté, marge comprise

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();

function setInstance(mesh: InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): void {
  position.set(x, y, z);
  scale.set(sx, sy, sz);
  matrix.compose(position, quaternion.identity(), scale);
  mesh.setMatrixAt(i, matrix);
}

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

  // Trottoirs : une dalle par îlot.
  const concrete = new MeshStandardMaterial({ color: 0xb9b5ad, roughness: 0.9 });
  const sidewalks = new InstancedMesh(new BoxGeometry(1, SIDEWALK_HEIGHT, 1), concrete, BLOCK_CENTERS.length);
  sidewalks.name = 'Sidewalks';
  BLOCK_CENTERS.forEach((b, i) => setInstance(sidewalks, i, b.x, SIDEWALK_HEIGHT / 2, b.z, BLOCK_SIZE, 1, BLOCK_SIZE));
  root.add(sidewalks);

  // Bâtiments : une géométrie unitaire (origine au sol), instanciée et teintée par instance.
  const lots = buildLots();
  const facade = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const unitBox = new BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const buildings = new InstancedMesh(unitBox, facade, lots.length);
  buildings.name = 'Buildings';
  const rng = makeRandom(11);
  const palette = [0xd9c7b0, 0xc9a98a, 0xa8b4bf, 0xe3ded2, 0x8f7f72, 0xbfc6a4].map((c) => new Color(c));
  lots.forEach((lot, i) => {
    setInstance(buildings, i, lot.x, SIDEWALK_HEIGHT, lot.z, lot.width, lot.height, lot.depth);
    buildings.setColorAt(i, palette[Math.floor(rng() * palette.length)]!);
  });
  root.add(buildings);

  // Lampadaires : mât fin, origine au sol.
  const metal = new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.4 });
  const pole = new CylinderGeometry(0.06, 0.08, 4, 6);
  pole.translate(0, 2, 0);
  const lamps = lampPositions();
  const poles = new InstancedMesh(pole, metal, lamps.length);
  poles.name = 'LampPosts';
  lamps.forEach((p, i) => setInstance(poles, i, p.x, SIDEWALK_HEIGHT, p.z));
  root.add(poles);

  return root;
}
