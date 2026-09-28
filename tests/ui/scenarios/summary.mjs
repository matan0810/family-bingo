// UI checks: "also on your card" and the end-of-game summary
import { PLAYERS as P, ROLE, SIZE, byId, cardFor, marksFor, eventsFor, nudgeFor } from "../../fixtures.mjs";
import { check, open, batchOps, lastBatch, markOp, scenario, done } from "../harness.mjs";

console.log("— \"also on your card\" and the end-of-game summary");
await scenario(async () => {
  const p = await open("m=play&nudge=1");
  check("no nudge on load", !(await p.isVisible("#nudge")));
  await p.evaluate(() => nudgeNow()); await p.waitForTimeout(200);
  const id = nudgeFor(SIZE), box = await p.isVisible("#nudge") ? await p.textContent("#nudge") : "";
  check("another player marks a cell I have: a nudge with who and what", box.includes(ROLE.other) && box.includes(byId(id).text), box);
  await p.click('[data-nudge="yes"]'); await p.waitForTimeout(100);
  const m = markOp(await lastBatch(p));
  check("one tap marks it on my card", m?.[2].marked.includes(id) && !(await p.isVisible("#nudge")), m);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&nudge=1");
  await p.evaluate(() => nudgeNow()); await p.waitForTimeout(200);
  await p.click('[data-nudge="no"]'); await p.waitForTimeout(100);
  check("'not now' closes it without marking", !(await p.isVisible("#nudge")) && !(await batchOps(p)).some(([, r]) => r.startsWith("marks/")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=ended&nudge=1");
  await p.evaluate(() => nudgeNow()); await p.waitForTimeout(200);
  check("no nudges once the game has ended", !(await p.isVisible("#nudge")));
  // what the summary should say, from the fixtures
  const marked = marksFor(SIZE), onCards = [...new Set(P.flatMap(x => cardFor(x, SIZE)))];
  const came = onCards.filter(id => P.some(x => marked[x].includes(id)));
  const points = P.map(x => [x, came.filter(id => byId(id).author === x).length]).sort((a, b) => b[1] - a[1]);
  const rows = await p.locator("#prophets li").evaluateAll(l => l.map(li => [li.querySelector(".name").textContent, +li.querySelector(".n").textContent]));
  check("prophets: a point to the author of every prediction that came true", JSON.stringify(rows) === JSON.stringify(points), rows);
  const first = eventsFor(SIZE)[0], awards = await p.textContent("#awards");
  check("awards: the fastest prediction, with who marked it", awards.includes(byId(first.item).text) && awards.includes(first.player), awards);
  check("the reveal lists every prediction that was on a card, with its author", await p.locator("#reveal li").count() === onCards.length && (await p.textContent("#reveal")).includes(`✍️`));
  check("the journal lists every mark", await p.locator("#journal li").count() === eventsFor(SIZE).length);
  check("the summary sits in collapsed sections", !(await p.isVisible("#reveal")) && !(await p.isVisible("#journal")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&size=4", { ctx: { colorScheme: "dark" } });
  check("dark mode renders", await p.locator(".cell").count() === 4 * 4);
  await done(p);
});
