// UI checks: rating phase
import { PLAYERS as P, ROLE, FOUNDERS, SETTINGS, RATINGS, aboutOf, byId, rateableFor, poolFor } from "../../fixtures.mjs";
import { check, ME, whoName, general, group, open, writes, lastBatch, sheet, scenario, done } from "../harness.mjs";

console.log("— rating phase");
await scenario(async () => {
  const p = await open("m=rate");
  const whos = await p.locator("#rate li .who").allTextContents();
  check("rater never sees predictions about or by themselves", whos.length === rateableFor(ME).length && !whos.some(w => w.includes(ME)), whos.length);
  check("rating list shows general events and groups", whos.includes(whoName(general)) && whos.includes(whoName(group)), whos);
  const r0 = RATINGS.find(r => r.player === ME && r.stars > 0);
  await p.click(`[data-rate="${r0.item}"][data-k="${r0.stars}"]`); await p.waitForTimeout(100);
  check("tapping the current star lowers it by one", JSON.stringify((await writes(p)).at(-1)) === JSON.stringify([`ratings/${r0.item}_${ME}`, { item: r0.item, player: ME, stars: r0.stars - 1 }]));
  check("raters' progress: one row per admin", (await p.locator("#raters li").count()) === FOUNDERS.length + SETTINGS.base.admins.length);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate", { me: ROLE.player });
  check("non-admin sees a waiting message, no rating list", !(await p.locator("#rate").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&cfg=full", { me: ROLE.admin });
  check("an extra admin (not a founder) is a rater", await p.locator("#rate li").count() === rateableFor(ROLE.admin, SETTINGS.full.players).length && (await p.locator("#raters li").allTextContents()).some(t => t.includes(ROLE.admin)));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate", { admin: true });
  check("no rater lists are written", !(await writes(p)).some(([r, d]) => r === "game/state" && ("raterUids" in d || "raters" in d)));
  await p.click('[data-size="4"]'); await p.click('[data-act="gen"]'); await p.waitForTimeout(200);
  const g = await lastBatch(p);
  check("generate 4×4: 16 cells per card, marks reset", g[0][2].status === "play" && g[0][2].size === 4 && P.every(pl => g[0][2].cards[pl].length === 16) && g.length === 1 + P.length);
  check("…and the sheet closes on the new phase", !(await p.evaluate(() => setDlg.open)));
  await sheet(p, "admin");
  check("the win condition starts as a full card", g[0][2].win === "full" && await p.locator('[data-win="full"].on').count() === 1);
  await p.click('[data-win="line"]');
  check("choosing the first line explains it", await p.locator('[data-win="line"].on').count() === 1 && (await p.textContent("#adm")).includes("בינגו קלאסי"));
  await p.click('[data-act="gen"]'); await p.waitForTimeout(200);
  check("…and the cards are generated with it", (await lastBatch(p))[0][2].win === "line" && p.dialogs.at(-1).includes("שורה"));
  check("cards never contain predictions about their owner", Object.entries(g[0][2].cards).every(([pl, ids]) => ids.every(id => !aboutOf(byId(id)).includes(pl))));
  const cards = Object.entries(g[0][2].cards), N = 16;
  check("no prediction twice on a card", cards.every(([, ids]) => new Set(ids).size === ids.length));
  const subjectOver = cards.filter(([pl, ids]) => {
    const subject = i => aboutOf(i)[0] ?? "", pool = poolFor(pl), cap = Math.ceil(N / new Set(pool.map(subject)).size) + 1;
    const per = {}; ids.forEach(id => per[subject(byId(id))] = (per[subject(byId(id))] || 0) + 1);
    return Math.max(...Object.values(per)) > cap;
  }).map(([pl]) => pl);
  check("variety: no subject goes over its share of a card", !subjectOver.length, subjectOver);
  const onCards = id => cards.filter(([, ids]) => ids.includes(id)).length;
  check("some predictions are shared by several cards", cards.some(([, ids]) => ids.some(id => onCards(id) > 1)));
  await sheet(p, "admin"); await p.click('[data-act="back"]'); await p.waitForTimeout(100);
  check("back to entry", (await writes(p)).filter(([r, d]) => d.status).at(-1)[1].status === "entry");
  await done(p);
});

await scenario(async () => {
  const p = await open("m=rate", { admin: true });
  const n = 4, N = n * n;
  await p.click(`[data-size="${n}"]`);
  check("card tuning is collapsed", !(await p.isVisible("[data-tune]")));
  await p.click('[data-k="tune"] summary'); await p.waitForTimeout(200);
  check("tuning: every setting starts in the middle", (await p.locator("[data-tune].on").evaluateAll(x => x.map(b => b.dataset.tune.split(":")[1]))).every(x => x === "1"));
  check("tuning shows a preview in numbers", /\d/.test(await p.textContent("#tuneStats")));
  const sharedCells = async () => {
    await p.click('[data-act="gen"]'); await p.waitForTimeout(200);
    await sheet(p, "admin");
    const cards = Object.values((await lastBatch(p))[0][2].cards);
    let s = 0, k = 0; cards.forEach((a, x) => cards.slice(x + 1).forEach(b => { s += a.filter(id => b.includes(id)).length; k++; }));
    return s / k;
  };
  await p.click('[data-tune="shared:0"]'); const few = await sharedCells();
  await p.click('[data-tune="shared:2"]'); const many = await sharedCells();
  check("more crossings = cards share more cells", many > few, { few, many });
  check("the panel stays open after a choice", await p.isVisible("[data-tune]"));
  const cards = Object.values((await lastBatch(p))[0][2].cards);
  check("…and cards stay full", cards.every(c => c.length === N));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&lag=1");
  check("a text refused before the server has the new phase shows 🔒 at first", (await p.textContent("#rate")).includes("🔒"));
  await p.waitForTimeout(900);
  const shown = await p.textContent("#rate");
  check("…and is read again once the server confirms the phase", !shown.includes("🔒") && rateableFor(ME).every(i => shown.includes(i.text)), shown.slice(0, 200));
  await done(p);
});
