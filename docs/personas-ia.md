# Personas pilotés par l'IA — architecture cible (brouillon)

Six sims « actifs » ont chacun une identité, une histoire, une fiche personnelle, des
paramètres relationnels (envers les cinq autres), des paramètres émotionnels et une mémoire.
Tout cela évolue au fil des conversations, sous le contrôle de Claude.

## Deux usages distincts de l'API Claude (et du crédit)

| | Pendant le développement | Pendant le jeu |
|---|---|---|
| Quoi | **Managed Agents** : des agents qui écrivent les modules du jeu | **Messages API** : Claude joue chaque persona |
| Qui appelle | Nos scripts (`scripts/agents/`) | Un petit backend Node.js, jamais le casque directement |
| Modèle | `claude-sonnet-5-5` | `claude-haiku-5-5` pour le dialogue courant ; `claude-sonnet-5-5` pour les moments « réflexion » (bilan de journée, mise à jour de la mémoire) |
| Coût typique | 0,15 à 0,40 $ par session courte | ~0,0005 $ par réplique avec Haiku (fiche persona en cache) |

La clé API ne doit **jamais** être embarquée dans la page WebXR (elle serait lisible par
quiconque ouvre le jeu). Le casque parle à un backend qui détient la clé et applique les
limites de dépense.

## Modèle de données d'un persona (logique pure, sans Three.js)

```ts
interface Persona {
  id: string;
  identity: { name: string; age: number; job: string; home: string };
  backstory: string;                 // histoire, 10 à 20 lignes, écrite une fois
  traits: Record<string, number>;    // ex. sociabilité, impulsivité, optimisme : 0..1
  emotions: Record<string, number>;  // ex. joie, colère, fatigue, stress : 0..1, décroissent avec le temps
  relations: Record<PersonaId, { score: number; trust: number; lastSeenHour: number }>;
  memory: {
    core: string[];                  // faits durables (« Léa est ma colocataire »)
    recent: MemoryEntry[];           // épisodes récents, résumés et élagués chaque nuit de jeu
  };
}
```

## Boucle de vie d'un persona

1. **Perception** : le moteur de jeu produit un événement (rencontre, lieu, heure, humeur).
2. **Dialogue** : le backend envoie à Claude la fiche (en cache), les émotions, la relation à
   l'interlocuteur et les souvenirs pertinents ; Claude répond en **JSON structuré** :
   réplique + deltas d'émotions + delta de relation + souvenir éventuel à retenir.
3. **Application** : `relations.ts` / `emotions.ts` appliquent les deltas (bornes, dérive).
4. **Réflexion** (chaque nuit de jeu, avec Sonnet) : résumé des épisodes récents en quelques
   faits durables, élagage de `recent`.

## Ordre de construction proposé

1. `relations.ts` — scores par paire, événements, dérive (tâche 1, en cours).
2. `persona.ts` + `emotions.ts` + `memory.ts` — types et logique pure, tests Vitest.
3. Backend `server/` : route `POST /persona/:id/talk` qui appelle Claude avec sortie
   structurée, cache de prompt sur la fiche, plafond de dépense journalier.
4. Branchement dans la scène IWSDK (bulles de dialogue, animations Mixamo « parler »).
