// UI checks: entry phase
import { ROLE, ITEMS, MIGRATED } from "../../fixtures.mjs";
import { devices, check, ME, typed, chip, open, batchOps, lastBatch, scenario, done } from "../harness.mjs";

console.log("— entry phase");
await scenario(async () => {
  const p = await open("m=entry&oldtext=1");
  check("only my own predictions are listed", await p.locator("#list li").count() === ITEMS.filter(i => i.author === ME).length);
  check("old-format item migrated by its author", (await batchOps(p)).some(([op, r]) => op === "del" && r === `items/${MIGRATED.id}`));
  const chosen = () => p.locator("input[name=about]:checked").count();
  await p.click(chip(ROLE.founder2)); await p.click(chip(ROLE.founder2));
  check("tapping the chosen name again clears it", await chosen() === 0);
  await p.click(chip(ROLE.player)); await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  const add = await lastBatch(p);
  check("add = one batch: items (no text) + texts", add.length === 2 && add[0][1].startsWith("items/") && !("text" in add[0][2]) && add[1][1].startsWith("texts/") && add[1][2].text === typed);
  await p.click("[data-del] >> nth=0"); await p.waitForTimeout(200);
  const del = await lastBatch(p);
  check("delete removes item and text together", del.length === 2 && del.every(([op]) => op === "del"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { ctx: devices["Pixel 7"] });
  await p.tap(chip(ROLE.founder2)); await p.tap(chip(ROLE.founder2));
  check("touch: tap again clears the chosen name", await p.locator("input[name=about]:checked").count() === 0);
  await done(p);
});
