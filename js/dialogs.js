// The dialogs: the settings sheet (⚙️, one tab per role), emoji picker, how to play and installing the app.
// Every dialog closes from its ✕ (or any [data-close]) and by tapping outside it.
import { EMOJIS, STEPS } from "./config.js";
import { S, emo, isAdminName, isFounderName } from "./state.js";
import { setLook } from "./data.js";
import { $, $$, html, who, toast } from "./ui.js";
import { showWelcome } from "./views.js";
import { logout, release } from "./account.js";
import { startCfg, fillCfg, leaveCfg } from "./settings.js";
import { fillAdmin } from "./admin.js";

// ---- install as an app (PWA): Android shows the browser prompt, iPhone gets instructions ----
let installEvt = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone; // iPhone
const showInstall = () => $$(".install").forEach(b => b.hidden = standalone() || !(installEvt || isIOS));
async function install() {
  if (!installEvt) return alert("באייפון: בספארי לוחצים על כפתור השיתוף ⬆️ ואז על \"הוספה למסך הבית\" ➕");
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null; showInstall();
}

// ---- emoji picker: other players' emojis are taken ----
export function openLooks() {
  const mine = emo(S.me);
  $("#emojis").innerHTML = html`${EMOJIS.map(([e, c]) => {
    const taken = e !== mine && S.players.some(p => p !== S.me && emo(p) === e);
    return html`<button data-e="${e}" style="--c:${c}"${e === mine && html` class="on"`}${taken && html` disabled`}>${e}</button>`;
  })}`;
  $("#lookDlg").showModal();
}

export function openHow() {
  $("#steps").innerHTML = html`${STEPS.map(([e, t, d]) => html`<li><span class="se">${e}</span><span><b>${t}</b><br><span class="muted">${d}</span></span></li>`)}`;
  $("#howDlg").showModal();
}

// ---- the settings sheet: 👤 mine for everyone, 🛠️ running the game for admins, 👑 game settings for founders ----
const tabsFor = () => ["me", isAdminName(S.me) && "admin", isFounderName(S.me) && "game"].filter(Boolean);
let tab = (() => { try { return localStorage.getItem("bingo-tab") || "me"; } catch { return "me"; } })();
function showTab(t) {
  const tabs = tabsFor();
  tab = tabs.includes(t) ? t : "me";
  try { localStorage.setItem("bingo-tab", tab); } catch {}
  $("#setTabs").hidden = tabs.length < 2;
  $("#setDlg").classList.toggle("tabbed", tabs.length > 1);
  $$("#setTabs [data-tab]").forEach(b => { b.hidden = !tabs.includes(b.dataset.tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  $$("#setBox [data-pane]").forEach(p => p.hidden = p.dataset.pane !== tab);
  fillSheet();
  $("#setDlg").scrollTop = 0;
}
// keeps the open tab up to date with the game (called from render)
export function fillSheet() {
  if (!$("#setDlg").open) return;
  if (tab === "admin" && isAdminName(S.me)) fillAdmin();
  if (tab === "game" && isFounderName(S.me)) fillCfg();
}
function openSettings() {
  $("#setTitle").innerHTML = who(S.me);
  showInstall();
  if (isFounderName(S.me)) startCfg();
  $("#setDlg").showModal();
  showTab(tab);
}
const menu = {
  look: openLooks, install, howto: openHow, logout,
  switch: () => confirm("להחליף שחקן? השם שלך ישוחרר ותוכלו לבחור מחדש.") && release()
};

export function initDialogs() {
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; showInstall(); });
  addEventListener("appinstalled", () => { installEvt = null; showInstall(); toast("📲 הבינגו הותקן!"); });
  $("#logo").onclick = showWelcome;
  $("#who").onclick = openSettings;
  $("#setTabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); };
  $("#setMenu").onclick = e => {
    const b = e.target.closest("[data-set]");
    if (!b || !leaveCfg()) return;
    $("#setDlg").close();
    menu[b.dataset.set]();
  };
  $("#emojis").onclick = e => {
    const b = e.target.closest("[data-e]");
    if (!b) return;
    $("#lookDlg").close();
    setLook(b.dataset.e);
  };
  $$("dialog").forEach(d => d.addEventListener("click", e => {
    if ((e.target === d || e.target.closest("[data-close]")) && (d.id !== "setDlg" || leaveCfg())) d.close();
  }));
  // unsaved game settings ask first, also on Esc
  $("#setDlg").addEventListener("cancel", e => { if (!leaveCfg()) e.preventDefault(); });
}
