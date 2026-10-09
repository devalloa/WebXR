// Lance UNE session Managed Agents sur l'agent « webxr-game-systems ».
//
// Usage : npm run agent:session -- [chemin/vers/rubrique.md] ["description de la tâche"]
//
// - La clé API vient uniquement de `.env` (chargé par `node --env-file`), jamais du shell global.
// - Les identifiants agent/environnement viennent de `.env` ou, à défaut, de `claude-lock.json`
//   (écrit par `ant apply`). L'agent n'est JAMAIS créé ici : c'est le rôle de `ant apply`.
// - Chaque session reçoit un plafond de dépense en dollars appliqué par la plateforme,
//   et un garde-fou de durée côté client (interruption au-delà de WALL_CLOCK_MINUTES).
// - Tout appel d'outil mis en pause par la politique `auto` est REFUSÉ (personne ne surveille
//   en direct) ; le refus est affiché pour qu'on puisse en discuter ensuite.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Authentification : ANTHROPIC_API_KEY (via .env), sinon le profil OAuth créé par
// `ant auth login` (lu automatiquement par le SDK, jeton court stocké hors du dépôt).
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log("Pas de ANTHROPIC_API_KEY : utilisation du profil `ant auth login` s'il existe.\n");
}

const AGENT_FILE = "agents/webxr-game-systems.md";
const ENV_FILE = "environments/cloud.yaml";

const AGENT_ID = process.env.WEBXR_AGENT_ID ?? idFromLock(AGENT_FILE);
const ENV_ID = process.env.WEBXR_ENV_ID ?? idFromLock(ENV_FILE);
const BUDGET_CENTS = process.env.WEBXR_SESSION_BUDGET_CENTS ?? "100"; // 100 = 1,00 $
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE ?? "default";
const MAX_ITERATIONS = Number(process.env.WEBXR_MAX_ITERATIONS ?? 2); // passes évaluateur → agent
const WALL_CLOCK_MINUTES = Number(process.env.WEBXR_WALL_CLOCK_MINUTES ?? 15);

const RUBRIC_PATH = process.argv[2] ?? "scripts/agents/rubrics/relations.md";
const DESCRIPTION =
  process.argv[3] ??
  "Écrire le module TypeScript `relations.ts` (relations entre six sims : création du monde, " +
    "événements qui font évoluer un score par paire, dérive lente vers zéro), ses tests Vitest " +
    "et un court README, dans /mnt/session/outputs/.";
// Fichiers du dépôt à fournir à l'agent en lecture seule, montés sous /mnt/inputs/<nom>.
const INPUT_FILES = (process.env.WEBXR_INPUT_FILES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Tarif liste de claude-sonnet-5-5 ($ / million de tokens), pour l'estimation locale.
// Le chiffre faisant foi est `list_cost`, calculé par la plateforme.
const PRICE = { input: 2, output: 10, cache_write: 2.5, cache_read: 0.1 };

// ---------------------------------------------------------------------------

function idFromLock(file) {
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync("claude-lock.json", "utf8"));
  } catch {
    throw new Error(`claude-lock.json introuvable : lancez \`ant apply ${AGENT_FILE} ${ENV_FILE}\` d'abord.`);
  }
  const key = Object.keys(lock.resources ?? {}).find((k) => k.replace(/^\.\//, "") === file);
  if (!key) throw new Error(`${file} absent de claude-lock.json : lancez \`ant apply\`.`);
  return lock.resources[key].id;
}

function usd(cents) {
  return `${(Number(cents) / 100).toFixed(2)} $`;
}

function tokensToUsd(u) {
  return (
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.output_tokens ?? 0) * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cache_write +
      (u.cache_read_input_tokens ?? 0) * PRICE.cache_read) /
    1_000_000
  );
}

