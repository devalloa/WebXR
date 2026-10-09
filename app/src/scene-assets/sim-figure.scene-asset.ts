// Silhouette stylisée d'un sim (placeholder avant les avatars Mixamo/VRM) :
// corps en capsule, tête en sphère, ~600 triangles. Origine aux pieds, face vers -Z.
// Déterministe, sans World ni DOM (module partagé runtime/éditeur).

import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from '@iwsdk/core';

export const SIM_HEIGHT = 1.7;

export function createSimFigure(): Object3D {
  const root = new Group();
  root.name = 'SimFigure';

  const skin = new MeshStandardMaterial({ color: 0xe8c4a2, roughness: 0.7 });
  const cloth = new MeshStandardMaterial({ color: 0x8899aa, roughness: 0.9 });

  const body = new Mesh(new CapsuleGeometry(0.22, 0.6, 4, 12), cloth);
  body.position.y = 0.95; // centre de la capsule : jambes + tronc
  body.name = 'Body';
  root.add(body);

  const head = new Mesh(new SphereGeometry(0.15, 12, 10), skin);
  head.position.y = SIM_HEIGHT - 0.15;
  head.name = 'Head';
  root.add(head);

  // Petit nez : donne une direction lisible à la silhouette.
  const nose = new Mesh(new SphereGeometry(0.035, 6, 6), skin);
  nose.position.set(0, SIM_HEIGHT - 0.17, -0.15);
  nose.name = 'Nose';
  root.add(nose);

  return root;
}
