// Horloge de jeu : fait tourner l'heure (0-24), pilote le soleil et le ciel,
// et fait vieillir les relations entre sims (src/sim/relations.ts).
// Lecture pour les autres systèmes : this.globals.gameHour (signal).

import { createSystem, DirectionalLight, DomeGradient, PCFShadowMap, Types, Vector3 } from '@iwsdk/core';
import { signal, type Signal } from '@preact/signals-core';
import { tick, type RelationsWorld } from '@sim/relations';

const SUN_DISTANCE = 60;
/** Demi-côté de la zone d'ombre portée (suit le joueur) ; au-delà, pas d'ombres. */
const SHADOW_HALF_SIZE = 28;
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
  private playerPosition!: Vector3;
  private hour!: Signal<number>;

  init(): void {
    this.hour = signal(this.config.startHour.peek());
    this.globals.gameHour = this.hour;

    // Une seule ombre dynamique (le soleil), carte 2048, zone centrée sur le joueur :
    // c'est le compromis lisible/abordable sur Quest 3. PCF simple, pas de « soft ».
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.sun = new DirectionalLight(0xfff1d6, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_HALF_SIZE; cam.right = SHADOW_HALF_SIZE;
    cam.top = SHADOW_HALF_SIZE; cam.bottom = -SHADOW_HALF_SIZE;
    cam.near = 1; cam.far = SUN_DISTANCE * 2.5;
    this.sunPosition = new Vector3();
    this.playerPosition = new Vector3();
    this.world.createTransformEntity(this.sun);
    this.world.createTransformEntity(this.sun.target);
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
    // Le soleil et sa cible suivent le joueur : la zone d'ombre reste autour de lui.
    this.player.getWorldPosition(this.playerPosition);
    this.sunPosition.set(Math.cos(angle) * SUN_DISTANCE, Math.max(elevation, 0.08) * SUN_DISTANCE, -20).add(this.playerPosition);
    this.sun.position.copy(this.sunPosition);
    this.sun.target.position.copy(this.playerPosition);
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
