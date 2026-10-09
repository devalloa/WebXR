// Routine quotidienne d'un sim : à quelle heure il dort, travaille, flâne.
// Logique pure et déterministe : chaque sim a un décalage personnel (dérivé de son id)
// pour que les six ne bougent pas tous à la même seconde.

export type Activity = "sleep" | "commute" | "work" | "leisure" | "home";
export type Place = "home" | "work" | "plaza";

export interface ScheduleSlot {
  activity: Activity;
  /** Lieu où le sim doit se trouver (ou se rendre) pendant ce créneau. */
  place: Place;
}

/** Journée type (heures de jeu), avant décalage personnel. */
export const DEFAULT_DAY: readonly { from: number; activity: Activity; place: Place }[] = [
  { from: 0, activity: "sleep", place: "home" },
  { from: 7, activity: "commute", place: "plaza" }, // petit détour par la place avant le travail
  { from: 9, activity: "work", place: "work" },
  { from: 17, activity: "leisure", place: "plaza" },
  { from: 21, activity: "home", place: "home" },
];

/** Décalage personnel dans [-1, +1] heure, stable pour un id donné. */
export function personalOffsetHours(simId: string): number {
  let h = 2166136261;
  for (let i = 0; i < simId.length; i++) h = Math.imul(h ^ simId.charCodeAt(i), 16777619) >>> 0;
  return ((h % 2001) / 1000 - 1) * 1; // -1.000 … +1.000
}

/** Créneau actif pour un sim à une heure de jeu donnée (0 ≤ hour < 24, fractionnaire). */
export function scheduleFor(simId: string, hour: number): ScheduleSlot {
  if (!Number.isFinite(hour)) throw new RangeError(`Heure invalide : ${hour}`);
  const local = (((hour - personalOffsetHours(simId)) % 24) + 24) % 24;
  let slot = DEFAULT_DAY[0]!;
  for (const s of DEFAULT_DAY) if (local >= s.from) slot = s;
  return { activity: slot.activity, place: slot.place };
}
