// Game settings (founders only): title, players, extra admins and the family code, edited as a draft and written
// by "💾 שמירת שינויים". Rare and destructive tools sit in the collapsed danger zone: backup, restore,
// removing a player, the new-trip wipe and the history wipe.
import { COLOR, MAX_PLAYERS } from "./config.js";
import { S, emo, textOf } from "./state.js";
import { aboutOf, without, formerPlayers } from "./logic.js";
import { ref, batch, safe, saveConfig, saveCode, readSecret, getText, remove, clearMarks, newItemRef, serverTimestamp } from "./data.js";
import { $, esc, col, toast } from "./ui.js";

let draft = null;
// admins are kept in player order, so turning one off and on again is not a change
const draftOf = () => ({ title: S.config.title, players: [...S.players], founders: [...S.config.founders], admins: S.players.filter(p => S.config.admins.includes(p)) });
const dirty = () => !!draft && (JSON.stringify(draft) !== JSON.stringify(draftOf()) || !!$("#cfgCode").value.trim());
const refresh = () => { draft = draftOf(); fillCfg(); };
// leaving with unsaved changes asks first (close button, tap outside, Esc)
export const leaveCfg = () => !dirty() || confirm("לצאת בלי לשמור את השינויים?");

export async function openCfg() {
  draft = draftOf();
  $("#cfgTitle").value = draft.title; $("#cfgCode").value = $("#cfgNew").value = "";
  $("#cfgBox .danger").open = false; $("#cfgDel").value = "";
  fillCfg();
  $("#cfgCodeNote").textContent = "טוען…";
  $("#cfgDlg").showModal();
  const secret = await readSecret();
  $("#cfgCodeNote").textContent = (secret?.exists() ? `הקוד הנוכחי: ${secret.data().code}.` : "עכשיו בתוקף הקוד שמוגדר בחוקים.") + " טלפונים שכבר מחוברים לא יצטרכו קוד חדש.";
}

export function fillCfg() {
  if (!draft) return;
  const entry = S.game.status === "entry", d = draft;
  const chip = p => `<span class="fixed" style="${col(p)}">${emo(p)} ${esc(p)}${d.founders.includes(p) ? " 👑" : ""}</span>`;
  const adminSwitch = p => { const on = d.admins.includes(p); return `<button class="ghost pick toggle${on ? " on" : ""}" data-cfg="admin" data-p="${esc(p)}" style="${col(p)}" aria-pressed="${on}"><span class="box">${on ? "✓" : ""}</span>${emo(p)} ${esc(p)}</button>`; };
  $("#cfgPlayers").innerHTML = d.players.map(chip).join("");
  $("#cfgPlayersNote").textContent = entry ? `${d.players.length} שחקנים (עד ${MAX_PLAYERS}). הסרת שחקן נמצאת באזור המסוכן למטה.` : "הוספה, החזרה והסרה של שחקנים רק בשלב הניחושים.";
  const former = formerPlayers(S.items, S.marks, S.looks, S.players).filter(p => !d.players.includes(p));
  $("#cfgFormer").innerHTML = former.length ? `<span class="muted">הוסרו:</span>${former.map(p => `<button class="ghost" data-cfg="back" data-p="${esc(p)}"${entry ? "" : " disabled"}>↩️ ${esc(p)}</button>`).join("")}` : "";
  const sel = $("#cfgDel").value;
  $("#cfgDel").innerHTML = `<option value="">בוחרים שחקן…</option>` + S.players.filter(p => !S.config.founders.includes(p)).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  $("#cfgDel").value = S.players.includes(sel) ? sel : "";
  $("#cfgNew").disabled = $("[data-cfg=add]").disabled = $("#cfgDel").disabled = $("[data-cfg=del]").disabled = !entry;
  $("#cfgFounders").textContent = d.founders.map(p => `${emo(p)} ${p}`).join(", ");
  $("#cfgAdmins").innerHTML = d.players.filter(p => !d.founders.includes(p)).map(adminSwitch).join("");
  $("#cfgSave").disabled = !dirty();
}

