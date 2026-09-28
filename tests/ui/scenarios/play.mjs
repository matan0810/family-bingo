// UI checks: play and ended
import { PLAYERS as P, ROLE, SIZE, aboutOf, cardFor, BINGO_AT, PLAY_AT, HISTORY, byId, marksFor, eventsFor } from "../../fixtures.mjs";
import { check, ME, open, lastBatch, sheet, markOp, eventOp, mark, noOverflow, scenario, done } from "../harness.mjs";

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
  const p = await open("m=play");
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
  await sheet(p, "admin"); await p.click('[data-act="end"]'); await p.waitForTimeout(200);
  const e = await lastBatch(p);
  check("end game: history (with title and prophets) + ended state, keeping the start time", e[0][1].startsWith("history/") && e[0][2].results.length === P.length && "title" in e[0][2] && e[0][2].prophets.length === P.length && e[1][2].status === "ended" && e[1][2].at?.seconds === PLAY_AT, e);
  await sheet(p, "admin");
  check("wiping tools wait in the collapsed danger zone", !(await p.isVisible('[data-act="backRate"]')));
  await p.click('#adm .danger summary');
  for (const act of ["backRate", "reset"]) {
    p.promptAnswer = "לא"; const before = await lastBatch(p);
    await p.click(`[data-act="${act}"]`); await p.waitForTimeout(150);
    check(`${act}: without typing the word nothing is wiped`, JSON.stringify(await lastBatch(p)) === JSON.stringify(before) && p.dialogs.at(-1).includes("מחיקה"));
  }
  p.promptAnswer = "מחיקה";
  await p.click('[data-act="backRate"]'); await p.waitForTimeout(200);
  const b = await lastBatch(p), journal = eventsFor(SIZE).map(x => `events/${x.item}_${x.player}`);
  check("play → rate wipes cards, marks and the journal", b[0][2].status === "rate" && JSON.stringify(b[0][2].cards) === "{}" && b.length === 1 + P.length + journal.length && journal.every(id => b.some(([op, r]) => op === "del" && r === id)));
  await done(p);
});
// the win condition: a full card (default) or the first line
await scenario(async () => {
  const full = await open("m=play");
  check("full card mode: the rule says so, a bingo is a step on the way", (await full.textContent("#rule")).includes("כרטיס מלא") && (await full.textContent("#banner")).includes("ממשיכים"));
  await done(full);
  const p = await open("m=play&win=line");
  check("first line mode: the rule says so", (await p.textContent("#rule")).includes("הבינגו הראשון מנצח"));
  check("…my bingo is the win", (await p.textContent("#banner")).includes("ניצחת") && (await p.textContent("#score li:first-child")).includes(ME) && (await p.textContent("#score")).includes("🏆 בינגו"));
  await sheet(p, "admin");
  check("…and the admin tab shows it", (await p.textContent("#adm")).includes("שורה ראשונה"));
  await p.click('[data-act="end"]'); await p.waitForTimeout(200);
  const e = await lastBatch(p);
  check("…and ending the game keeps it", e[1][2].status === "ended" && e[1][2].win === "line" && e[0][2].results[0].p === ME, e);
  await done(p);
});

// a founder gives one player a new card, from the admin tab
await scenario(async () => {
  const p = await open("m=play", { admin: true });
  const who = ROLE.player;
  check("new card: folded away in the admin tab", !(await p.isVisible(`[data-card="${who}"]`)));
  await p.click('[data-k="cards"] summary');
  check("…a row per player", await p.locator("[data-card]").count() === P.length);
  await p.click(`[data-card="${who}"]`); await p.waitForTimeout(200);
  const b = await lastBatch(p), g = b?.find(([, r]) => r === "game/state")?.[2];
  const ev = eventsFor(SIZE).filter(x => x.player === who).map(x => `events/${x.item}_${x.player}`);
  check("…asks first, naming the player", p.dialogs.at(-1).includes(who));
  check("…a new card for that player only, the same size, never about them", g && g.status === "play" && g.cards[who].length === SIZE * SIZE && g.cards[who].every(id => !aboutOf(byId(id)).includes(who))
    && P.filter(x => x !== who).every(x => JSON.stringify(g.cards[x]) === JSON.stringify(cardFor(x, SIZE))), g);
  check("…their marks and journal restart, in the same batch", b.some(([op, r, d]) => op === "set" && r === `marks/${who}` && !d.marked.length && !d.bingo) && ev.every(id => b.some(([op, r]) => op === "del" && r === id))
    && !b.some(([, r]) => r.startsWith("marks/") && r !== `marks/${who}`), b);
  await done(p);
  const ad = await open(`m=play&cfg=full&claim=${ROLE.admin}`, { me: ROLE.admin, admin: true });
  check("new card: only founders have it (an extra admin doesn't)", await ad.isVisible('[data-act="end"]') && !(await ad.locator('[data-k="cards"]').count()));
  await done(ad);
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
  const p = await open("m=ended");
  check("ended: winner banner", (await p.textContent("#winner")).includes("🏆"));
  await p.click("[data-cell] >> nth=0");
  check("ended: a cell still opens with its text, but can't be marked", await p.evaluate(() => cellDlg.open) && !(await p.isVisible("#cellMark")));
  await p.click("#cellDlg .x");
  check("history listed", await p.locator("#hist li").count() === HISTORY.length);
  const top = Math.max(...HISTORY[0].prophets.map(x => x.n)), hist = await p.textContent("#hist");
  check("history names the family prophets", HISTORY[0].prophets.filter(x => x.n === top).every(x => hist.includes(x.p)) && HISTORY[0].prophets.filter(x => x.n < top).every(x => !hist.includes(`${x.p} (`)), hist);
  await sheet(p, "admin");
  check("new game button", await p.locator('[data-act="new"]').count() === 1);
  await done(p);
});
