// Screens. render() works out the stage and rebuilds the view HTML only when the view key changes (keeping a
// typed draft and the chosen chips); otherwise the fill*() functions update the lists in place.
// All taps inside #app go through one delegated handler over the taps table (bind).
import { PHASE, GENERAL, MINI } from "./config.js";
import { S, emo, colorOf, appTitle, isAdmin, isRater, raters, rateable, myStars, itemsById, shownText, size, ranking, myCard, myMarks } from "./state.js";
import { subjectOf, aboutOf, secs, bingoCells, isBlackout } from "./logic.js";
import { live, need, migrate, addItem, delItem, rate, safe, remove, join } from "./data.js";
import { $, $$, html, col, av, generalAv, who, whoName, whoEmo, whoCol, whoAv, countChips, medal, toast, confetti } from "./ui.js";
import { claim, checkMyName, recordName } from "./account.js";
import { startRating, backToEntry, backToRating, generate, endGame, reset, toggle, showNudge } from "./game.js";
import { openEdit, acceptSuggestion, rejectSuggestion, cleanSuggestions } from "./wording.js";
import { fillCfg } from "./settings.js";
import { openLooks, openHow } from "./dialogs.js";
import { adminBox, fillAdmin } from "./admin.js";
import { summaryView, fillSummary, fillHistory } from "./summary.js";

export function render() {
  const on = live();
  if (on) { checkMyName(); recordName(); cleanSuggestions(); }
  const { me } = S, whoBtn = $("#who");
  whoBtn.hidden = !me || !on; whoBtn.innerHTML = me ? html`${who(me)} ⚙️` : "";
  document.documentElement.style.setProperty("--me", me ? colorOf(me) : "var(--hot)");
  $("#phase").textContent = PHASE[S.game.status] ?? "";
  $("#logo .word").textContent = document.title = appTitle();

  const stage = !S.uid ? "load" : !S.member ? "code" : !S.welcomed ? "welcome" : !on ? "load" : !me ? "pick" : S.game.status in PHASE ? S.game.status : "entry";
  const key = `${me}|${stage}|${stage === "rate" && isRater()}|${JSON.stringify(S.looks)}`;
  if (key !== S.view) {
    S.view = key; S.shown = null;
    const typing = $("#text")?.value, chosen = $$("#add input:checked").map(i => i.name + ":" + i.value);
    document.body.classList.toggle("intro", stage === "welcome");
    if (stage === "welcome") setTimeout(() => S.view.startsWith(`${S.me}|welcome`) && confetti(90), 2400);
    $("#app").innerHTML = views[stage]();
    if (typing && $("#text")) $("#text").value = typing;
    $$("#add input").forEach(i => i.checked = chosen.includes(i.name + ":" + i.value));
    syncWith();
    bind();
  }
  if (stage === "welcome") return;
  if (stage === "pick") $("#app").innerHTML = pickView();
  if (!me || !on) return;
  ({ entry: fillEntry, rate: fillRate, play: fillPlay, ended: fillEnded })[stage]();
  fillHistory();
  if (isAdmin()) fillAdmin();
  if ($("#cfgDlg").open) fillCfg();
  showNudge();
}

// ---- welcome screen: right after the family code, and again from the header logo;
// the phone's back button (or "יאללה") returns to the game ----
export function showWelcome() {
  if (!S.welcomed) return;
  history.pushState({ welcome: 1 }, "");
  S.welcomed = false; S.view = ""; render(); scrollTo(0, 0);
}
function leaveWelcome() {
  if (history.state?.welcome) return history.back(); // popstate closes it
  closeWelcome();
}
function closeWelcome() {
  S.welcomed = true;
  try { localStorage.setItem("bingo-welcome", "1"); } catch {}
  S.view = ""; render(); scrollTo(0, 0);
}
export const initWelcome = () => addEventListener("popstate", () => { if (!S.welcomed) closeWelcome(); });

