// The game: moving between phases (admins; every step asks first), generating cards, marking cells,
// "also on your card" nudges and the numbers behind the end-of-game summary.
import { S, size, poolFor, activeItems, itemsById, ranking, tuned, weight, myCard, myMarks, shownText } from "./state.js";
import { makeCards, cardStats, endStats, lines } from "./logic.js";
import { ref, batch, safe, writeGame, clearMarks, newItemRef, serverTimestamp } from "./data.js";
import { $, html, who, whoEmo, whoName } from "./ui.js";

// ---- phases ----
export function startRating() {
  const again = S.ratings.length > 0;
  if (confirm(again ? "לחזור לשלב הדירוג? הניחושים יינעלו שוב, והדירוגים שכבר ניתנו נשמרים." : "לנעול את הניחושים ולעבור לשלב הדירוג?"))
    writeGame({ status: "rate", cards: {}, at: serverTimestamp() });
}
export function backToEntry() {
  if (confirm("לחזור לשלב הניחושים? אפשר יהיה שוב להוסיף ולמחוק ניחושים. הדירוגים שכבר ניתנו נשמרים.")) writeGame({ status: "entry", cards: {} });
}
// writes the game state and empties everyone's marks and the journal, in one batch
async function withClearMarks(state) {
  const b = batch();
  b.set(ref("game", "state"), state);
  clearMarks(b);
  await safe(b.commit());
}
export async function backToRating() {
  if (confirm("לחזור לשלב הדירוג?\n⚠️ הכרטיסים והסימונים של כולם יימחקו! הדירוגים נשמרים.")) await withClearMarks({ status: "rate", cards: {}, at: serverTimestamp() });
}
export async function reset(ask) {
  if (confirm(ask)) await withClearMarks({ status: "entry", cards: {} });
}
export async function generate() {
  if (S.game.status !== "rate") return; // cards are generated only after the rating phase
  const n = S.sizeSel || size(), N = n * n;
  const short = S.players.filter(p => poolFor(p).length < N);
  if (short.length) return alert(`חסרים ניחושים לכרטיס של: ${short.join(", ")} (צריך לפחות ${N} לכל אחד בלוח ${n}×${n})`);
  if (!confirm(`ליצור כרטיסים ${n}×${n} ולהתחיל את המשחק?`)) return;
  await withClearMarks({ status: "play", cards: newCards(N), size: n, at: serverTimestamp() });
}
export async function endGame() {
  if (!confirm("לסיים את המשחק ולשמור את התוצאות בהיסטוריה?")) return;
  const board = size(), b = batch();
  b.set(newItemRef("history"), { at: serverTimestamp(), size: board, title: S.config.title,
    results: ranking().map(({ p, place, n, bingo, blackout }) => ({ p, place, n, bingo, blackout })),
    prophets: summary().prophets.map(({ p, n }) => ({ p, n })) });
  // at stays the start of play: the journal and the awards count from it
  b.set(ref("game", "state"), { status: "ended", cards: S.game.cards, size: board, at: S.game.at ?? serverTimestamp() });
  await safe(b.commit());
}

// ---- cards ----
const newCards = N => makeCards({ players: S.players, items: activeItems(), N, shared: tuned("shared"), mix: tuned("mix"), weight });
// preview of the current tuning, averaged over a few dry runs (only when every card can be filled)
export function tuneStats(N) {
  if (!S.tuneOpen || S.players.some(p => poolFor(p).length < N)) return "";
  const { shared, top } = cardStats(Array.from({ length: 12 }, () => Object.values(newCards(N))), itemsById());
  return `🔮 תצוגה מקדימה: שני כרטיסים חולקים בממוצע ${shared.toFixed(1)} מתוך ${N} משבצות. האדם שהכי מופיע בכרטיס תופס בו בערך ${top.toFixed(1)} משבצות.`;
}

// ---- marking: marks/{me} and its journal entry events/{item}_{me}, in one batch ----
export async function toggle(id) {
  if (S.game.status !== "play") return;
  const ids = myCard(), m = S.marks[S.me] || /** @type {Partial<Marks>} */ ({}), on = myMarks();
  on.has(id) ? on.delete(id) : on.add(id);
  navigator.vibrate?.(25);
  const bingo = lines(size()).some(l => l.every(k => on.has(ids[k]))), blackout = ids.every(x => on.has(x));
  const b = batch(), ev = ref("events", `${id}_${S.me}`);
  b.set(ref("marks", S.me), {
    marked: [...on], bingo, blackout,
    // keep a time the server already set; one still pending (offline) reads as null, so ask for it again
    bingoAt: bingo ? (m.bingo && m.bingoAt || serverTimestamp()) : null,
    blackoutAt: blackout ? (m.blackout && m.blackoutAt || serverTimestamp()) : null
  });
  on.has(id) ? b.set(ev, { item: id, player: S.me, at: serverTimestamp() }) : b.delete(ev);
  await safe(b.commit());
}

// ---- a cell: tapping opens it with its full text; marking is a deliberate second tap on "זה קרה!" ----
let cellOpen = "";
export function openCell(id) {
  const i = itemsById()[id];
  if (!i) return;
  const on = myMarks().has(id), playing = S.game.status === "play";
  cellOpen = id;
  $("#cellWho").innerHTML = html`${whoEmo(i)} ${whoName(i)}`;
  $("#cellText").textContent = shownText(i);
  $("#cellNote").textContent = !playing ? "המשחק נגמר, הכרטיס רק לצפייה." : on ? "סימנת שזה קרה." : "קרה? מסמנים. טעיתם? אפשר לבטל אחר כך.";
  const b = $("#cellMark");
  b.hidden = !playing;
  b.textContent = on ? "↩️ ביטול הסימון" : "✅ זה קרה! לסמן";
  b.classList.toggle("ghost", on);
  $("#cellDlg").showModal();
}
export function initCell() {
  $("#cellMark").onclick = () => { $("#cellDlg").close(); if (cellOpen) toggle(cellOpen); };
}

// ---- "also on your card": another player marked a cell I have too; one tap marks it here ----
const nudges = [], nudged = new Set();
let nudgeShown = "";
export function nudge(p, id) {
  if (S.game.status !== "play" || !myCard().includes(id) || myMarks().has(id) || nudged.has(id)) return;
  nudged.add(id); nudges.push({ p, id }); showNudge();
}
export function showNudge() {
  while (nudges.length && (S.game.status !== "play" || myMarks().has(nudges[0].id))) nudges.shift();
  const n = nudges[0], i = n && itemsById()[n.id], key = n ? `${n.id}|${i && shownText(i)}` : "";
  $("#nudge").hidden = !n;
  if (key === nudgeShown) return;
  nudgeShown = key;
  if (n) $("#nudge").innerHTML = html`<div>📣 אצל ${who(n.p)} זה קרה:</div><div class="nt">${i && shownText(i)}</div><div class="muted">וזה גם בכרטיס שלך!</div>
    <div class="row"><button data-nudge="yes">✅ לסמן גם אצלי</button><button class="ghost" data-nudge="no">לא עכשיו</button></div>`;
}
export function initNudge() {
  $("#nudge").onclick = e => {
    const b = e.target.closest("[data-nudge]");
    if (!b) return;
    const n = nudges.shift();
    if (b.dataset.nudge === "yes" && n && !myMarks().has(n.id)) toggle(n.id);
    showNudge();
  };
}

// ---- end of the game ----
export const summary = () => endStats({ players: S.players, byId: itemsById(), cards: S.game.cards, marks: S.marks, events: S.events, ratings: S.ratings, startAt: S.game.at });
