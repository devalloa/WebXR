// Mémoire d'un sim : un noyau de souvenirs consolidés (`core`) et un tampon borné
// de souvenirs récents. Logique pure, sans réseau : le résumé est une fonction injectée.
// Les fonctions modifient la mémoire sur place ; en cas d'entrée invalide, erreur sans mutation.

export interface MemoryEntry {
  /** Heure de jeu de l'événement. */
  atHour: number;
  text: string;
  /** Importance dans [0, 1]. */
  importance: number;
  /** Identifiants des sims concernés. */
  participants: string[];
}

export interface Memory {
  /** Souvenirs consolidés, durables. */
  core: string[];
  /** Souvenirs récents, dans l'ordre d'insertion ; au plus `maxRecent`. */
  recent: MemoryEntry[];
  maxRecent: number;
}

export interface RecallQuery {
  /** Si fourni, ne garde que les souvenirs impliquant tous ces sims. */
  participants?: string[];
  nowHour: number;
  limit: number;
}

export type Summarize = (entries: MemoryEntry[]) => string[];

export const DEFAULT_MAX_RECENT = 20;
/** Demi-vie de la récence, en heures de jeu. */
export const RECENCY_HALF_LIFE_HOURS = 24;
/** Poids de l'importance dans le score de rappel ; le reste va à la récence. */
export const IMPORTANCE_WEIGHT = 0.6;
/** Âge minimal (heures) d'un souvenir pour être consolidé par défaut. */
export const DEFAULT_MIN_AGE_HOURS = 24;

export function createMemory(maxRecent = DEFAULT_MAX_RECENT): Memory {
  if (!Number.isInteger(maxRecent) || maxRecent < 1) throw new RangeError(`maxRecent invalide : ${maxRecent}`);
  return { core: [], recent: [], maxRecent };
}

/** Lève une erreur si l'entrée n'est pas un souvenir valide. */
export function assertMemoryEntry(entry: MemoryEntry): void {
  if (typeof entry !== "object" || entry === null) throw new TypeError("Souvenir invalide");
  if (!Number.isFinite(entry.atHour)) throw new RangeError(`atHour invalide : ${entry.atHour}`);
  if (typeof entry.text !== "string" || entry.text.trim() === "") throw new Error("Texte de souvenir vide");
  if (!(entry.importance >= 0 && entry.importance <= 1)) throw new RangeError(`Importance hors de [0, 1] : ${entry.importance}`);
  if (!Array.isArray(entry.participants) || entry.participants.some((p) => typeof p !== "string")) {
    throw new TypeError("participants doit être un tableau de chaînes");
  }
}

/** Ajoute un souvenir (copié) ; au-delà de `maxRecent`, retire les moins importants, puis les plus anciens. */
export function remember(memory: Memory, entry: MemoryEntry): void {
  assertMemoryEntry(entry);
  memory.recent.push({ ...entry, participants: [...entry.participants] });
  const excess = memory.recent.length - memory.maxRecent;
  if (excess <= 0) return;

  // Du plus jetable au plus précieux : importance croissante, puis plus ancien d'abord.
  const doomed = memory.recent
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.importance - y.e.importance || x.e.atHour - y.e.atHour || x.i - y.i)
    .slice(0, excess)
    .map((x) => x.e);
  memory.recent = memory.recent.filter((e) => !doomed.includes(e));
}

/** Score de rappel : importance et récence (décroissance exponentielle) combinées. */
function recallScore(entry: MemoryEntry, nowHour: number): number {
  const age = Math.max(0, nowHour - entry.atHour);
  const recency = 0.5 ** (age / RECENCY_HALF_LIFE_HOURS);
  return IMPORTANCE_WEIGHT * entry.importance + (1 - IMPORTANCE_WEIGHT) * recency;
}

/** Souvenirs récents les plus pertinents d'abord (importance + récence), au plus `limit`. Ne modifie rien. */
export function recall(memory: Memory, query: RecallQuery): MemoryEntry[] {
  const { participants, nowHour, limit } = query;
  if (!Number.isFinite(nowHour)) throw new RangeError(`nowHour invalide : ${nowHour}`);
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`limit invalide : ${limit}`);

  return memory.recent
    .filter((e) => !participants || participants.every((p) => e.participants.includes(p)))
    .map((e) => ({ e, score: recallScore(e, nowHour) }))
    .sort((x, y) => y.score - x.score || y.e.atHour - x.e.atHour)
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * Résume les souvenirs récents d'au moins `minAgeHours` via `summarize` (injecté, sans réseau).
 * Les résumés vont dans `core`, les entrées consolidées quittent `recent`. Renvoie les résumés ajoutés.
 * Si `summarize` échoue ou renvoie n'importe quoi, la mémoire reste intacte.
 */
export function consolidate(
  memory: Memory,
  summarize: Summarize,
  nowHour: number,
  minAgeHours = DEFAULT_MIN_AGE_HOURS,
): string[] {
  if (!Number.isFinite(nowHour)) throw new RangeError(`nowHour invalide : ${nowHour}`);
  if (!(minAgeHours >= 0)) throw new RangeError(`minAgeHours invalide : ${minAgeHours}`);

  const old = memory.recent.filter((e) => nowHour - e.atHour >= minAgeHours);
  if (old.length === 0) return [];

  const summaries = summarize(old.map((e) => ({ ...e, participants: [...e.participants] })));
  if (!Array.isArray(summaries) || summaries.some((s) => typeof s !== "string" || s.trim() === "")) {
    throw new TypeError("summarize doit renvoyer un tableau de chaînes non vides");
  }
  memory.core.push(...summaries);
  memory.recent = memory.recent.filter((e) => !old.includes(e));
  return summaries;
}
