import { describe, expect, it } from "vitest";
import { createWorld, getScore, tick } from "./relations";
import { decayEmotions } from "./emotions";
import { consolidate, recall, type MemoryEntry } from "./memory";
import { createPersona, interact, type InteractionOutcome, type PersonaInput } from "./persona";

const input = (id: string, name = id): PersonaInput => ({
  id,
  identity: { name, age: 30, job: "boulanger", home: "12 rue des Lilas" },
  backstory: "Vit ici depuis l'enfance.",
  traits: { openness: 0.7, temper: 0.2 },
});

const ids = ["ana", "ben", "cam", "dia", "eli", "fay"];

describe("createPersona", () => {
  it("crée un persona complet, sérialisable en JSON", () => {
    const p = createPersona({ ...input("ana"), emotions: { joy: 0.5 }, maxRecent: 5 });
    expect(p.emotions.joy).toBe(0.5);
    expect(p.memory).toEqual({ core: [], recent: [], maxRecent: 5 });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("copie les traits (pas d'aliasing avec l'entrée)", () => {
    const i = input("ana");
    const p = createPersona(i);
    i.traits!.temper = 0.9;
    expect(p.traits.temper).toBe(0.2);
  });

  it.each([
    ["id vide", { ...input(""), id: "" }, /id/],
    ["nom vide", { ...input("a"), identity: { name: "", age: 30, job: "x", home: "y" } }, /name/],
    ["métier manquant", { ...input("a"), identity: { name: "A", age: 30, home: "y" } as never }, /job/],
    ["âge négatif", { ...input("a"), identity: { name: "A", age: -1, job: "x", home: "y" } }, /âge/],
    ["âge non entier", { ...input("a"), identity: { name: "A", age: 3.5, job: "x", home: "y" } }, /âge/],
    ["trait > 1", { ...input("a"), traits: { kind: 1.1 } }, /kind/],
    ["trait NaN", { ...input("a"), traits: { kind: NaN } }, /kind/],
    ["émotion hors bornes", { ...input("a"), emotions: { joy: 2 } }, /joy/],
    ["maxRecent invalide", { ...input("a"), maxRecent: 0 }, /maxRecent/],
  ] as [string, PersonaInput, RegExp][])("refuse : %s", (_label, bad, message) => {
    expect(() => createPersona(bad)).toThrow(message);
  });
});

describe("interact", () => {
  const outcome: InteractionOutcome = {
    relationEvent: "compliment",
    emotionDeltasA: { joy: 0.2 },
    emotionDeltasB: { joy: 0.3, stress: -0.1 },
    memoryText: "Ana a complimenté Ben sur son pain.",
    importance: 0.4,
  };

  it("applique relation, émotions et souvenirs d'un coup", () => {
    const world = createWorld(ids);
    const a = createPersona(input("ana"));
    const b = createPersona(input("ben"));
    interact(world, a, b, outcome, 8);
    expect(getScore(world, "ana", "ben")).toBe(8);
    expect(a.emotions.joy).toBeCloseTo(0.2);
    expect(b.emotions.joy).toBeCloseTo(0.3);
    expect(a.memory.recent).toEqual([{ atHour: 8, text: outcome.memoryText, importance: 0.4, participants: ["ana", "ben"] }]);
    expect(b.memory.recent).toHaveLength(1);
    expect(a.memory.recent[0]!.participants).not.toBe(b.memory.recent[0]!.participants);
  });

  it("entrée invalide : erreur sans aucune mutation", () => {
    const world = createWorld(ids);
    const a = createPersona(input("ana"));
    const b = createPersona(input("ben"));
    const snapshot = JSON.stringify([world, a, b]);
    const bads: unknown[] = [
      { ...outcome, relationEvent: "hug" },
      { ...outcome, emotionDeltasB: { rage: 1 } },
      { ...outcome, importance: 2 },
      { ...outcome, memoryText: "" },
    ];
    for (const bad of bads) expect(() => interact(world, a, b, bad as InteractionOutcome, 1)).toThrow();
    expect(() => interact(world, a, a, outcome, 1)).toThrow(/lui-même/);
    expect(() => interact(world, a, createPersona(input("zed")), outcome, 1)).toThrow(/inconnu/);
    expect(() => interact(world, a, b, outcome, NaN)).toThrow();
    expect(JSON.stringify([world, a, b])).toBe(snapshot);
  });
});

describe("scénario sur plusieurs jours", () => {
  it("relation, émotions et mémoire évoluent ensemble", () => {
    const world = createWorld(ids);
    const ana = createPersona({ ...input("ana"), maxRecent: 4 });
    const ben = createPersona({ ...input("ben"), maxRecent: 4 });
    const summarize = (entries: MemoryEntry[]): string[] => [`${entries.length} échanges mémorables`];

    // Jour 1 : dispute, tension, souvenir fort.
    interact(world, ana, ben, {
      relationEvent: "argument",
      emotionDeltasA: { anger: 0.7, stress: 0.4 },
      emotionDeltasB: { anger: 0.5, sadness: 0.3 },
      memoryText: "Dispute au marché.",
      importance: 0.9,
    }, 10);
    const afterFight = getScore(world, "ana", "ben");
    expect(afterFight).toBe(-10);
    expect(ana.emotions.anger).toBeCloseTo(0.7);

    // Jours 2-3 : le temps passe, la colère retombe, la rancune s'estompe.
    const pass = (hours: number): void => {
      tick(world, hours);
      decayEmotions(ana.emotions, hours);
      decayEmotions(ben.emotions, hours);
    };
    pass(30);
    expect(ana.emotions.anger).toBeLessThan(0.01);
    expect(getScore(world, "ana", "ben")).toBeGreaterThan(afterFight);
    expect(getScore(world, "ana", "ben")).toBeLessThan(0);

    // Jour 3 : réconciliation, puis plusieurs échanges amicaux.
    const friendly = (text: string, at: number, importance: number): void =>
      interact(world, ana, ben, {
        relationEvent: "conversation",
        emotionDeltasA: { joy: 0.3 },
        emotionDeltasB: { joy: 0.3, sadness: -0.2 },
        memoryText: text,
        importance,
      }, at);
    interact(world, ana, ben, {
      relationEvent: "gift",
      emotionDeltasA: { joy: 0.4 },
      emotionDeltasB: { joy: 0.6, sadness: -0.5 },
      memoryText: "Ana offre une brioche en s'excusant.",
      importance: 0.8,
    }, 40);
    const afterGift = getScore(world, "ana", "ben");
    expect(afterGift).toBeGreaterThan(0);
    for (let day = 3; day <= 5; day++) {
      friendly(`Discussion du jour ${day}`, day * 24, 0.2);
      pass(24);
    }

    // Relation devenue positive, émotions bornées, mémoire élaguée mais le fort souvenir tient.
    expect(getScore(world, "ana", "ben")).toBeGreaterThan(0);
    for (const p of [ana, ben]) {
      for (const v of Object.values(p.emotions)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
      expect(p.memory.recent.length).toBeLessThanOrEqual(4);
    }
    expect(ana.memory.recent.map((e) => e.text)).toContain("Dispute au marché.");
    expect(recall(ana.memory, { participants: ["ben"], nowHour: 144, limit: 1 })[0]!.importance).toBeGreaterThan(0.5);

    // Consolidation : les vieux souvenirs partent dans le noyau, de façon indépendante par persona.
    consolidate(ana.memory, summarize, 144);
    expect(ana.memory.core.length).toBe(1);
    expect(ben.memory.core).toEqual([]);
    expect(ana.memory.recent.every((e) => 144 - e.atHour < 24)).toBe(true);
    expect(JSON.parse(JSON.stringify([world, ana, ben]))).toEqual([world, ana, ben]);
  });
});
