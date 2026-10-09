// Vie quotidienne des sims : selon l'heure de jeu, chacun dort chez lui, va travailler,
// flâne sur la place, puis rentre. Les trajets suivent les rues (src/sim/streets.ts) ;
// à l'intérieur d'un bâtiment, le sim est caché. L'avatar est animé (clips `idle` / `walk`
// de l'asset `sim-avatar`, fondu enchaîné). Aucune allocation par image.

import { AnimationMixer, AssetManager, Color, createSystem, Mesh, MeshStandardMaterial, Vector3, type AnimationAction, type Entity } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { scheduleFor, type Place } from '@sim/schedule';
import { pathLength, pointAlong, routeTo, type Point2, type StreetGrid } from '@sim/streets';
import { PITCH, WALK_LOOP } from './city-layout.js';
import { SIM_PLACES } from './city-places.js';
import { Sim } from './sim-component.js';

/** Axes des rues : entre les îlots (±11) et autour de la ville (±33). */
const GRID: StreetGrid = { xs: [-PITCH * 1.5, -PITCH / 2, PITCH / 2, PITCH * 1.5], zs: [-PITCH * 1.5, -PITCH / 2, PITCH / 2, PITCH * 1.5] };
/** Boucle de promenade autour de la place, fermée. */
const LOOP: Point2[] = [...WALK_LOOP, WALK_LOOP[0]!];
const LOOP_LENGTH = pathLength(LOOP);

/** Vitesse de marche « naturelle » du clip `walk` (m/s) : timeScale = vitesse / WALK_CLIP_SPEED. */
const WALK_CLIP_SPEED = 1.19;
const FADE_SECONDS = 0.25;

interface Journey {
  place: Place;
  path: Point2[];
  length: number;
  distance: number;
  arrived: boolean;
  mixer?: AnimationMixer;
  idle?: AnimationAction;
  walk?: AnimationAction;
  walking: boolean;
}