// ---- view templates ----
const welcomeView = () => html`<section class="welcome">
  <div class="fam">${S.players.map((p, k) => html`<span style="--k:${k}">${emo(p)}</span>`)}</div>
  <div class="mini" aria-hidden="true">${MINI.map((e, k) => k % 4 ? html`<span>${e}</span>` : html`<span class="hit" style="--d:${k / 4}">${e}</span>`)}<b class="yay">בינגו!</b></div>
  <h2 class="wtitle">${appTitle()}</h2>
  <p class="wsub">מנחשים מה יקרה בטיול 🔮<br>ומסמנים כשזה קורה ✅</p>
  <button class="go" data-act="start">יאללה! 🚀</button>
</section>`;

const codeView = () => html`<h2>🔐 קוד משפחתי</h2>
  <form id="join" class="panel"><div class="muted">פעם אחת בכל מכשיר.</div>
  <div class="row"><input class="field" id="code" required autocomplete="off" placeholder="הקוד"><button>כניסה</button></div>
  <p class="muted" id="err" role="alert"></p></form>`;

const pickView = () => html`<h2>מי משחק? 👋</h2><div class="names">${S.players.map((p, k) => {
  const taken = S.claims[p] && S.claims[p] !== S.uid;
  return html`<button data-me="${p}" class="${taken ? "taken" : ""}" style="${col(p)};animation-delay:${k * 60}ms"><span class="e">${emo(p)}</span>${p}${taken && html`<small>תפוס · זה אתם?</small>`}</button>`;
})}</div>`;

const lookBtn = () => html`<button class="av" data-look style="${col(S.me)}" aria-label="בחירת אימוג׳י">${emo(S.me)}</button>`;
const hello = () => html`<div class="panel hello">${lookBtn()}<span class="t">היי ${S.me}! 👋</span></div>`;
const tail = () => html`<section id="histBox" hidden><h2>📚 היסטוריה</h2><ul id="hist"></ul></section>${adminBox()}
  <p class="howto"><button class="ghost" data-act="howto">❓ איך משחקים?</button></p>`;

const chipsFor = name => S.players.filter(p => p !== S.me).map(p =>
  html`<label class="chip" style="${col(p)}"><input type="checkbox" name="${name}" value="${p}">${av(p)}${p}</label>`);
const entryView = () => html`${hello()}
  <h2>✍️ ניחוש חדש</h2>
  <form id="add" class="panel">
    <div class="muted">על מי? (אחד, או אירוע כללי)</div>
    <div class="chips">${chipsFor("about")}
      <label class="chip" style="--c:${GENERAL}"><input type="checkbox" name="general">${generalAv}כללי</label></div>
    <div class="with"><div class="muted">🙈 עוד מעורבים? (גם הם לא יראו את הניחוש ולא יקבלו אותו בכרטיס)</div>
    <div class="chips">${chipsFor("with")}</div></div>
    <textarea id="text" required maxlength="140" placeholder="למשל: &quot;עוד 5 דקות מגיעים&quot;"></textarea>
    <div class="row"><button>הוספת ניחוש ✨</button></div>
  </form>
  <h2>🎯 כמה ניחושים על כל אחד</h2><div class="counts" id="counts"></div>
  <h2>📜 הניחושים שלי</h2><p class="muted">🤫 כל אחד רואה רק את הניחושים שהוא כתב. כולם יתגלו בטיול!</p><ul id="list"></ul>
  ${tail()}`;

