// Screens. render() works out the stage and rebuilds the view HTML only when the view key changes (keeping a
// typed draft and the chosen chips); otherwise the fill*() functions update the lists in place.
// All clicks inside #app go through one delegated handler on data-* attributes (bind).
import { PHASE, STAGES, SIZES, TUNE, GENERAL, MINI } from "./config.js";
import { S, emo, colorOf, appTitle, isAdmin, isRater, raters, rateable, myStars, poolFor, activeItems, itemsById, shownText, size, ranking, myCard, myMarks } from "./state.js";
import { subjectOf, aboutOf, secs, bingoCells, isBlackout, enough } from "./logic.js";
import { live, need, migrate, addItem, delItem, rate, safe, remove, join } from "./data.js";
import { $, $$, esc, col, av, generalAv, whoName, whoEmo, whoCol, whoAv, countChips, medal, when, toast, confetti } from "./ui.js";
import { claim, checkMyName, recordName } from "./account.js";
import { startRating, backToEntry, backToRating, generate, endGame, reset, toggle, tuneStats, showNudge, summary } from "./game.js";
import { openEdit, acceptSuggestion, rejectSuggestion, cleanSuggestions } from "./wording.js";
import { fillCfg } from "./settings.js";
import { openLooks, openHow } from "./dialogs.js";

