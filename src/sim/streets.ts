// Itinéraires sur une grille de rues orthogonales (Manhattan) : d'un point quelconque
// à un autre en passant par les axes de rues, sans traverser les îlots.
// Logique pure ; les coordonnées des rues sont fournies par l'appelant.

export interface Point2 {
  x: number;
  z: number;
}

export interface StreetGrid {
  /** Abscisses des rues verticales (parallèles à z). */
  xs: readonly number[];
  /** Ordonnées des rues horizontales (parallèles à x). */
  zs: readonly number[];
}

const nearest = (v: number, values: readonly number[]): number =>
  values.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), values[0]!);

/** Projette un point sur l'axe de rue le plus proche (vertical ou horizontal). */
export function snapToStreet(p: Point2, grid: StreetGrid): { point: Point2; vertical: boolean } {
  const nx = nearest(p.x, grid.xs);
  const nz = nearest(p.z, grid.zs);
  return Math.abs(nx - p.x) <= Math.abs(nz - p.z)
    ? { point: { x: nx, z: p.z }, vertical: true }
    : { point: { x: p.x, z: nz }, vertical: false };
}

/**
 * Polyligne de `from` à `to` : rejoindre la rue la plus proche, suivre les axes,
 * puis quitter la rue vers la destination. Les points consécutifs identiques sont fusionnés.
 */
export function routeTo(from: Point2, to: Point2, grid: StreetGrid): Point2[] {
  if (grid.xs.length === 0 || grid.zs.length === 0) throw new Error("Grille de rues vide");
  const a = snapToStreet(from, grid);
  const b = snapToStreet(to, grid);
  const path: Point2[] = [from, a.point];

  if (a.vertical && b.vertical) {
    // Deux rues verticales : rejoindre une rue horizontale entre les deux, la suivre.
    const h = nearest((a.point.z + b.point.z) / 2, grid.zs);
    path.push({ x: a.point.x, z: h }, { x: b.point.x, z: h });
  } else if (!a.vertical && !b.vertical) {
    const v = nearest((a.point.x + b.point.x) / 2, grid.xs);
    path.push({ x: v, z: a.point.z }, { x: v, z: b.point.z });
  } else if (a.vertical) {
    path.push({ x: a.point.x, z: b.point.z }); // coin de rue
  } else {
    path.push({ x: b.point.x, z: a.point.z });
  }
  path.push(b.point, to);

  return path.filter((p, i) => i === 0 || Math.hypot(p.x - path[i - 1]!.x, p.z - path[i - 1]!.z) > 1e-6);
}

/** Longueur d'une polyligne. */
export function pathLength(path: readonly Point2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  return len;
}

/** Position et direction à `distance` mètres le long de la polyligne (bornée aux extrémités). */
export function pointAlong(path: readonly Point2[], distance: number): { x: number; z: number; dx: number; dz: number } {
  if (path.length === 0) throw new Error("Polyligne vide");
  let remaining = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= len || i === path.length - 1) {
      const t = len > 0 ? Math.min(1, remaining / len) : 1;
      const dx = len > 0 ? (b.x - a.x) / len : 0;
      const dz = len > 0 ? (b.z - a.z) / len : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx, dz };
    }
    remaining -= len;
  }
  const p = path[0]!;
  return { x: p.x, z: p.z, dx: 0, dz: 1 };
}
