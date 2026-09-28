// UI checks: admin: entry → rate
import { PLAYERS as P, ROLE, FOUNDERS, ITEMS, poolFor } from "../../fixtures.mjs";
import { SIZES } from "../../source.mjs";
import { check, open, writes, scenario, done } from "../harness.mjs";

console.log("— admin: entry → rate");
await scenario(async () => {
  const p = await open("m=entry", { admin: true });
  check("phase bar", JSON.stringify(await p.locator(".stepper span").allTextContents()) === JSON.stringify(["ניחושים", "דירוג", "משחק", "סיום"]));
  const least = Math.min(...P.map(x => poolFor(x).length)), mark = n => least >= Math.ceil(2.5 * n * n) ? "✅" : least >= n * n ? "👌" : "❌";
  const enough = await p.textContent("#enough");
  check("how many predictions: a mark per board size", enough.includes(`${ITEMS.length} ניחושים`) && SIZES.every(n => enough.includes(`${n}×${n} ${mark(n)}`)), enough);
  check("no board size / generate in entry", await p.locator('[data-size],[data-act="gen"]').count() === 0);
  const adm = await p.textContent("#adm");
  check("no rater picker: the raters are the admins", !(await p.locator("[data-rater]").count()) && adm.includes("המדרגים") && FOUNDERS.every(f => adm.includes(f)), adm);
  check("one next step stands out", await p.locator("#adm .next button").count() === 1);
  check("stuck-name release is collapsed", !(await p.isVisible(`[data-free="${ROLE.other}"]`)));
  await p.click('[data-k="free"] summary'); await p.click(`[data-free="${ROLE.other}"]`); await p.waitForTimeout(200);
  check("admin releases a stuck name", (await p.evaluate(() => sessionStorage.del || "")).includes(`players/${ROLE.other};`));
  check("…and the fold stays open as the tab refreshes", await p.isVisible('[data-k="free"] .chips'));
  await p.click('[data-act="rate"]'); await p.waitForTimeout(100);
  const w = (await writes(p)).at(-1);
  check("start rating writes only the phase", w[0] === "game/state" && w[1].status === "rate" && !("raters" in w[1]), w);
  check("asks before changing phase, then the sheet closes", p.dialogs.length > 0 && !(await p.evaluate(() => setDlg.open)));
  await done(p);
});

