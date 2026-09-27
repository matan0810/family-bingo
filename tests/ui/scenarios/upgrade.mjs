// UI checks: upgrade from the first version
import { ME_UID } from "../../fixtures.mjs";
import { LEGACY, EMOJIS, DEFAULT_TITLE } from "../../source.mjs";
import { check, open, writes, scenario, done } from "../harness.mjs";

console.log("— upgrade from the first version");
await scenario(async () => {
  const old = LEGACY.founders[0];
  const p = await open(`m=entry&cfg=none&claim=${encodeURIComponent(old)}`, { me: old });
  const seed = (await writes(p)).find(([r]) => r === "config/settings");
  check("missing game settings are seeded from the existing game", JSON.stringify(seed?.[1]) === JSON.stringify(LEGACY), seed);
  check("a device holding a name records it (members/{uid}.name)", (await writes(p)).some(([r, d]) => r === `members/${ME_UID}` && d.name === old));
  const avs = (await p.locator("#counts span .av").allTextContents()).slice(0, LEGACY.players.length);
  check("existing emojis stay the same", JSON.stringify(avs) === JSON.stringify(LEGACY.players.map((_, k) => EMOJIS[k])), avs);
  check("without a title the app keeps its default name", (await p.textContent("#logo .word")) === DEFAULT_TITLE);
  await done(p);
});
