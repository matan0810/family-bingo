// UI checks: offline (service worker + Firestore cache)
import { readFileSync } from "fs";
import { join } from "path";
import { SIZE } from "../../fixtures.mjs";
import { browser, ORIGIN, root, check, ME, scenario, done } from "../harness.mjs";

console.log("— offline (service worker + Firestore cache)");
await scenario(async () => {
  // the real index.html; the CDNs are stood in for (Firebase = the mock, fonts = empty css), and every request that
  // reaches them is counted, so after going offline nothing may get through
  const context = await browser.newContext({ serviceWorkers: "allow" }), cdn = [];
  await context.route(/^https:\/\/(www\.gstatic\.com|fonts\.googleapis\.com)\//, r => {
    cdn.push(r.request().url());
    const headers = { "access-control-allow-origin": "*" };
    return r.request().url().includes("gstatic")
      ? r.fulfill({ contentType: "text/javascript", headers, body: readFileSync(join(root, "tests/ui/mock.js"), "utf8").replaceAll("../fixtures.mjs", `${ORIGIN}/tests/fixtures.mjs`) })
      : r.fulfill({ contentType: "text/css", headers, body: "" });
  });
  const p = await context.newPage();
  p.errors = []; p.on("pageerror", e => p.errors.push(e.message));
  await p.addInitScript(me => { try { localStorage.setItem("bingo-welcome", "1"); localStorage.setItem("bingo-me", me); } catch {} }, ME);
  // wait for conditions, not for time: CI machines are slower
  await p.goto(`${ORIGIN}/#m=play`);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  // one more load while online, now through the service worker (like any phone that opened the app before),
  // so everything the page loads is in its cache, not only in the browser's HTTP cache
  await p.reload();
  await p.waitForSelector(".cell", { timeout: 15000 });
  const want = ["/style.css", "/js/main.js", "/js/views.js", "firebase-app.js", "firebase-auth.js", "firebase-firestore.js", "fonts.googleapis.com"];
  const cachedUrls = () => p.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat());
  await p.waitForFunction(async want => { const urls = (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat(); return want.every(x => urls.some(u => u.includes(x))); }, want, { timeout: 15000 }).catch(() => {});
  const cached = await cachedUrls();
  check("the service worker keeps the app's files, Firebase's code and the fonts", want.every(x => cached.some(u => u.includes(x))), cached);
  cdn.length = 0;
  await context.setOffline(true);
  await p.reload();
  await p.waitForSelector(".cell", { timeout: 15000 }).catch(() => {});
  check("offline: the app opens with the board, without reaching the CDNs", await p.locator(".cell").count() === SIZE * SIZE && !cdn.length, { cells: await p.locator(".cell").count(), cdn, app: (await p.textContent("#app").catch(() => ""))?.slice(0, 120) });
  await done(p);
});
