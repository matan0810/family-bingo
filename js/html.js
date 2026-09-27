// HTML templates: html`...` escapes every interpolated value, so escaping is by construction.
// A nested html`` goes in as is, a list is joined, and null/undefined/false leave nothing
// (so `${cond && html`...`}` works). Assign the result to innerHTML.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
class Html { constructor(s) { this.s = s; } toString() { return this.s; } }
const part = v => v instanceof Html ? v.s : Array.isArray(v) ? v.map(part).join("") : v == null || v === false ? "" : esc(v);
export const html = (strings, ...vals) => new Html(strings.reduce((out, s, k) => out + s + (k < vals.length ? part(vals[k]) : ""), ""));
