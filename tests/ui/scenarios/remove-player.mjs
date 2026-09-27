// UI checks: removing a player (founders, danger zone)
import { PLAYERS as P, ROLE, FOUNDERS, EXTRA_PLAYER, TITLE, TITLE2, SETTINGS, ITEMS, aboutOf, rateableFor } from "../../fixtures.mjs";
import { check, ME, without, open, writes, batchOps, scenario, done } from "../harness.mjs";

console.log("— removing a player (founders, danger zone)");
await scenario(async () => {
  const p = await open("m=entry&cfg=full");
  const cfgWrites = async () => (await writes(p)).filter(w => w[0] === "config/settings");
  const gone = ROLE.admin; // an extra admin who wrote predictions and has predictions about them
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("removing lives in the collapsed danger zone", !(await p.isVisible("[data-cfg=del]")));
  await p.click(".danger summary");
  const options = await p.locator("#cfgDel option").evaluateAll(o => o.map(x => x.value).filter(Boolean));
  check("founders can't be removed", JSON.stringify(options) === JSON.stringify(SETTINGS.full.players.filter(x => !FOUNDERS.includes(x))), options);
  await p.click("[data-cfg=del]");
  check("nothing chosen: asks to choose", p.dialogs.at(-1).includes("בוחרים") && !(await cfgWrites()).length);
  await p.selectOption("#cfgDel", gone);
  p.promptAnswer = gone + "x";
  await p.click("[data-cfg=del]"); await p.waitForTimeout(200);
  const msg = p.dialogs.at(-2) || "";
  check("the warning spells out what leaves the game", msg.includes(`${ITEMS.filter(i => i.author === gone).length} ניחושים של ${gone}`) && msg.includes(`${ITEMS.filter(i => aboutOf(i).includes(gone)).length} ניחושים על ${gone}`) && msg.includes("מתכללים") && msg.includes("שום דבר לא נמחק"), msg);
  check("a wrong name removes nobody", p.dialogs.at(-1).includes("לא תואם") && !(await cfgWrites()).length);
  await p.fill("#cfgTitle", TITLE2);
  p.promptAnswer = gone;
  await p.click("[data-cfg=del]"); await p.waitForTimeout(200);
  check("not while there are unsaved changes", p.dialogs.at(-1).includes("לא נשמרו") && !(await cfgWrites()).length);
  await p.fill("#cfgTitle", TITLE);
  await p.click("[data-cfg=del]"); await p.waitForTimeout(300);
  const [, d] = (await cfgWrites()).at(-1) ?? [];
  check("typing the name removes the player (and their admin role) right away", d && JSON.stringify(d.players) === JSON.stringify(without(SETTINGS.full.players, gone)) && !d.admins.includes(gone) && JSON.stringify(d.founders) === JSON.stringify(FOUNDERS) && d.title === TITLE, d);
  check("…and no prediction is deleted", !(await batchOps(p)).some(([op]) => op === "del") && !(await p.evaluate(() => sessionStorage.del || "")).includes("items/"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=removed");
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("a removed player with data can be brought back", await p.isVisible(`#cfgFormer [data-cfg=back][data-p="${ROLE.removed}"]`));
  await p.click(`[data-cfg=back][data-p="${ROLE.removed}"]`);
  await p.click("#cfgSave"); await p.waitForTimeout(300);
  const [, d] = (await writes(p)).filter(w => w[0] === "config/settings").at(-1) ?? [];
  check("…by saving, with their old name", d?.players.includes(ROLE.removed), d);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&cfg=full");
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("no removing after the writing phase", await p.locator("[data-cfg=del]").isDisabled());
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=full", { me: ROLE.admin });
  await p.click("#who");
  check("extra admin: admin mode, but no game settings", await p.isVisible("#adminItem") && !(await p.isVisible("#cfgItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { me: ROLE.player });
  await p.click("#who");
  check("regular player: no game settings", !(await p.isVisible("#cfgItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=full", { me: null });
  const e = (await p.textContent(`[data-me="${EXTRA_PLAYER}"] .e`)).trim();
  const others = await Promise.all(P.map(n => p.textContent(`[data-me="${n}"] .e`)));
  check("new player gets an unused emoji", e && !others.map(x => x.trim()).includes(e), e);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&cfg=removed");
  const left = rateableFor(ME, SETTINGS.removed.players);
  check("removed player's predictions are left out of rating", left.length < rateableFor(ME).length && await p.locator("#rate li").count() === left.length);
  await done(p);
});
