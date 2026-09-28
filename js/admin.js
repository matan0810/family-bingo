// The admin panel (admin mode): where the game is, moving between phases, the board size and card tuning,
// how many predictions there are, and releasing a stuck name.
import { SIZES, TUNE, STAGES } from "./config.js";
import { S, isAdmin, raters, poolFor, activeItems, size } from "./state.js";
import { enough } from "./logic.js";
import { $, html, who, countChips } from "./ui.js";
import { tuneStats } from "./game.js";

export const adminBox = () => isAdmin() && html`<section class="admin"><h2>🛠️ מסך מתכלל</h2><div id="adm"></div>
  <details class="free"><summary>🔓 שם תקוע?</summary>
    <p class="muted">מי שהטלפון הישן שלו לא זמין: משחררים את השם, והוא בוחר אותו מחדש.</p><div class="chips" id="freeList"></div></details></section>`;


export function fillAdmin() {
  const st = S.game.status;
  S.sizeSel ??= S.game.size || 3;
  const N = S.sizeSel * S.sizeSel;
  const tuning = Object.entries(TUNE).map(([k, [label, opts]]) =>
    html`<p class="muted">${label}:</p><div class="chips">${opts.map(([name], x) => html`<button class="ghost pick${x === S.tune[k] ? " on" : ""}" data-tune="${k}:${x}">${name}</button>`)}</div>`);
  const sizes = html`<p class="muted">גודל הלוח:</p><div class="chips">${SIZES.map(n => html`<button class="ghost pick${n === S.sizeSel ? " on" : ""}" data-size="${n}">${n}×${n}</button>`)}</div>
    <p class="muted">ניחושים זמינים לכרטיס של כל אחד (צריך ${N}):</p>
    <div class="counts">${countChips(p => poolFor(p).length)}</div>
    <details class="tune"${S.tuneOpen ? html` open` : ""}><summary>🎛️ כוונון הכרטיסים</summary>${tuning}<p class="muted" id="tuneStats">${tuneStats(N)}</p></details>`;
  // enough predictions for each board size, from the smallest pool any card can draw from
  const least = Math.min(...S.players.map(p => poolFor(p).length));
  const counts = html`<p class="muted" id="enough">📊 יש ${activeItems().length} ניחושים. ${SIZES.map((n, k) => html`${k ? " · " : ""}${n}×${n} ${enough(least, n)}`)}<br>✅ מספיק לחוויה טובה · 👌 אפשר, אבל הכרטיסים יהיו דומים · ❌ חסרים ניחושים</p>`;
  const ratersNote = html`<p class="muted">המדרגים הם המתכללים: ${raters().map((p, k) => html`${k ? ", " : ""}${who(p)}`)}. (מוסיפים מתכללים בהגדרות המשחק.)</p>`;
  const order = Object.keys(STAGES), at = order.indexOf(st);
  const stepper = html`<div class="stepper">${order.map((k, i) => html`<span class="${i < at ? "done" : i === at ? "now" : ""}">${i < at && "✓ "}${STAGES[k]}</span>`)}</div>`;
  const taken = S.players.filter(p => S.claims[p] && p !== S.me);
  if ($("#freeList")) $("#freeList").innerHTML = taken.length ? html`${taken.map(p => html`<button class="ghost" data-free="${p}">${who(p)} ✕</button>`)}` : html`<span class="muted">אין שמות תפוסים</span>`;
  $("#adm").innerHTML = html`${stepper}${{
    entry: () => html`<div class="step">כשכולם סיימו לכתוב</div>
      <p class="muted">הניחושים ננעלים והמתכללים מדרגים אותם. גודל הלוח בוחרים בשלב הבא.</p>${counts}${ratersNote}
      <div class="row"><button data-act="rate">${S.ratings.length ? "⭐ חזרה לשלב הדירוג" : "⭐ נעילה ומעבר לדירוג"}</button></div>`,
    rate: () => html`${ratersNote}<div class="row"><button class="ghost" data-act="back">↩️ חזרה לשלב הניחושים</button></div>
      <hr><div class="step">כשהדירוג הסתיים: יצירת כרטיסים</div>${counts}${sizes}<div class="row"><button data-act="gen">🎲 יצירת כרטיסים והתחלה</button></div>`,
    play: () => html`<p class="muted">המשחק רץ (${size()}×${size()}). המשחק נגמר רק כשלוחצים כאן.</p>
      <div class="row"><button data-act="end">🏁 סיום המשחק ושמירה</button></div>
      <div class="row"><button class="ghost" data-act="backRate">↩️ חזרה לשלב הדירוג</button><button class="ghost" data-act="reset">איפוס בלי שמירה</button></div>`,
    ended: () => html`<p class="muted">התוצאות נשמרו בהיסטוריה.</p><div class="row"><button data-act="new">🔄 משחק חדש</button></div>`
  }[st]?.()}`;
}

// the tuning panel stays open across re-renders; its preview is computed only while it is open
export const initAdmin = () => $("#app").addEventListener("toggle", e => {
  if (!e.target.matches?.(".tune")) return;
  S.tuneOpen = e.target.open;
  if (S.tuneOpen && $("#tuneStats")) $("#tuneStats").textContent = tuneStats((S.sizeSel || size()) ** 2);
}, true);
