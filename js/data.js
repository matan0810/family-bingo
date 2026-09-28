// Firestore: signing in, the live listeners that fill S, fetching texts, and the writes shared by several screens.
// Every write goes through safe(); multi-document changes use one writeBatch.
import { LEGACY } from "./config.js";
import { db, auth, onAuthStateChanged, signInAnonymously, collection, doc, setDoc, getDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, writeBatch, query, where } from "./firebase.js";
import { S, emo } from "./state.js";
import { aboutOf, secs } from "./logic.js";
import { $, html, toast, confetti } from "./ui.js";
import { render } from "./views.js";
import { nudge } from "./game.js";

// wraps a write: reports failure with a toast, resolves to true/false
export const safe = p => p.then(() => true, e => { console.error(e); toast(e.code === "permission-denied" ? "⚠️ אין הרשאה" : "⚠️ שגיאה"); return false; });
/** @param {...string} path the collection, then the document id (a document path) */
export const ref = (...path) => doc(db, path[0], ...path.slice(1));
export const batch = () => writeBatch(db);
export { serverTimestamp };

function fatal(e) { console.error(e); $("#app").innerHTML = html`<p class="panel">⚠️ שגיאת חיבור (${e.code || e.message}). נסו לרענן.</p>`; }

// ---- auth: anonymous user + one-time family code (checked by the Firestore rules) ----
export function startAuth() {
  onAuthStateChanged(auth, async u => {
    if (!u) return signInAnonymously(auth).catch(fatal);
    if (S.uid) return; // listeners already set up
    S.uid = u.uid;
    try { const m = await getDoc(ref("members", S.uid)); S.member = m.exists(); S.memberName = m.data()?.name ?? null; } catch (e) { return fatal(e); }
    S.member ? listen() : render();
  });
}
export async function join(code) {
  try { await setDoc(ref("members", S.uid), { code }); S.member = true; S.welcomed = false; listen(); render(); }
  catch { $("#err").textContent = "❌ קוד שגוי"; }
}

// ---- live data: renders once every source has delivered ----
const got = new Set(); // sources that have delivered at least once
const SOURCES = 9;
export const live = () => S.member && got.size >= SOURCES;
function ready(k) { got.add(k); if (got.size >= SOURCES) render(); }
const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
const lastMarks = {}; // per player at the last snapshot, to announce only new bingos and new marks
let lastStatus = null, seeded = false;

function listen() {
  onSnapshot(collection(db, "items"), s => { S.items = docsOf(s); ready("items"); }, fatal);
  onSnapshot(ref("game", "state"), s => {
    S.game = /** @type {Game} */ (s.data()) || { status: "entry", cards: {} };
    // the server has the phase now: read again the texts it refused before (e.g. asked for right after this device
    // moved to the rating phase, when the server was still in the writing phase), which show as 🔒
    if (!s.metadata?.hasPendingWrites) retryTexts();
    if (lastStatus === "play" && S.game.status === "ended") { toast("🏁 המשחק נגמר!"); confetti(200); }
    lastStatus = S.game.status;
    ready("game");
  }, fatal);
  onSnapshot(collection(db, "players"), s => { S.claims = Object.fromEntries(s.docs.map(d => [d.id, d.data().uid])); ready("players"); }, fatal);
  onSnapshot(collection(db, "marks"), s => {
    S.marks = Object.fromEntries(s.docs.map(d => [d.id, /** @type {Marks} */ (d.data())]));
    for (const [p, m] of Object.entries(S.marks)) {
      const was = lastMarks[p];
      if (was && !was.blackout && m.blackout) { toast(`${emo(p)} ${p}: כרטיס מלא! 🏆`); confetti(260); }
      else if (was && !was.bingo && m.bingo) { toast(`${emo(p)} ${p}: בינגו! 🎉`); confetti(p === S.me ? 140 : 70); }
      if (was && p !== S.me) (m.marked || []).filter(id => !was.marked.includes(id)).forEach(id => nudge(p, id));
      lastMarks[p] = { bingo: m.bingo, blackout: m.blackout, marked: m.marked || [] };
    }
    ready("marks");
  }, fatal);
  // not fatal: under older rules the game still runs, only without a journal
  onSnapshot(collection(db, "events"), s => { S.events = Object.fromEntries(s.docs.map(d => [d.id, /** @type {MarkEvent} */ (d.data())])); ready("events"); }, e => { console.warn("events", e); ready("events"); });
  onSnapshot(collection(db, "looks"), s => { S.looks = Object.fromEntries(s.docs.map(d => [d.id, d.data().e])); ready("looks"); }, fatal);
  onSnapshot(collection(db, "ratings"), s => { S.ratings = s.docs.map(d => /** @type {Rating} */ (d.data())); ready("ratings"); }, fatal);
  onSnapshot(collection(db, "history"), s => { S.pastGames = docsOf(s).sort((a, b) => secs(b.at) - secs(a.at)); ready("history"); }, fatal);
  // game settings; if they don't exist yet (first run after the upgrade), create them from LEGACY
  const setConfig = c => {
    const src = c?.players?.length ? c : LEGACY;
    S.config = { title: src.title || "", players: src.players, founders: src.founders || [], admins: src.admins || [] };
    ready("config");
  };
  onSnapshot(ref("config", "settings"), s => {
    if (!s.data() && !seeded) { seeded = true; setDoc(ref("config", "settings"), LEGACY).catch(e => console.warn("seed settings", e)); }
    setConfig(s.data());
  }, e => { console.warn("settings", e); setConfig(null); });
  const mine = (field, key) => onSnapshot(query(collection(db, "suggestions"), where(field, "==", S.uid)), s => { S[key] = docsOf(s); render(); }, e => console.warn("suggestions", e));
  mine("toUid", "sugIn"); mine("fromUid", "sugOut");
}

