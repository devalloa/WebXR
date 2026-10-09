# Grille d'évaluation — module `relations.ts` (grille de départ, à ajuster)

Livrable attendu dans `/mnt/session/outputs/` : `relations.ts`, `relations.test.ts`,
`README.md`, plus les fichiers de configuration nécessaires (`package.json`,
`tsconfig.json`).

Critères, chacun vérifiable indépendamment :

1. `relations.ts` exporte `createWorld(simIds: string[])`, `applyEvent(world, event)` et `tick(world, hours)`.
2. Le monde contient exactement six sims nommés (prénoms au choix) et un score de relation par paire, borné à l'intervalle [-100, +100].
3. Au moins trois types d'événements existent : `conversation` (positif), `compliment` (positif), `argument` (négatif), avec des deltas configurables dans un objet de paramètres exporté.
4. `tick(world, hours)` fait dériver chaque score vers 0 d'un taux par heure configurable, sans jamais dépasser 0 (un score positif ne devient pas négatif par dérive, et inversement).
5. Les relations sont symétriques : la relation A→B vaut toujours la relation B→A.
6. Aucune importation de `three`, de `@iwsdk/*` ni d'API du DOM ; zéro dépendance d'exécution dans `package.json` (devDependencies uniquement).
7. `relations.test.ts` (Vitest) couvre : les bornes, la symétrie, la dérive, et un scénario sur plusieurs jours de jeu.
8. `npx vitest run` passe et `npx tsc --noEmit` passe en mode `strict`.
9. `README.md` fait 20 lignes au maximum et décrit l'API publique.
10. Aucun texte provisoire, `TODO` ou section vide ne subsiste.
