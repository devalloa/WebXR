// Déplace chaque sim le long de la boucle de promenade (WALK_LOOP) et l'oriente
// dans le sens de la marche. Aucune allocation par image : les vecteurs sont
// créés dans init().

import { Color, createSystem, Mesh, MeshStandardMaterial, Vector3, type Entity } from '@iwsdk/core';
import { WALK_LOOP } from './city-layout.js';
import { Sim } from './sim-component.js';

/** Longueurs cumulées des segments de la boucle (fermée). */
const SEGMENTS: { ax: number; az: number; bx: number; bz: number; length: number }[] = WALK_LOOP.map((a, i) => {
  const b = WALK_LOOP[(i + 1) % WALK_LOOP.length]!;
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z, length: Math.hypot(b.x - a.x, b.z - a.z) };
});
export const LOOP_LENGTH = SEGMENTS.reduce((sum, s) => sum + s.length, 0);

export class SimWalkSystem extends createSystem({
  sims: { required: [Sim] },
}) {
  private target!: Vector3;
  private lookAt!: Vector3;
  private tint!: Color;

  init(): void {
    this.target = new Vector3();
    this.lookAt = new Vector3();
    this.tint = new Color();

    const onQualify = (entity: Entity) => this.setup(entity);
    this.cleanupFuncs.push(this.queries.sims.subscribe('qualify', onQualify));
    for (const entity of this.queries.sims.entities) this.setup(entity);
  }

  /** Teinte le corps avec la couleur du composant et place le sim à son offset de départ. */
  private setup(entity: Entity): void {
    const tint = entity.getVectorView(Sim, 'tint');
    this.tint.setRGB(tint[0]!, tint[1]!, tint[2]!);
    entity.object3D?.traverse((obj) => {
      if (obj instanceof Mesh && obj.name === 'Body' && obj.material instanceof MeshStandardMaterial) {
        const own = obj.material.clone(); // une copie par sim : le matériau du prototype reste partagé
        own.color.copy(this.tint);
        obj.material = own;
      }
    });
    entity.setValue(Sim, '_distance', entity.getValue(Sim, 'startOffset') ?? 0);
    this.place(entity, 0);
  }

  update(delta: number): void {
    for (const entity of this.queries.sims.entities) this.place(entity, delta);
  }

  private place(entity: Entity, delta: number): void {
    const obj = entity.object3D;
    if (obj == null) return;
    const speed = entity.getValue(Sim, 'speed') ?? 0;
    let distance = ((entity.getValue(Sim, '_distance') ?? 0) + speed * delta) % LOOP_LENGTH;
    entity.setValue(Sim, '_distance', distance);

    // Trouve le segment courant et interpole la position.
    let seg = SEGMENTS[0]!;
    for (const s of SEGMENTS) {
      if (distance <= s.length) { seg = s; break; }
      distance -= s.length;
    }
    const t = seg.length > 0 ? distance / seg.length : 0;
    this.target.set(seg.ax + (seg.bx - seg.ax) * t, 0, seg.az + (seg.bz - seg.az) * t);
    obj.position.copy(this.target);
    // Regarde vers la fin du segment (la figure fait face à -Z local).
    this.lookAt.set(seg.bx, 0, seg.bz);
    if (this.lookAt.distanceToSquared(this.target) > 1e-6) obj.lookAt(this.lookAt);
  }
}
