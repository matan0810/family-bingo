// Unit tests for js/html.js: html`` escapes every interpolated value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { html, esc } from "../../js/html.js";

const evil = `"><img src=x onerror=alert(1)>'&`;

test("interpolated values are escaped, in text and in attributes", () => {
  assert.equal(String(html`<b title="${evil}">${evil}</b>`), `<b title="${esc(evil)}">${esc(evil)}</b>`);
  assert.ok(!String(html`${evil}`).includes("<"));
});

test("nested templates go in as they are; lists are joined", () => {
  const inner = html`<i>${evil}</i>`;
  assert.equal(String(html`<p>${inner}</p>`), `<p><i>${esc(evil)}</i></p>`);
  assert.equal(String(html`<ul>${["a", "<b>"].map(x => html`<li>${x}</li>`)}</ul>`), "<ul><li>a</li><li>&lt;b&gt;</li></ul>");
  assert.equal(String(html`${["<", ">"]}`), "&lt;&gt;");
});

test("null, undefined and false leave nothing; 0 and true are text", () => {
  assert.equal(String(html`[${null}${undefined}${false}]`), "[]");
  assert.equal(String(html`${0} ${true}`), "0 true");
  assert.equal(String(html`${false && html`<x>`}`), "");
});
