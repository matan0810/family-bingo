// UI checks: editing wording and suggestions
import { ROLE, ME_UID, OTHER_UID, ITEMS, OTHERS_ITEM, NO_DEVICE_ITEM, SUGGESTION } from "../../fixtures.mjs";
import { check, ME, typed, open, writes, lastBatch, scenario, done } from "../harness.mjs";

console.log("— editing wording and suggestions");
await scenario(async () => {
  const p = await open("m=entry");
  await p.click("[data-edit] >> nth=0");
  const before = await p.inputValue("#editText");
  check("edit opens with the current text", await p.evaluate(() => editDlg.open) && ITEMS.some(i => i.author === ME && i.text === before), before);
  await p.fill("#editText", typed); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("author edit updates texts/{id} only", r.startsWith("texts/") && JSON.stringify(d) === JSON.stringify({ text: typed }));
  check("edited text shows in my list", (await p.textContent("#list")).includes(typed));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate");
  await p.click(`[data-suggest="${OTHERS_ITEM.id}"]`);
  check("rater: suggestion dialog names the author", (await p.textContent("#editSub")).includes(OTHERS_ITEM.author));
  await p.fill("#editText", typed); await p.click("#editSave"); await p.waitForTimeout(200);
  const [r, d] = (await writes(p)).at(-1);
  check("suggestion goes to the author's device", r.startsWith("suggestions/") && d.item === OTHERS_ITEM.id && d.from === ME && d.fromUid === ME_UID && d.toUid === OTHER_UID && d.text === typed, d);
  await p.click(`[data-suggest="${NO_DEVICE_ITEM.id}"]`); await p.waitForTimeout(200);
  check("no suggestion when the author has no device", (await p.textContent("#toast")).includes("אין טלפון מחובר") && !(await p.evaluate(() => editDlg.open)));
  await p.click(".mine summary");
  check("rate: my predictions are editable, not deletable", await p.locator("#list [data-edit]").count() > 0 && !(await p.locator("#list [data-del]").count()));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1", { me: ROLE.founder2 });
  check("suggestions box is only for their author", !(await p.isVisible("#sugBox")));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  check("author sees the suggestion: old and new wording", await p.isVisible("#sugBox") && (await p.textContent("#sugList")).includes(SUGGESTION.text));
  await p.click(`[data-accept="${SUGGESTION.id}"]`); await p.waitForTimeout(200);
  const b = await lastBatch(p);
  check("accept = update text + delete suggestion in one batch", JSON.stringify(b) === JSON.stringify([["set", `texts/${SUGGESTION.item}`, { text: SUGGESTION.text }], ["del", `suggestions/${SUGGESTION.id}`]]), b);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=rate&sugg=1");
  await p.click(`[data-reject="${SUGGESTION.id}"]`); await p.waitForTimeout(200);
  check("reject deletes the suggestion", (await p.evaluate(() => sessionStorage.del || "")).includes(`suggestions/${SUGGESTION.id};`));
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&sugg=1");
  check("suggestions are cleared once the rating phase is over", (await p.evaluate(() => sessionStorage.del || "")).includes(`suggestions/${SUGGESTION.id};`));
  await done(p);
});
