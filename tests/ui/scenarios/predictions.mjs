// UI checks: subject, involved people and general events
import { PLAYERS as P, ROLE, ITEMS, NEW_ITEMS, aboutOf } from "../../fixtures.mjs";
import { check, ME, whoName, typed, chip, open, lastBatch, scenario, done } from "../harness.mjs";

console.log("— subject, involved people and general events");
await scenario(async () => {
  const p = await open("m=entry");
  const withRow = () => p.isVisible("#add .with");
  check("no involved row before a subject is chosen", !(await withRow()));
  await p.click(chip(ROLE.player)); await p.click(chip(ROLE.founder2));
  check("one subject: choosing another name moves the choice", JSON.stringify(await p.locator("input[name=about]:checked").evaluateAll(x => x.map(i => i.value))) === JSON.stringify([ROLE.founder2]));
  check("involved row shows, without the subject", await withRow() && !(await p.isVisible(chip(ROLE.founder2, "with"))));
  const involved = [ROLE.player, ROLE.other];
  for (const x of involved) await p.click(chip(x, "with"));
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  let add = await lastBatch(p);
  check("about = [subject, ...involved]", JSON.stringify(add[0][2].about) === JSON.stringify([ROLE.founder2, ...involved]), add[0][2].about);
  await p.click(chip("כללי", "general"));
  check("'כללי' clears the subject and the involved", !(await p.locator("input[name=about]:checked,input[name=with]:checked").count()) && await p.locator("input[name=general]").isChecked() && !(await withRow()));
  await p.click(chip(ROLE.player));
  check("choosing a person clears 'כללי'", !(await p.locator("input[name=general]").isChecked()));
  await p.click(chip("כללי", "general"));
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  add = await lastBatch(p);
  check("general event: about is empty", JSON.stringify(add[0][2].about) === "[]");
  await p.click(chip("כללי", "general")); // the choice stays between predictions; clear it
  await p.fill("#text", typed); await p.click("#add button"); await p.waitForTimeout(200);
  check("must choose someone or 'כללי'", (await p.textContent("#toast")).includes("כללי") && (await p.inputValue("#text")) === typed);
  const mine = await p.locator("#list li .who").allTextContents();
  const myNew = NEW_ITEMS.filter(i => i.author === ME).map(whoName);
  check("my list shows 'כללי' and 'subject (with …)'", myNew.includes("כללי") && myNew.some(w => w.includes("(עם ")) && myNew.every(w => mine.includes(w)), mine);
  const counts = await p.locator("#counts > span").evaluateAll(x => x.map(s => [s.textContent.replace(s.querySelector(".av").textContent, "").replace(s.querySelector("b").textContent, "").trim(), +s.querySelector("b").textContent]));
  const want = [...P.map(x => [x, ITEMS.filter(i => aboutOf(i)[0] === x).length]), ["כללי", ITEMS.filter(i => !aboutOf(i).length).length]];
  check("counts go by the subject only (involved don't count)", JSON.stringify(counts) === JSON.stringify(want), counts);
  await done(p);
});
await scenario(async () => {
  const p = await open("m=play&size=5");
  const evil = NEW_ITEMS.find(i => i.text.includes("<"));
  check("HTML in a prediction shows as text and never runs", (await p.textContent("#card")).includes(evil.text) && !(await p.evaluate(() => window.XSS)) && !(await p.locator("#card .txt *").count()));
  const tags = await p.locator(".cell .tag i").allTextContents();
  check("card tags: 🌍 for general, several emojis for a group", tags.includes("🌍") && tags.some(t => [...t].length >= 2), tags);
  await done(p);
});