const rateView = () => html`${hello()}
  ${isRater()
    ? html`<h2>⭐ דרגו את הניחושים <span class="muted" id="rateCnt"></span></h2>
       <p class="muted">כמה כיף יהיה לראות את זה בכרטיס? 🥱 = לא מעניין, ⭐⭐⭐ = חובה! ניחושים עליכם או שלכם לא מופיעים כאן.</p><ul id="rate"></ul>`
    : html`<div class="panel" style="margin-top:16px">⏳ עכשיו שלב הדירוג. המתכללים בוחרים את הניחושים הכי טובים, ואחר כך מתחילים!</div>`}
  <section id="sugBox" hidden><h2>💬 הצעות ניסוח לניחושים שלך</h2><ul id="sugList"></ul></section>
  <h2>📊 התקדמות המדרגים</h2><ul class="score" id="raters"></ul>
  <details class="mine"><summary>📜 הניחושים שלי (אפשר לערוך עד סוף הדירוג)</summary><ul id="list"></ul></details>
  ${tail()}`;

const playView = () => html`
  <div class="panel status"><div class="ring" id="ring"><span id="cnt"></span></div>
    <div><div class="display" style="font-size:22px">הכרטיס של ${S.me} ${lookBtn()}</div>
    <div class="muted">שורה, עמודה או אלכסון = בינגו. כרטיס מלא = ניצחון 🏆</div></div></div>
  <div id="banner"></div>
  <div class="grid" id="card"></div>
  <h2>🏁 טבלת המשחק</h2><ul class="score" id="score"></ul>
  ${tail()}`;

const endedView = () => html`
  <div class="banner" id="winner"></div>
  <h2>🏆 התוצאות</h2><ul class="score" id="score"></ul>
  ${summaryView()}
  <h2>🃏 הכרטיס שלי</h2><div class="grid done" id="card"></div>
  ${tail()}`;

const views = { welcome: welcomeView, load: () => html`<p class="muted">טוען…</p>`, code: codeView, pick: () => "", entry: entryView, rate: rateView, play: playView, ended: endedView };

// ---- rows shared by the lists ----
// a prediction: who it is about, its text, and whatever comes after the text / after the row
export const predRow = (i, rest = "", after = "") =>
  html`<li class="pred" style="${whoCol(i)}">${whoAv(i)}<span class="t"><span class="who">${whoName(i)}</span> · ${shownText(i)}${rest}</span>${after}</li>`;
// a player with a place (if any), a bar (0..1) and a number
export const scoreRow = (r, bar, n, extra = "") =>
  html`<li style="${col(r.p)}">${r.place && html`<span class="place">${medal(r.place)}</span>`}${av(r.p)}<span class="name">${r.p}</span><span class="bar"><i style="width:${bar * 100}%"></i></span><span class="n">${n}</span>${extra}</li>`;

// ---- filling the lists ----
function fillEntry() {
  $("#counts").innerHTML = html`${countChips(p => S.items.filter(i => subjectOf(i) === p).length)}<span style="--c:${GENERAL}">${generalAv}כללי <b>${S.items.filter(i => !aboutOf(i).length).length}</b></span>`;
  migrate();
  fillMine(true);
}

// my predictions: editable until the rating phase ends, deletable only while writing
function fillMine(canDelete) {
  const mine = S.items.filter(i => i.author === S.me).sort((a, b) => (b.at?.seconds ?? 9e9) - (a.at?.seconds ?? 9e9));
  const buttons = i => html`<button class="ghost" data-edit="${i.id}" aria-label="עריכה">✏️</button>${canDelete && html`<button class="ghost" data-del="${i.id}" aria-label="מחיקה">🗑️</button>`}`;
  $("#list").innerHTML = mine.length ? html`${mine.map(i => predRow(i, "", buttons(i)))}` : html`<li class="empty">עוד אין פה ניחושים שלך. קדימה! 🚀</li>`;
  need(mine.filter(i => !i.text).map(i => i.id));
}

