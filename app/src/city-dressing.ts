// Habillage du sol : applique les textures tuilables (asphalte, pavés, pelouse) aux
// maillages du sol une fois l'asset `city-ground` placé. Les matériaux du prototype
// restent intacts : chaque maillage reçoit sa propre copie texturée.

import { AssetManager, createSystem, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from '@iwsdk/core';

/** Nom de maillage → (clé de texture, mètres par tuile). */
const SURFACES: Record<string, { key: string; metersPerTile: number }> = {
  Ground: { key: 'tex-asphalt', metersPerTile: 6 },
  Sidewalk: { key: 'tex-sidewalk', metersPerTile: 2.5 },
  Plaza: { key: 'tex-grass', metersPerTile: 3 },
};
const CITY_EXTENT = 78;
const BLOCK_SIZE = 16;

export class CityDressingSystem extends createSystem({}) {
  private done = false;
  private textures = new Map<string, Texture>();

  init(): void {
    void Promise.all(
      Object.values(SURFACES).map(async ({ key }) => {
        const tex = await AssetManager.loadTextureById(key);
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 4;
        this.textures.set(key, tex);
      }),
    ).catch((err: unknown) => console.warn('[CityDressing] textures indisponibles', err));
  }

  update(): void {
    if (this.done || this.textures.size < Object.keys(SURFACES).length) return;
    let applied = 0;
    this.scene.traverse((obj) => {
      const spec = SURFACES[obj.name];
      if (spec == null || !(obj instanceof Mesh) || !(obj.material instanceof MeshStandardMaterial)) return;
      const base = this.textures.get(spec.key);
      if (base == null) return;
      // Un repeat par surface : la texture est clonée (l'image GPU reste partagée).
      const tex = base.clone();
      tex.needsUpdate = true;
      const size = obj.name === 'Ground' ? CITY_EXTENT : BLOCK_SIZE;
      tex.repeat.set(size / spec.metersPerTile, size / spec.metersPerTile);
      const mat = obj.material.clone();
      mat.map = tex;
      mat.color.setScalar(obj.name === 'Ground' ? 0.55 : 0.9); // asphalte assombri (texture claire)
      obj.material = mat;
      applied += 1;
    });
    if (applied > 0) this.done = true;
  }
}
