// UI tests: the app against a mocked Firebase (mock.js), driven by Playwright/Chromium.
// Run from tests/: `npm run test:ui` (or `node ui/run.mjs`, or `node ui/run.mjs rating play` for some scenarios).
// Exits 1 if any check fails. Each file in scenarios/ is one area of the app.
import { finish } from "./harness.mjs";

const ALL = ["entering", "entry", "settings", "upgrade", "predictions", "wording", "game-settings", "remove-player", "admin", "rating", "play", "summary", "offline"];
const only = process.argv.slice(2);
for (const name of only.length ? ALL.filter(n => only.includes(n)) : ALL) await import(`./scenarios/${name}.mjs`);
await finish();