export function render() {
  const on = live();
  if (on) { checkMyName(); recordName(); cleanSuggestions(); }
  const { me } = S, who = $("#who");
  who.hidden = !me || !on; who.innerHTML = me ? `${emo(me)} ${esc(me)} ⚙️` : "";
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
const welcomeView = () => `<section class="welcome">
  <div class="fam">${S.players.map((p, k) => `<span style="--k:${k}">${emo(p)}</span>`).join("")}</div>
  <div class="mini" aria-hidden="true">${MINI.map((e, k) => `<span${k % 4 ? "" : ` class="hit" style="--d:${k / 4}"`}>${e}</span>`).join("")}<b class="yay">בינגו!</b></div>
  <h2 class="wtitle">${esc(appTitle())}</h2>
  <p class="wsub">מנחשים מה יקרה בטיול 🔮<br>ומסמנים כשזה קורה ✅</p>
  <button class="go" data-act="start">יאללה! 🚀</button>
</section>`;

const codeView = () => `<h2>🔐 קוד משפחתי</h2>
  <form id="join" class="panel"><div class="muted">פעם אחת בכל מכשיר.</div>
  <div class="row"><input class="field" id="code" required autocomplete="off" placeholder="הקוד"><button>כניסה</button></div>
  <p class="muted" id="err" role="alert"></p></form>`;

const pickView = () => `<h2>מי משחק? 👋</h2><div class="names">${S.players.map((p, k) => {
  const taken = !S.legacy && S.claims[p] && S.claims[p] !== S.uid;
  return `<button data-me="${esc(p)}" class="${taken ? "taken" : ""}" style="${col(p)};animation-delay:${k * 60}ms"><span class="e">${emo(p)}</span>${esc(p)}${taken ? "<small>תפוס · זה אתם?</small>" : ""}</button>`;
}).join("")}</div>`;

const lookBtn = () => `<button class="av" data-look style="${col(S.me)}" aria-label="בחירת אימוג׳י">${emo(S.me)}</button>`;
const hello = () => `<div class="panel hello">${lookBtn()}<span class="t">היי ${esc(S.me)}! 👋</span></div>`;
const adminBox = () => isAdmin() ? `<section class="admin"><h2>🛠️ מסך מתכלל</h2><div id="adm"></div>${S.legacy ? "" : `
  <details class="free"><summary>🔓 שם תקוע?</summary>
    <p class="muted">מי שהטלפון הישן שלו לא זמין: משחררים את השם, והוא בוחר אותו מחדש.</p><div class="chips" id="freeList"></div></details>`}</section>` : "";
const tail = () => `<section id="histBox" hidden><h2>📚 היסטוריה</h2><ul id="hist"></ul></section>` + adminBox()
  + `<p class="howto"><button class="ghost" data-act="howto">❓ איך משחקים?</button></p>`;

const chipsFor = name => S.players.filter(p => p !== S.me).map(p =>
  `<label class="chip" style="${col(p)}"><input type="checkbox" name="${name}" value="${esc(p)}">${av(p)}${esc(p)}</label>`).join("");
const entryView = () => `${hello()}
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

const rateView = () => `${hello()}
  ${isRater()
    ? `<h2>⭐ דרגו את הניחושים <span class="muted" id="rateCnt"></span></h2>
       <p class="muted">כמה כיף יהיה לראות את זה בכרטיס? 🥱 = לא מעניין, ⭐⭐⭐ = חובה! ניחושים עליכם או שלכם לא מופיעים כאן.</p><ul id="rate"></ul>`
    : `<div class="panel" style="margin-top:16px">⏳ עכשיו שלב הדירוג. המתכללים בוחרים את הניחושים הכי טובים, ואחר כך מתחילים!</div>`}
  <section id="sugBox" hidden><h2>💬 הצעות ניסוח לניחושים שלך</h2><ul id="sugList"></ul></section>
  <h2>📊 התקדמות המדרגים</h2><ul class="score" id="raters"></ul>
  <details class="mine"><summary>📜 הניחושים שלי (אפשר לערוך עד סוף הדירוג)</summary><ul id="list"></ul></details>
  ${tail()}`;

const playView = () => `
  <div class="panel status"><div class="ring" id="ring"><span id="cnt"></span></div>
    <div><div class="display" style="font-size:22px">הכרטיס של ${esc(S.me)} ${lookBtn()}</div>
    <div class="muted">שורה, עמודה או אלכסון = בינגו. כרטיס מלא = ניצחון 🏆</div></div></div>
  <div id="banner"></div>
  <div class="grid" id="card"></div>
  <h2>🏁 טבלת המשחק</h2><ul class="score" id="score"></ul>
  ${tail()}`;

const endedView = () => `
  <div class="banner" id="winner"></div>
  <h2>🏆 התוצאות</h2><ul class="score" id="score"></ul>
  <h2>🔮 נביאי המשפחה</h2><p class="muted">נקודה לכותב על כל ניחוש שלו שהתגשם.</p><ul class="score" id="prophets"></ul>
  <h2>🏅 פרסים</h2><ul id="awards"></ul>
  <details class="mine"><summary>🎭 מי ניחש מה</summary><ul id="reveal"></ul></details>
  <details class="mine"><summary>📜 יומן הטיול</summary><ul class="journal" id="journal"></ul></details>
  <h2>🃏 הכרטיס שלי</h2><div class="grid done" id="card"></div>
  ${tail()}`;

const views = { welcome: welcomeView, load: () => `<p class="muted">טוען…</p>`, code: codeView, pick: () => "", entry: entryView, rate: rateView, play: playView, ended: endedView };

// ---- filling the lists ----
// a prediction as a list row: who it is about, its text, and whatever goes after it
const predRow = (i, rest = "", cls = "pred") => `<li class="${cls}" style="${whoCol(i)}">${whoAv(i)}<span class="t"><span class="who">${esc(whoName(i))}</span> · ${esc(shownText(i))}${rest}</span></li>`;
const scoreRow = (r, bar, n, extra = "") => `<li style="${col(r.p)}"><span class="place">${medal(r.place)}</span>${av(r.p)}<span class="name">${esc(r.p)}</span><span class="bar"><i style="width:${bar * 100}%"></i></span><span class="n">${n}</span>${extra}</li>`;

function fillEntry() {
  $("#counts").innerHTML = countChips(p => S.items.filter(i => subjectOf(i) === p).length)
    + `<span style="--c:${GENERAL}">${generalAv}כללי <b>${S.items.filter(i => !aboutOf(i).length).length}</b></span>`;
  if (!S.legacy) migrate();
  fillMine(true);
}

// my predictions: editable until the rating phase ends, deletable only while writing
function fillMine(canDelete) {
  const mine = S.items.filter(i => i.author === S.me).sort((a, b) => (b.at?.seconds ?? 9e9) - (a.at?.seconds ?? 9e9));
  $("#list").innerHTML = mine.map(i => `<li class="pred" style="${whoCol(i)}">${whoAv(i)}<span class="t"><span class="who">${esc(whoName(i))}</span> · ${esc(shownText(i))}</span><button class="ghost" data-edit="${esc(i.id)}" aria-label="עריכה">✏️</button>${canDelete ? `<button class="ghost" data-del="${esc(i.id)}" aria-label="מחיקה">🗑️</button>` : ""}</li>`).join("")
    || `<li class="empty">עוד אין פה ניחושים שלך. קדימה! 🚀</li>`;
  need(mine.filter(i => !i.text).map(i => i.id));
}

function fillRate() {
  if (isRater()) {
    const list = rateable(S.me).sort((a, b) => secs(a.at) - secs(b.at)), my = myStars(), sent = new Set(S.sugOut.filter(x => x.from === S.me).map(x => x.item));
    need(list.filter(i => !i.text).map(i => i.id));
    $("#rateCnt").textContent = `(${list.filter(i => i.id in my).length}/${list.length})`;
    const stars = i => [0, 1, 2, 3].map(k => `<button class="star${(k ? my[i.id] >= k : my[i.id] === 0) ? " on" : ""}" data-rate="${esc(i.id)}" data-k="${k}" aria-label="${k} כוכבים">${k ? "★" : "🥱"}</button>`).join("");
    const suggest = i => sent.has(i.id) ? `<span class="sent">💬 נשלחה הצעה</span>` : `<button class="star" data-suggest="${esc(i.id)}" aria-label="הצעת ניסוח">✏️</button>`;
    $("#rate").innerHTML = list.map(i => predRow(i, `\n        <span class="stars">${stars(i)}\n        ${suggest(i)}</span>`)).join("") || `<li class="empty">אין ניחושים לדרג</li>`;
  }
  $("#raters").innerHTML = raters().map(p => {
    const total = rateable(p).length, done = S.ratings.filter(r => r.player === p).length;
    return `<li style="${col(p)}">${av(p)}<span class="name">${esc(p)}</span><span class="bar"><i style="width:${total ? done / total * 100 : 100}%"></i></span><span class="n">${done}/${total}</span></li>`;
  }).join("");
  // suggestions come by device, so also check the prediction is mine
  const byId = itemsById(), mine = S.sugIn.filter(x => byId[x.item]?.author === S.me);
  $("#sugBox").hidden = !mine.length;
  $("#sugList").innerHTML = mine.map(x => { const i = byId[x.item]; return `<li class="pred sugg" style="${whoCol(i)}">
    <span>${whoAv(i)} <span class="who">${esc(whoName(i))}</span> · <span class="old">${esc(shownText(i))}</span></span>
    <span class="new">✏️ ${esc(x.text)}</span><span class="muted">הצעה של ${emo(x.from)} ${esc(x.from)}</span>
    <span class="row"><button data-accept="${esc(x.id)}">✅ אישור</button><button class="ghost" data-reject="${esc(x.id)}">✖️ לא, תודה</button></span></li>`; }).join("");
  need(mine.map(x => x.item));
  fillMine(false);
}

function fillCard(interactive) {
  const ids = myCard(), n = size(), byId = itemsById(), on = myMarks();
  const hot = bingoCells(ids, on, n), full = isBlackout(ids, on), card = $("#card");
  card.dataset.n = n; card.style.gridTemplateColumns = `repeat(${n},1fr)`;
  card.classList.toggle("full", full);
  card.innerHTML = ids.map((id, k) => {
    const i = byId[id] || { text: "(נמחק)", gone: true };
    const cls = `${on.has(id) ? " on" : ""}${on.has(id) && S.shown && !S.shown.has(id) ? " pop" : ""}${hot.has(k) ? " line" : ""}`;
    return `<div class="cell${cls}"${interactive ? ` role="button" tabindex="0" aria-pressed="${on.has(id)}" data-cell="${esc(id)}"` : ""} data-stamp="${emo(S.me)}"><span class="txt">${esc(shownText(i))}</span>${i.gone ? "" : `<span class="tag" style="${whoCol(i)}"><i>${whoEmo(i)}</i><b>${esc(whoName(i))}</b></span>`}</div>`;
  }).join("");
  S.shown = on;
  need(ids.filter(id => byId[id] && !byId[id].text));
  return { on, hot, full, N: ids.length };
}

function fillScore() {
  $("#score").innerHTML = ranking().map(r => {
    const N = S.game.cards[r.p].length;
    return scoreRow(r, r.n / N, `${r.n}/${N}`, r.blackout ? `<span class="win">🏆 מלא</span>` : r.bingo ? `<span class="win">🎉 בינגו</span>` : "");
  }).join("");
}

function fillPlay() {
  const { on, hot, full, N } = fillCard(true);
  $("#ring").style.setProperty("--p", N ? on.size / N * 100 : 0);
  $("#cnt").textContent = `${on.size}/${N}`;
  $("#banner").innerHTML = full ? `<div class="banner">🏆 כרטיס מלא! אלופים! 🏆</div>` : hot.size ? `<div class="banner">🎉 יש לך בינגו! ממשיכים לכרטיס מלא</div>` : "";
  fillScore();
}

// the awards, from the facts in summary()
function awards(st) {
  const list = [], who = p => `${emo(p)} ${esc(p)}`;
  if (st.fastest) { const { mins } = st.fastest; list.push({ e: "⚡", title: "הכי מהר", item: st.fastest.item, note: `סימון ראשון: ${who(st.fastest.player)}${mins === null ? "" : `, ${mins === 1 ? "דקה" : `${mins} דקות`} אחרי ההתחלה`}` }); }
  if (st.crowd) list.push({ e: "🤝", title: "קרה אצל הכי הרבה", item: st.crowd.i, note: `${st.crowd.by.length} שחקנים סימנו: ${st.crowd.by.map(emo).join("")}` });
  if (st.predictable) list.push({ e: "🎯", title: "הכי צפוי", note: `${st.predictable.n} ניחושים על ${who(st.predictable.p)} התגשמו` });
  if (st.missed) list.push({ e: "💤", title: "הכי שווה שלא קרה", item: st.missed.item, note: `⭐ ${st.missed.stars.toFixed(1)} בדירוג, ואף אחד לא סימן` });
  return list;
}
function fillEnded() {
  fillCard(false);
  fillScore();
  const winners = ranking().filter(r => r.place === 1).map(r => `${emo(r.p)} ${esc(r.p)}`);
  $("#winner").innerHTML = winners.length ? `🏆 במקום הראשון: ${winners.join(", ")} 🏆` : "🏁 המשחק נגמר";
  const st = summary(), top = Math.max(1, st.prophets[0]?.n || 0), byId = itemsById();
  need(st.reveal.filter(r => !r.i.text).map(r => r.i.id));
  $("#prophets").innerHTML = st.prophets.map(r => scoreRow(r, r.n / top, r.n)).join("");
  $("#awards").innerHTML = awards(st).map(a => `<li class="award"><span class="ae">${a.e}</span><span class="t"><b>${a.title}</b>${a.item ? `<br>${esc(shownText(a.item))} <span class="muted">(${esc(whoName(a.item))})</span>` : ""}<br><span class="muted">${a.note}</span></span></li>`).join("")
    || `<li class="empty">אף ניחוש לא סומן הפעם 🤷</li>`;
  $("#reveal").innerHTML = st.reveal.map(({ i, by }) => predRow(i, `<br><span class="muted">✍️ ${emo(i.author)} ${esc(i.author)} · ${by.length ? `✅ ${by.map(emo).join("")}` : "לא קרה"}</span>`)).join("");
  $("#journal").innerHTML = st.journal.map(e => `<li><span class="muted jt">${when(e.at)}</span>${av(e.player)}<span class="t">${esc(shownText(byId[e.item]))}</span></li>`).join("") || `<li class="empty">היומן ריק</li>`;
}

const prophetLine = h => {
  const top = Math.max(0, ...(h.prophets || []).map(x => x.n));
  return top ? `<div class="muted">🔮 נביאי המשפחה: ${h.prophets.filter(x => x.n === top).map(x => `${emo(x.p)} ${esc(x.p)}`).join(", ")} (${top})</div>` : "";
};
function fillHistory() {
  $("#histBox").hidden = !S.pastGames.length;
  $("#hist").innerHTML = S.pastGames.map(h => `<li class="hist">${h.title ? `<b>${esc(h.title)}</b>` : ""}<div class="muted">${h.at?.seconds ? new Date(h.at.seconds * 1000).toLocaleDateString("he-IL") : "עכשיו"} · ${h.size}×${h.size}</div>
    <div>${(h.results || []).map(r => `<span class="res">${medal(r.place)} ${emo(r.p)} ${esc(r.p)} <small>${r.blackout ? "🏆" : r.bingo ? "🎉" : ""}${r.n}/${h.size * h.size}</small></span>`).join("")}</div>${prophetLine(h)}</li>`).join("");
}

// ---- admin panel ----
function fillAdmin() {
  const st = S.game.status;
  S.sizeSel ??= S.game.size || 3;
  const N = S.sizeSel * S.sizeSel;
  const sizes = `<p class="muted">גודל הלוח:</p><div class="chips">${SIZES.map(n => `<button class="ghost pick${n === S.sizeSel ? " on" : ""}" data-size="${n}">${n}×${n}</button>`).join("")}</div>
    <p class="muted">ניחושים זמינים לכרטיס של כל אחד (צריך ${N}):</p>
    <div class="counts">${countChips(p => poolFor(p).length)}</div>
    <details class="tune"${S.tuneOpen ? " open" : ""}><summary>🎛️ כוונון הכרטיסים</summary>
      ${Object.entries(TUNE).map(([k, [label, opts]]) => `<p class="muted">${label}:</p><div class="chips">${opts.map(([name], x) => `<button class="ghost pick${x === S.tune[k] ? " on" : ""}" data-tune="${k}:${x}">${name}</button>`).join("")}</div>`).join("")}
      <p class="muted" id="tuneStats">${tuneStats(N)}</p></details>`;
  const least = Math.min(...S.players.map(p => poolFor(p).length));
  const counts = `<p class="muted" id="enough">📊 יש ${activeItems().length} ניחושים. ${SIZES.map(n => `${n}×${n} ${enough(least, n)}`).join(" · ")}<br>✅ מספיק לחוויה טובה · 👌 אפשר, אבל הכרטיסים יהיו דומים · ❌ חסרים ניחושים</p>`;
  const who = `<p class="muted">המדרגים הם המתכללים: ${raters().map(p => `${emo(p)} ${esc(p)}`).join(", ")}. (מוסיפים מתכללים בהגדרות המשחק.)</p>`;
  const order = Object.keys(STAGES), at = order.indexOf(st);
  const stepper = `<div class="stepper">${order.map((k, i) => `<span class="${i < at ? "done" : i === at ? "now" : ""}">${i < at ? "✓ " : ""}${STAGES[k]}</span>`).join("")}</div>`;
  if ($("#freeList")) $("#freeList").innerHTML = S.players.filter(p => S.claims[p] && p !== S.me).map(p => `<button class="ghost" data-free="${esc(p)}">${emo(p)} ${esc(p)} ✕</button>`).join("") || `<span class="muted">אין שמות תפוסים</span>`;
  $("#adm").innerHTML = stepper + ({
    entry: `<div class="step">כשכולם סיימו לכתוב</div>
      <p class="muted">הניחושים ננעלים והמתכללים מדרגים אותם. גודל הלוח בוחרים בשלב הבא.</p>${counts}${who}
      <div class="row"><button data-act="rate">${S.ratings.length ? "⭐ חזרה לשלב הדירוג" : "⭐ נעילה ומעבר לדירוג"}</button></div>`,
    rate: `${who}<div class="row"><button class="ghost" data-act="back">↩️ חזרה לשלב הניחושים</button></div>
      <hr><div class="step">כשהדירוג הסתיים: יצירת כרטיסים</div>${counts}${sizes}<div class="row"><button data-act="gen">🎲 יצירת כרטיסים והתחלה</button></div>`,
    play: `<p class="muted">המשחק רץ (${size()}×${size()}). המשחק נגמר רק כשלוחצים כאן.</p>
      <div class="row"><button data-act="end">🏁 סיום המשחק ושמירה</button></div>
      <div class="row"><button class="ghost" data-act="backRate">↩️ חזרה לשלב הדירוג</button><button class="ghost" data-act="reset">איפוס בלי שמירה</button></div>`,
    ended: `<p class="muted">התוצאות נשמרו בהיסטוריה.</p><div class="row"><button data-act="new">🔄 משחק חדש</button></div>`
  })[st] ?? "";
}

// ---- events inside #app ----
const act = {
  start: leaveWelcome, howto: openHow,
  rate: startRating, back: backToEntry, backRate: backToRating, gen: generate, end: endGame,
  reset: () => reset("לאפס את המשחק בלי לשמור? הניחושים נשמרים."), new: () => reset("להתחיל משחק חדש? הניחושים נשמרים.")
};
// data-* attribute → what a tap on it does (checked in this order)
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
// the tuning panel stays open across re-renders; its preview is computed only while it is open
export const initAdmin = () => $("#app").addEventListener("toggle", e => {
  if (!e.target.matches?.(".tune")) return;
  S.tuneOpen = e.target.open;
  if (S.tuneOpen && $("#tuneStats")) $("#tuneStats").textContent = tuneStats((S.sizeSel || size()) ** 2);
}, true);

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
