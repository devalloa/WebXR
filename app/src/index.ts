import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { createWorld } from '@sim/relations';
import { GameClockSystem } from './game-clock.js';
import { SimWalkSystem } from './sim-walk.js';

/** Les six sims actifs ; les mêmes identifiants que dans la scène (composant Sim). */
export const SIM_IDS = ['lea', 'noah', 'ines', 'malik', 'sofia', 'theo'] as const;

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // État de simulation partagé entre systèmes (logique pure de src/sim).
  world.globals.relations = createWorld([...SIM_IDS]);

  world.registerSystem(GameClockSystem);
  world.registerSystem(SimWalkSystem);
});