function fillRate() {
  if (isRater()) {
    const list = rateable(S.me).sort((a, b) => secs(a.at) - secs(b.at)), my = myStars(), sent = new Set(S.sugOut.filter(x => x.from === S.me).map(x => x.item));
    need(list.filter(i => !i.text).map(i => i.id));
    $("#rateCnt").textContent = `(${list.filter(i => i.id in my).length}/${list.length})`;
    const star = (i, k) => html`<button class="star${(k ? my[i.id] >= k : my[i.id] === 0) ? " on" : ""}" data-rate="${i.id}" data-k="${k}" aria-label="${k} כוכבים">${k ? "★" : "🥱"}</button>`;
    const suggest = i => sent.has(i.id) ? html`<span class="sent">💬 נשלחה הצעה</span>` : html`<button class="star" data-suggest="${i.id}" aria-label="הצעת ניסוח">✏️</button>`;
    $("#rate").innerHTML = list.length ? html`${list.map(i => predRow(i, html`<span class="stars">${[0, 1, 2, 3].map(k => star(i, k))}${suggest(i)}</span>`))}` : html`<li class="empty">אין ניחושים לדרג</li>`;
  }
  $("#raters").innerHTML = html`${raters().map(p => {
    const total = rateable(p).length, done = S.ratings.filter(r => r.player === p).length;
    return scoreRow({ p }, total ? done / total : 1, `${done}/${total}`);
  })}`;
  // suggestions come by device, so also check the prediction is mine
  const byId = itemsById(), mine = S.sugIn.filter(x => byId[x.item]?.author === S.me);
  $("#sugBox").hidden = !mine.length;
  $("#sugList").innerHTML = html`${mine.map(x => { const i = byId[x.item]; return html`<li class="pred sugg" style="${whoCol(i)}">
    <span>${whoAv(i)} <span class="who">${whoName(i)}</span> · <span class="old">${shownText(i)}</span></span>
    <span class="new">✏️ ${x.text}</span><span class="muted">הצעה של ${who(x.from)}</span>
    <span class="row"><button data-accept="${x.id}">✅ אישור</button><button class="ghost" data-reject="${x.id}">✖️ לא, תודה</button></span></li>`; })}`;
  need(mine.map(x => x.item));
  fillMine(false);
}

function fillCard(interactive) {
  const ids = myCard(), n = size(), byId = itemsById(), on = myMarks();
  const hot = bingoCells(ids, on, n), full = isBlackout(ids, on), card = $("#card");
  card.dataset.n = n; card.style.gridTemplateColumns = `repeat(${n},1fr)`;
  card.classList.toggle("full", full);
  card.innerHTML = html`${ids.map((id, k) => {
    const i = byId[id] || { text: "(נמחק)", gone: true };
    const cls = `${on.has(id) ? " on" : ""}${on.has(id) && S.shown && !S.shown.has(id) ? " pop" : ""}${hot.has(k) ? " line" : ""}`;
    const tap = interactive && html` role="button" tabindex="0" aria-pressed="${String(on.has(id))}" data-cell="${id}"`;
    return html`<div class="cell${cls}"${tap} data-stamp="${emo(S.me)}"><span class="txt">${shownText(i)}</span>${!i.gone && html`<span class="tag" style="${whoCol(i)}"><i>${whoEmo(i)}</i><b>${whoName(i)}</b></span>`}</div>`;
  })}`;
  S.shown = on;
  need(ids.filter(id => byId[id] && !byId[id].text));
  return { on, hot, full, N: ids.length };
}

function fillScore() {
  $("#score").innerHTML = html`${ranking().map(r => {
    const N = S.game.cards[r.p].length;
    return scoreRow(r, r.n / N, `${r.n}/${N}`, r.blackout ? html`<span class="win">🏆 מלא</span>` : r.bingo && html`<span class="win">🎉 בינגו</span>`);
  })}`;
}

function fillPlay() {
  const { on, hot, full, N } = fillCard(true);
  $("#ring").style.setProperty("--p", N ? on.size / N * 100 : 0);
  $("#cnt").textContent = `${on.size}/${N}`;
  $("#banner").innerHTML = full ? html`<div class="banner">🏆 כרטיס מלא! אלופים! 🏆</div>` : hot.size ? html`<div class="banner">🎉 יש לך בינגו! ממשיכים לכרטיס מלא</div>` : "";
  fillScore();
}

