// Horloge de jeu : fait tourner l'heure (0-24), pilote le soleil, la lumière d'ambiance,
// le ciel et l'éclat des matériaux émissifs (nuit), et fait vieillir les relations
// entre sims (src/sim/relations.ts). Lecture : this.globals.gameHour (signal).

import { createSystem, DirectionalLight, DomeGradient, HemisphereLight, IBLGradient, Mesh, MeshStandardMaterial, PCFShadowMap, Types, Vector3 } from '@iwsdk/core';
import { signal, type Signal } from '@preact/signals-core';
import { tick, type RelationsWorld } from '@sim/relations';

const SUN_DISTANCE = 60;
/** Demi-côté de la zone d'ombre portée (suit le joueur) ; au-delà, pas d'ombres. */
const SHADOW_HALF_SIZE = 28;
// Couleurs (linéaires) à midi et à minuit ; interpolées selon la hauteur du soleil.
const SKY_DAY = [0.24, 0.62, 0.83] as const;
const SKY_NIGHT = [0.01, 0.015, 0.04] as const;
const EQUATOR_DAY = [0.66, 0.71, 0.79] as const;
const EQUATOR_NIGHT = [0.03, 0.04, 0.07] as const;
const GROUND_DAY = [0.8, 0.78, 0.75] as const;
const GROUND_NIGHT = [0.02, 0.02, 0.025] as const;
const IBL_SKY_DAY = [0.69, 0.75, 0.78] as const;
const IBL_SKY_NIGHT = [0.04, 0.05, 0.09] as const;
const EMISSIVE_DAY = 0.4;
const EMISSIVE_NIGHT = 3.5;
const EMISSIVE_SCAN_SECONDS = 2;

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
  private ambient!: HemisphereLight;
  private sunPosition!: Vector3;
  private playerPosition!: Vector3;
  private hour!: Signal<number>;
  private emissives!: Set<MeshStandardMaterial>;
  private sinceScan = 0;

  init(): void {
    this.hour = signal(this.config.startHour.peek());
    this.globals.gameHour = this.hour;
    this.emissives = new Set();

    // Une seule ombre dynamique (le soleil), carte 2048, zone centrée sur le joueur :
    // le compromis lisible/abordable sur Quest 3. PCF simple, pas de « soft ».
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

    this.ambient = new HemisphereLight(0xb3ccff, 0x594d40, 0.6);
    this.world.createTransformEntity(this.ambient);

    this.applyHour(this.hour.peek());
  }

  update(delta: number): void {
    const hoursElapsed = (delta * this.config.hoursPerRealMinute.peek()) / 60;
    const hour = (this.hour.peek() + hoursElapsed) % 24;
    this.hour.value = hour;
    this.applyHour(hour);

    // Les matériaux émissifs des GLB arrivent au fil des chargements : recensés périodiquement.
    this.sinceScan += delta;
    if (this.sinceScan > EMISSIVE_SCAN_SECONDS) {
      this.sinceScan = 0;
      this.scene.traverse((obj) => {
        if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
          const m = obj.material;
          if (m.emissive.r + m.emissive.g + m.emissive.b > 0.05) this.emissives.add(m);
        }
      });
    }

    // Les relations dérivent lentement vers 0 avec le temps de jeu.
    const relations = this.globals.relations as RelationsWorld | undefined;
    if (relations) tick(relations, hoursElapsed);
  }

  private applyHour(hour: number): void {
    // Soleil : lever à 6 h, zénith à 12 h, coucher à 18 h.
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle); // -1 (minuit) … 1 (midi)
    const k = Math.max(0, Math.min(1, elevation * 1.4 + 0.3)); // 0 nuit … 1 jour

    // Le soleil et sa cible suivent le joueur : la zone d'ombre reste autour de lui.
    this.player.getWorldPosition(this.playerPosition);
    this.sunPosition.set(Math.cos(angle) * SUN_DISTANCE, Math.max(elevation, 0.08) * SUN_DISTANCE, -20).add(this.playerPosition);
    this.sun.position.copy(this.sunPosition);
    this.sun.target.position.copy(this.playerPosition);
    this.sun.intensity = Math.max(0, elevation) * 2.5 + 0.05;
    // Nuit : lumière froide et faible (lune + halo urbain) ; jour : ciel bleu, sol chaud.
    this.ambient.intensity = 0.22 + 0.4 * k; // nuit lisible en VR, sans noir total
    this.ambient.color.setRGB(0.7 * k + 0.2, 0.8 * k + 0.25, 1);
    this.ambient.groundColor.setRGB(0.35 * k + 0.05, 0.3 * k + 0.05, 0.25 * k + 0.08);

    const emissive = EMISSIVE_DAY + (EMISSIVE_NIGHT - EMISSIVE_DAY) * (1 - k);
    for (const m of this.emissives) m.emissiveIntensity = emissive;

    const root = this.world.activeLevel.value;
    if (root == null) return;
    const mix = (out: { [i: number]: number }, day: readonly number[], night: readonly number[]) => {
      for (let i = 0; i < 3; i++) out[i] = night[i]! + (day[i]! - night[i]!) * k;
    };
    if (root.hasComponent(DomeGradient)) {
      mix(root.getVectorView(DomeGradient, 'sky'), SKY_DAY, SKY_NIGHT);
      mix(root.getVectorView(DomeGradient, 'equator'), EQUATOR_DAY, EQUATOR_NIGHT);
      mix(root.getVectorView(DomeGradient, 'ground'), GROUND_DAY, GROUND_NIGHT);
      root.setValue(DomeGradient, '_needsUpdate', true);
    }
    if (root.hasComponent(IBLGradient)) {
      mix(root.getVectorView(IBLGradient, 'sky'), IBL_SKY_DAY, IBL_SKY_NIGHT);
      mix(root.getVectorView(IBLGradient, 'equator'), EQUATOR_DAY, EQUATOR_NIGHT);
      mix(root.getVectorView(IBLGradient, 'ground'), GROUND_DAY, GROUND_NIGHT);
      root.setValue(IBLGradient, '_needsUpdate', true);
    }
  }
}
