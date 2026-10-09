/**
 * Catalogue d'assets partagé par le runtime et l'éditeur (deux réalités JS
 * distinctes) : déterministe, sans effet de bord.
 */

import { defineAssets } from '@iwsdk/core';
import { createCityBlock } from './scene-assets/city-block.scene-asset.js';
import { createSimFigure } from './scene-assets/sim-figure.scene-asset.js';

export default defineAssets({
  'city-block': createCityBlock(),
  'sim-figure': createSimFigure(),
});
