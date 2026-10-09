# Grille d'évaluation — modules `persona.ts`, `emotions.ts`, `memory.ts` (grille de départ)

Contexte : le module `relations.ts` existant est fourni en lecture seule dans
`/mnt/inputs/relations.ts`. Il fixe les conventions (TypeScript strict, ES modules, logique
pure, monde JSON-sérialisable modifié sur place, erreur sans mutation sur entrée invalide,
commentaires courts en français). Les nouveaux modules doivent suivre les mêmes conventions
et peuvent copier `relations.ts` à côté d'eux pour l'importer dans les tests.

Livrable attendu dans `/mnt/session/outputs/` : `persona.ts`, `emotions.ts`, `memory.ts`,
leurs tests `*.test.ts`, `README.md`, plus `package.json` et `tsconfig.json`.

Critères, chacun vérifiable indépendamment :

1. `emotions.ts` exporte une liste `EMOTIONS` d'au moins cinq émotions (`joy`, `anger`, `sadness`, `fatigue`, `stress`), un type `Emotions` (valeurs dans [0, 1]), `createEmotions(initial?)`, `applyEmotionDeltas(emotions, deltas)` (résultat borné à [0, 1]) et `decayEmotions(emotions, hours, ratePerHour?)` : décroissance exponentielle vers une valeur de repos configurable par émotion (0 par défaut), indépendante du pas de temps, sans jamais dépasser la valeur de repos.
2. `memory.ts` exporte `MemoryEntry` (`atHour`, `text`, `importance` dans [0, 1], `participants: string[]`), `Memory` (`core: string[]`, `recent: MemoryEntry[]`, `maxRecent`), `createMemory(maxRecent?)`, `remember(memory, entry)` (élague les entrées les moins importantes et les plus anciennes au-delà de `maxRecent`), `recall(memory, {participants?, nowHour, limit})` (trie par importance et récence combinées) et `consolidate(memory, summarize, nowHour)` où `summarize: (entries: MemoryEntry[]) => string[]` est une fonction injectée (aucun appel réseau dans le module) : ses résultats vont dans `core`, les entrées consolidées sont retirées de `recent`.
3. `persona.ts` exporte `Persona` (`id`, `identity: {name, age, job, home}`, `backstory: string`, `traits: Record<string, number>` dans [0, 1], `emotions: Emotions`, `memory: Memory`) et `createPersona(input)` qui valide les bornes et lève une erreur explicite en cas d'entrée invalide.
4. `persona.ts` exporte aussi `interact(world, a, b, outcome, nowHour)` qui, en un seul appel, applique un événement de relation (`relations.ts`), des deltas d'émotions aux deux personas et enregistre un souvenir chez chacun ; `outcome` est un objet `{relationEvent, emotionDeltasA, emotionDeltasB, memoryText, importance}` (la forme de ce que renverra plus tard l'IA).
5. Aucune importation de `three`, de `@iwsdk/*`, du DOM ni d'un module réseau ; zéro dépendance d'exécution dans `package.json` (devDependencies uniquement) ; toutes les structures sont sérialisables en JSON.
6. Les tests Vitest couvrent : bornes des émotions, dérive vers la valeur de repos, élagage de la mémoire, ordre de `recall`, consolidation avec un `summarize` factice, validation de `createPersona`, et un scénario sur plusieurs jours de jeu avec deux personas qui interagissent (relation, émotions et mémoire évoluent ensemble).
7. `npx vitest run` passe et `npx tsc --noEmit` passe en mode `strict`.
8. `README.md` fait 30 lignes au maximum et décrit l'API publique des trois modules.
9. Aucun texte provisoire, `TODO` ou section vide ne subsiste.
