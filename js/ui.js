// DOM helpers, the HTML bits shared by the views, toasts and confetti.
import { GENERAL, MEDAL } from "./config.js";
import { S, emo, colorOf } from "./state.js";
import { aboutOf } from "./logic.js";
import { html } from "./html.js";

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export { html };

// ---- players and predictions ----
export const col = p => `--c:${colorOf(p)}`;
export const av = p => html`<span class="av" style="${col(p)}">${emo(p)}</span>`;
export const generalAv = html`<span class="av" style="--c:${GENERAL}">🌍</span>`;
const listFmt = new Intl.ListFormat("he", { type: "conjunction" });
export const whoName = i => { const [s, ...w] = aboutOf(i); return s ? s + (w.length ? ` (עם ${listFmt.format(w)})` : "") : "כללי"; };
export const whoEmo = i => aboutOf(i).length ? aboutOf(i).map(emo).join("") : "🌍";
export const whoCol = i => aboutOf(i).length ? col(aboutOf(i)[0]) : `--c:${GENERAL}`;
export const whoAv = i => aboutOf(i).length ? aboutOf(i).map(av) : generalAv;
export const who = p => html`${emo(p)} ${p}`; // emoji and name, inline
// a player chip with a number: how many predictions (about them, or available for their card)
export const countChips = n => S.players.map(p => html`<span style="${col(p)}">${av(p)}${p} <b>${n(p)}</b></span>`);
export const medal = place => MEDAL[place - 1] ?? `${place}.`;
export const when = t => t?.seconds ? new Date(t.seconds * 1000).toLocaleString("he-IL", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "עכשיו";

// ---- toast ----
let toastTimer;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}

// ---- confetti ----
const bits = [];
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
export function confetti(n) {
  if (calm) return;
  const fx = $("#fx"), cx = fx.getContext("2d"), dpr = devicePixelRatio || 1, cols = S.players.map(colorOf).concat("#ffc23c", "#ff4f6d");
  fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const idle = !bits.length;
  for (let k = 0; k < n; k++) bits.push({ x: innerWidth * (k % 2 ? .15 : .85), y: innerHeight * .9, vx: (Math.random() - .5) * 10 + (k % 2 ? 4 : -4), vy: -Math.random() * 16 - 10, r: Math.random() * 6, vr: (Math.random() - .5) * .4, s: 7 + Math.random() * 7, c: cols[k % cols.length] });
  if (idle) requestAnimationFrame(() => tick(cx));
}
function tick(cx) {
  cx.clearRect(0, 0, innerWidth, innerHeight);
  for (let k = bits.length - 1; k >= 0; k--) {
    const b = bits[k];
    b.vy += .4; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
    if (b.y > innerHeight + 30) { bits.splice(k, 1); continue; }
    cx.save(); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c; cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); cx.restore();
  }
  if (bits.length) requestAnimationFrame(() => tick(cx));
}