// ---- texts: items/{id} holds only who/about; the text is in texts/{id}, fetched one by one as the rules allow ----
export function need(ids) {
  const miss = ids.filter(id => !(id in S.texts));
  if (!miss.length) return;
  miss.forEach(id => S.texts[id] = undefined);
  Promise.all(miss.map(id => getDoc(ref("texts", id)).then(s => S.texts[id] = s.data()?.text ?? null, () => S.texts[id] = null))).then(render);
}
export const getText = id => getDoc(ref("texts", id));
// forget the texts that couldn't be read, so the next render asks for them again
const retryTexts = () => Object.keys(S.texts).forEach(id => { if (S.texts[id] === null) delete S.texts[id]; });
addEventListener("online", () => { retryTexts(); render(); });

// ---- predictions ----
export function addItem(about, text) {
  const r = doc(collection(db, "items")), b = batch();
  b.set(r, { about, author: S.me, weight: 1, at: serverTimestamp() });
  b.set(ref("texts", r.id), { text });
  S.texts[r.id] = text;
  return b.commit();
}
export function delItem(id) {
  const b = batch();
  b.delete(ref("items", id)); b.delete(ref("texts", id));
  return b.commit();
}
// predictions saved before the split still carry their text; their author moves them to the new format
const moved = new Set();
export function migrate() {
  S.items.filter(i => i.author === S.me && i.text && !moved.has(i.id)).forEach(i => {
    moved.add(i.id);
    const r = doc(collection(db, "items")), b = batch();
    b.set(r, { about: aboutOf(i), author: S.me, weight: 1, at: serverTimestamp() });
    b.set(ref("texts", r.id), { text: i.text });
    b.delete(ref("items", i.id));
    S.texts[r.id] = i.text;
    b.commit().catch(e => console.warn("migrate", e));
  });
}
export const setText = (id, text) => safe(setDoc(ref("texts", id), { text }));
export const rate = (id, stars) => safe(setDoc(ref("ratings", `${id}_${S.me}`), { item: id, player: S.me, stars }));
export const setLook = e => safe(setDoc(ref("looks", S.me), { e }));

// ---- game state and settings ----
export const newItemRef = coll => doc(collection(db, coll));
export const writeGame = state => safe(setDoc(ref("game", "state"), state));
export const saveConfig = patch => safe(setDoc(ref("config", "settings"), { ...S.config, ...patch }));
export const saveCode = code => safe(setDoc(ref("config", "secret"), { code }));
export const readSecret = () => getDoc(ref("config", "secret")).catch(() => null);
// empty marks for every player, and the journal gone with them (new cards, back to rating, new game)
export const remove = (...path) => safe(deleteDoc(ref(...path)));
export const removeQuietly = (...path) => deleteDoc(ref(...path)).catch(() => {});
export const add = (coll, data) => safe(addDoc(collection(db, coll), data));
export const clearMarks = b => {
  S.players.forEach(p => b.set(ref("marks", p), { marked: [], bingo: false, blackout: false, bingoAt: null, blackoutAt: null }));
  Object.keys(S.events).forEach(id => b.delete(ref("events", id)));
};
