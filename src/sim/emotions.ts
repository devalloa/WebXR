// Émotions d'un sim : cinq jauges dans [0, 1] qui reviennent vers une valeur de repos.
// Logique pure, sans dépendance ; les fonctions modifient l'objet sur place
// (et le renvoient pour chaîner), comme relations.ts.

export const EMOTIONS = ["joy", "anger", "sadness", "fatigue", "stress"] as const;

export type Emotion = (typeof EMOTIONS)[number];
/** Valeurs dans [0, 1], une par émotion (objet simple, sérialisable en JSON). */
export type Emotions = Record<Emotion, number>;
/** Variations (positives ou négatives) à appliquer, émotions omises = 0. */
export type EmotionDeltas = Partial<Record<Emotion, number>>;

/** Valeur de repos par défaut : 0 pour toutes les émotions. */
export const DEFAULT_REST: Readonly<Emotions> = { joy: 0, anger: 0, sadness: 0, fatigue: 0, stress: 0 };
/** Part de l'écart au repos perdue par heure de jeu, par émotion. */
export const DEFAULT_DECAY_PER_HOUR: Readonly<Emotions> = {
  joy: 0.1,
  anger: 0.2,
  sadness: 0.08,
  fatigue: 0.05,
  stress: 0.12,
};
/** Sous cet écart au repos, la décroissance ramène la valeur au repos pile. */
export const DECAY_EPSILON = 0.001;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const isEmotion = (key: string): key is Emotion => (EMOTIONS as readonly string[]).includes(key);

/** Vérifie que `values` ne contient que des émotions connues, avec des nombres finis. */
function assertKnownFinite(values: Record<string, unknown>, label: string): void {
  for (const [key, v] of Object.entries(values)) {
    if (!isEmotion(key)) throw new Error(`Émotion inconnue : "${key}"`);
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`${label} invalide pour "${key}" : ${String(v)}`);
  }
}

/** Crée des émotions à 0, avec des valeurs initiales optionnelles dans [0, 1]. */
export function createEmotions(initial: Partial<Emotions> = {}): Emotions {
  assertKnownFinite(initial, "Valeur");
  const emotions = { joy: 0, anger: 0, sadness: 0, fatigue: 0, stress: 0 };
  for (const e of EMOTIONS) {
    const v = initial[e] ?? 0;
    if (v < 0 || v > 1) throw new RangeError(`Valeur hors de [0, 1] pour "${e}" : ${v}`);
    emotions[e] = v;
  }
  return emotions;
}

/** Lève une erreur si `deltas` est invalide (aucune mutation, utile pour valider avant d'agir). */
export function assertEmotionDeltas(deltas: EmotionDeltas): void {
  if (typeof deltas !== "object" || deltas === null) throw new TypeError("Deltas d'émotions invalides");
  assertKnownFinite(deltas, "Delta");
}

/** Ajoute les deltas ; chaque émotion reste bornée à [0, 1]. */
export function applyEmotionDeltas(emotions: Emotions, deltas: EmotionDeltas): Emotions {
  assertEmotionDeltas(deltas);
  for (const e of EMOTIONS) {
    emotions[e] = clamp01(emotions[e] + (deltas[e] ?? 0));
  }
  return emotions;
}

/**
 * Fait passer `hours` heures : chaque émotion se rapproche de sa valeur de repos
 * en décroissance exponentielle (indépendante du pas : 2 h == 1 h deux fois).
 * `ratePerHour` est un nombre commun ou un taux par émotion (part de l'écart perdue
 * par heure, dans [0, 1)). Ne dépasse jamais le repos, par le haut comme par le bas.
 */
export function decayEmotions(
  emotions: Emotions,
  hours: number,
  ratePerHour: number | Partial<Emotions> = DEFAULT_DECAY_PER_HOUR,
  rest: Partial<Emotions> = DEFAULT_REST,
): Emotions {
  if (!Number.isFinite(hours) || hours < 0) throw new RangeError(`Durée invalide : ${hours}`);
  const rates: Partial<Emotions> =
    typeof ratePerHour === "number" ? { joy: ratePerHour, anger: ratePerHour, sadness: ratePerHour, fatigue: ratePerHour, stress: ratePerHour } : ratePerHour;
  assertKnownFinite(rates, "Taux");
  assertKnownFinite(rest, "Repos");
  for (const e of EMOTIONS) {
    const rate = rates[e] ?? DEFAULT_DECAY_PER_HOUR[e];
    const target = rest[e] ?? DEFAULT_REST[e];
    if (!(rate >= 0 && rate < 1)) throw new RangeError(`Taux invalide pour "${e}" : ${rate}`);
    if (target < 0 || target > 1) throw new RangeError(`Repos hors de [0, 1] pour "${e}" : ${target}`);
  }
  if (hours === 0) return emotions;

  for (const e of EMOTIONS) {
    const rate = rates[e] ?? DEFAULT_DECAY_PER_HOUR[e];
    const target = rest[e] ?? DEFAULT_REST[e];
    const gap = (emotions[e] - target) * (1 - rate) ** hours;
    emotions[e] = Math.abs(gap) < DECAY_EPSILON ? target : clamp01(target + gap);
  }
  return emotions;
}