function addPlayer(name) {
  if (!name || /[\/.#$\[\]]/.test(name)) return alert("שם לא תקין (בלי / . # $ [ ])");
  if (draft.players.includes(name)) return alert("כבר יש שחקן בשם הזה");
  if (draft.players.length >= MAX_PLAYERS) return alert(`אפשר עד ${MAX_PLAYERS} שחקנים`);
  draft.players.push(name);
  return true;
}
const actions = {
  add: () => { if (addPlayer($("#cfgNew").value.trim())) $("#cfgNew").value = ""; },
  back: p => { addPlayer(p); },
  admin: p => { draft.admins = draft.players.filter(x => x === p ? !draft.admins.includes(p) : draft.admins.includes(x)); },
  save: saveCfg, del: () => removePlayer($("#cfgDel").value),
  backup: downloadBackup, restore: () => $("#cfgFile").click(), wipe: wipeTrip, wipeHist: wipeHistory,
};
// actions that change the draft redraw it; the others (save, backup, …) do their own thing
const drafting = ["add", "back", "admin"];

export function initSettings() {
  $("#cfgTitle").oninput = () => { if (draft) { draft.title = $("#cfgTitle").value.trim(); fillCfg(); } };
  $("#cfgCode").oninput = () => fillCfg();
  $("#cfgBox").onclick = e => {
    const b = e.target.closest("[data-cfg]");
    if (!b || !draft) return;
    const kind = b.dataset.cfg;
    actions[kind]?.(b.dataset.p);
    if (drafting.includes(kind)) fillCfg();
  };
  $("#cfgDlg").addEventListener("cancel", e => { if (!leaveCfg()) e.preventDefault(); });
  $("#cfgFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) restore(f); };
}

async function saveCfg() {
  const code = $("#cfgCode").value.trim();
  if (code && code.length < 3) return alert("הקוד צריך לפחות 3 תווים");
  if (code && !confirm(`לשמור? הקוד המשפחתי יוחלף ל־"${code}"`)) return;
  if (!await saveConfig(draft)) return;
  if (code && await saveCode(code)) $("#cfgCode").value = "";
  refresh();
  toast("✅ ההגדרות נשמרו");
}

// removing a player is serious: on its own (not part of a draft), with the full impact spelled out, confirmed by typing the name
async function removePlayer(p) {
  if (!p) return alert("בוחרים קודם שחקן להסרה");
  if (S.game.status !== "entry" || S.config.founders.includes(p) || !S.players.includes(p)) return;
  if (dirty()) return alert("יש שינויים שלא נשמרו. שומרים אותם קודם (או סוגרים בלי לשמור), ואז מסירים.");
  if (S.players.length <= 2) return alert("צריך לפחות 2 שחקנים");
  const wrote = S.items.filter(i => i.author === p).length, about = S.items.filter(i => aboutOf(i).includes(p)).length;
  const impact = [`${wrote} ניחושים של ${p} ו־${about} ניחושים על ${p} או שהוא מעורב בהם יצאו מהדירוג ומהכרטיסים`,
    S.config.admins.includes(p) && `${p} כבר לא בין המתכללים`, S.claims[p] && `הטלפון של ${p} יתנתק מהשם`].filter(Boolean);
  const typed = prompt(`🚪 הסרת ${p}\n\n• ${impact.join("\n• ")}\n\nשום דבר לא נמחק: מחזירים ב"↩️ ${p}" והכל חוזר.\nכדי לאשר, מקלידים את השם: ${p}`);
  if (typed === null) return;
  if (typed.trim() !== p) return alert("השם לא תואם. לא הוסר אף אחד.");
  if (!await saveConfig({ players: without(S.config.players, p), admins: without(S.config.admins, p) })) return;
  if (S.claims[p]) await remove("players", p);
  refresh();
  toast(`🚪 ${p} כבר לא במשחק`);
}

// ---- backup and restore: only what the rules let this device read and write ----
const plain = v => v?.toDate ? { seconds: v.seconds } : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
async function downloadBackup() {
  const txt = Object.fromEntries(await Promise.all(S.items.map(i => getText(i.id).then(s => [i.id, s.data()?.text ?? null], () => [i.id, textOf(i) ?? null]))));
  const secret = await readSecret();
  const data = plain({ app: "family-bingo", version: 1, at: new Date().toISOString(), by: S.me,
    settings: S.config, secret: secret?.exists() ? secret.data() : null, game: S.game, marks: S.marks, looks: S.looks, players: S.claims,
    items: S.items.map(i => ({ ...i, text: txt[i.id] })), ratings: S.ratings, history: S.pastGames });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `bingo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  toast("💾 הגיבוי ירד");
  return true;
}
async function restore(file) {
  let bk;
  try { bk = JSON.parse(await file.text()); } catch { return alert("הקובץ לא נקרא. צריך קובץ גיבוי של הבינגו (json)."); }
  if (bk?.app !== "family-bingo" || !bk.settings?.players?.length) return alert("זה לא קובץ גיבוי של הבינגו");
  if (!confirm(`לשחזר מהגיבוי של ${new Date(bk.at).toLocaleString("he-IL")}?\nיוחזרו: הגדרות המשחק, הקוד, שלב המשחק והכרטיסים, הסימונים והאימוג׳ים${S.pastGames.length ? "" : ", וההיסטוריה (עם תאריך של היום)"}.\nניחושים ודירוגים לא ניתן לשחזר מכאן (החוקים לא מאפשרים לכתוב בשם אחרים), אבל הם שמורים בקובץ.`)) return;
  const s = bk.settings, pl = s.players, founders = S.config.founders; // the founders stay as they are now
  const writes = [
    [["config", "settings"], { title: s.title || "", players: [...new Set([...pl, ...founders])], founders, admins: (s.admins || []).filter(p => pl.includes(p)) }],
    ...(bk.secret?.code ? [[["config", "secret"], { code: bk.secret.code }]] : []),
    ...(bk.game?.status ? [[["game", "state"], { status: bk.game.status, cards: bk.game.cards || {}, ...(bk.game.size ? { size: bk.game.size } : {}) }]] : []),
    ...Object.entries(bk.marks || {}).filter(([p]) => pl.includes(p)).map(([p, m]) => [["marks", p], { marked: m.marked || [], bingo: !!m.bingo, blackout: !!m.blackout, bingoAt: m.bingo ? serverTimestamp() : null, blackoutAt: m.blackout ? serverTimestamp() : null }]),
    ...Object.entries(bk.looks || {}).filter(([p, e]) => pl.includes(p) && COLOR[e]).map(([p, e]) => [["looks", p], { e }])
  ];
  const b = batch();
  writes.forEach(([path, v]) => b.set(ref(...path), v));
  if (!S.pastGames.length) (bk.history || []).forEach(h => b.set(newItemRef("history"), { at: serverTimestamp(), size: h.size, title: h.title || "", results: h.results || [] }));
  if (await safe(b.commit())) { refresh(); toast("♻️ שוחזר מהגיבוי"); }
}

// ---- wipes: the typed word makes it a deliberate act, and a backup downloads first ----
const confirmWipe = what => prompt(`${what}\nכדי לאשר, הקלידו: מחיקה`)?.trim() === "מחיקה";
async function wipeTrip() {
  if (S.game.status !== "entry") return alert("ניקוי אפשרי רק בשלב הניחושים. קודם מחזירים את המשחק לשלב הניחושים.");
  if (!confirmWipe(`לנקות הכול לטיול חדש?\n${S.items.length} ניחושים, ${S.ratings.length} דירוגים והצעות יימחקו, והסימונים יתאפסו. ההיסטוריה נשארת.\nלפני המחיקה יירד קובץ גיבוי.`)) return toast("לא נמחק כלום");
  await downloadBackup();
  const ops = [...S.items.flatMap(i => [["items", i.id], ["texts", i.id]]), ...S.ratings.map(r => ["ratings", `${r.item}_${r.player}`]), ...[...S.sugIn, ...S.sugOut].map(x => ["suggestions", x.id])];
  let ok = true;
  // a batch holds up to 500 writes
  for (let k = 0; k < ops.length; k += 400) { const b = batch(); ops.slice(k, k + 400).forEach(path => b.delete(ref(...path))); ok = await safe(b.commit()) && ok; }
  const b = batch(); clearMarks(b); ok = await safe(b.commit()) && ok;
  if (ok) toast("🧹 הכול נקי לטיול חדש");
}
async function wipeHistory() {
  if (!S.pastGames.length) return alert("אין היסטוריה");
  if (!confirmWipe(`למחוק את כל ההיסטוריה (${S.pastGames.length} משחקים)?\nלפני המחיקה יירד קובץ גיבוי.`)) return toast("לא נמחק כלום");
  await downloadBackup();
  const b = batch(); S.pastGames.forEach(h => b.delete(ref("history", h.id)));
  if (await safe(b.commit())) toast("🗑️ ההיסטוריה נמחקה");
}
