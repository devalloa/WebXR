import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRIFT_PER_HOUR,
  DRIFT_EPSILON,
  EVENT_DELTAS,
  MAX_SCORE,
  MIN_SCORE,
  PAIR_COUNT,
  applyEvent,
  createWorld,
  getRelationsOf,
  getScore,
  pairKey,
  tick,
  type EventType,
} from "./relations";

const IDS = ["ana", "ben", "chloe", "dan", "eve", "finn"];

// Petit rng déterministe (mulberry32) pour des tests reproductibles.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("createWorld", () => {
  it("crée 15 paires à 0 par défaut", () => {
    const w = createWorld(IDS);
    expect(Object.keys(w.scores)).toHaveLength(PAIR_COUNT);
    expect(PAIR_COUNT).toBe(15);
    expect(Object.values(w.scores).every((s) => s === 0)).toBe(true);
  });

  it("tire des scores initiaux bornés et reproductibles avec un rng", () => {
    const a = createWorld(IDS, { rng: seeded(42), spread: 10 });
    const b = createWorld(IDS, { rng: seeded(42), spread: 10 });
    expect(a.scores).toEqual(b.scores);
    const values = Object.values(a.scores);
    expect(values.every((s) => Math.abs(s) <= 10)).toBe(true);
    expect(values.some((s) => s !== 0)).toBe(true);
  });

  it("borne les scores initiaux même avec un spread énorme", () => {
    const w = createWorld(IDS, { rng: () => 0.999, spread: 1000 });
    expect(Object.values(w.scores).every((s) => s === MAX_SCORE)).toBe(true);
  });

  it("refuse un nombre de sims différent de six", () => {
    expect(() => createWorld(IDS.slice(0, 5))).toThrow();
    expect(() => createWorld([...IDS, "gus"])).toThrow();
  });

  it("refuse doublons et identifiants invalides", () => {
    expect(() => createWorld(["a", "a", "c", "d", "e", "f"])).toThrow(/double/);
    expect(() => createWorld(["a|b", "b", "c", "d", "e", "f"])).toThrow(/invalide/);
    expect(() => createWorld(["", "b", "c", "d", "e", "f"])).toThrow(/invalide/);
  });

  it("ne partage pas d'état avec le tableau d'entrée", () => {
    const ids = [...IDS];
    const w = createWorld(ids);
    ids[0] = "zed";
    expect(w.simIds[0]).toBe("ana");
  });
});

describe("getScore / pairKey", () => {
  it("est symétrique", () => {
    expect(pairKey("ana", "ben")).toBe(pairKey("ben", "ana"));
    const w = createWorld(IDS);
    applyEvent(w, "ana", "ben", "gift");
    expect(getScore(w, "ben", "ana")).toBe(getScore(w, "ana", "ben"));
  });

  it("refuse sim inconnu et auto-relation", () => {
    const w = createWorld(IDS);
    expect(() => getScore(w, "ana", "zed")).toThrow(/inconnu/);
    expect(() => getScore(w, "ana", "ana")).toThrow(/lui-même/);
  });
});

