// UI checks: entering: code → welcome → name
import { ROLE, CODE, ME_UID } from "../../fixtures.mjs";
import { check, open, writes, picked, scenario, done } from "../harness.mjs";

console.log("— entering: code → welcome → name");
await scenario(async () => {
  const p = await open("member=0", { me: null, welcome: true });
  check("code screen first", await p.isVisible("#join"));
  await p.fill("#code", CODE); await p.click("#join button"); await p.waitForTimeout(400);
  check("welcome after code", await p.isVisible(".welcome"));
  check("code stored as members/{uid}", (await writes(p)).some(([r, d]) => r === `members/${ME_UID}` && d.code === CODE));
  await p.click('[data-act="start"]'); await p.waitForTimeout(300);
  check("then name picker", await p.isVisible(".names"));
  check("taken name is marked", (await p.textContent(`[data-me="${ROLE.other}"]`)).includes("תפוס"));
  await p.click(`[data-me="${ROLE.founder2}"]`); await p.waitForTimeout(300);
  check("picking a name claims it and records it on the device", await picked(p, ROLE.founder2));
  check("entry form after picking", await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: null });
  await p.click(`[data-me="${ROLE.other}"]`); await p.waitForTimeout(300);
  check("taking a taken name asks 'זה אתם?' first", p.dialogs.some(m => m.includes("זה אתם?")));
  check("…then moves the name to this device", await picked(p, ROLE.other) && await p.isVisible("#add"));
  await done(p);
});
await scenario(async () => {
  const p = await open("member=0&deny=1", { me: null });
  await p.fill("#code", "x"); await p.click("#join button"); await p.waitForTimeout(300);
  check("wrong code shows an error", (await p.textContent("#err")).includes("קוד שגוי"));
  await done(p);
});
await scenario(async () => {
  const p = await open("", { me: ROLE.other });
  check("stored name owned by another device -> picker", await p.isVisible(".names"));
  await done(p);
});
