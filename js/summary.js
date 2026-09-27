// The end-of-game summary: family prophets, awards, the reveal of who wrote what, the trip journal,
// and the history of past games.
import { S, emo, itemsById, shownText } from "./state.js";
import { need } from "./data.js";
import { $, html, av, who, whoName, medal, when } from "./ui.js";
import { summary } from "./game.js";
import { predRow, scoreRow } from "./views.js";

export const summaryView = () => html`
  <h2>🔮 נביאי המשפחה</h2><p class="muted">נקודה לכותב על כל ניחוש שלו שהתגשם.</p><ul class="score" id="prophets"></ul>
  <h2>🏅 פרסים</h2><ul id="awards"></ul>
  <details class="mine"><summary>🎭 מי ניחש מה</summary><ul id="reveal"></ul></details>
  <details class="mine"><summary>📜 יומן הטיול</summary><ul class="journal" id="journal"></ul></details>`;

// the awards, from the facts in summary()
function awards(st) {
  const list = [];
  if (st.fastest) { const { mins } = st.fastest; list.push({ e: "⚡", title: "הכי מהר", item: st.fastest.item, note: html`סימון ראשון: ${who(st.fastest.player)}${mins !== null && `, ${mins === 1 ? "דקה" : `${mins} דקות`} אחרי ההתחלה`}` }); }
  if (st.crowd) list.push({ e: "🤝", title: "קרה אצל הכי הרבה", item: st.crowd.i, note: html`${st.crowd.by.length} שחקנים סימנו: ${st.crowd.by.map(emo).join("")}` });
  if (st.predictable) list.push({ e: "🎯", title: "הכי צפוי", note: html`${st.predictable.n} ניחושים על ${who(st.predictable.p)} התגשמו` });
  if (st.missed) list.push({ e: "💤", title: "הכי שווה שלא קרה", item: st.missed.item, note: html`⭐ ${st.missed.stars.toFixed(1)} בדירוג, ואף אחד לא סימן` });
  return list;
}

export function fillSummary() {
  const st = summary(), top = Math.max(1, st.prophets[0]?.n || 0), byId = itemsById(), list = awards(st);
  need(st.reveal.filter(r => !r.i.text).map(r => r.i.id));
  $("#prophets").innerHTML = html`${st.prophets.map(r => scoreRow(r, r.n / top, r.n))}`;
  $("#awards").innerHTML = list.length
    ? html`${list.map(a => html`<li class="award"><span class="ae">${a.e}</span><span class="t"><b>${a.title}</b>${a.item && html`<br>${shownText(a.item)} <span class="muted">(${whoName(a.item)})</span>`}<br><span class="muted">${a.note}</span></span></li>`)}`
    : html`<li class="empty">אף ניחוש לא סומן הפעם 🤷</li>`;
  $("#reveal").innerHTML = html`${st.reveal.map(({ i, by }) => predRow(i, html`<br><span class="muted">✍️ ${who(i.author)} · ${by.length ? `✅ ${by.map(emo).join("")}` : "לא קרה"}</span>`))}`;
  $("#journal").innerHTML = st.journal.length
    ? html`${st.journal.map(e => html`<li><span class="muted jt">${when(e.at)}</span>${av(e.player)}<span class="t">${shownText(byId[e.item])}</span></li>`)}`
    : html`<li class="empty">היומן ריק</li>`;
}

// ---- history of finished games ----
const prophetLine = h => {
  const top = Math.max(0, ...(h.prophets || []).map(x => x.n));
  return top > 0 && html`<div class="muted">🔮 נביאי המשפחה: ${h.prophets.filter(x => x.n === top).map((x, k) => html`${k ? ", " : ""}${who(x.p)}`)} (${top})</div>`;
};
export function fillHistory() {
  $("#histBox").hidden = !S.pastGames.length;
  $("#hist").innerHTML = html`${S.pastGames.map(h => html`<li class="hist">${h.title && html`<b>${h.title}</b>`}<div class="muted">${h.at?.seconds ? new Date(h.at.seconds * 1000).toLocaleDateString("he-IL") : "עכשיו"} · ${h.size}×${h.size}</div>
    <div>${(h.results || []).map(r => html`<span class="res">${medal(r.place)} ${who(r.p)} <small>${r.blackout ? "🏆" : r.bingo ? "🎉" : ""}${r.n}/${h.size * h.size}</small></span>`)}</div>${prophetLine(h)}</li>`)}`;
}
