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
