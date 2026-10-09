import { describe, expect, it } from "vitest";
import { applyEmotionDeltas, createEmotions, decayEmotions, EMOTIONS } from "./emotions";

describe("emotions", () => {
  it("expose au moins les cinq émotions de base", () => {
    for (const e of ["joy", "anger", "sadness", "fatigue", "stress"]) expect(EMOTIONS).toContain(e);
  });

  it("createEmotions : 0 par défaut, valeurs initiales validées", () => {
    expect(Object.values(createEmotions())).toEqual([0, 0, 0, 0, 0]);
    expect(createEmotions({ joy: 0.4 }).joy).toBe(0.4);
    expect(() => createEmotions({ joy: 1.2 })).toThrow(RangeError);
    expect(() => createEmotions({ stress: -0.1 })).toThrow(RangeError);
    expect(() => createEmotions({ joy: NaN })).toThrow(RangeError);
    expect(() => createEmotions({ boredom: 0.1 } as never)).toThrow(/inconnue/);
  });

  it("applyEmotionDeltas : résultat borné à [0, 1]", () => {
    const e = createEmotions({ joy: 0.9, anger: 0.1 });
    applyEmotionDeltas(e, { joy: 0.5, anger: -0.5, stress: 0.3 });
    expect(e.joy).toBe(1);
    expect(e.anger).toBe(0);
    expect(e.stress).toBeCloseTo(0.3);
  });

  it("applyEmotionDeltas : delta invalide sans mutation", () => {
    const e = createEmotions({ joy: 0.5 });
    expect(() => applyEmotionDeltas(e, { joy: 0.2, anger: Infinity })).toThrow(RangeError);
    expect(() => applyEmotionDeltas(e, { nope: 0.2 } as never)).toThrow(/inconnue/);
    expect(e.joy).toBe(0.5);
  });

  it("decayEmotions : dérive exponentielle vers 0 par défaut", () => {
    const e = createEmotions({ anger: 0.8 });
    decayEmotions(e, 5, 0.2);
    expect(e.anger).toBeCloseTo(0.8 * 0.8 ** 5);
    decayEmotions(e, 500, 0.2);
    expect(e.anger).toBe(0);
  });

  it("decayEmotions : indépendante du pas de temps", () => {
    const a = createEmotions({ joy: 0.9, stress: 0.6 });
    const b = createEmotions({ joy: 0.9, stress: 0.6 });
    decayEmotions(a, 6);
    for (let i = 0; i < 6; i++) decayEmotions(b, 1);
    for (const k of EMOTIONS) expect(a[k]).toBeCloseTo(b[k], 10);
  });

  it("decayEmotions : tend vers la valeur de repos sans la dépasser", () => {
    const rest = { joy: 0.3, fatigue: 0.2 };
    const down = createEmotions({ joy: 0.9 });
    const up = createEmotions({ joy: 0, fatigue: 0 });
    for (let h = 0; h < 200; h++) {
      decayEmotions(down, 1, 0.3, rest);
      decayEmotions(up, 1, 0.3, rest);
      expect(down.joy).toBeGreaterThanOrEqual(0.3);
      expect(up.joy).toBeLessThanOrEqual(0.3);
      expect(up.fatigue).toBeLessThanOrEqual(0.2);
    }
    expect(down.joy).toBe(0.3);
    expect(up.joy).toBeCloseTo(0.3, 3);
    expect(up.fatigue).toBeCloseTo(0.2, 3);
  });

  it("decayEmotions : taux par émotion et validation sans mutation", () => {
    const e = createEmotions({ joy: 0.5, anger: 0.5 });
    decayEmotions(e, 1, { joy: 0.5 });
    expect(e.joy).toBeCloseTo(0.25);
    expect(() => decayEmotions(e, -1)).toThrow(RangeError);
    expect(() => decayEmotions(e, 1, 1)).toThrow(RangeError);
    expect(() => decayEmotions(e, 1, 0.1, { joy: 2 })).toThrow(RangeError);
    expect(e.joy).toBeCloseTo(0.25);
  });
});
