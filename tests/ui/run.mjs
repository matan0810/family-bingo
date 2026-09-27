// UI tests: index.html against a mocked Firebase (mock.js), driven by Playwright/Chromium.
// Run from tests/: `npm run test:ui` (or `node ui/run.mjs`). Exits 1 if any check fails.
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { extname, join, normalize } from "path";
import { PLAYERS as P, ROLE, FOUNDERS, EXTRA_PLAYER, NEW_PLAYER, TITLE, TITLE2, TITLE3, CODE, NEW_CODE, ME_UID, OTHER_UID, SETTINGS, SIZE, BINGO_AT,
  ITEMS, NEW_ITEMS, MIGRATED, OTHERS_ITEM, NO_DEVICE_ITEM, RATINGS, SUGGESTION, HISTORY, aboutOf, byId, rateableFor } from "../fixtures.mjs";
import { LEGACY, EMOJIS, DEFAULT_TITLE } from "../source.mjs";

const { chromium, devices } = await import("playwright").catch(() =>
  import(join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")));
const CHROMIUM = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

// app.html = index.html with the gstatic Firebase imports pointed at mock.js
const root = new URL("../..", import.meta.url).pathname;
const html = readFileSync(join(root, "index.html"), "utf8").replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js/g, "./mock.js");
writeFileSync(join(root, "tests/ui/app.html"), html);

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const file = join(root, normalize(decodeURIComponent(req.url.split(/[?#]/)[0])));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const URL_ = `http://localhost:${server.address().port}/tests/ui/app.html`;

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
let pass = 0, fail = 0;
const ME = ROLE.founder; // the device under test
// how the app names the people of a prediction: the subject, then who else is involved
const whoName = i => { const [s, ...w] = aboutOf(i); return s ? s + (w.length ? ` (עם ${new Intl.ListFormat("he", { type: "conjunction" }).format(w)})` : "") : "כללי"; };
const general = NEW_ITEMS.find(i => !aboutOf(i).length), group = NEW_ITEMS.find(i => aboutOf(i).length > 1 && !aboutOf(i).includes(ME));
const typed = "typed prediction";
const without = (list, x) => list.filter(y => y !== x);
const chip = (value, name = "about") => `label.chip:has(input[name=${name}]${name === "general" ? "" : `[value="${value}"]`})`;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  (got: ${JSON.stringify(got)})`}`); };

// opens the app; `me` = stored player (null = none), welcome skipped unless welcome:true
async function open(hash = "", { me = ME, admin = false, welcome = false, ctx = {}, once = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...ctx });
  const page = await context.newPage();
  page.errors = []; page.dialogs = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("dialog", d => { page.dialogs.push(d.message()); d.type() === "prompt" ? d.accept(page.promptAnswer ?? "") : d.accept(); });
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
const batchOps = p => p.evaluate(() => (window.B || []).flat());
// picking a name = one batch: players/{name} = {uid} and members/{uid}.name
const picked = async (p, name) => { const ops = await batchOps(p); return ops.some(([op, r, d]) => op === "set" && r === `players/${name}` && d.uid === ME_UID) && ops.some(([op, r, d]) => op === "set" && r === `members/${ME_UID}` && d.name === name); };
const lastBatch = p => p.evaluate(() => (window.B || []).at(-1));
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0);
// a scenario that throws (e.g. an element never shows up) counts as one failure; the run goes on
async function scenario(fn) { try { await fn(); } catch (e) { check(`scenario crashed: ${e.message.split("\n")[0]}`, false); } }
const done = async p => { check(`no page errors`, !p.errors.length, p.errors); await p.context().close(); };

console.log("— entering: code → welcome → name");
await scenario(async () => {
  const p = await open("member=0", { me: null, welcome: true });
  check("code screen first", await p.isVisible("#join"));
  await p.fill("#code", CODE); await p.click("#join button"); await p.waitForTimeout(400);
  check("welcome after code", await p.isVisible(".welcome"));
  check("code stored as members/{uid}", (await writes(p)).some(([r, d]) => r === `members/${ME_UID}` && d.code === CODE));
  await p.click('[data-act="start"]'); await p.waitForTimeout(300);
  check("then name picker", await p.isVisible(".names"));
  check("taken name is marked", (await p.textContent(`[data-me="${ROLE.other}"]`)).includes("תפוס"));
  await p.click(`[data-me="${ROLE.founder2}"]`); await p.waitForTimeout(300);
  check("picking a name claims it and records it on the device", await picked(p, ROLE.founder2));
  check("entry form after picking", await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: null });
  await p.click(`[data-me="${ROLE.other}"]`); await p.waitForTimeout(300);
  check("taking a taken name asks 'זה אתם?' first", p.dialogs.some(m => m.includes("זה אתם?")));
  check("…then moves the name to this device", await picked(p, ROLE.other) && await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("member=0&deny=1", { me: null });
  await p.fill("#code", "x"); await p.click("#join button"); await p.waitForTimeout(300);
  check("wrong code shows an error", (await p.textContent("#err")).includes("קוד שגוי"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: ROLE.other });
  check("stored name owned by another device -> picker", await p.isVisible(".names"));
  await done(p);
});

console.log("— entry phase");
await scenario(async () => {
  const p = await open("m=entry&legacy=1");
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

console.log("— settings, dialogs, emoji, logo");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("#who");
  check("settings open from the header", await p.evaluate(() => setDlg.open));
  check("settings items (founder)", JSON.stringify(await p.locator("#setMenu button:visible").allTextContents()) === JSON.stringify(["🎨 שינוי אימוג׳י", "🛠️ הפעלת מצב מתכלל", "👑 הגדרות משחק", "❓ איך משחקים?", "🔄 החלפת שחקן", "🚪 התנתקות"]), await p.locator("#setMenu button:visible").allTextContents());
  await p.mouse.click(5, 5);
  check("tapping outside closes a dialog", !(await p.evaluate(() => setDlg.open)));
  await p.click(".hello .av");
  check("emoji picker: every emoji is an option", await p.locator("#emojis button").count() === EMOJIS.length);
  check("emojis of other players are disabled", await p.locator("#emojis button:disabled").count() === P.length - 1);
  const free = EMOJIS[P.length]; // nobody has it: players get emojis by their place in the list
  await p.click(`[data-e="${free}"]`);
  check("emoji saved to looks/{me}", (await writes(p)).some(([r, d]) => r === `looks/${ME}` && d.e === free));
  await p.click('[data-act="howto"]');
  check("how-to opens as a dialog with steps", await p.evaluate(() => howDlg.open) && await p.locator("#steps li").count() > 0);
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

console.log("— subject, involved people and general events");
await scenario(async () => {
  const p = await open("m=entry");
  const withRow = () => p.isVisible("#add .with");
  check("no involved row before a subject is chosen", !(await withRow()));
  await p.click(chip(ROLE.player)); await p.click(chip(ROLE.founder2));
  check("one subject: choosing another name moves the choice", JSON.stringify(await p.locator("input[name=about]:checked").evaluateAll(x => x.map(i => i.value))) === JSON.stringify([ROLE.founder2]));
  check("involved row shows, without the subject", await withRow() && !(await p.isVisible(chip(ROLE.founder2, "with"))));
  const involved = [ROLE.player, ROLE.other];
  for (const x of involved) await p.click(chip(x, "with"));
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  let add = await lastBatch(p);
  check("about = [subject, ...involved]", JSON.stringify(add[0][2].about) === JSON.stringify([ROLE.founder2, ...involved]), add[0][2].about);
  await p.click(chip("כללי", "general"));
  check("'כללי' clears the subject and the involved", !(await p.locator("input[name=about]:checked,input[name=with]:checked").count()) && await p.locator("input[name=general]").isChecked() && !(await withRow()));
  await p.click(chip(ROLE.player));
  check("choosing a person clears 'כללי'", !(await p.locator("input[name=general]").isChecked()));
  await p.click(chip("כללי", "general"));
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  add = await lastBatch(p);
  check("general event: about is empty", JSON.stringify(add[0][2].about) === "[]");
  await p.click(chip("כללי", "general")); // the choice stays between predictions; clear it
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  check("must choose someone or 'כללי'", (await p.textContent("#toast")).includes("כללי") && (await p.inputValue("#text")) === typed);
  const mine = await p.locator("#list li .who").allTextContents();
  const myNew = NEW_ITEMS.filter(i => i.author === ME).map(whoName);
  check("my list shows 'כללי' and 'subject (with …)'", myNew.includes("כללי") && myNew.some(w => w.includes("(עם ")) && myNew.every(w => mine.includes(w)), mine);
  const counts = await p.locator("#counts > span").evaluateAll(x => x.map(s => [s.textContent.replace(s.querySelector(".av").textContent, "").replace(s.querySelector("b").textContent, "").trim(), +s.querySelector("b").textContent]));
  const want = [...P.map(x => [x, ITEMS.filter(i => aboutOf(i)[0] === x).length]), ["כללי", ITEMS.filter(i => !aboutOf(i).length).length]];
  check("counts go by the subject only (involved don't count)", JSON.stringify(counts) === JSON.stringify(want), counts);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&size=5");
  const tags = await p.locator(".cell .tag i").allTextContents();
  check("card tags: 🌍 for general, several emojis for a group", tags.includes("🌍") && tags.some(t => [...t].length >= 2), tags);
  await done(p);
});

console.log("— editing wording and suggestions");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("[data-edit] >> nth=0");
  const before = await p.inputValue("#editText");
  check("edit opens with the current text", await p.evaluate(() => editDlg.open) && ITEMS.some(i => i.author === ME && i.text === before), before);
  await p.fill("#editText", typed); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("author edit updates texts/{id} only", r.startsWith("texts/") && JSON.stringify(d) === JSON.stringify({ text: typed }));
  check("edited text shows in my list", (await p.textContent("#list")).includes(typed));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate");
  await p.click(`[data-suggest="${OTHERS_ITEM.id}"]`);
  check("rater: suggestion dialog names the author", (await p.textContent("#editSub")).includes(OTHERS_ITEM.author));
  await p.fill("#editText", typed); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("suggestion goes to the author's device", r.startsWith("suggestions/") && d.item === OTHERS_ITEM.id && d.from === ME && d.fromUid === ME_UID && d.toUid === OTHER_UID && d.text === typed, d);
  await p.click(`[data-suggest="${NO_DEVICE_ITEM.id}"]`); await p.waitForTimeout(200);
  check("no suggestion when the author has no device", (await p.textContent("#toast")).includes("לא מחובר") && !(await p.evaluate(() => editDlg.open)));
  await p.click(".mine summary");
  check("rate: my predictions are editable, not deletable", await p.locator("#list [data-edit]").count() > 0 && !(await p.locator("#list [data-del]").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1", { me: ROLE.founder2 });
  check("suggestions box is only for their author", !(await p.isVisible("#sugBox")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  check("author sees the suggestion: old and new wording", await p.isVisible("#sugBox") && (await p.textContent("#sugList")).includes(SUGGESTION.text));
  await p.click(`[data-accept="${SUGGESTION.id}"]`); await p.waitForTimeout(200);
  const b = await lastBatch(p);
  check("accept = update text + delete suggestion in one batch", JSON.stringify(b) === JSON.stringify([["set", `texts/${SUGGESTION.item}`, { text: SUGGESTION.text }], ["del", `suggestions/${SUGGESTION.id}`]]), b);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  await p.click(`[data-reject="${SUGGESTION.id}"]`); await p.waitForTimeout(200);
  check("reject deletes the suggestion", (await p.evaluate(() => sessionStorage.del || "")).includes(`suggestions/${SUGGESTION.id};`));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&sugg=1");
  check("suggestions are cleared once the rating phase is over", (await p.evaluate(() => sessionStorage.del || "")).includes(`suggestions/${SUGGESTION.id};`));
  await done(p);
});

console.log("— game settings (founders)");
await scenario(async () => {
  const p = await open("m=entry&cfg=full");
  const cfgWrites = async () => (await writes(p)).filter(w => w[0] === "config/settings");
  check("title from settings in the header and tab", (await p.textContent("#logo .word")) === TITLE && (await p.title()) === TITLE);
  check("extra player from settings appears", (await p.locator("label.chip").allTextContents()).some(t => t.includes(EXTRA_PLAYER)));
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("settings dialog opens for a founder", await p.evaluate(() => cfgDlg.open));
  check("the player list has no quick remove buttons", !(await p.locator("#cfgPlayers button").count()));
  check("current family code is shown", (await p.textContent("#cfgCodeNote")).includes(CODE));
  check("save is disabled until something changes", await p.locator("#cfgSave").isDisabled());
  await p.fill("#cfgTitle", TITLE2);
  await p.fill("#cfgNew", NEW_PLAYER); await p.click("[data-cfg=add]");
  await p.click(`[data-cfg=admin][data-p="${ROLE.player}"]`);
  const shown = await p.textContent("#cfgFounders");
  check("founders are fixed: shown, no toggles", FOUNDERS.every(f => shown.includes(f)) && !(await p.locator("[data-cfg=founder]").count()) && !(await p.locator(FOUNDERS.map(f => `#cfgAdmins [data-p="${f}"]`).join()).count()));
  await p.fill("#cfgCode", NEW_CODE);
  check("changes are only a draft until saved", !(await cfgWrites()).length && !(await writes(p)).some(([r]) => r === "config/secret"));
  check("save button lights up", !(await p.locator("#cfgSave").isDisabled()));
  await p.click("#cfgSave"); await p.waitForTimeout(300);
  const [, d] = (await cfgWrites()).at(-1);
  check("one save writes all the settings", d.title === TITLE2 && JSON.stringify(d.players) === JSON.stringify([...SETTINGS.full.players, NEW_PLAYER]) && d.admins.includes(ROLE.player) && JSON.stringify(d.founders) === JSON.stringify(FOUNDERS), d);
  check("save confirms the new code", p.dialogs.some(m => m.includes(NEW_CODE)));
  check("the new family code is saved", (await writes(p)).some(([r, d]) => r === "config/secret" && d.code === NEW_CODE));
  await p.click(`[data-cfg=admin][data-p="${ROLE.admin}"]`);
  const before = p.dialogs.length;
  await p.click("#cfgDlg [data-close]"); await p.waitForTimeout(200);
  check("closing with unsaved changes asks first", p.dialogs.length === before + 1 && p.dialogs.at(-1).includes("בלי לשמור"));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=entry&cfg=full");
  await p.click("#who"); await p.click('[data-set="cfg"]'); await p.waitForTimeout(300);
  check("danger zone is collapsed", !(await p.isVisible("[data-cfg=wipe]")));
  await p.click(".danger summary");
  p.promptAnswer = "לא";
  await p.click("[data-cfg=wipe]"); await p.waitForTimeout(300);
  check("wipe without typing 'מחיקה' deletes nothing", !(await batchOps(p)).some(([op]) => op === "del"));
  p.promptAnswer = "מחיקה";
  const dl = p.waitForEvent("download", { timeout: 5000 });
  await p.click("[data-cfg=wipe]");
  const file = await dl; await p.waitForTimeout(300);
  check("a backup downloads before wiping", /bingo-backup-.*\.json/.test(file.suggestedFilename()));
  const all = await batchOps(p);
  check("new trip deletes items, texts, ratings and resets marks", ITEMS.every(({ id }) => all.some(([op, r]) => op === "del" && r === `items/${id}`) && all.some(([op, r]) => op === "del" && r === `texts/${id}`)) && all.some(([op, r]) => op === "del" && r.startsWith("ratings/")) && all.some(([op, r, d]) => op === "set" && r.startsWith("marks/") && d.marked.length === 0));
  const bk = JSON.parse(await (await import("fs")).promises.readFile(await file.path(), "utf8"));
  check("backup holds settings, items with texts, ratings, marks, history", bk.app === "family-bingo" && bk.settings.title === TITLE && bk.items.length === ITEMS.length && ITEMS.every(i => bk.items.some(b => b.id === i.id && b.text === i.text)) && bk.ratings.length === RATINGS.length && Object.keys(bk.marks).length === P.length && bk.history.length === HISTORY.length);
  await p.click("[data-cfg=wipeHist]"); await p.waitForTimeout(400);
  check("delete history needs the word too", (await lastBatch(p)).some(([op, r]) => op === "del" && r === `history/${HISTORY[0].id}`));
  // restore from the downloaded backup
  const bk2 = { ...bk, settings: { ...bk.settings, title: TITLE3 } };
  await p.setInputFiles("#cfgFile", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bk2)) });
  await p.waitForTimeout(400);
  const r = await lastBatch(p);
  check("restore writes settings, code, game state, marks", r.some(([op, k, d]) => k === "config/settings" && d.title === TITLE3) && r.some(([, k]) => k === "config/secret") && r.some(([, k]) => k === "game/state") && r.filter(([, k]) => k.startsWith("marks/")).length === Object.keys(bk.marks).length, r.map(x => x[1]));
  check("restore asks first and explains the limits", p.dialogs.some(m => m.includes("לשחזר") && m.includes("ניחושים ודירוגים לא ניתן")));
  await p.setInputFiles("#cfgFile", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await p.waitForTimeout(200);
  check("a non-backup file is refused", p.dialogs.at(-1).includes("לא קובץ גיבוי"));
  await done(p);
});
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

console.log("— admin: entry → rate");
await scenario(async () => {
  const p = await open("m=entry", { admin: true });
  check("phase bar", JSON.stringify(await p.locator(".stepper span").allTextContents()) === JSON.stringify(["ניחושים", "דירוג", "משחק", "סיום"]));
  check("no board size / generate in entry", await p.locator('[data-size],[data-act="gen"]').count() === 0);
  const adm = await p.textContent("#adm");
  check("no rater picker: the raters are the admins", !(await p.locator("[data-rater]").count()) && adm.includes("המדרגים הם המתכללים") && FOUNDERS.every(f => adm.includes(f)), adm);
  await p.click('[data-act="rate"]'); await p.waitForTimeout(100);
  const w = (await writes(p)).at(-1);
  check("start rating writes only the phase", w[0] === "game/state" && w[1].status === "rate" && !("raters" in w[1]), w);
  check("asks before changing phase", p.dialogs.length > 0);
  check("stuck-name release is collapsed", !(await p.isVisible("#freeList")));
  await p.click(".free summary"); await p.click(`[data-free="${ROLE.other}"]`); await p.waitForTimeout(200);
  check("admin releases a stuck name", (await p.evaluate(() => sessionStorage.del || "")).includes(`players/${ROLE.other};`));
  await done(p);
});

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
  check("cards never contain predictions about their owner", Object.entries(g[0][2].cards).every(([pl, ids]) => ids.every(id => !aboutOf(byId(id)).includes(pl))));
  await p.click('[data-act="back"]'); await p.waitForTimeout(100);
  check("back to entry", (await writes(p)).filter(([r, d]) => d.status).at(-1)[1].status === "entry");
  await done(p);
});

console.log("— play and ended");
for (const n of [2, 3, 4, 5]) await scenario(async () => {
  const p = await open(`m=play&size=${n}`, { ctx: { viewport: { width: 360, height: 740 } } });
  check(`${n}×${n}: ${n * n} cells, bingo banner, places`, await p.locator(".cell").count() === n * n && await p.isVisible("#banner .banner") && await p.locator(".score .place").count() === P.length);
  check(`${n}×${n}: no horizontal overflow at 360px`, await noOverflow(p));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play", { admin: true });
  await p.click(".cell:not(.on) >> nth=0"); await p.waitForTimeout(100);
  const [r, d] = (await writes(p)).at(-1);
  check("marking keeps the original bingoAt", r === `marks/${ME}` && d.bingo && d.bingoAt?.seconds === BINGO_AT && d.marked.length === SIZE + 1);
  await p.click('[data-act="end"]'); await p.waitForTimeout(200);
  const e = await lastBatch(p);
  check("end game: history (with title) + ended state", e[0][1].startsWith("history/") && e[0][2].results.length === P.length && "title" in e[0][2] && e[1][2].status === "ended");
  await p.click('[data-act="backRate"]'); await p.waitForTimeout(200);
  const b = await lastBatch(p);
  check("play → rate wipes cards and marks", b[0][2].status === "rate" && JSON.stringify(b[0][2].cards) === "{}" && b.length === 1 + P.length);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=ended", { admin: true });
  check("ended: winner banner", (await p.textContent("#winner")).includes("🏆"));
  check("ended: card is read-only", await p.locator("[data-cell]").count() === 0);
  check("history listed", await p.locator("#hist li").count() === HISTORY.length);
  check("new game button", await p.locator('[data-act="new"]').count() === 1);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&size=4", { ctx: { colorScheme: "dark" } });
  check("dark mode renders", await p.locator(".cell").count() === 4 * 4);
  await done(p);
});

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
