// UI checks: settings, dialogs, emoji, logo
import { PLAYERS as P, ROLE } from "../../fixtures.mjs";
import { EMOJIS } from "../../source.mjs";
import { check, ME, open, writes, scenario, done } from "../harness.mjs";

console.log("— settings, dialogs, emoji, logo");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("#who");
  check("settings open from the header", await p.evaluate(() => setDlg.open));
  check("settings items (founder)", JSON.stringify(await p.locator("#setMenu button:visible").allTextContents()) === JSON.stringify(["🎨 שינוי אימוג׳י", "🛠️ הפעלת מצב מתכלל", "👑 הגדרות משחק", "❓ איך משחקים?", "🔄 החלפת שחקן", "🚪 התנתקות"]), await p.locator("#setMenu button:visible").allTextContents());
  await p.mouse.click(5, 5);
  check("tapping outside closes a dialog", !(await p.evaluate(() => setDlg.open)));
  const noX = await p.evaluate(() => [...document.querySelectorAll("dialog")].filter(d => !d.querySelector(".dlg-head .x[data-close]")).map(d => d.id));
  check("every dialog has a ✕ in its header", !noX.length, noX);
  await p.click("#who"); await p.click("#setDlg .dlg-head .x");
  check("✕ closes the dialog", !(await p.evaluate(() => setDlg.open)));
  await p.click(".hello .av");
  check("emoji picker: every emoji is an option", await p.locator("#emojis button").count() === EMOJIS.length);
  check("emojis of other players are disabled", await p.locator("#emojis button:disabled").count() === P.length - 1);
  const free = EMOJIS[P.length]; // nobody has it: players get emojis by their place in the list
  await p.click(`[data-e="${free}"]`);
  check("emoji saved to looks/{me}", (await writes(p)).some(([r, d]) => r === `looks/${ME}` && d.e === free));
  await p.click('[data-act="howto"]');
  check("how-to opens as a dialog with steps", await p.evaluate(() => howDlg.open) && await p.locator("#steps li").count() > 0);
  await p.click("#howDlg .dlg-head .x");
  await p.click("#logo"); await p.waitForTimeout(200);
  check("logo opens the welcome screen", await p.isVisible(".welcome"));
  await p.goBack(); await p.waitForTimeout(200);
  check("back button returns to the game", await p.isVisible("#add"));
  await p.click("#logo"); await p.click('[data-act="start"]'); await p.waitForTimeout(300);
  check("'יאללה' returns too", await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { once: true });
  check("no admin panel by default", !(await p.locator(".admin").count()));
  await p.click("#who"); await p.click('[data-set="admin"]'); await p.waitForTimeout(200);
  check("settings turns admin mode on", await p.isVisible(".admin"));
  await p.reload(); await p.waitForTimeout(600);
  check("admin mode is remembered on this device", await p.isVisible(".admin"));
  await p.click("#who");
  check("settings shows it is on", (await p.textContent("#adminItem")).includes("פועל"));
  await p.click('[data-set="admin"]'); await p.waitForTimeout(200);
  check("…and turns it off", !(await p.locator(".admin").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { me: ROLE.player });
  await p.click("#who");
  check("non-admins have no admin item", !(await p.isVisible("#adminItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("#who"); await p.click('[data-set="switch"]'); await p.waitForTimeout(400);
  const claims = await p.evaluate(me => (sessionStorage.claims || "").split(";").filter(x => x === me).length, ME);
  check("switch player frees the name (no re-claim)", claims === 0 && !(await p.locator(`[data-me="${ME}"].taken`).count()), claims);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { once: true });
  await p.click("#who"); await p.click('[data-set="logout"]'); await p.waitForTimeout(1200);
  const s = await p.evaluate(() => ({ del: sessionStorage.del || "", claims: (sessionStorage.claims || "").split(";"), me: localStorage.getItem("bingo-me") }));
  check("logout frees the name without re-claiming", s.del.includes(`players/${ME};`) && !s.claims.includes(ME) && s.me === null, s);
  check("logout returns to the code screen", await p.isVisible("#join"));
  await done(p);
});
