// Plan de la ville : données pures, déterministes, partagées par l'asset
// procédural (géométrie) et les systèmes (déplacement des sims).
// Unités en mètres. Origine = centre de la place centrale, dégagée pour le joueur.

/** Côté d'un îlot (trottoir compris). */
export const BLOCK_SIZE = 16;
/** Largeur d'une rue entre deux îlots. */
export const STREET_WIDTH = 6;
/** Distance centre à centre entre deux îlots. */
export const PITCH = BLOCK_SIZE + STREET_WIDTH;
/** Hauteur du trottoir au-dessus de la chaussée. */
export const SIDEWALK_HEIGHT = 0.15;
/** Marge de trottoir autour des bâtiments, à l'intérieur de l'îlot. */
export const SIDEWALK_MARGIN = 2;

export interface Lot {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

/** Générateur pseudo-aléatoire à graine fixe : jamais Math.random() ici. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Centres des 8 îlots autour de la place centrale (grille 3x3 sans le centre). */
export const BLOCK_CENTERS: readonly { x: number; z: number }[] = (() => {
  const out: { x: number; z: number }[] = [];
  for (const ix of [-1, 0, 1]) {
    for (const iz of [-1, 0, 1]) {
      if (ix === 0 && iz === 0) continue;
      out.push({ x: ix * PITCH, z: iz * PITCH });
    }
  }
  return out;
})();

/** Quatre parcelles par îlot, bâtiments de hauteur variée (6 à 20 m). */
export function buildLots(seed = 7): Lot[] {
  const rng = makeRandom(seed);
  const inner = BLOCK_SIZE - SIDEWALK_MARGIN * 2; // 12 m constructibles
  const lot = inner / 2; // 6 m par parcelle
  const lots: Lot[] = [];
  for (const block of BLOCK_CENTERS) {
    for (const ox of [-0.5, 0.5]) {
      for (const oz of [-0.5, 0.5]) {
        const width = lot - 0.8 - rng() * 1.2;
        const depth = lot - 0.8 - rng() * 1.2;
        const floors = 2 + Math.floor(rng() * 5); // 2 à 6 étages
        lots.push({
          x: block.x + ox * lot,
          z: block.z + oz * lot,
          width,
          depth,
          height: floors * 3.2,
        });
      }
    }
  }
  return lots;
}

/** Boucle de promenade des sims : le tour de la place centrale, au milieu de la rue. */
export const WALK_LOOP: readonly { x: number; z: number }[] = (() => {
  const r = PITCH / 2; // 11 m : axe de la rue qui entoure la place
  return [
    { x: -r, z: -r },
    { x: r, z: -r },
    { x: r, z: r },
    { x: -r, z: r },
  ];
})();

/** Lampadaires aux quatre coins de chaque îlot, sur le trottoir. */
export function lampPositions(): { x: number; z: number }[] {
  const d = BLOCK_SIZE / 2 - 0.6;
  const out: { x: number; z: number }[] = [];
  for (const b of BLOCK_CENTERS) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: b.x + sx * d, z: b.z + sz * d });
  }
  return out;
}
