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
  content: { type: 'asset', asset, castShadow: true, receiveShadow: true },
  transform: { position: [x, SIDEWALK, z], rotationDeg: [0, rotY, 0] },
  ...extra,
});
/** Rotation Y (deg) pour que la face avant (+Z local) regarde vers la place centrale. */
const faceCenter = (x, z) => (Math.atan2(-x, -z) * 180) / Math.PI;

const nodes = [
  { id: 'ground', name: 'Sol', content: { type: 'asset', asset: 'city-ground', castShadow: false, receiveShadow: true },
    transform: { position: [0, 0, 0] }, components: { LocomotionEnvironment: {} } },
];
// Lumière d'ambiance et soleil : créés par GameClockSystem (ils varient avec l'heure).

/** Emprises au sol du kit (x, z) ; la porte est au centre de la face avant (+Z local). */
const FOOTPRINT = { 'building-a': [6, 6], 'building-b': [6, 8], 'building-c': [8, 6], 'tower-d': [7, 7] };
const placed = []; // { id, asset, x, z, rotY } pour attribuer logements et lieux de travail
const building = (id, name, asset, pos, rotY) => {
  placed.push({ id, asset, x: pos[0], z: pos[1], rotY });
  return node(id, name, asset, pos, rotY, wall);
};

// Îlots : grille 3x3 sans le centre ; composition selon l'index.
const blocks = [];
for (const ix of [-1, 0, 1]) for (const iz of [-1, 0, 1]) if (ix || iz) blocks.push({ x: ix * PITCH, z: iz * PITCH });
const wall = { components: { LocomotionEnvironment: {} } }; // infranchissable pour le joueur
blocks.forEach((b, i) => {
  const rot = Math.round(faceCenter(b.x, b.z) / 90) * 90; // façades vers la place, par quart de tour
  const P = (dx, dz) => [b.x + dx, b.z + dz];
  switch (i % 4) {
    case 0:
      nodes.push(building(`blk${i}-a1`, 'Immeuble A', 'building-a', P(-3, -3), rot));
      nodes.push(building(`blk${i}-a2`, 'Immeuble A', 'building-a', P(3, 3), rot));
      nodes.push(node(`blk${i}-tree`, 'Arbre', 'tree', P(3, -3)));
      break;
    case 1:
      nodes.push(building(`blk${i}-b`, 'Immeuble B', 'building-b', P(-3, 0), rot));
      nodes.push(building(`blk${i}-a`, 'Immeuble A', 'building-a', P(3.3, 2), rot)); // 30 cm d'écart avec B
      nodes.push(node(`blk${i}-tree`, 'Arbre', 'tree', P(3, -3.5)));
      break;
    case 2:
      nodes.push(building(`blk${i}-c`, 'Immeuble C', 'building-c', P(0, -3), rot));
      nodes.push(building(`blk${i}-a`, 'Immeuble A', 'building-a', P(0, 3.3), rot)); // 30 cm d'écart avec C
      break;
    default:
      nodes.push(building(`blk${i}-tower`, 'Tour D', 'tower-d', P(0, 0), rot));
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
  nodes.push({ id: `sim-${simId}`, name, content: { type: 'asset', asset: 'sim-avatar', castShadow: true, receiveShadow: false },
    transform: { position: [pos[0], 0, pos[1]] }, components: { Sim: { simId, speed, startOffset, tint } } });
}

// Logements et lieux de travail : porte = centre de la face avant, point d'attente 2,5 m devant.
const doorOf = (b) => {
  const depth = FOOTPRINT[b.asset][1];
  const rad = (b.rotY * Math.PI) / 180;
  const fx = Math.sin(rad), fz = Math.cos(rad); // direction de la face avant (+Z local tourné de rotY)
  const door = { x: b.x + fx * (depth / 2), z: b.z + fz * (depth / 2) };
  const stand = { x: b.x + fx * (depth / 2 + 2.5), z: b.z + fz * (depth / 2 + 2.5) };
  return { nodeId: b.id, door, stand };
};
const homes = placed.filter((b) => b.asset === 'building-a' || b.asset === 'building-b');
const works = placed.filter((b) => b.asset === 'tower-d' || b.asset === 'building-c');
const places = {};
sims.forEach(([simId], k) => {
  places[simId] = { home: doorOf(homes[k % homes.length]), work: doorOf(works[k % works.length]) };
});
const r = (v) => Math.round(v * 100) / 100;
const placeTs = (p) => `{ nodeId: '${p.nodeId}', door: { x: ${r(p.door.x)}, z: ${r(p.door.z)} }, stand: { x: ${r(p.stand.x)}, z: ${r(p.stand.z)} } }`;
fs.writeFileSync('src/city-places.ts',
  `// GÉNÉRÉ par tools/gen-scene.mjs : ne pas éditer à la main.\n` +
  `// Logement et lieu de travail de chaque sim : nœud de scène, porte et point d'attente (mètres).\n\n` +
  `export interface Place { nodeId: string; door: { x: number; z: number }; stand: { x: number; z: number } }\n\n` +
  `export const SIM_PLACES: Record<string, { home: Place; work: Place }> = {\n` +
  Object.entries(places).map(([id, p]) => `  ${id}: { home: ${placeTs(p.home)}, work: ${placeTs(p.work)} },`).join('\n') +
  `\n};\n`);
console.log('src/city-places.ts généré');

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
