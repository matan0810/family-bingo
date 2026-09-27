// Service worker: makes the site installable and lets the app open without reception.
// The site's own files: network first, so a new version shows up right away.
// Firebase's code and the fonts (other origins): cached, so the app also starts offline; the game data itself
// comes from Firestore's own cache on the device.
const CACHE = "bingo-v5";
// every file of the app (tests/unit checks that the js/ list matches the folder)
const SHELL = ["./", "index.html", "style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  ...["account", "admin", "config", "data", "dialogs", "firebase", "game", "html", "logic", "main", "settings", "state", "summary", "ui", "views", "wording"].map(m => `js/${m}.js`)];
// only code and fonts; never the Firestore or sign-in APIs
const LIBS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    // the Firebase modules and the font stylesheet the app loads, so the first offline start works too
    const texts = await Promise.all(SHELL.filter(f => /\.(html|js)$/.test(f)).map(async f => (await c.match(f))?.text() ?? ""));
    const urls = [...new Set(texts.join("\n").match(/https:\/\/(www\.gstatic\.com\/firebasejs|fonts\.googleapis\.com)\/[^"'\s]+/g) || [])];
    await Promise.all(urls.map(u => c.add(new Request(u.replaceAll("&amp;", "&"), { mode: "cors" })).catch(() => {})));
  }));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (LIBS.includes(url.hostname)) {
    // versioned code and fonts don't change: cache first
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }) // revalidate: GitHub Pages lets browsers cache files for 10 minutes
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
