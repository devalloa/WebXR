# WebXR Sims — simulation de vie en ville (Three.js + IWSDK, Quest 3)

Dépôt du jeu et de son outillage d'agents (Claude Managed Agents, bêta).

## Agents (Managed Agents)

| Fichier | Rôle |
|---|---|
| `agents/webxr-game-systems.md` | Définition versionnée de l'agent « systèmes de jeu » (modèle `claude-sonnet-5-5`, outils, prompt système). |
| `environments/cloud.yaml` | Bac à sable cloud partagé (réseau limité aux gestionnaires de paquets). |
| `claude-lock.json` | Écrit par `ant apply` : identifiants des ressources créées. **À committer** (sinon `ant apply` crée des doublons). |
| `scripts/agents/run-session.mjs` | Lance une session avec plafond de dépense, suit le flux, télécharge les livrables. |
| `scripts/agents/rubrics/*.md` | Grilles d'évaluation (« outcomes ») par tâche. |

### Mise en place (une fois)

```sh
cp .env.example .env            # puis renseigner ANTHROPIC_API_KEY — .env est ignoré par git
npm install
ant apply --dry-run -v agents/webxr-game-systems.md environments/cloud.yaml   # plan, ne change rien
ant apply agents/webxr-game-systems.md environments/cloud.yaml               # crée agent + environnement
```

Créer ou modifier un agent ne coûte rien ; seules les sessions consomment du crédit.

### Lancer une session

```sh
npm run agent:session -- scripts/agents/rubrics/relations.md
```

Le script affiche l'URL de suivi en direct dans la Console, refuse tout appel d'outil
mis en pause par la politique `auto`, interrompt au-delà de 15 min, puis affiche le
coût (`list_cost`) et télécharge les sorties dans `agent-outputs/<session_id>/`.

Variables utiles dans `.env` : `WEBXR_SESSION_BUDGET_CENTS` (défaut 100 = 1 $),
`WEBXR_MAX_ITERATIONS` (défaut 2), `WEBXR_WALL_CLOCK_MINUTES` (défaut 15).

## Le jeu (`app/`, IWSDK 1.0 + Three.js + Vite)

```sh
cd app && npm install
npm run typecheck && npm run build     # vérifications
npm run dev                            # serveur de dev + navigateur piloté (émulateur Quest 3)
```

- `app/src/scene-assets/` : sol de la ville (`city-ground`) et silhouette de sim (`sim-figure`) ; les bâtiments viennent du kit Blender (`app/public/gltf/city-kit/`, généré par `tools/blender/city_kit.py`).
- `app/tools/gen-scene.mjs` : génère la scène JSON (placement des immeubles, lampadaires, mobilier, sims) ; relancer après tout changement de plan.
- `app/src/city-layout.ts` : plan de la ville (données pures, boucle de promenade `WALK_LOOP`).
- `app/src/sim-walk.ts` : `SimWalkSystem`, déplace et oriente les six sims (composant `Sim`).
- `app/src/game-clock.ts` : `GameClockSystem`, heure de jeu (`globals.gameHour`), soleil, ciel, et `tick()` des relations.
- `app/public/scenes/main.iwsdk.scene.json` : composition (ville, lumière, six sims avec `simId`, `speed`, `tint`).
- L'alias `@sim/*` pointe vers `src/sim/` (logique pure partagée avec les tests Vitest).

Sur Quest 3 : `npm run dev` affiche une URL réseau (`https://<ip>:8081`) à ouvrir dans le navigateur du casque, sur le même Wi-Fi.
