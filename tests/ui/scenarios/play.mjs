// UI checks: play and ended
import { PLAYERS as P, SIZE, BINGO_AT, PLAY_AT, HISTORY, byId, marksFor, eventsFor } from "../../fixtures.mjs";
import { check, ME, open, lastBatch, markOp, eventOp, mark, noOverflow, scenario, done } from "../harness.mjs";

console.log("— play and ended");
for (const n of [2, 3, 4, 5]) await scenario(async () => {
  const p = await open(`m=play&size=${n}`, { ctx: { viewport: { width: 360, height: 740 } } });
  check(`${n}×${n}: ${n * n} cells, bingo banner, places`, await p.locator(".cell").count() === n * n && await p.isVisible("#banner .banner") && await p.locator(".score .place").count() === P.length);
  check(`${n}×${n}: no horizontal overflow at 360px`, await noOverflow(p));
  // readable: text of at least 10px, a short text (≤ 30 chars) whole, and rows of one height
  const look = await p.$$eval(".cell", cs => cs.map(c => { const t = c.querySelector(".txt"); return { f: parseFloat(getComputedStyle(t).fontSize), cut: t.textContent.length <= 30 && t.scrollHeight > t.clientHeight + 1, h: Math.round(c.getBoundingClientRect().height) }; }));
  check(`${n}×${n}: cell text readable and whole, equal rows`, look.every(c => c.f >= 10 && !c.cut) && new Set(look.map(c => c.h)).size === 1, look);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play", { admin: true });
  const cell = await p.locator(".cell:not(.on) >> nth=0").getAttribute("data-cell");
  await p.click(`[data-cell="${cell}"]`); await p.waitForTimeout(100);
  const text = byId(cell).text;
  check("tapping a cell only opens it: the full text, and nothing is marked yet", await p.evaluate(() => cellDlg.open) && (await p.textContent("#cellText")) === text && !(await lastBatch(p)), text);
  await p.click("#cellMark"); await p.waitForTimeout(100);
  const m = await lastBatch(p), [r, d] = markOp(m).slice(1), ev = eventOp(m);
  check("marking keeps the original bingoAt", r === `marks/${ME}` && d.bingo && d.bingoAt?.seconds === BINGO_AT && d.marked.length === SIZE + 1);
  check("…and logs it in the journal, in the same batch", ev?.[0] === "set" && ev[1] === `events/${cell}_${ME}` && JSON.stringify(ev[2]) === JSON.stringify({ item: cell, player: ME, at: "TS" }), ev);
  const on = marksFor(SIZE)[ME][0];
  await p.click(`[data-cell="${on}"]`);
  check("a marked cell offers to undo the mark", (await p.textContent("#cellMark")).includes("ביטול"));
  await p.click("#cellMark"); await p.waitForTimeout(100);
  check("unmarking removes the journal entry", JSON.stringify(eventOp(await lastBatch(p))) === JSON.stringify(["del", `events/${on}_${ME}`]));
  await p.click('[data-act="end"]'); await p.waitForTimeout(200);
  const e = await lastBatch(p);
  check("end game: history (with title and prophets) + ended state, keeping the start time", e[0][1].startsWith("history/") && e[0][2].results.length === P.length && "title" in e[0][2] && e[0][2].prophets.length === P.length && e[1][2].status === "ended" && e[1][2].at?.seconds === PLAY_AT, e);
  await p.click('[data-act="backRate"]'); await p.waitForTimeout(200);
  const b = await lastBatch(p), journal = eventsFor(SIZE).map(x => `events/${x.item}_${x.player}`);
  check("play → rate wipes cards, marks and the journal", b[0][2].status === "rate" && JSON.stringify(b[0][2].cards) === "{}" && b.length === 1 + P.length + journal.length && journal.every(id => b.some(([op, r]) => op === "del" && r === id)));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&pending=1");
  check("Firestore keeps a local cache on the device (offline)", await p.evaluate(() => !!window.FS?.localCache?.persistent));
  await mark(p, ".cell:not(.on) >> nth=0");
  const [r, d] = markOp(await lastBatch(p)).slice(1);
  check("a bingo whose time is still pending asks for the server time again (not null)", r === `marks/${ME}` && d.bingo && d.bingoAt === "TS", d);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=ended", { admin: true });
  check("ended: winner banner", (await p.textContent("#winner")).includes("🏆"));
  await p.click("[data-cell] >> nth=0");
  check("ended: a cell still opens with its text, but can't be marked", await p.evaluate(() => cellDlg.open) && !(await p.isVisible("#cellMark")));
  await p.click("#cellDlg .x");
  check("history listed", await p.locator("#hist li").count() === HISTORY.length);
  const top = Math.max(...HISTORY[0].prophets.map(x => x.n)), hist = await p.textContent("#hist");
  check("history names the family prophets", HISTORY[0].prophets.filter(x => x.n === top).every(x => hist.includes(x.p)) && HISTORY[0].prophets.filter(x => x.n < top).every(x => !hist.includes(`${x.p} (`)), hist);
  check("new game button", await p.locator('[data-act="new"]').count() === 1);
  await done(p);
});
