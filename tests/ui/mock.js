// Stand-in for the three Firebase modules (app, auth, firestore) used by index.html.
// run.mjs rewrites the gstatic imports to "./mock.js". Fixtures are chosen by URL hash params:
//   m=entry|rate|play|ended   game phase (default entry)
//   size=2..5                 board size in play/ended (default 3)
//   member=0                  device has not entered the family code yet
//   deny=1                    every setDoc fails with permission-denied (e.g. wrong code)
//   legacy=1                  item i0 is old-format (text inside the item) -> migration
//   nohist=1                  no history
//   cfg=1                     game settings saved: extra player "סבתא", extra admin "עדי", a family code
//   cfg=2                     game settings saved without the player "הדר"
//   sugg=1                    a wording suggestion from אמא waiting for מתן (on i0)
// Writes are recorded for assertions: window.W (setDoc), window.B (batches),
// sessionStorage.claims / .del (survive the reload after logout).
const P = ["אבא", "אמא", "מתן", "אורי", "עדי", "הדר"];
const q = new URLSearchParams(location.hash.slice(1));
const base = ["עוד 5 דקות מגיעים", "מי רוצה במבה?", "תסגרו את החלון", "אני לא עייף", "איפה המטען שלי?", "בואו נעצור לקפה",
  "זה בדיוק כמו בפעם שעברה", "אני רעב", "מתי מגיעים?", "תורידו את המוזיקה", "עוד תמונה אחת", "שכחתי משהו באוטו"];
const TX = Object.fromEntries(Array.from({ length: 36 }, (_, i) => ["i" + i, base[i % 12] + (i >= 12 ? " #" + i : "")]));
// item i is about P[i%6], written by P[(i+2)%6]
const items = Object.keys(TX).map((id, i) => ({ id, data: () => ({ about: P[i % 6], author: P[(i + 2) % 6], weight: 1, at: { seconds: i }, ...(i === 0 && q.get("legacy") ? { text: TX[id] } : {}) }) }));
const n = +(q.get("size") || 3), mode = q.get("m") || "entry";
const cards = Object.fromEntries(P.map(p => [p, items.filter(i => i.data().about !== p).slice(0, n * n).map(i => i.id)]));
const mine = cards["מתן"];
const state = {
  entry: { status: "entry", cards: {} },
  rate: { status: "rate", cards: {}, raters: ["מתן", "אמא"] },
  play: { status: "play", cards, size: n },
  ended: { status: "ended", cards, size: n }
}[mode];
// מתן has the main diagonal (a bingo); the others have k marks
const diag = [...Array(n).keys()].map(k => mine[k * n + k]);
const marks = P.map((p, k) => ({ id: p, data: () => p === "מתן" ? { marked: diag, bingo: true, blackout: false, bingoAt: { seconds: 50 } } : { marked: cards[p].slice(0, k), bingo: false, blackout: false } }));
const ratings = [{ item: "i1", player: "מתן", stars: 3 }, { item: "i3", player: "מתן", stars: 0 }, { item: "i5", player: "אמא", stars: 2 }];
const config = { 1: { players: [...P, "סבתא"], admins: ["עדי"], adminUids: [] }, 2: { players: P.filter(p => p !== "הדר"), admins: [], adminUids: [] } }[q.get("cfg")];
const sugIn = q.get("sugg") ? [{ id: "s1", item: "i0", from: "אמא", fromUid: "OTHER", toUid: "U1", text: "הצעה משופרת", at: { seconds: 99 } }] : [];
const history = [{ at: { seconds: 1790000000 }, size: 3, results: [{ p: "אורי", place: 1, n: 9, bingo: true, blackout: true }, { p: "מתן", place: 2, n: 7, bingo: true, blackout: false }, { p: "אמא", place: 3, n: 5, bingo: false, blackout: false }] }];

// players/{name} is live, so claims and releases come back through the snapshot like in Firestore
const PL = { "אמא": "OTHER", "מתן": "U1" };
let plCb = null;
const emitPl = () => plCb && setTimeout(() => plCb({ docs: Object.entries(PL).map(([id, uid]) => ({ id, data: () => ({ uid }) })) }));
const log = (k, v) => { try { sessionStorage[k] = (sessionStorage[k] || "") + v + ";"; } catch {} };

export const initializeApp = () => ({}), getFirestore = () => ({}), serverTimestamp = () => "TS";
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
export const writeBatch = () => { const ops = []; return { set(r, d) { ops.push(["set", String(r), d]); }, delete(r) { ops.push(["del", String(r)]); }, commit: async () => { window.B = (window.B || []).concat([ops]); } }; };
export const getDoc = async r => {
  r = String(r);
  if (r.startsWith("members/")) return { exists: () => q.get("member") !== "0" && !sessionStorage.signedOut };
  if (r.startsWith("texts/")) return { data: () => ({ text: TX[r.slice(6)] }) };
  if (r === "config/secret") return { exists: () => !!config, data: () => ({ code: "lavi" }) };
  return { exists: () => false, data: () => undefined };
};
export const onSnapshot = (ref, cb) => setTimeout(() => {
  const docs = list => cb({ docs: list.map(v => v.id && v.data ? v : { id: "h", data: () => v }) });
  switch (String(ref)) {
    case "items": return docs(items);
    case "marks": return docs(marks);
    case "ratings": return docs(ratings);
    case "history": return docs(q.get("nohist") ? [] : history);
    case "looks": return docs([]);
    case "players": plCb = cb; return emitPl();
    case "config/settings": return cb({ data: () => config });
    case "suggestions?toUid": return docs(sugIn);
    case "suggestions?fromUid": return docs([]);
    default: return cb({ data: () => state }); // game/state
  }
});
export const getAuth = () => ({});
export const signInAnonymously = async () => {};
export const signOut = async () => { sessionStorage.signedOut = 1; };
export const onAuthStateChanged = (_, cb) => setTimeout(() => cb({ uid: "U1" }));
