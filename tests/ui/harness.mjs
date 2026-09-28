// UI test harness: serves the app, starts Chromium, and gives the scenarios their helpers (open a page with a
// fixture, read what it wrote, check). run.mjs runs the scenarios in scenarios/ in order.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { extname, join, normalize } from "path";
import { ROLE, NEW_ITEMS, ME_UID, aboutOf } from "../fixtures.mjs";

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1"; // lets routes see the service worker's requests (offline test)
const { chromium, devices } = await import("playwright").catch(() =>
  import(join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")));
const CHROMIUM = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

// The repo is served as is at /, and again under /mock/ with the gstatic Firebase imports (in js/firebase.js)
// pointed at mock.js; the tests use /mock/, the offline test the real thing.
const root = new URL("../..", import.meta.url).pathname;
const GSTATIC = /https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js/g;
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split(/[?#]/)[0]), mocked = path.startsWith("/mock/");
  let file = join(root, normalize(mocked ? path.slice(5) : path));
  if (file.endsWith("/")) file += "index.html";
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  const body = readFileSync(file);
  res.end(mocked && extname(file) === ".js" ? body.toString().replace(GSTATIC, "/tests/ui/mock.js") : body);
}).listen(0);
const ORIGIN = `http://localhost:${server.address().port}`, URL_ = `${ORIGIN}/mock/index.html`;

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
let pass = 0, fail = 0;
export const results = () => ({ pass, fail });
const ME = ROLE.founder; // the device under test
// how the app names the people of a prediction: the subject, then who else is involved
const whoName = i => { const [s, ...w] = aboutOf(i); return s ? s + (w.length ? ` (עם ${new Intl.ListFormat("he", { type: "conjunction" }).format(w)})` : "") : "כללי"; };
const general = NEW_ITEMS.find(i => !aboutOf(i).length), group = NEW_ITEMS.find(i => aboutOf(i).length > 1 && !aboutOf(i).includes(ME));
const typed = "typed prediction";
const without = (list, x) => list.filter(y => y !== x);
const chip = (value, name = "about") => `label.chip:has(input[name=${name}]${name === "general" ? "" : `[value="${value}"]`})`;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  (got: ${JSON.stringify(got)})`}`); };

// the settings sheet (⚙️ by the name), on one of its tabs: me, admin (admins) or game (founders)
async function sheet(p, tab = "me") {
  if (!await p.evaluate(() => setDlg.open)) await p.click("#who");
  if (await p.isVisible(`[data-tab="${tab}"]`)) await p.click(`[data-tab="${tab}"]`);
  await p.waitForTimeout(150);
}
const closeSheet = async p => { await p.click("#setDlg .dlg-head .x"); await p.waitForTimeout(100); };
// opens the app; `me` = stored player (null = none), welcome skipped unless welcome:true, admin:true = on the admin tab
async function open(hash = "", { me = ME, admin = false, welcome = false, ctx = {}, once = false } = {}) {
  // no service worker here: it would cache the mocked files (the offline test below covers it)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...ctx });
  const page = await context.newPage();
  page.errors = []; page.dialogs = [];
  page.on("pageerror", e => page.errors.push(e.message));
  // prompts get page.promptAnswer; page.refuse = true answers the next confirm with "cancel"
  page.on("dialog", d => { page.dialogs.push(d.message()); d.type() === "prompt" ? d.accept(page.promptAnswer ?? "") : page.refuse ? (page.refuse = false, d.dismiss()) : d.accept(); });
  await page.addInitScript(({ me, welcome, once }) => {
    try {
      if (once && sessionStorage.init) return; // keep storage across the reload after logout
      sessionStorage.init = 1;
      localStorage.clear();
      if (!welcome) localStorage.setItem("bingo-welcome", "1");
      if (me) localStorage.setItem("bingo-me", me);
    } catch {}
  }, { me, welcome, once });
  await page.goto(`${URL_}#${hash}`);
  await page.waitForTimeout(600);
  if (admin) await sheet(page, "admin");
  return page;
}
const writes = p => p.evaluate(() => window.W || []);
const batchOps = p => p.evaluate(() => (window.B || []).flat());
// picking a name = one batch: players/{name} = {uid} and members/{uid}.name
const picked = async (p, name) => { const ops = await batchOps(p); return ops.some(([op, r, d]) => op === "set" && r === `players/${name}` && d.uid === ME_UID) && ops.some(([op, r, d]) => op === "set" && r === `members/${ME_UID}` && d.name === name); };
const lastBatch = p => p.evaluate(() => (window.B || []).at(-1));
// a mark is one batch: marks/{me} and its journal entry events/{item}_{me}
const markOp = b => b?.find(([op, r]) => op === "set" && r.startsWith("marks/")), eventOp = b => b?.find(([, r]) => r.startsWith("events/"));
// marking = tapping the cell (it opens) and then "זה קרה!" (or "ביטול הסימון")
const mark = async (p, selector) => { await p.click(selector); await p.click("#cellMark"); await p.waitForTimeout(100); };
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0);
// a scenario that throws (e.g. an element never shows up) counts as one failure; the run goes on
async function scenario(fn) { try { await fn(); } catch (e) { check(`scenario crashed: ${e.message.split("\n")[0]}`, false); } }
const done = async p => { check(`no page errors`, !p.errors.length, p.errors); await p.context().close(); };

export { browser, root, ORIGIN, devices, check, sheet, closeSheet, ME, whoName, general, group, typed, without, chip, open, writes, batchOps, picked, lastBatch, markOp, eventOp, mark, noOverflow, scenario, done };
export async function finish() {
  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