describe("applyEvent", () => {
  it("applique le delta de chaque type d'événement", () => {
    for (const type of Object.keys(EVENT_DELTAS) as EventType[]) {
      const w = createWorld(IDS);
      applyEvent(w, "ana", "ben", type);
      expect(getScore(w, "ana", "ben")).toBe(EVENT_DELTAS[type]);
    }
  });

  it("a conversation, compliment (positifs) et argument (négatif)", () => {
    expect(EVENT_DELTAS.conversation).toBeGreaterThan(0);
    expect(EVENT_DELTAS.compliment).toBeGreaterThan(0);
    expect(EVENT_DELTAS.argument).toBeLessThan(0);
  });

  it("n'affecte que la paire concernée", () => {
    const w = createWorld(IDS);
    applyEvent(w, "ana", "ben", "help");
    const touched = Object.entries(w.scores).filter(([, s]) => s !== 0);
    expect(touched).toEqual([[pairKey("ana", "ben"), EVENT_DELTAS.help]]);
  });

  it("cumule les événements, quel que soit l'ordre des sims", () => {
    const w = createWorld(IDS);
    applyEvent(w, "ana", "ben", "conversation");
    applyEvent(w, "ben", "ana", "argument");
    expect(getScore(w, "ana", "ben")).toBe(EVENT_DELTAS.conversation + EVENT_DELTAS.argument);
  });

  it("borne le score à [-100, 100]", () => {
    const w = createWorld(IDS);
    for (let i = 0; i < 20; i++) applyEvent(w, "ana", "ben", "gift");
    expect(getScore(w, "ana", "ben")).toBe(MAX_SCORE);
    for (let i = 0; i < 20; i++) applyEvent(w, "ana", "ben", "betrayal");
    expect(getScore(w, "ana", "ben")).toBe(MIN_SCORE);
  });

  it("rejette les entrées invalides sans modifier le monde", () => {
    const w = createWorld(IDS);
    const before = { ...w.scores };
    expect(() => applyEvent(w, "ana", "zed", "gift")).toThrow(/inconnu/);
    expect(() => applyEvent(w, "ana", "ana", "gift")).toThrow();
    expect(() => applyEvent(w, "ana", "ben", "nope" as EventType)).toThrow(/Événement/);
    expect(() => applyEvent(w, "ana", "ben", "toString" as EventType)).toThrow(/Événement/);
    expect(w.scores).toEqual(before);
  });
});

describe("tick (dérive vers zéro)", () => {
  const withScores = () => {
    const w = createWorld(IDS);
    w.scores[pairKey("ana", "ben")] = 80;
    w.scores[pairKey("ana", "chloe")] = -80;
    return w;
  };

  it("applique le taux par heure, dans les deux signes", () => {
    const w = withScores();
    tick(w, 1, 0.1);
    expect(getScore(w, "ana", "ben")).toBeCloseTo(72, 10);
    expect(getScore(w, "ana", "chloe")).toBeCloseTo(-72, 10);
  });

  it("ne change jamais le signe et rapproche toujours de zéro", () => {
    const w = withScores();
    for (let i = 0; i < 100; i++) {
      const before = Math.abs(getScore(w, "ana", "ben"));
      tick(w, 1);
      const after = getScore(w, "ana", "ben");
      expect(after).toBeGreaterThanOrEqual(0);
      expect(after).toBeLessThanOrEqual(before);
    }
    expect(getScore(w, "ana", "chloe")).toBeLessThanOrEqual(0);
  });

  it("est indépendante du pas de temps", () => {
    const one = withScores();
    const many = withScores();
    tick(one, 24, 0.05);
    for (let i = 0; i < 24; i++) tick(many, 1, 0.05);
    expect(getScore(many, "ana", "ben")).toBeCloseTo(getScore(one, "ana", "ben"), 8);
    const half = withScores();
    tick(half, 0.5, 0.05);
    tick(half, 0.5, 0.05);
    const full = withScores();
    tick(full, 1, 0.05);
    expect(getScore(half, "ana", "ben")).toBeCloseTo(getScore(full, "ana", "ben"), 10);
  });

  it("laisse les paires à 0 à 0 (sans -0) et 0 h sans effet", () => {
    const w = withScores();
    const before = { ...w.scores };
    tick(w, 0);
    expect(w.scores).toEqual(before);
    tick(w, 10);
    expect(Object.is(getScore(w, "dan", "eve"), 0)).toBe(true);
  });

  it("atteint exactement 0 sous le seuil epsilon", () => {
    const w = createWorld(IDS);
    w.scores[pairKey("ana", "ben")] = 5;
    w.scores[pairKey("ana", "chloe")] = -5;
    tick(w, 1000, 0.5);
    expect(Object.is(getScore(w, "ana", "ben"), 0)).toBe(true);
    expect(Object.is(getScore(w, "ana", "chloe"), 0)).toBe(true);
    expect(DRIFT_EPSILON).toBeGreaterThan(0);
  });

  it("est lente par défaut : un taux de 2 % par heure", () => {
    expect(DEFAULT_DRIFT_PER_HOUR).toBe(0.02);
    const w = withScores();
    tick(w, 1);
    expect(getScore(w, "ana", "ben")).toBeCloseTo(78.4, 10);
  });

  it("taux 0 : aucune dérive", () => {
    const w = withScores();
    tick(w, 500, 0);
    expect(getScore(w, "ana", "ben")).toBe(80);
  });

  it("rejette durée et taux invalides sans modifier le monde", () => {
    const w = withScores();
    for (const h of [-1, NaN, Infinity]) expect(() => tick(w, h)).toThrow(RangeError);
    for (const r of [-0.1, 1, 2, NaN]) expect(() => tick(w, 1, r)).toThrow(RangeError);
    expect(getScore(w, "ana", "ben")).toBe(80);
  });
});

