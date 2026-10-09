import { describe, expect, it } from "vitest";
import { pathLength, pointAlong, routeTo, snapToStreet, type StreetGrid } from "./streets";

const grid: StreetGrid = { xs: [-33, -11, 11, 33], zs: [-33, -11, 11, 33] };

describe("streets", () => {
  it("projette sur l'axe de rue le plus proche", () => {
    expect(snapToStreet({ x: -12, z: 0 }, grid)).toEqual({ point: { x: -11, z: 0 }, vertical: true });
    expect(snapToStreet({ x: 0, z: -10 }, grid)).toEqual({ point: { x: 0, z: -11 }, vertical: false });
  });

  it("relie deux points par les rues, sans diagonale hors rue", () => {
    const path = routeTo({ x: -14, z: -20 }, { x: 25, z: 16 }, grid);
    expect(path[0]).toEqual({ x: -14, z: -20 });
    expect(path[path.length - 1]).toEqual({ x: 25, z: 16 });
    // Tous les segments intermédiaires sont axés (horizontaux ou verticaux).
    for (let i = 2; i < path.length - 1; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      expect(a.x === b.x || a.z === b.z).toBe(true);
    }
  });

  it("gère les cas sur deux rues verticales et fusionne les doublons", () => {
    const path = routeTo({ x: -11, z: -30 }, { x: 11, z: 30 }, grid);
    expect(path.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < path.length; i++) expect(path[i]).not.toEqual(path[i - 1]);
  });

  it("mesure et parcourt une polyligne", () => {
    const path = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }];
    expect(pathLength(path)).toBe(15);
    expect(pointAlong(path, 12)).toEqual({ x: 10, z: 2, dx: 0, dz: 1 });
    expect(pointAlong(path, 99)).toEqual({ x: 10, z: 5, dx: 0, dz: 1 });
    expect(pointAlong(path, -3).x).toBe(0);
  });
});
