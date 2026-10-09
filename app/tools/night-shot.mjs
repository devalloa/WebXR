// Script Playwright pour `npx @iwsdk/cli browser run tools/night-shot.mjs` (serveur lancé
// avec --allow-browser-automation) : recharge l'APPLICATION (l'iframe runtime, pas la page
// hôte Runtime/Editor) à l'heure demandée, puis laisse le CLI faire la capture.
// Usage : HOUR=22 npx @iwsdk/cli browser run tools/night-shot.mjs ; puis `browser screenshot`.
export default async function run({ page, frame }) {
  const hour = process.env.HOUR ?? '22';
  const target = frame ?? page;
  const url = new URL(target.url());
  url.searchParams.set('hour', hour);
  await target.goto(url.toString(), { waitUntil: 'load' });
  await target.waitForTimeout(6000); // chargement des GLB + recensement des émissifs
  return { navigated: url.toString(), isFrame: Boolean(frame) };
}