async function main() {
  const client = new Anthropic(); // lit ANTHROPIC_API_KEY
  const rubric = fs.readFileSync(RUBRIC_PATH, "utf8");

  console.log(`Agent        : ${AGENT_ID}`);
  console.log(`Environnement: ${ENV_ID}`);
  console.log(`Plafond      : ${usd(BUDGET_CENTS)} (appliqué par la plateforme)`);
  console.log(`Durée max    : ${WALL_CLOCK_MINUTES} min (interruption côté client)`);
  console.log(`Itérations   : ${MAX_ITERATIONS} max (évaluateur → agent)\n`);

  // 0. Ressources : fichiers du dépôt téléversés (Files API) puis montés en lecture seule.
  const resources = [];
  for (const file of INPUT_FILES) {
    const uploaded = await client.beta.files.upload({ file: fs.createReadStream(file) });
    resources.push({ type: "file", file_id: uploaded.id, mount_path: `/mnt/inputs/${path.basename(file)}` });
    console.log(`Ressource     : ${file} → /mnt/inputs/${path.basename(file)} (${uploaded.id})`);
  }

  // 1. La session : une instance de l'agent dans l'environnement, avec son plafond.
  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: AGENT_ID },
    environment_id: ENV_ID,
    title: `${path.basename(RUBRIC_PATH, ".md")} — ${new Date().toISOString().slice(0, 16)}`,
    budget: { type: "limit", max_list_cost: { amount: String(BUDGET_CENTS), currency: "USD" } },
    ...(resources.length ? { resources } : {}),
  });
  console.log(`Session      : ${session.id}`);
  console.log(`Suivi en direct : https://platform.claude.com/workspaces/${WORKSPACE}/sessions/${session.id}\n`);

  // 2. Le flux d'événements s'ouvre AVANT l'envoi du kickoff, sinon on rate le début.
  const stream = await client.beta.sessions.events.stream(session.id);

  // 3. Kickoff : un « outcome » = la tâche + la grille ; un évaluateur indépendant note
  //    chaque itération et renvoie l'agent corriger si besoin.
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.define_outcome",
        // La grille est jointe à la description : l'agent voit exactement ce que l'évaluateur notera.
        description: `${DESCRIPTION}\n\nGrille d'évaluation (celle de l'évaluateur) :\n\n${rubric}`,
        rubric: { type: "text", content: rubric },
        max_iterations: MAX_ITERATIONS,
      },
    ],
  });

  // Garde-fou de durée : au-delà, on interrompt proprement.
  let interrupted = false;
  const watchdog = setTimeout(async () => {
    interrupted = true;
    console.log(`\n[garde-fou] ${WALL_CLOCK_MINUTES} min écoulées : interruption de la session.`);
    await client.beta.sessions.events.send(session.id, { events: [{ type: "user.interrupt" }] });
  }, WALL_CLOCK_MINUTES * 60_000);

  const tokens = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let modelRequests = 0;
  let platformUsage = null;
  const t0 = Date.now();

  // 4. Boucle de lecture, avec la bonne condition d'arrêt :
  //    - `session.status_terminated`  → fin ;
  //    - `session.status_idle` avec un stop_reason autre que `requires_action` → fin
  //      (`end_turn`, `budget_reached`, `retries_exhausted`) ;
  //    - `requires_action` = la session attend une réponse de notre part → on continue.
  loop: for await (const event of stream) {
    switch (event.type) {
      case "agent.message":
        for (const block of event.content ?? []) {
          if (block.type === "text") console.log(`[agent] ${block.text}`);
        }
        break;

      case "agent.tool_use":
      case "agent.mcp_tool_use":
        console.log(`[outil] ${event.name ?? event.type} (${event.evaluated_permission ?? "n/a"})`);
        if (event.evaluated_permission === "ask") {
          // Personne ne surveille en direct : on refuse, et on en discute après coup.
          console.log(`[outil] appel mis en pause par la politique auto → REFUSÉ : ${JSON.stringify(event.input ?? {}).slice(0, 200)}`);
          await client.beta.sessions.events.send(session.id, {
            events: [{ type: "user.tool_confirmation", tool_use_id: event.id, result: "deny" }],
          });
        }
        break;

      case "span.model_request_end":
        modelRequests += 1;
        for (const k of Object.keys(tokens)) tokens[k] += event.model_usage?.[k] ?? 0;
        break;

      case "span.outcome_evaluation_end":
        console.log(`[évaluateur] itération ${event.iteration} → ${event.result} : ${event.explanation ?? ""}`);
        break;

      case "session.usage":
        platformUsage = event;
        break;

      case "session.error":
        console.error(`[erreur] ${JSON.stringify(event).slice(0, 500)}`);
        break;

      case "session.status_idle":
        if (event.stop_reason?.type === "requires_action") break; // la session nous attend
        console.log(`\n--- Session à l'arrêt (${event.stop_reason?.type}) ---`);
        break loop;

      case "session.status_terminated":
        console.log("\n--- Session terminée ---");
        break loop;
    }
  }
  clearTimeout(watchdog);

  // 5. Bilan. Le statut interrogeable peut être en retard d'une fraction de seconde sur le flux.
  let final;
  for (let i = 0; i < 10; i++) {
    final = await client.beta.sessions.retrieve(session.id);
    if (final.status !== "running") break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const u = final?.usage ?? platformUsage;
  console.log(`\nDurée totale   : ${((Date.now() - t0) / 60_000).toFixed(1)} min${interrupted ? " (interrompue)" : ""}`);
  console.log(`Appels modèle  : ${modelRequests}`);
  console.log(`Tokens         : entrée ${tokens.input_tokens}, sortie ${tokens.output_tokens}, ` +
    `cache écrit ${tokens.cache_creation_input_tokens}, cache lu ${tokens.cache_read_input_tokens}`);
  console.log(`Estimation locale (tokens seuls) : ${tokensToUsd(tokens).toFixed(3)} $`);
  if (u?.list_cost) console.log(`Coût liste plateforme (tokens + temps) : ${usd(u.list_cost.amount)}`);
  if (u?.active_seconds != null) console.log(`Temps actif facturé : ${(u.active_seconds / 60).toFixed(1)} min`);

  // 6. Récupération des livrables écrits dans /mnt/session/outputs/ (léger délai d'indexation).
  const outDir = path.join("agent-outputs", session.id);
  fs.mkdirSync(outDir, { recursive: true });
  let files = [];
  for (let i = 0; i < 4 && files.length === 0; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    const page = await client.beta.files.list({ scope_id: session.id, betas: ["managed-agents-2026-04-01"] });
    files = page.data ?? [];
  }
  for (const f of files) {
    const dest = path.join(outDir, f.filename);
    if (!path.resolve(dest).startsWith(path.resolve(outDir))) continue; // sécurité chemin
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const resp = await client.beta.files.download(f.id);
    fs.writeFileSync(dest, Buffer.from(await resp.arrayBuffer()));
    console.log(`[fichier] ${dest} (${f.size_bytes} octets)`);
  }
  if (files.length === 0) console.log("[fichier] aucun livrable trouvé dans /mnt/session/outputs/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
