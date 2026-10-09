// Persona d'un sim : identité, traits, émotions et mémoire, plus `interact` qui fait évoluer
// relation, émotions et souvenirs ensemble. Logique pure, sans réseau ; données JSON-sérialisables.

import { applyEvent, EVENT_DELTAS, type EventType, type RelationsWorld } from "./relations";
import { assertEmotionDeltas, createEmotions, applyEmotionDeltas, type EmotionDeltas, type Emotions } from "./emotions";
import { assertMemoryEntry, createMemory, remember, type Memory } from "./memory";

export interface Identity {
  name: string;
  age: number;
  job: string;
  home: string;
}

export interface Persona {
  id: string;
  identity: Identity;
  backstory: string;
  /** Traits de caractère, chacun dans [0, 1]. */
  traits: Record<string, number>;
  emotions: Emotions;
  memory: Memory;
}

export interface PersonaInput {
  id: string;
  identity: Identity;
  backstory?: string;
  traits?: Record<string, number>;
  /** Émotions initiales (0 par défaut). */
  emotions?: Partial<Emotions>;
  /** Taille du tampon de souvenirs récents. */
  maxRecent?: number;
}

/** Résultat d'une interaction (la forme que renverra l'IA). */
export interface InteractionOutcome {
  relationEvent: EventType;
  emotionDeltasA: EmotionDeltas;
  emotionDeltasB: EmotionDeltas;
  memoryText: string;
  importance: number;
}

const isNonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Crée un persona après validation ; erreur explicite si une entrée est invalide. */
export function createPersona(input: PersonaInput): Persona {
  if (typeof input !== "object" || input === null) throw new TypeError("Entrée de persona invalide");
  const { id, identity, backstory = "", traits = {}, emotions, maxRecent } = input;

  if (!isNonEmpty(id)) throw new Error("Persona : id vide ou invalide");
  if (typeof identity !== "object" || identity === null) throw new Error(`Persona "${id}" : identité manquante`);
  for (const field of ["name", "job", "home"] as const) {
    if (!isNonEmpty(identity[field])) throw new Error(`Persona "${id}" : identity.${field} vide ou invalide`);
  }
  if (!Number.isInteger(identity.age) || identity.age < 0 || identity.age > 130) {
    throw new RangeError(`Persona "${id}" : âge invalide (${identity.age})`);
  }
  if (typeof backstory !== "string") throw new TypeError(`Persona "${id}" : backstory doit être une chaîne`);
  for (const [trait, v] of Object.entries(traits)) {
    if (typeof v !== "number" || !(v >= 0 && v <= 1)) {
      throw new RangeError(`Persona "${id}" : trait "${trait}" hors de [0, 1] (${String(v)})`);
    }
  }

  return {
    id,
    identity: { name: identity.name, age: identity.age, job: identity.job, home: identity.home },
    backstory,
    traits: { ...traits },
    emotions: createEmotions(emotions),
    memory: createMemory(maxRecent),
  };
}

/**
 * Applique en un appel : l'événement de relation, les deltas d'émotions de a et b,
 * et un souvenir chez chacun. Tout est validé avant la première modification.
 */
export function interact(
  world: RelationsWorld,
  a: Persona,
  b: Persona,
  outcome: InteractionOutcome,
  nowHour: number,
): void {
  for (const p of [a, b]) {
    if (!world.simIds.includes(p.id)) throw new Error(`Sim inconnu : "${p.id}"`);
  }
  if (a.id === b.id) throw new Error(`Un persona ne peut pas interagir avec lui-même : "${a.id}"`);
  if (!Object.hasOwn(EVENT_DELTAS, outcome.relationEvent)) {
    throw new Error(`Événement inconnu : "${outcome.relationEvent}"`);
  }
  assertEmotionDeltas(outcome.emotionDeltasA);
  assertEmotionDeltas(outcome.emotionDeltasB);
  const participants = [a.id, b.id];
  const entry = { atHour: nowHour, text: outcome.memoryText, importance: outcome.importance, participants };
  assertMemoryEntry(entry);

  applyEvent(world, a.id, b.id, outcome.relationEvent);
  applyEmotionDeltas(a.emotions, outcome.emotionDeltasA);
  applyEmotionDeltas(b.emotions, outcome.emotionDeltasB);
  remember(a.memory, entry);
  remember(b.memory, entry);
}
