// GÉNÉRÉ par tools/gen-scene.mjs : ne pas éditer à la main.
// Logement et lieu de travail de chaque sim : nœud de scène, porte et point d'attente (mètres).

export interface Place { nodeId: string; door: { x: number; z: number }; stand: { x: number; z: number } }

export const SIM_PLACES: Record<string, { home: Place; work: Place }> = {
  lea: { home: { nodeId: 'blk0-a1', door: { x: -22, z: -25 }, stand: { x: -19.5, z: -25 } }, work: { nodeId: 'blk2-c', door: { x: -22, z: 16 }, stand: { x: -22, z: 13.5 } } },
  noah: { home: { nodeId: 'blk0-a2', door: { x: -16, z: -19 }, stand: { x: -13.5, z: -19 } }, work: { nodeId: 'blk3-tower', door: { x: 0, z: -18.5 }, stand: { x: 0, z: -16 } } },
  ines: { home: { nodeId: 'blk1-b', door: { x: -21, z: 0 }, stand: { x: -18.5, z: 0 } }, work: { nodeId: 'blk6-c', door: { x: 19, z: -3 }, stand: { x: 16.5, z: -3 } } },
  malik: { home: { nodeId: 'blk1-a', door: { x: -15.7, z: 2 }, stand: { x: -13.2, z: 2 } }, work: { nodeId: 'blk7-tower', door: { x: 18.5, z: 22 }, stand: { x: 16, z: 22 } } },
  sofia: { home: { nodeId: 'blk2-a', door: { x: -22, z: 22.3 }, stand: { x: -22, z: 19.8 } }, work: { nodeId: 'blk2-c', door: { x: -22, z: 16 }, stand: { x: -22, z: 13.5 } } },
  theo: { home: { nodeId: 'blk4-a1', door: { x: -3, z: 16 }, stand: { x: -3, z: 13.5 } }, work: { nodeId: 'blk3-tower', door: { x: 0, z: -18.5 }, stand: { x: 0, z: -16 } } },
};
