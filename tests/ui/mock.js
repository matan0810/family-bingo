// Stand-in for the three Firebase modules (app, auth, firestore) used by index.html.
// run.mjs rewrites the gstatic imports to "./mock.js". All data comes from ../fixtures.mjs.
// Fixtures are chosen by URL hash params:
//   m=entry|rate|play|ended   game phase (default entry)
//   size=2..5                 board size in play/ended (default SIZE)
//   cfg=base|full|removed     which SETTINGS to serve (default base); full also has a family code set
//   cfg=none                  no game settings yet: the app seeds them from its LEGACY values
//   claim=<name>              this device (ME_UID) also holds <name>
//   member=0                  device has not entered the family code yet
//   deny=1                    every setDoc fails with permission-denied (e.g. wrong code)
//   legacy=1                  MIGRATED still holds its text (the first version's format) -> migration
//   nohist=1                  no history
//   sugg=1                    SUGGESTION waits for its author
//   pending=1                 the founder's bingo time is still pending (made offline): it reads as null
// Writes are recorded for assertions: window.W (setDoc), window.B (batches), window.FS (Firestore options),
// sessionStorage.claims / .del (survive the reload after logout).
import { PLAYERS, ROLE, ITEMS, MIGRATED, SETTINGS, CODE, ME_UID, CLAIMS, SIZE, BINGO_AT, RATINGS, SUGGESTION, HISTORY, cardFor } from "../fixtures.mjs";

const q = new URLSearchParams(location.hash.slice(1));
const TX = Object.fromEntries(ITEMS.map(i => [i.id, i.text]));
const items = ITEMS.map(({ id, at, text, ...d }) => ({ id, data: () => ({ weight: 1, at: { seconds: at }, ...d, ...(id === MIGRATED.id && q.get("legacy") ? { text } : {}) }) }));
const n = +(q.get("size") || SIZE), mode = q.get("m") || "entry", cfg = q.get("cfg") || "base";
const cards = Object.fromEntries(PLAYERS.map(p => [p, cardFor(p, n)]));
const state = {
  entry: { status: "entry", cards: {} },
  rate: { status: "rate", cards: {} },
  play: { status: "play", cards, size: n },
  ended: { status: "ended", cards, size: n }
}[mode];
// the founder has the main diagonal (a bingo); player k has k marks
const diag = [...Array(n).keys()].map(k => cards[ROLE.founder][k * n + k]);
const marks = PLAYERS.map((p, k) => ({ id: p, data: () => p === ROLE.founder ? { marked: diag, bingo: true, blackout: false, bingoAt: q.get("pending") ? null : { seconds: BINGO_AT } } : { marked: cards[p].slice(0, k), bingo: false, blackout: false } }));
const config = SETTINGS[cfg];
const sugIn = q.get("sugg") ? [SUGGESTION] : [];
const asDocs = list => list.map(({ id, ...d }) => ({ id, data: () => d }));

// players/{name} is live, so claims and releases come back through the snapshot like in Firestore
const PL = { ...CLAIMS, ...(q.get("claim") ? { [q.get("claim")]: ME_UID } : {}) };
let plCb = null;
const emitPl = () => plCb && setTimeout(() => plCb({ docs: Object.entries(PL).map(([id, uid]) => ({ id, data: () => ({ uid }) })) }));
const log = (k, v) => { try { sessionStorage[k] = (sessionStorage[k] || "") + v + ";"; } catch {} };

export const initializeApp = () => ({}), serverTimestamp = () => "TS";
export const persistentMultipleTabManager = () => "tabs", persistentLocalCache = o => ({ persistent: o });
export const initializeFirestore = (_, o) => { window.FS = o; return {}; };
let auto = 0;
export const collection = (_, name) => name;
export const where = field => field;
export const query = (coll, field) => `${coll}?${field}`;
export const doc = (d, a, b) => { const [c, id] = a === undefined ? [d, "AUTO" + auto++] : [a, b]; return Object.assign(new String(c + "/" + id), { id }); };
export const setDoc = async (r, d) => {
  window.W = (window.W || []).concat([[String(r), d]]);
  if (q.get("deny")) throw { code: "permission-denied" };
  const [c, id] = String(r).split("/");
  if (c === "players") { PL[id] = d.uid; emitPl(); log("claims", id); }
};
export const deleteDoc = async r => {
  log("del", String(r));
  const [c, id] = String(r).split("/");
  if (c === "players") { delete PL[id]; emitPl(); await new Promise(z => setTimeout(z, 50)); }
};
export const addDoc = async (coll, d) => { const r = doc(coll); await setDoc(r, d); return r; };
export const writeBatch = () => { const ops = []; return { set(r, d) { ops.push(["set", String(r), d]); }, delete(r) { ops.push(["del", String(r)]); }, commit: async () => {
  window.B = (window.B || []).concat([ops]);
  ops.forEach(([op, r, d]) => { const [c, id] = r.split("/"); if (c === "players" && op === "set") { PL[id] = d.uid; log("claims", id); } });
  if (ops.some(([, r]) => r.startsWith("players/"))) emitPl();
} }; };
export const getDoc = async r => {
  r = String(r);
  if (r.startsWith("members/")) return { exists: () => q.get("member") !== "0" && !sessionStorage.signedOut, data: () => ({ code: CODE }) };
  if (r.startsWith("texts/")) return { data: () => ({ text: TX[r.slice(6)] }) };
  if (r === "config/secret") return { exists: () => cfg === "full", data: () => ({ code: CODE }) };
  return { exists: () => false, data: () => undefined };
};
export const onSnapshot = (ref, cb) => setTimeout(() => {
  const docs = list => cb({ docs: list });
  switch (String(ref)) {
    case "items": return docs(items);
    case "marks": return docs(marks);
    case "ratings": return docs(asDocs(RATINGS.map(r => ({ id: `${r.item}_${r.player}`, ...r }))));
    case "history": return docs(q.get("nohist") ? [] : asDocs(HISTORY));
    case "looks": return docs([]);
    case "players": plCb = cb; return emitPl();
    case "config/settings": return cb({ data: () => config });
    case "suggestions?toUid": return docs(asDocs(sugIn));
    case "suggestions?fromUid": return docs([]);
    default: return cb({ data: () => state }); // game/state
  }
});
export const getAuth = () => ({});
export const signInAnonymously = async () => {};
export const signOut = async () => { sessionStorage.signedOut = 1; };
export const onAuthStateChanged = (_, cb) => setTimeout(() => cb({ uid: ME_UID }));
