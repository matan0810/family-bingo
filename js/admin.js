// The "🛠️ ניהול" tab of the settings sheet (admins): where the game is, the one next step, the choices for that
// step (board size, how to win, card tuning), and rarer tools folded away: a new card for a player (founders),
// the danger zone and releasing a stuck name.
import { SIZES, TUNE, STAGES, WINS } from "./config.js";
import { S, isFounderName, raters, poolFor, activeItems, size, win } from "./state.js";
import { enough } from "./logic.js";
import { remove } from "./data.js";
import { $, $$, html, who, col, countChips, toast } from "./ui.js";
import { render } from "./views.js";
import { tuneStats, startRating, backToEntry, backToRating, generate, endGame, resetGame, newGame, newCard } from "./game.js";

const fold = (k, title, body, cls = "fold") => html`<details class="${cls}" data-k="${k}"><summary>${title}</summary>${body}</details>`;

export function fillAdmin() {
  const st = S.game.status;
  S.sizeSel ??= S.game.size || 3;
  S.winSel ??= win();
  const N = S.sizeSel * S.sizeSel;
  const choice = (label, items) => html`<p class="label">${label}</p><div class="chips">${items}</div>`;
  const pick = (on, attr, v, text) => html`<button class="ghost pick${on ? " on" : ""}" data-${attr}="${v}">${text}</button>`;
  // enough predictions for each board size, from the smallest pool any card can draw from
  const least = Math.min(...S.players.map(p => poolFor(p).length));
  const counts = html`<p class="muted" id="enough">📊 ${activeItems().length} ניחושים. ${SIZES.map((n, k) => html`${k ? " · " : ""}${n}×${n} ${enough(least, n)}`)}</p>`;
  const legend = html`<p class="muted">✅ מספיק לחוויה טובה · 👌 אפשר, אבל הכרטיסים יהיו דומים · ❌ חסרים ניחושים</p>`;
  const order = Object.keys(STAGES), at = order.indexOf(st);
  const stepper = html`<div class="stepper">${order.map((k, i) => html`<span class="${i < at ? "done" : i === at ? "now" : ""}">${i < at && "✓ "}${STAGES[k]}</span>`)}</div>`;
  const next = (title, body, button) => html`<div class="next"><div class="step">${title}</div>${body}<div class="row"><button data-act="${button[0]}">${button[1]}</button></div></div>`;
  const back = (act, text) => html`<div class="row"><button class="ghost small" data-act="${act}">${text}</button></div>`;
  const taken = S.players.filter(p => S.claims[p] && p !== S.me);
  const stuck = fold("free", "🔓 שם תקוע?", html`<p class="muted">מי שהטלפון הישן שלו לא זמין: משחררים את השם, והוא בוחר אותו מחדש.</p>
    <div class="chips">${taken.length ? taken.map(p => html`<button class="ghost" data-free="${p}">${who(p)} ✕</button>`) : html`<span class="muted">אין שמות תפוסים</span>`}</div>`);
  const body = {
    entry: () => html`${next("כשכולם סיימו לכתוב", html`<p class="muted">הניחושים ננעלים, והמדרגים (המתכללים: ${raters().map((p, k) => html`${k ? ", " : ""}${who(p)}`)}) נותנים כוכבים.</p>${counts}${legend}`,
      ["rate", S.ratings.length ? "⭐ חזרה לשלב הדירוג" : "⭐ נעילה ומעבר לדירוג"])}`,
    rate: () => html`${next("כשהדירוג הסתיים: יצירת כרטיסים", html`
        <p class="muted">מדרגים: ${raters().map((p, k) => html`${k ? ", " : ""}${who(p)}`)}</p>
        ${choice("גודל הלוח", SIZES.map(n => pick(n === S.sizeSel, "size", n, `${n}×${n}`)))}
        ${choice("איך מנצחים", Object.entries(WINS).map(([k, name]) => pick(k === S.winSel, "win", k, name)))}
        <p class="muted">${S.winSel === "line" ? "בינגו קלאסי: מי שממלא ראשון שורה, עמודה או אלכסון, מנצח. משחק קצר." : "מי שממלא ראשון את כל הכרטיס מנצח. בינגו (שורה) הוא בונוס בדרך. מתאים לטיול ארוך."}</p>
        ${fold("pool", "📊 ניחושים זמינים", html`<p class="muted">לכל כרטיס צריך ${N}. כמה יש לכל אחד:</p><div class="counts">${countChips(p => poolFor(p).length)}</div>${counts}${legend}`)}
        ${fold("tune", "🎛️ כוונון הכרטיסים", html`${Object.entries(TUNE).map(([k, [label, opts]]) => choice(label, opts.map(([name], x) => pick(x === S.tune[k], "tune", `${k}:${x}`, name))))}<p class="muted" id="tuneStats">${tuneStats(N)}</p>`)}`,
      ["gen", "🎲 יצירת כרטיסים והתחלה"])}${back("back", "↩️ חזרה לשלב הניחושים")}`,
    play: () => html`${next(`המשחק רץ: ${size()}×${size()}, ${WINS[win()]}`, html`<p class="muted">המשחק נגמר רק כשלוחצים כאן, גם אם מישהו כבר ניצח.</p>`, ["end", "🏁 סיום המשחק ושמירה"])}
      ${isFounderName(S.me) && fold("cards", "🎲 כרטיס חדש לשחקן", html`<p class="muted">כרטיס קשה מדי, או יותר מדי משבצות על אדם אחד? השחקן מקבל כרטיס חדש באותו גודל, והסימונים שלו מתאפסים. לשאר לא משתנה כלום.</p>
        <ul class="plain">${S.players.filter(p => S.game.cards?.[p]).map(p => html`<li style="${col(p)}"><span class="name">${who(p)} <small class="muted">${S.marks[p]?.marked?.length || 0}/${size() ** 2}</small></span><button class="ghost small" data-card="${p}">🔄 כרטיס חדש</button></li>`)}</ul>`)}`,
    ended: () => next("התוצאות נשמרו בהיסטוריה", "", ["new", "🔄 משחק חדש"])
  }[st]?.();
  // last and apart: what throws away everyone's cards and marks
  const danger = st === "play" && fold("danger", "⚠️ אזור מסוכן", html`<p class="muted">מוחק את הכרטיסים והסימונים של כולם, בלי לשמור תוצאות. צריך להקליד "מחיקה" כדי לאשר.</p>
    <div class="row"><button class="ghost warn" data-act="backRate">↩️ חזרה לשלב הדירוג</button><button class="ghost warn" data-act="reset">איפוס בלי שמירה</button></div>`, "danger");
  const open = $$("#adm details[open]").map(d => d.dataset.k);
  $("#adm").innerHTML = html`${stepper}${body}${stuck}${danger}`;
  $$("#adm details").forEach(d => d.open = open.includes(d.dataset.k));
}

