// UI tests: index.html against a mocked Firebase (mock.js), driven by Playwright/Chromium.
// Run from tests/: `npm run test:ui` (or `node ui/run.mjs`). Exits 1 if any check fails.
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { extname, join, normalize } from "path";

const { chromium, devices } = await import("playwright").catch(() =>
  import(join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")));
const CHROMIUM = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

// app.html = index.html with the gstatic Firebase imports pointed at mock.js
const root = new URL("../..", import.meta.url).pathname;
const html = readFileSync(join(root, "index.html"), "utf8").replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js/g, "./mock.js");
writeFileSync(join(root, "tests/ui/app.html"), html);

const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const file = join(root, normalize(decodeURIComponent(req.url.split(/[?#]/)[0])));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const URL_ = `http://localhost:${server.address().port}/tests/ui/app.html`;

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  (got: ${JSON.stringify(got)})`}`); };

// opens the app; `me` = stored player (null = none), welcome skipped unless welcome:true
async function open(hash = "", { me = "מתן", admin = false, welcome = false, ctx = {}, once = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...ctx });
  const page = await context.newPage();
  page.errors = []; page.dialogs = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("dialog", d => { page.dialogs.push(d.message()); d.accept(); });
  await page.addInitScript(({ me, welcome, once }) => {
    try {
      if (once && sessionStorage.init) return; // keep storage across the reload after logout
      sessionStorage.init = 1;
      localStorage.clear();
      if (!welcome) localStorage.setItem("bingo-welcome", "1");
      if (me) localStorage.setItem("bingo-me", me);
    } catch {}
  }, { me, welcome, once });
  await page.goto(`${URL_}${admin ? "?admin" : ""}#${hash}`);
  await page.waitForTimeout(600);
  return page;
}
const writes = p => p.evaluate(() => window.W || []);
const lastBatch = p => p.evaluate(() => (window.B || []).at(-1));
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0);
// a scenario that throws (e.g. an element never shows up) counts as one failure; the run goes on
async function scenario(fn) { try { await fn(); } catch (e) { check(`scenario crashed: ${e.message.split("\n")[0]}`, false); } }
const done = async p => { check(`no page errors`, !p.errors.length, p.errors); await p.context().close(); };

console.log("— entering: code → welcome → name");
await scenario(async () => {
  const p = await open("member=0", { me: null, welcome: true });
  check("code screen first", await p.isVisible("#join"));
  await p.fill("#code", "abc"); await p.click("#join button"); await p.waitForTimeout(400);
  check("welcome after code", await p.isVisible(".welcome"));
  check("code stored as members/{uid}", (await writes(p)).some(([r, d]) => r === "members/U1" && d.code === "abc"));
  await p.click('[data-act="start"]'); await p.waitForTimeout(300);
  check("then name picker", await p.isVisible(".names"));
  check("taken name is marked", (await p.textContent('[data-me="אמא"]')).includes("תפוס"));
  await p.click('[data-me="אורי"]'); await p.waitForTimeout(300);
  check("claim writes players/{name}", (await writes(p)).some(([r, d]) => r === "players/אורי" && d.uid === "U1"));
  check("entry form after picking", await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: null });
  await p.click('[data-me="אמא"]'); await p.waitForTimeout(300);
  check("taking a taken name asks 'זה אתם?' first", p.dialogs.some(m => m.includes("זה אתם?")));
  check("…then moves the name to this device", (await writes(p)).some(([r, d]) => r === "players/אמא" && d.uid === "U1") && await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("member=0&deny=1", { me: null });
  await p.fill("#code", "x"); await p.click("#join button"); await p.waitForTimeout(300);
  check("wrong code shows an error", (await p.textContent("#err")).includes("קוד שגוי"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: "אמא" });
  check("stored name owned by another device -> picker", await p.isVisible(".names"));
  await done(p);
});

console.log("— entry phase");
await scenario(async () => {
  const p = await open("m=entry&legacy=1");
  check("only my own predictions are listed", (await p.locator("#list li .who").allTextContents()).length > 0 && !(await p.locator("#list li", { hasText: "מתן ·" }).count()));
  check("old-format item migrated by its author", (await p.evaluate(() => window.B || [])).some(b => b.some(([op, r]) => op === "del" && r === "items/i0")));
  const chosen = () => p.locator("input[name=about]:checked").count();
  await p.click('label.chip:has-text("אורי")'); await p.click('label.chip:has-text("אורי")');
  check("tapping the chosen name again clears it", await chosen() === 0);
  await p.click('label.chip:has-text("אבא")'); await p.fill("#text", "ניחוש חדש"); await p.click("#add button"); await p.waitForTimeout(200);
  const add = await lastBatch(p);
  check("add = one batch: items (no text) + texts", add.length === 2 && add[0][1].startsWith("items/") && !("text" in add[0][2]) && add[1][1].startsWith("texts/") && add[1][2].text === "ניחוש חדש");
  await p.click("[data-del] >> nth=0"); await p.waitForTimeout(200);
  const del = await lastBatch(p);
  check("delete removes item and text together", del.length === 2 && del.every(([op]) => op === "del"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { ctx: devices["Pixel 7"] });
  await p.tap('label.chip:has-text("אורי")'); await p.tap('label.chip:has-text("אורי")');
  check("touch: tap again clears the chosen name", await p.locator("input[name=about]:checked").count() === 0);
  await done(p);
});

console.log("— settings, dialogs, emoji, logo");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("#who");
  check("settings open from the header", await p.evaluate(() => setDlg.open));
  check("settings items (founder)", JSON.stringify(await p.locator("#setMenu button:visible").allTextContents()) === JSON.stringify(["🎨 שינוי אימוג׳י", "🛠️ הפעלת מצב מתכלל", "👑 הגדרות משחק", "❓ איך משחקים?", "🔄 החלפת שחקן", "🚪 התנתקות"]), await p.locator("#setMenu button:visible").allTextContents());
  await p.mouse.click(5, 5);
  check("tapping outside closes a dialog", !(await p.evaluate(() => setDlg.open)));
  await p.click(".hello .av");
  check("emoji picker: 30 options", await p.locator("#emojis button").count() === 30);
  check("emojis of other players are disabled", await p.locator("#emojis button:disabled").count() === 5);
  await p.click('[data-e="🚀"]');
  check("emoji saved to looks/{me}", (await writes(p)).some(([r, d]) => r === "looks/מתן" && d.e === "🚀"));
  await p.click('[data-act="howto"]');
  check("how-to opens as a dialog with 5 steps", await p.evaluate(() => howDlg.open) && await p.locator("#steps li").count() === 5);
  await p.click("#howDlg [data-close]");
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
  const p = await open("m=entry", { me: "אבא" });
  await p.click("#who");
  check("non-admins have no admin item", !(await p.isVisible("#adminItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("#who"); await p.click('[data-set="switch"]'); await p.waitForTimeout(400);
  const claims = await p.evaluate(() => (sessionStorage.claims || "").split(";").filter(x => x === "מתן").length);
  check("switch player frees the name (no re-claim)", claims === 0 && !(await p.locator('[data-me="מתן"].taken').count()), claims);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { once: true });
  await p.click("#who"); await p.click('[data-set="logout"]'); await p.waitForTimeout(1200);
  const s = await p.evaluate(() => ({ del: sessionStorage.del, claims: sessionStorage.claims || "", me: localStorage.getItem("bingo-me") }));
  check("logout frees the name without re-claiming", s.del?.includes("players/מתן") && !s.claims.includes("מתן") && s.me === null, s);
  check("logout returns to the code screen", await p.isVisible("#join"));
  await done(p);
});

console.log("— editing wording and suggestions");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("[data-edit] >> nth=0");
  const before = await p.inputValue("#editText");
  check("edit opens with the current text", await p.evaluate(() => editDlg.open) && before.length > 0);
  await p.fill("#editText", "ניסוח מתוקן"); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("author edit updates texts/{id} only", r.startsWith("texts/") && JSON.stringify(d) === JSON.stringify({ text: "ניסוח מתוקן" }));
  check("edited text shows in my list", (await p.textContent("#list")).includes("ניסוח מתוקן"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate");
  await p.click('[data-suggest="i5"]');
  check("rater: suggestion dialog names the author", (await p.textContent("#editSub")).includes("אמא"));
  await p.fill("#editText", "ניסוח טוב יותר"); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("suggestion goes to the author's device", r.startsWith("suggestions/") && d.item === "i5" && d.from === "מתן" && d.fromUid === "U1" && d.toUid === "OTHER" && d.text === "ניסוח טוב יותר", d);
  await p.click('[data-suggest="i4"]'); await p.waitForTimeout(200);
  check("no suggestion when the author has no device", (await p.textContent("#toast")).includes("לא מחובר") && !(await p.evaluate(() => editDlg.open)));
  await p.click(".mine summary");
  check("rate: my predictions are editable, not deletable", await p.locator("#list [data-edit]").count() > 0 && !(await p.locator("#list [data-del]").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1", { me: "אורי" });
  check("suggestions box is only for their author", !(await p.isVisible("#sugBox")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  check("author sees the suggestion: old and new wording", await p.isVisible("#sugBox") && (await p.textContent("#sugList")).includes("הצעה משופרת"));
  await p.click('[data-accept="s1"]'); await p.waitForTimeout(200);
  const b = await lastBatch(p);
  check("accept = update text + delete suggestion in one batch", JSON.stringify(b) === JSON.stringify([["set", "texts/i0", { text: "הצעה משופרת" }], ["del", "suggestions/s1"]]), b);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  await p.click('[data-reject="s1"]'); await p.waitForTimeout(200);
  check("reject deletes the suggestion", (await p.evaluate(() => sessionStorage.del || "")).includes("suggestions/s1"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&sugg=1");
  check("suggestions are cleared once the rating phase is over", (await p.evaluate(() => sessionStorage.del || "")).includes("suggestions/s1"));
  await done(p);
});

console.log("— game settings (founders)");
await scenario(async () => {
  const p = await open("m=entry&cfg=1");
  check("extra player from settings appears", (await p.locator("label.chip").allTextContents()).some(t => t.includes("סבתא")));
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("settings dialog opens for a founder", await p.evaluate(() => cfgDlg.open));
  check("founders can't be removed", (await p.locator("#cfgPlayers [data-cfg=del]").allTextContents()).every(t => !t.includes("מתן") && !t.includes("אורי")));
  check("current family code is shown", (await p.textContent("#cfgCodeNote")).includes("lavi"));
  await p.fill("#cfgNew", "סבא"); await p.click("[data-cfg=add]"); await p.waitForTimeout(200);
  let [r, d] = (await writes(p)).at(-1);
  check("add player saves config/settings", r === "config/settings" && d.players.includes("סבא") && d.admins.join() === "עדי");
  await p.click('[data-cfg=del][data-p="סבתא"]'); await p.waitForTimeout(200);
  [r, d] = (await writes(p)).filter(w => w[0] === "config/settings").at(-1);
  check("remove player asks and saves", p.dialogs.some(m => m.includes("להסיר את סבתא")) && !d.players.includes("סבתא"));
  await p.click('[data-cfg=admin][data-p="אבא"]'); await p.waitForTimeout(200);
  [r, d] = (await writes(p)).filter(w => w[0] === "config/settings").at(-1);
  check("toggle an admin", d.admins.includes("אבא"));
  await p.fill("#cfgCode", "new-code"); await p.click("[data-cfg=code]"); await p.waitForTimeout(200);
  check("change family code writes config/secret", (await writes(p)).some(([r, d]) => r === "config/secret" && d.code === "new-code"));
  await p.click("[data-cfg=wipe]"); await p.waitForTimeout(300);
  const all = (await p.evaluate(() => window.B || [])).flat();
  check("new trip deletes items, texts, ratings and resets marks", all.some(([op, r]) => op === "del" && r === "items/i1") && all.some(([op, r]) => op === "del" && r === "texts/i1") && all.some(([op, r]) => op === "del" && r.startsWith("ratings/")) && all.some(([op, r, d]) => op === "set" && r.startsWith("marks/") && d.marked.length === 0));
  check("new trip asks twice", p.dialogs.filter(m => m.includes("לנקות") || m.includes("בטוח")).length >= 2);
  await p.click("[data-cfg=wipeHist]"); await p.waitForTimeout(200);
  check("delete history", (await lastBatch(p)).some(([op, r]) => op === "del" && r === "history/h"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=1", { me: "עדי" });
  await p.click("#who");
  check("extra admin: admin mode, but no game settings", await p.isVisible("#adminItem") && !(await p.isVisible("#cfgItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry", { me: "אבא" });
  await p.click("#who");
  check("regular player: no game settings", !(await p.isVisible("#cfgItem")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=1", { me: null });
  const e = (await p.textContent('[data-me="סבתא"] .e')).trim();
  const others = await Promise.all(["אבא", "אמא", "מתן", "אורי", "עדי", "הדר"].map(n => p.textContent(`[data-me="${n}"] .e`)));
  check("new player gets an unused emoji", e && !others.map(x => x.trim()).includes(e), e);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&cfg=2");
  check("removed player's predictions are left out of rating", !(await p.locator("#rate li .who", { hasText: "הדר" }).count()) && await p.locator("#rate li").count() > 0);
  await done(p);
});

console.log("— admin: entry → rate");
await scenario(async () => {
  const p = await open("m=entry", { admin: true });
  check("phase bar", JSON.stringify(await p.locator(".stepper span").allTextContents()) === JSON.stringify(["ניחושים", "דירוג", "משחק", "סיום"]));
  check("no board size / generate in entry", await p.locator('[data-size],[data-act="gen"]').count() === 0);
  await p.click('[data-act="noRaters"]');
  check("no raters -> rating button disabled", await p.locator('[data-act="rate"]').isDisabled());
  await p.click('[data-rater="אמא"]'); await p.click('[data-rater="עדי"]');
  check("chosen raters summary", (await p.locator("#adm .row .muted").first().textContent()).includes("אמא, עדי"));
  await p.click('[data-act="rate"]'); await p.waitForTimeout(100);
  const w = (await writes(p)).at(-1);
  check("start rating writes status, raters, raterUids", w[0] === "game/state" && w[1].status === "rate" && w[1].raters.join() === "אמא,עדי");
  check("asks before changing phase", p.dialogs.length > 0);
  check("stuck-name release is collapsed", !(await p.isVisible("#freeList")));
  await p.click(".free summary"); await p.click('[data-free="אמא"]'); await p.waitForTimeout(200);
  check("admin releases a stuck name", (await p.evaluate(() => sessionStorage.del || "")).includes("players/אמא"));
  await done(p);
});

console.log("— rating phase");
await scenario(async () => {
  const p = await open("m=rate");
  const whos = await p.locator("#rate li .who").allTextContents();
  check("rater never sees predictions about or by themselves", whos.length === 24 && !whos.includes("מתן"), whos.length);
  await p.click('[data-rate="i1"][data-k="3"]'); await p.waitForTimeout(100);
  check("tapping the current star lowers it by one", JSON.stringify((await writes(p)).at(-1)) === JSON.stringify(["ratings/i1_מתן", { item: "i1", player: "מתן", stars: 2 }]));
  check("raters' progress", (await p.locator("#raters li").count()) === 2);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate", { me: "אורי" });
  check("non-rater sees a waiting message, no list", !(await p.locator("#rate").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate", { admin: true });
  check("admin device syncs raterUids", (await writes(p)).some(([r, d]) => r === "game/state" && d.raterUids?.join() === "U1,OTHER"));
  check("save-raters button only after a change", !(await p.locator('[data-act="raters"]').count()));
  await p.click('[data-rater="עדי"]');
  check("…and appears after one", await p.locator('[data-act="raters"]').count() === 1);
  await p.click('[data-size="4"]'); await p.click('[data-act="gen"]'); await p.waitForTimeout(200);
  const g = await lastBatch(p);
  check("generate 4×4: 16 cells per card, marks reset", g[0][2].status === "play" && g[0][2].size === 4 && g[0][2].cards["מתן"].length === 16 && g.length === 7);
  check("cards never contain predictions about their owner", Object.entries(g[0][2].cards).every(([pl, ids]) => ids.every(id => +id.slice(1) % 6 !== ["אבא", "אמא", "מתן", "אורי", "עדי", "הדר"].indexOf(pl))));
  await p.click('[data-act="back"]'); await p.waitForTimeout(100);
  check("back to entry keeps raters", (await writes(p)).filter(([r, d]) => d.status).at(-1)[1].status === "entry");
  await done(p);
});

console.log("— play and ended");
for (const n of [2, 3, 4, 5]) await scenario(async () => {
  const p = await open(`m=play&size=${n}`, { ctx: { viewport: { width: 360, height: 740 } } });
  check(`${n}×${n}: ${n * n} cells, bingo banner, places`, await p.locator(".cell").count() === n * n && await p.isVisible("#banner .banner") && await p.locator(".score .place").count() === 6);
  check(`${n}×${n}: no horizontal overflow at 360px`, await noOverflow(p));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play", { admin: true });
  await p.click(".cell:not(.on) >> nth=0"); await p.waitForTimeout(100);
  const [r, d] = (await writes(p)).at(-1);
  check("marking keeps the original bingoAt", r === "marks/מתן" && d.bingo && d.bingoAt?.seconds === 50 && d.marked.length === 4);
  await p.click('[data-act="end"]'); await p.waitForTimeout(200);
  const e = await lastBatch(p);
  check("end game: history + ended state", e[0][1].startsWith("history/") && e[0][2].results.length === 6 && e[1][2].status === "ended");
  await p.click('[data-act="backRate"]'); await p.waitForTimeout(200);
  const b = await lastBatch(p);
  check("play → rate wipes cards and marks", b[0][2].status === "rate" && JSON.stringify(b[0][2].cards) === "{}" && b.length === 7);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=ended", { admin: true });
  check("ended: winner banner", (await p.textContent("#winner")).includes("🏆"));
  check("ended: card is read-only", await p.locator("[data-cell]").count() === 0);
  check("history listed", await p.locator("#hist li").count() === 1);
  check("new game button", await p.locator('[data-act="new"]').count() === 1);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&size=4", { ctx: { colorScheme: "dark" } });
  check("dark mode renders", await p.locator(".cell").count() === 16);
  await done(p);
});

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
