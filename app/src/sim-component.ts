// Composant de données d'un sim actif dans la scène (déclaré sans système ni DOM).
import { createComponent, Types } from '@iwsdk/core';

export const Sim = createComponent('Sim', {
  /** Identifiant logique, le même que dans src/sim (relations, persona). */
  simId: { type: Types.String, default: '' },
  /** Vitesse de marche en m/s. */
  speed: { type: Types.Float32, default: 1.2, min: 0, max: 4, step: 0.1 },
  /** Position de départ sur la boucle de promenade, en mètres parcourus. */
  startOffset: { type: Types.Float32, default: 0, min: 0, max: 100, step: 1 },
  /** Couleur des vêtements (RGBA), appliquée au corps à l'apparition. */
  tint: { type: Types.Color, default: [0.53, 0.6, 0.67, 1] },
  /** Distance parcourue sur la boucle ; géré par SimWalkSystem. */
  _distance: { type: Types.Float32, default: 0 },
});