function fillEnded() {
  fillCard(false);
  fillScore();
  const winners = ranking().filter(r => r.place === 1).map(r => who(r.p));
  $("#winner").innerHTML = winners.length ? html`🏆 במקום הראשון: ${winners.map((w, k) => html`${k ? ", " : ""}${w}`)} 🏆` : "🏁 המשחק נגמר";
  fillSummary();
}

// ---- taps inside #app ----
const act = {
  start: leaveWelcome, howto: openHow,
  rate: startRating, back: backToEntry, backRate: backToRating, gen: generate, end: endGame,
  reset: () => reset("לאפס את המשחק בלי לשמור? הניחושים נשמרים."), new: () => reset("להתחיל משחק חדש? הניחושים נשמרים.")
};
// data-* attribute → what a tap on it does (the value of the attribute, and the element)
const taps = [
  ["look", () => openLooks()],
  ["me", (v, t) => { if (!t.classList.contains("taken") || confirm(`השם ${v} כבר תפוס בטלפון אחר.\nזה אתם? השם יעבור לטלפון הזה, והטלפון השני יחזור למסך בחירת השם.`)) claim(v); }],
  ["del", v => { if (confirm("למחוק את הניחוש?")) safe(delItem(v)); }],
  ["edit", v => openEdit("edit", v)],
  ["suggest", v => openEdit("suggest", v)],
  ["accept", acceptSuggestion],
  ["reject", rejectSuggestion],
  ["cell", toggle],
  ["free", v => { if (confirm(`לשחרר את השם ${v}?`)) remove("players", v).then(ok => ok && toast(`🔓 השם ${v} פנוי`)); }],
  // tapping the current star lowers it by one
  ["rate", (v, t) => { const k = +t.dataset.k; rate(v, myStars()[v] === k && k > 0 ? k - 1 : k); }],
  ["size", v => { S.sizeSel = +v; render(); }],
  ["tune", v => { const [k, x] = v.split(":"); S.tune[k] = +x; render(); }],
  ["act", v => act[v]?.()],
];
const tapSelector = taps.map(([k]) => `[data-${k}]`).join(",");

function bind() {
  const app = $("#app");
  app.onclick = e => {
    const t = e.target.closest(tapSelector);
    if (!t) return;
    const [k, run] = taps.find(([k]) => t.hasAttribute(`data-${k}`));
    run(t.getAttribute(`data-${k}`), t);
  };
  app.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset.cell) { e.preventDefault(); toggle(e.target.dataset.cell); } };
  $("#add")?.addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("#text").value.trim(), subject = $("input[name=about]:checked")?.value;
    if (!text) return;
    if (!subject && !$("input[name=general]").checked) return toast("✋ בוחרים על מי, או \"כללי\"");
    const about = subject ? [subject, ...$$("input[name=with]:checked").map(i => i.value).filter(p => p !== subject)] : [];
    $("#text").value = "";
    if (!await safe(addItem(about, text))) $("#text").value = text;
  });
  // one subject or "כללי"; tapping another name moves the choice
  $("#add")?.addEventListener("change", e => {
    if (e.target.checked && ["general", "about"].includes(e.target.name)) $$("input[name=about],input[name=general]").forEach(i => i.checked = i === e.target);
    syncWith();
  });
  $("#join")?.addEventListener("submit", e => { e.preventDefault(); join($("#code").value.trim()); });
}

// the involved row shows once there is a subject, without the subject's own chip
function syncWith() {
  const subject = $("#add input[name=about]:checked")?.value, box = $("#add .with");
  if (!box) return;
  box.hidden = !subject;
  $$("#add input[name=with]").forEach(i => {
    const own = i.value === subject;
    i.closest("label").hidden = own;
    if (own || !subject) i.checked = false;
  });
}
