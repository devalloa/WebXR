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
