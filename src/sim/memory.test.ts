import { describe, expect, it } from "vitest";
import { consolidate, createMemory, recall, remember, type MemoryEntry } from "./memory";

const entry = (atHour: number, importance: number, text = `t${atHour}`, participants = ["a", "b"]): MemoryEntry => ({
  atHour,
  text,
  importance,
  participants,
});

describe("memory", () => {
  it("createMemory valide maxRecent", () => {
    expect(createMemory(3)).toEqual({ core: [], recent: [], maxRecent: 3 });
    expect(() => createMemory(0)).toThrow(RangeError);
  });

  it("remember copie l'entrée et refuse les entrées invalides sans mutation", () => {
    const m = createMemory();
    const e = entry(1, 0.5);
    remember(m, e);
    e.participants.push("z");
    expect(m.recent[0]!.participants).toEqual(["a", "b"]);
    expect(() => remember(m, entry(2, 1.5))).toThrow(RangeError);
    expect(() => remember(m, entry(NaN, 0.5))).toThrow(RangeError);
    expect(() => remember(m, entry(2, 0.5, " "))).toThrow();
    expect(m.recent).toHaveLength(1);
  });

  it("élague les moins importants au-delà de maxRecent", () => {
    const m = createMemory(3);
    remember(m, entry(1, 0.9));
    remember(m, entry(2, 0.1));
    remember(m, entry(3, 0.5));
    remember(m, entry(4, 0.7));
    expect(m.recent.map((e) => e.atHour)).toEqual([1, 3, 4]);
  });

  it("à importance égale, élague le plus ancien", () => {
    const m = createMemory(2);
    remember(m, entry(5, 0.5));
    remember(m, entry(1, 0.5));
    remember(m, entry(9, 0.5));
    expect(m.recent.map((e) => e.atHour)).toEqual([5, 9]);
  });

  it("recall trie par importance et récence combinées", () => {
    const m = createMemory(10);
    remember(m, entry(0, 1, "ancien mais capital"));
    remember(m, entry(95, 0.3, "récent mineur"));
    remember(m, entry(90, 0.8, "récent important"));
    remember(m, entry(10, 0.2, "ancien mineur"));
    const texts = recall(m, { nowHour: 100, limit: 10 }).map((e) => e.text);
    expect(texts).toEqual(["récent important", "ancien mais capital", "récent mineur", "ancien mineur"]);
    expect(recall(m, { nowHour: 100, limit: 2 })).toHaveLength(2);
    expect(recall(m, { nowHour: 100, limit: 0 })).toEqual([]);
  });

  it("recall filtre par participants, sans modifier la mémoire", () => {
    const m = createMemory(10);
    remember(m, entry(1, 0.5, "ab", ["a", "b"]));
    remember(m, entry(2, 0.9, "ac", ["a", "c"]));
    const before = JSON.stringify(m);
    expect(recall(m, { participants: ["c"], nowHour: 3, limit: 5 }).map((e) => e.text)).toEqual(["ac"]);
    expect(recall(m, { participants: ["a", "b"], nowHour: 3, limit: 5 }).map((e) => e.text)).toEqual(["ab"]);
    expect(recall(m, { participants: ["z"], nowHour: 3, limit: 5 })).toEqual([]);
    expect(JSON.stringify(m)).toBe(before);
    expect(() => recall(m, { nowHour: 3, limit: -1 })).toThrow(RangeError);
  });

  it("consolidate : résumés dans core, entrées consolidées retirées de recent", () => {
    const m = createMemory(10);
    remember(m, entry(0, 0.5, "vieux 1"));
    remember(m, entry(5, 0.5, "vieux 2"));
    remember(m, entry(60, 0.5, "frais"));
    const seen: string[][] = [];
    const summarize = (entries: MemoryEntry[]): string[] => {
      seen.push(entries.map((e) => e.text));
      return [`résumé de ${entries.length} souvenirs`];
    };
    const added = consolidate(m, summarize, 72);
    expect(seen).toEqual([["vieux 1", "vieux 2"]]);
    expect(added).toEqual(["résumé de 2 souvenirs"]);
    expect(m.core).toEqual(["résumé de 2 souvenirs"]);
    expect(m.recent.map((e) => e.text)).toEqual(["frais"]);
  });

  it("consolidate : rien à résumer = summarize non appelé ; résultat invalide = mémoire intacte", () => {
    const m = createMemory(10);
    remember(m, entry(70, 0.5));
    let calls = 0;
    consolidate(m, () => (calls++, ["x"]), 72);
    expect(calls).toBe(0);
    const before = JSON.stringify(m);
    expect(() => consolidate(m, () => [""], 200)).toThrow(TypeError);
    expect(() => consolidate(m, () => { throw new Error("IA indisponible"); }, 200)).toThrow("IA indisponible");
    expect(JSON.stringify(m)).toBe(before);
  });
});
