# relations.ts

Relations entre six sims : un score par paire, des événements, une dérive lente vers 0.
Logique pure (ni Three.js, ni IWSDK, ni DOM), zéro dépendance d'exécution.

- `createWorld(simIds, { rng?, spread? })` : exactement 6 sims → 15 paires à 0 (ou tirées autour de 0 avec `rng`).
- `applyEvent(world, a, b, type)` : ajoute `EVENT_DELTAS[type]` au score de la paire, borné à [-100, 100].
- `tick(world, hours, ratePerHour = 0.02)` : chaque score perd 2 %/h par défaut (exponentiel, indépendant du pas, signe conservé, 0 exact sous 0,01).
- `getScore(world, a, b)` (symétrique), `getRelationsOf(world, id)`, `pairKey(a, b)`.

Événements : `conversation` +4, `joke` +6, `compliment` +8, `help` +12, `gift` +15,
`argument` −10, `insult` −15, `betrayal` −35 (table `EVENT_DELTAS`).

Le monde est un objet JSON-sérialisable, modifié sur place. Entrée invalide
(sim inconnu, auto-relation, type, durée ou taux) : exception, monde intact.

```sh
npm install && npx tsc --noEmit && npx vitest run
```
# Systèmes de jeu : émotions, mémoire, persona

Logique pure (TypeScript strict, ES modules, zéro dépendance d'exécution, aucun réseau).
Données JSON-sérialisables, modifiées sur place ; entrée invalide = erreur sans mutation.
S'appuie sur `relations.ts` (copie en lecture seule). `npm test` et `npm run typecheck`.

## emotions.ts
- `EMOTIONS` (joy, anger, sadness, fatigue, stress), types `Emotions` (valeurs dans [0, 1]), `EmotionDeltas`.
- `createEmotions(initial?)`, `applyEmotionDeltas(e, deltas)` : résultat borné à [0, 1].
- `decayEmotions(e, hours, ratePerHour?, rest?)` : décroissance exponentielle vers le repos
  (0 par défaut, configurable par émotion), indépendante du pas, sans dépasser le repos.

## memory.ts
- `createMemory(maxRecent?)` → `{ core, recent, maxRecent }` ; `MemoryEntry` = `{ atHour, text, importance, participants }`.
- `remember(m, entry)` : élague les moins importants, puis les plus anciens, au-delà de `maxRecent`.
- `recall(m, { participants?, nowHour, limit })` : tri par importance (60 %) et récence (demi-vie 24 h).
- `consolidate(m, summarize, nowHour, minAgeHours = 24)` : `summarize(entries) → string[]` injecté ;
  résumés ajoutés à `core`, entrées consolidées retirées de `recent`.

## persona.ts
- `createPersona({ id, identity, backstory?, traits?, emotions?, maxRecent? })` : valide les bornes, erreur explicite.
- `interact(world, a, b, outcome, nowHour)` : `outcome = { relationEvent, emotionDeltasA, emotionDeltasB,
  memoryText, importance }` ; applique relation, émotions et souvenir chez les deux personas, tout validé avant mutation.
