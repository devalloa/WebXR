/**
 * Catalogue d'assets partagé par le runtime et l'éditeur (deux réalités JS
 * distinctes) : déterministe, sans effet de bord.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createCityBlock } from './scene-assets/city-block.scene-asset.js';
import { createSimFigure } from './scene-assets/sim-figure.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

/** Kit Blender v1 (tools/blender/city_kit.py) : origine au sol, face avant vers +Z. */
const kit = (file: string, name: string) => ({
  url: publicAssetUrl(`gltf/city-kit/${file}.glb`),
  type: AssetType.GLTF,
  name,
});

export default defineAssets({
  'city-ground': createCityBlock(),
  'sim-figure': createSimFigure(),
  'building-a': kit('building_a', 'Immeuble A (3 niveaux)'),
  'building-b': kit('building_b', 'Immeuble B (5 niveaux)'),
  'building-c': kit('building_c', 'Immeuble C (7 niveaux)'),
  'tower-d': kit('tower_d', 'Tour D (12 étages)'),
  lamppost: kit('lamppost', 'Lampadaire'),
  bench: kit('bench', 'Banc'),
  tree: kit('tree', 'Arbre'),
});