// phase moves close the sheet once confirmed, so the new phase shows underneath
const act = { rate: startRating, back: backToEntry, gen: generate, end: endGame, backRate: backToRating, reset: resetGame, new: newGame };
const taps = {
  act: v => { if (act[v]?.()) $("#setDlg").close(); },
  size: v => { S.sizeSel = +v; },
  win: v => { S.winSel = v === "line" ? "line" : "full"; },
  tune: v => { const [k, x] = v.split(":"); S.tune[k] = +x; },
  card: p => newCard(p)?.then(ok => ok && toast(`🎲 ל־${p} יש כרטיס חדש`)),
  free: v => { if (confirm(`לשחרר את השם ${v}?`)) remove("players", v).then(ok => ok && toast(`🔓 השם ${v} פנוי`)); },
};

export function initAdmin() {
  const box = $("#adm");
  box.onclick = e => {
    const t = e.target.closest("[data-act],[data-size],[data-win],[data-tune],[data-card],[data-free]");
    if (!t) return;
    const k = Object.keys(taps).find(k => t.hasAttribute(`data-${k}`));
    taps[k](t.getAttribute(`data-${k}`));
    if (["size", "win", "tune"].includes(k)) render();
  };
  // the tuning preview is computed only while its fold is open
  box.addEventListener("toggle", e => {
    if (e.target.dataset?.k !== "tune") return;
    S.tuneOpen = e.target.open;
    if (S.tuneOpen) $("#tuneStats").textContent = tuneStats((S.sizeSel || size()) ** 2);
  }, true);
}
