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
  await p.goto(`${ORIGIN}/#m=play`); await p.waitForTimeout(1500);
  const cached = await p.evaluate(async () => (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => r.url)))).flat());
  check("the service worker keeps the app's files, Firebase's code and the fonts", ["/style.css", "/js/main.js", "/js/views.js", "firebase-app.js", "firebase-auth.js", "firebase-firestore.js", "fonts.googleapis.com"].every(x => cached.some(u => u.includes(x))), cached);
  cdn.length = 0;
  await context.setOffline(true);
  await p.reload(); await p.waitForTimeout(1500);
  check("offline: the app opens with the board, without reaching the CDNs", await p.locator(".cell").count() === SIZE * SIZE && !cdn.length, cdn);
  await done(p);
});
