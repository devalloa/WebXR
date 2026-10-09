// Génère public/scenes/main.iwsdk.scene.json de façon déterministe à partir du plan
// de la ville (mêmes constantes que src/city-layout.ts). Relancer après toute
// modification du plan : node tools/gen-scene.mjs
import fs from 'node:fs';

const PITCH = 22; // BLOCK_SIZE 16 + STREET_WIDTH 6
const BLOCK_HALF = 8;
const SIDEWALK = 0.15;
const OUT = 'public/scenes/main.iwsdk.scene.json';

const node = (id, name, asset, [x, z], rotY = 0, extra = {}) => ({
  id, name,
  content: { type: 'asset', asset },
  transform: { position: [x, SIDEWALK, z], rotationDeg: [0, rotY, 0] },
  ...extra,
});
/** Rotation Y (deg) pour que la face avant (+Z local) regarde vers la place centrale. */
const faceCenter = (x, z) => (Math.atan2(-x, -z) * 180) / Math.PI;

const nodes = [
  { id: 'ground', name: 'Sol', content: { type: 'asset', asset: 'city-ground' },
    transform: { position: [0, 0, 0] }, components: { LocomotionEnvironment: {} } },
  { id: 'fill', name: "Lumière d'ambiance", components: { 'com.iwsdk.components.HemisphereLight': {
    skyColor: [0.7, 0.8, 1, 1], groundColor: [0.35, 0.3, 0.25, 1], intensity: 0.6 } } },
];

// Îlots : grille 3x3 sans le centre ; composition selon l'index.
const blocks = [];
for (const ix of [-1, 0, 1]) for (const iz of [-1, 0, 1]) if (ix || iz) blocks.push({ x: ix * PITCH, z: iz * PITCH });
const wall = { components: { LocomotionEnvironment: {} } }; // infranchissable pour le joueur
blocks.forEach((b, i) => {
  const rot = Math.round(faceCenter(b.x, b.z) / 90) * 90; // façades vers la place, par quart de tour
  const P = (dx, dz) => [b.x + dx, b.z + dz];
  switch (i % 4) {
    case 0:
      nodes.push(node(`blk${i}-a1`, 'Immeuble A', 'building-a', P(-3, -3), rot, wall));
      nodes.push(node(`blk${i}-a2`, 'Immeuble A', 'building-a', P(3, 3), rot, wall));
      nodes.push(node(`blk${i}-tree`, 'Arbre', 'tree', P(3, -3)));
      break;
    case 1:
      nodes.push(node(`blk${i}-b`, 'Immeuble B', 'building-b', P(-3, 0), rot, wall));
      nodes.push(node(`blk${i}-a`, 'Immeuble A', 'building-a', P(3.3, 2), rot, wall)); // 30 cm d'écart avec B : pas de z-fighting
      nodes.push(node(`blk${i}-tree`, 'Arbre', 'tree', P(3, -3.5)));
      break;
    case 2:
      nodes.push(node(`blk${i}-c`, 'Immeuble C', 'building-c', P(0, -3), rot, wall));
      nodes.push(node(`blk${i}-a`, 'Immeuble A', 'building-a', P(0, 3.3), rot, wall)); // 30 cm d'écart avec C
      break;
    default:
      nodes.push(node(`blk${i}-tower`, 'Tour D', 'tower-d', P(0, 0), rot, wall));
      nodes.push(node(`blk${i}-bench`, 'Banc', 'bench', P(0, 5.5), rot));
  }
  // Lampadaires aux quatre coins de l'îlot, sur le trottoir.
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    nodes.push(node(`blk${i}-lamp${sx > 0 ? 'E' : 'W'}${sz > 0 ? 'S' : 'N'}`, 'Lampadaire', 'lamppost',
      P(sx * (BLOCK_HALF - 0.6), sz * (BLOCK_HALF - 0.6))));
  }
});

// Place centrale : arbres et bancs, en laissant l'origine libre (spawn du joueur).
for (const [x, z] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) nodes.push(node(`plaza-tree-${x}-${z}`, 'Arbre', 'tree', [x, z]));
for (const [x, z, r] of [[0, -6, 0], [6, 0, 90], [0, 6, 180], [-6, 0, 270]]) nodes.push(node(`plaza-bench-${r}`, 'Banc', 'bench', [x, z], r));

// Les six sims, répartis sur la boucle de promenade.
const sims = [
  ['lea', 'Léa', 1.2, 0, [0.85, 0.3, 0.3, 1], [-11, -11]],
  ['noah', 'Noah', 1.4, 15, [0.3, 0.45, 0.85, 1], [0, -11]],
  ['ines', 'Inès', 1.1, 30, [0.9, 0.75, 0.25, 1], [11, -11]],
  ['malik', 'Malik', 1.3, 45, [0.3, 0.7, 0.4, 1], [11, 0]],
  ['sofia', 'Sofia', 1.0, 60, [0.75, 0.4, 0.8, 1], [11, 11]],
  ['theo', 'Théo', 1.5, 75, [0.95, 0.55, 0.2, 1], [0, 11]],
];
for (const [simId, name, speed, startOffset, tint, pos] of sims) {
  nodes.push({ id: `sim-${simId}`, name, content: { type: 'asset', asset: 'sim-figure' },
    transform: { position: [pos[0], 0, pos[1]] }, components: { Sim: { simId, speed, startOffset, tint } } });
}

const scene = {
  version: 'iwsdk.scene.v1',
  units: 'meters',
  components: {
    'com.iwsdk.components.DomeGradient': { sky: [0.24, 0.62, 0.83, 1], equator: [0.66, 0.71, 0.79, 1], ground: [0.8, 0.78, 0.75, 1], intensity: 1 },
    'com.iwsdk.components.IBLGradient': { sky: [0.69, 0.75, 0.78, 1], equator: [0.66, 0.71, 0.79, 1], ground: [0.8, 0.78, 0.75, 1], intensity: 1 },
  },
  resources: {},
  player: { transform: { position: [0, SIDEWALK, 0] } },
  authoring: { views: [
    { id: 'hero', role: 'hero', projection: 'perspective', position: [44, 30, 52], target: [0, 6, 0], fov: 45 },
    { id: 'street', role: 'diagnostic', projection: 'perspective', position: [0, 1.75, 2], target: [-11, 1.5, -11], fov: 70 },
  ] },
  nodes,
};
fs.writeFileSync(OUT, JSON.stringify(scene, null, 2) + '\n');
console.log(`${OUT}: ${nodes.length} nœuds`);
