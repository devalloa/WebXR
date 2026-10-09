// Relations entre six sims : un score symétrique par paire, dans [-100, 100].
// Logique pure : aucune dépendance à Three.js, IWSDK ni au DOM.
// Le monde est un objet de données simple (sérialisable en JSON) ;
// les fonctions le modifient sur place pour éviter les allocations par frame.

export const SIM_COUNT = 6;
export const MIN_SCORE = -100;
export const MAX_SCORE = 100;
/** Nombre de paires non ordonnées entre six sims : 6 * 5 / 2. */
export const PAIR_COUNT = (SIM_COUNT * (SIM_COUNT - 1)) / 2;

/** Part du score perdue par heure de jeu (2 % : lent, ~34 h de demi-vie). */
export const DEFAULT_DRIFT_PER_HOUR = 0.02;
/** Sous cette valeur absolue, la dérive ramène le score à 0 pile. */
export const DRIFT_EPSILON = 0.01;
/** Amplitude max des scores initiaux quand un rng est fourni. */
export const DEFAULT_INITIAL_SPREAD = 20;

/** Variation de score de chaque type d'événement. */
export const EVENT_DELTAS = {
  conversation: 4,
  joke: 6,
  compliment: 8,
  help: 12,
  gift: 15,
  argument: -10,
  insult: -15,
  betrayal: -35,
} as const;

export type SimId = string;
export type EventType = keyof typeof EVENT_DELTAS;

export interface RelationsWorld {
  /** Les six identifiants, dans l'ordre de création. */
  readonly simIds: readonly SimId[];
  /** Score par paire, clé = pairKey(a, b). Toujours 15 entrées. */
  readonly scores: Record<string, number>;
}

export interface CreateOptions {
  /** Générateur dans [0, 1) ; s'il est fourni, scores initiaux aléatoires. */
  rng?: () => number;
  /** Amplitude des scores initiaux aléatoires (défaut 20). */
  spread?: number;
}

const SEP = "|";

const clamp = (v: number): number => Math.min(MAX_SCORE, Math.max(MIN_SCORE, v));

/** Clé canonique et symétrique d'une paire : pairKey(a, b) === pairKey(b, a). */
export function pairKey(a: SimId, b: SimId): string {
  return a < b ? `${a}${SEP}${b}` : `${b}${SEP}${a}`;
}

function assertPair(world: RelationsWorld, a: SimId, b: SimId): void {
  for (const id of [a, b]) {
    if (!world.simIds.includes(id)) throw new Error(`Sim inconnu : "${id}"`);
  }
  if (a === b) throw new Error(`Un sim ne peut pas avoir de relation avec lui-même : "${a}"`);
}

/** Crée le monde : 15 paires, à 0 par défaut, ou tirées autour de 0 avec `rng`. */
export function createWorld(simIds: readonly SimId[], options: CreateOptions = {}): RelationsWorld {
  if (simIds.length !== SIM_COUNT) {
    throw new Error(`Il faut exactement ${SIM_COUNT} sims, reçu ${simIds.length}`);
  }
  if (new Set(simIds).size !== SIM_COUNT) throw new Error("Identifiants de sims en double");
  for (const id of simIds) {
    if (id === "" || id.includes(SEP)) throw new Error(`Identifiant invalide : "${id}"`);
  }

  const { rng, spread = DEFAULT_INITIAL_SPREAD } = options;
  const scores: Record<string, number> = {};
  for (let i = 0; i < SIM_COUNT; i++) {
    for (let j = i + 1; j < SIM_COUNT; j++) {
      const initial = rng ? (rng() * 2 - 1) * spread : 0;
      scores[pairKey(simIds[i]!, simIds[j]!)] = clamp(initial);
    }
  }
  return { simIds: [...simIds], scores };
}

/** Score de la paire (symétrique). */
export function getScore(world: RelationsWorld, a: SimId, b: SimId): number {
  assertPair(world, a, b);
  return world.scores[pairKey(a, b)]!;
}

/** Applique un événement à la paire (a, b) ; le score reste borné. */
export function applyEvent(world: RelationsWorld, a: SimId, b: SimId, type: EventType): void {
  if (!Object.hasOwn(EVENT_DELTAS, type)) throw new Error(`Événement inconnu : "${type}"`);
  assertPair(world, a, b);
  const key = pairKey(a, b);
  world.scores[key] = clamp(world.scores[key]! + EVENT_DELTAS[type]);
}

/**
 * Fait passer `hours` heures de jeu : chaque score perd `ratePerHour` de sa
 * valeur par heure (décroissance exponentielle, donc indépendante du pas :
 * tick(w, 2) == tick(w, 1) deux fois). Ne change jamais le signe.
 */
export function tick(world: RelationsWorld, hours: number, ratePerHour = DEFAULT_DRIFT_PER_HOUR): void {
  if (!Number.isFinite(hours) || hours < 0) throw new RangeError(`Durée invalide : ${hours}`);
  if (!(ratePerHour >= 0 && ratePerHour < 1)) throw new RangeError(`Taux invalide : ${ratePerHour}`);
  if (hours === 0) return;

  const factor = (1 - ratePerHour) ** hours;
  for (const key of Object.keys(world.scores)) {
    const next = world.scores[key]! * factor;
    world.scores[key] = Math.abs(next) < DRIFT_EPSILON ? 0 : next;
  }
}

/** Relations d'un sim avec les cinq autres, de la meilleure à la pire. */
export function getRelationsOf(world: RelationsWorld, id: SimId): { other: SimId; score: number }[] {
  if (!world.simIds.includes(id)) throw new Error(`Sim inconnu : "${id}"`);
  return world.simIds
    .filter((other) => other !== id)
    .map((other) => ({ other, score: world.scores[pairKey(id, other)]! }))
    .sort((x, y) => y.score - x.score);
}
