// Horloge de jeu : fait tourner l'heure (0-24), pilote le soleil et le ciel,
// et fait vieillir les relations entre sims (src/sim/relations.ts).
// Lecture pour les autres systèmes : this.globals.gameHour (signal).

import { createSystem, DirectionalLight, DomeGradient, Types, Vector3 } from '@iwsdk/core';
import { signal, type Signal } from '@preact/signals-core';
import { tick, type RelationsWorld } from '@sim/relations';

const SUN_DISTANCE = 60;
// Couleurs du ciel (linéaires) à midi et à minuit ; interpolées selon la hauteur du soleil.
const SKY_DAY = [0.24, 0.62, 0.83] as const;
const SKY_NIGHT = [0.01, 0.015, 0.04] as const;
const GROUND_DAY = [0.8, 0.78, 0.75] as const;
const GROUND_NIGHT = [0.02, 0.02, 0.025] as const;

export class GameClockSystem extends createSystem(
  {},
  {
    /** Heures de jeu par minute réelle (2 → une journée dure 12 minutes). */
    hoursPerRealMinute: { type: Types.Float32, default: 2 },
    /** Heure de départ. */
    startHour: { type: Types.Float32, default: 8 },
  },
) {
  private sun!: DirectionalLight;
  private sunPosition!: Vector3;
  private hour!: Signal<number>;

  init(): void {
    this.hour = signal(this.config.startHour.peek());
    this.globals.gameHour = this.hour;

    this.sun = new DirectionalLight(0xfff1d6, 2.5);
    this.sun.castShadow = false; // pas d'ombres dynamiques sur Quest : éclairage cuit plus tard
    this.sunPosition = new Vector3();
    this.world.createTransformEntity(this.sun);
    this.applyHour(this.hour.peek());
  }

  update(delta: number): void {
    const hoursElapsed = (delta * this.config.hoursPerRealMinute.peek()) / 60;
    const hour = (this.hour.peek() + hoursElapsed) % 24;
    this.hour.value = hour;
    this.applyHour(hour);

    // Les relations dérivent lentement vers 0 avec le temps de jeu.
    const relations = this.globals.relations as RelationsWorld | undefined;
    if (relations) tick(relations, hoursElapsed);
  }

  private applyHour(hour: number): void {
    // Soleil : lever à 6 h, zénith à 12 h, coucher à 18 h.
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle); // -1 (minuit) … 1 (midi)
    this.sunPosition.set(Math.cos(angle) * SUN_DISTANCE, elevation * SUN_DISTANCE, -20);
    this.sun.position.copy(this.sunPosition);
    this.sun.intensity = Math.max(0, elevation) * 2.5 + 0.05;

    const root = this.world.activeLevel.value;
    if (root == null || !root.hasComponent(DomeGradient)) return;
    const k = Math.max(0, Math.min(1, elevation * 1.4 + 0.3)); // 0 nuit … 1 jour
    const sky = root.getVectorView(DomeGradient, 'sky');
    const ground = root.getVectorView(DomeGradient, 'ground');
    for (let i = 0; i < 3; i++) {
      sky[i] = SKY_NIGHT[i]! + (SKY_DAY[i]! - SKY_NIGHT[i]!) * k;
      ground[i] = GROUND_NIGHT[i]! + (GROUND_DAY[i]! - GROUND_NIGHT[i]!) * k;
    }
    root.setValue(DomeGradient, '_needsUpdate', true);
  }
}
