import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import type { Signal } from '@preact/signals-core';
import { createWorld } from '@sim/relations';
import { CityDressingSystem } from './city-dressing.js';
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
  world.registerSystem(CityDressingSystem);

  // Réglages de test par l'URL : ?hour=22 (heure de départ), ?speed=6 (heures de jeu par minute).
  const params = new URLSearchParams(location.search);
  const hour = Number(params.get('hour'));
  if (Number.isFinite(hour) && params.has('hour')) (world.globals.gameHour as Signal<number>).value = ((hour % 24) + 24) % 24;
  const speed = Number(params.get('speed'));
  if (Number.isFinite(speed) && speed > 0) world.getSystem(GameClockSystem)!.config.hoursPerRealMinute.value = speed;
});
