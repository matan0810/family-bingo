// Wording: the author edits until the rating phase ends; raters suggest better wording, the author decides.
// Suggestions live only during the rating phase, and only for predictions that still exist.
import { S, textOf } from "./state.js";
import { ref, batch, safe, setText, add, remove, removeQuietly, serverTimestamp } from "./data.js";
import { $, esc, toast, whoEmo, whoName } from "./ui.js";
import { render } from "./views.js";

let editing = null;
export function openEdit(mode, id) {
  const i = S.items.find(x => x.id === id);
  if (!i) return;
  if (mode === "suggest" && !S.claims[i.author]) return toast("✋ למי שכתב את הניחוש עוד אין טלפון מחובר");
  editing = { mode, i };
  $("#editTitle").textContent = mode === "edit" ? "✏️ עריכת ניחוש" : "✏️ הצעת ניסוח";
  $("#editSub").innerHTML = `על ${whoEmo(i)} ${esc(whoName(i))}` + (mode === "edit" ? "" : `. ההצעה תגיע ל${esc(i.author)} לאישור.`);
  $("#editText").value = textOf(i) ?? "";
  $("#editDlg").showModal();
}
async function saveEdit() {
  const { mode, i } = editing, text = $("#editText").value.trim();
  $("#editDlg").close();
  if (!text || text === textOf(i)) return;
  if (mode === "edit") { if (await setText(i.id, text)) { S.texts[i.id] = text; render(); } }
  else if (await add("suggestions", { item: i.id, from: S.me, fromUid: S.uid, toUid: S.claims[i.author], text, at: serverTimestamp() })) toast(`💬 ההצעה נשלחה ל${i.author}`);
}
export const initWording = () => { $("#editSave").onclick = saveEdit; };

// accepting = one batch: the new text in, the suggestion gone
export async function acceptSuggestion(id) {
  const x = S.sugIn.find(s => s.id === id);
  if (!x) return;
  const b = batch();
  b.set(ref("texts", x.item), { text: x.text });
  b.delete(ref("suggestions", id));
  if (await safe(b.commit())) { S.texts[x.item] = x.text; toast("✅ הניסוח עודכן"); render(); }
}
export const rejectSuggestion = id => remove("suggestions", id);

const cleaned = new Set();
export function cleanSuggestions() {
  if (S.legacy) return;
  [...S.sugIn, ...S.sugOut].filter(x => !cleaned.has(x.id) && (S.game.status !== "rate" || !S.items.some(i => i.id === x.item))).forEach(x => {
    cleaned.add(x.id);
    removeQuietly("suggestions", x.id);
  });
}