describe("scénario sur plusieurs jours de jeu", () => {
  it("une amitié se construit, s'érode sans entretien, et une dispute la ternit", () => {
    const w = createWorld(IDS);

    // Jour 1 : trois conversations et un cadeau entre ana et ben.
    for (let i = 0; i < 3; i++) applyEvent(w, "ana", "ben", "conversation");
    applyEvent(w, "ben", "ana", "gift");
    const day1 = getScore(w, "ana", "ben");
    expect(day1).toBe(3 * EVENT_DELTAS.conversation + EVENT_DELTAS.gift); // 27

    // Jours 1 à 3 : 72 h sans contact, la relation s'érode lentement mais reste positive.
    tick(w, 72);
    const day4 = getScore(w, "ana", "ben");
    expect(day4).toBeCloseTo(day1 * (1 - DEFAULT_DRIFT_PER_HOUR) ** 72, 8);
    expect(day4).toBeGreaterThan(0);
    expect(day4).toBeLessThan(day1);

    // Jour 4 : dispute puis une insulte entre ana et chloe, déjà un peu amies.
    applyEvent(w, "ana", "chloe", "compliment");
    applyEvent(w, "ana", "chloe", "argument");
    applyEvent(w, "chloe", "ana", "insult");
    const fight = getScore(w, "ana", "chloe");
    expect(fight).toBe(EVENT_DELTAS.compliment + EVENT_DELTAS.argument + EVENT_DELTAS.insult);
    expect(fight).toBeLessThan(0);

    // Jours 4 à 14 : 10 jours de plus ; la rancune s'estompe vers 0 sans jamais passer positive.
    for (let h = 0; h < 240; h++) {
      tick(w, 1);
      expect(getScore(w, "ana", "chloe")).toBeLessThanOrEqual(0);
    }
    expect(Math.abs(getScore(w, "ana", "chloe"))).toBeLessThan(Math.abs(fight) / 2);
    expect(getScore(w, "ana", "ben")).toBeLessThan(day4);
    expect(getScore(w, "ana", "ben")).toBeGreaterThan(0);

    // Les paires non concernées sont restées à 0 et le classement d'ana est cohérent.
    expect(getScore(w, "dan", "eve")).toBe(0);
    const rel = getRelationsOf(w, "ana");
    expect(rel[0]?.other).toBe("ben");
    expect(rel.at(-1)?.other).toBe("chloe");
  });

  it("après des mois sans interaction, tout retombe à 0 exact", () => {
    const w = createWorld(IDS, { rng: seeded(3), spread: 50 });
    tick(w, 24 * 365);
    expect(Object.values(w.scores).every((s) => s === 0)).toBe(true);
  });
});

describe("getRelationsOf", () => {
  it("liste les cinq autres sims, triés par score décroissant", () => {
    const w = createWorld(IDS);
    applyEvent(w, "ana", "eve", "gift");
    applyEvent(w, "ana", "dan", "insult");
    const rel = getRelationsOf(w, "ana");
    expect(rel).toHaveLength(5);
    expect(rel[0]).toEqual({ other: "eve", score: EVENT_DELTAS.gift });
    expect(rel[4]).toEqual({ other: "dan", score: EVENT_DELTAS.insult });
    expect(rel.some((r) => r.other === "ana")).toBe(false);
  });

  it("refuse un sim inconnu", () => {
    expect(() => getRelationsOf(createWorld(IDS), "zed")).toThrow(/inconnu/);
  });
});

describe("sérialisation", () => {
  it("survit à un aller-retour JSON", () => {
    const w = createWorld(IDS, { rng: seeded(7) });
    applyEvent(w, "dan", "finn", "joke");
    const copy = JSON.parse(JSON.stringify(w));
    expect(copy).toEqual(w);
    expect(getScore(copy, "finn", "dan")).toBe(getScore(w, "dan", "finn"));
  });
});
