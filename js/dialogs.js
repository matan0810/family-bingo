// The small dialogs and menus: settings (⚙️), emoji picker, how to play, admin mode and installing the app.
// Every dialog closes from its ✕ (or any [data-close]) and by tapping outside it.
import { EMOJIS, STEPS } from "./config.js";
import { S, emo, isAdminName, isFounderName } from "./state.js";
import { setLook } from "./data.js";
import { $, $$, html, who, toast } from "./ui.js";
import { render, showWelcome } from "./views.js";
import { logout, release } from "./account.js";
import { openCfg, leaveCfg } from "./settings.js";

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

// admin mode: shown only to admins, remembered on this device
function toggleAdmin() {
  S.adminOpen = !S.adminOpen;
  try { S.adminOpen ? localStorage.setItem("bingo-admin", "1") : localStorage.removeItem("bingo-admin"); } catch {}
  S.view = ""; render();
  toast(S.adminOpen ? "🛠️ מצב מתכלל פועל" : "מצב מתכלל כבוי");
  if (S.adminOpen) $(".admin")?.scrollIntoView({ behavior: "smooth" });
}

function openSettings() {
  $("#setTitle").innerHTML = who(S.me);
  const ai = $("#adminItem");
  ai.hidden = !isAdminName(S.me);
  ai.textContent = S.adminOpen ? "🛠️ מצב מתכלל: פועל ✓ (לכיבוי)" : "🛠️ הפעלת מצב מתכלל";
  $("#cfgItem").hidden = !isFounderName(S.me);
  showInstall();
  $("#setDlg").showModal();
}
const menu = {
  look: openLooks, install, howto: openHow, logout, admin: toggleAdmin, cfg: openCfg,
  switch: () => confirm("להחליף שחקן? השם שלך ישוחרר ותוכלו לבחור מחדש.") && release()
};

export function initDialogs() {
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; showInstall(); });
  addEventListener("appinstalled", () => { installEvt = null; showInstall(); toast("📲 הבינגו הותקן!"); });
  $("#logo").onclick = showWelcome;
  $("#who").onclick = openSettings;
  $("#setMenu").onclick = e => {
    const b = e.target.closest("[data-set]");
    if (!b) return;
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
    if ((e.target === d || e.target.closest("[data-close]")) && (d.id !== "cfgDlg" || leaveCfg())) d.close();
  }));
}