export class SimWalkSystem extends createSystem({
  sims: { required: [Sim] },
}) {
  private journeys!: Map<Entity, Journey>;
  private lookAt!: Vector3;
  private tint!: Color;

  init(): void {
    this.journeys = new Map();
    this.lookAt = new Vector3();
    this.tint = new Color();
    this.cleanupFuncs.push(this.queries.sims.subscribe('qualify', (e) => this.setup(e)));
    this.cleanupFuncs.push(this.queries.sims.subscribe('disqualify', (e) => this.journeys.delete(e)));
    for (const entity of this.queries.sims.entities) this.setup(entity);
  }

  /** Teinte les vêtements avec la couleur du composant ; démarre la journée au lieu prévu. */
  private setup(entity: Entity): void {
    const tint = entity.getVectorView(Sim, 'tint');
    this.tint.setRGB(tint[0]!, tint[1]!, tint[2]!);
    entity.object3D?.traverse((obj) => {
      if (!(obj instanceof Mesh) || !(obj.material instanceof MeshStandardMaterial)) return;
      // Avatar : matériau « Outfit » ; silhouette de secours : maillage « Body ».
      if (obj.material.name === 'Outfit' || obj.name === 'Body') {
        const own = obj.material.clone(); // une copie par sim : le matériau du prototype reste partagé
        own.color.copy(this.tint);
        obj.material = own;
      }
    });
    const hour = (this.globals.gameHour as Signal<number> | undefined)?.peek() ?? 8;
    const place = scheduleFor(entity.getValue(Sim, 'simId') ?? '', hour).place;
    const start = this.targetFor(entity, place);
    const journey: Journey = { place, path: [start, start], length: 0, distance: 0, arrived: true, walking: false };

    // Animation : les clips sont partagés (asset en cache), le mixer est propre à ce sim.
    const gltf = AssetManager.getGLTF('sim-avatar', { shared: true });
    const idleClip = gltf?.animations.find((c) => c.name === 'idle');
    const walkClip = gltf?.animations.find((c) => c.name === 'walk');
    if (entity.object3D && idleClip && walkClip) {
      journey.mixer = new AnimationMixer(entity.object3D);
      journey.idle = journey.mixer.clipAction(idleClip);
      journey.walk = journey.mixer.clipAction(walkClip);
      journey.walk.timeScale = (entity.getValue(Sim, 'speed') ?? 1.2) / WALK_CLIP_SPEED;
      journey.idle.play();
      journey.walk.play();
      journey.walk.setEffectiveWeight(0);
      journey.mixer.setTime(Math.random() * 2); // désynchronise les six sims
    }
    this.journeys.set(entity, journey);
    this.applyPose(entity, start.x, start.z, 0, 1);
  }

  /** Bascule marche/repos par fondu enchaîné (sans à-coup). */
  private setWalking(journey: Journey, walking: boolean): void {
    if (journey.walking === walking || !journey.idle || !journey.walk) return;
    journey.walking = walking;
    const from = walking ? journey.idle : journey.walk;
    const to = walking ? journey.walk : journey.idle;
    to.enabled = true;
    to.setEffectiveWeight(1);
    from.crossFadeTo(to, FADE_SECONDS, false);
  }

  private targetFor(entity: Entity, place: Place): Point2 {
    if (place === 'plaza') {
      const offset = (entity.getValue(Sim, 'startOffset') ?? 0) % LOOP_LENGTH;
      const p = pointAlong(LOOP, offset);
      return { x: p.x, z: p.z };
    }
    const simId = entity.getValue(Sim, 'simId') ?? '';
    const places = SIM_PLACES[simId];
    const stand = place === 'home' ? places?.home.stand : places?.work.stand;
    return stand ?? { x: 0, z: 0 };
  }

  update(delta: number): void {
    const hour = (this.globals.gameHour as Signal<number> | undefined)?.peek() ?? 8;
    for (const entity of this.queries.sims.entities) {
      const journey = this.journeys.get(entity);
      if (journey == null) continue;
      const speed = entity.getValue(Sim, 'speed') ?? 1.2;
      const place = scheduleFor(entity.getValue(Sim, 'simId') ?? '', hour).place;

      if (place !== journey.place) {
        // Nouveau créneau : itinéraire par les rues depuis la position courante.
        const here = pointAlong(journey.path, journey.distance);
        journey.place = place;
        journey.path = routeTo({ x: here.x, z: here.z }, this.targetFor(entity, place), GRID);
        journey.length = pathLength(journey.path);
        journey.distance = 0;
        journey.arrived = false;
        if (entity.object3D) entity.object3D.visible = true;
      }

      journey.mixer?.update(delta);
      if (!journey.arrived) {
        this.setWalking(journey, true);
        journey.distance = Math.min(journey.length, journey.distance + speed * delta);
        const p = pointAlong(journey.path, journey.distance);
        this.applyPose(entity, p.x, p.z, p.dx, p.dz);
        if (journey.distance >= journey.length) {
          journey.arrived = true;
          this.setWalking(journey, false);
          // Chez soi ou au travail : le sim entre dans le bâtiment (caché jusqu'au prochain créneau).
          if (place !== 'plaza' && entity.object3D) entity.object3D.visible = false;
        }
      } else if (place === 'plaza') {
        // Flânerie : tour de la place en boucle.
        this.setWalking(journey, true);
        entity.setValue(Sim, '_distance', ((entity.getValue(Sim, '_distance') ?? 0) + speed * delta) % LOOP_LENGTH);
        const p = pointAlong(LOOP, entity.getValue(Sim, '_distance') ?? 0);
        journey.path = [{ x: p.x, z: p.z }, { x: p.x, z: p.z }];
        journey.length = 0;
        journey.distance = 0;
        this.applyPose(entity, p.x, p.z, p.dx, p.dz);
      }
    }
  }

  private applyPose(entity: Entity, x: number, z: number, dx: number, dz: number): void {
    const obj = entity.object3D;
    if (obj == null) return;
    obj.position.set(x, 0.15, z);
    if (dx !== 0 || dz !== 0) {
      this.lookAt.set(x + dx, 0.15, z + dz);
      obj.lookAt(this.lookAt); // la figure regarde vers -Z local
    }
  }
}
