// Unit tests for js/logic.js (pure game logic) with node:test. Run from tests/: `npm run test:unit`.
// Data comes from ../fixtures.mjs; randomness is seeded so every run is the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { PLAYERS, ROLE, ITEMS, OLD_ITEMS, NEW_ITEMS, RATINGS, PLAY_AT, aboutOf as fxAbout, byId, cardFor, marksFor, eventsFor } from "../fixtures.mjs";
import { EMOJIS, SIZES } from "../source.mjs";
import * as L from "../../js/logic.js";
import { GOOD, TUNE } from "../../js/config.js";

// a small seeded random generator (mulberry32)
const seeded = (seed = 1) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ts = s => ({ seconds: s });
const ids = ITEMS.map(i => i.id), itemById = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const weight = i => L.weightOf(i, RATINGS);

test("aboutOf and subjectOf read old single names, lists and general events", () => {
  assert.deepEqual(L.aboutOf(OLD_ITEMS[0]), [OLD_ITEMS[0].about]);
  for (const i of NEW_ITEMS) assert.deepEqual(L.aboutOf(i), i.about);
  assert.deepEqual(L.aboutOf({}), []);
  assert.equal(L.subjectOf(NEW_ITEMS.find(i => i.about.length > 1)), NEW_ITEMS.find(i => i.about.length > 1).about[0]);
  assert.equal(L.subjectOf(NEW_ITEMS.find(i => !i.about.length)), undefined);
});

test("isActive leaves out predictions by or about removed players", () => {
  const rest = PLAYERS.filter(p => p !== ROLE.removed);
  for (const i of ITEMS) assert.equal(L.isActive(i, rest), rest.includes(i.author) && fxAbout(i).every(p => rest.includes(p)));
  assert.ok(ITEMS.every(i => L.isActive(i, PLAYERS)));
});

test("autoEmoji: by place in the player list, skipping emojis that are taken", () => {
  assert.deepEqual(PLAYERS.map(p => L.autoEmoji(p, PLAYERS, {})), PLAYERS.map((_, k) => EMOJIS[k]));
  // the second player chose the first player's emoji: the first moves on to the next free one
  const looks = { [PLAYERS[1]]: EMOJIS[0] };
  const got = PLAYERS.map(p => looks[p] ?? L.autoEmoji(p, PLAYERS, looks));
  assert.equal(new Set(got).size, PLAYERS.length);
  assert.equal(L.autoEmoji(PLAYERS[0], PLAYERS, looks), EMOJIS[1]);
});

test("lines: every row, column and both diagonals", () => {
  for (const n of SIZES) {
    const ls = L.lines(n);
    assert.equal(ls.length, 2 * n + 2);
    assert.ok(ls.every(l => l.length === n && new Set(l).size === n && l.every(k => k >= 0 && k < n * n)));
    assert.equal(new Set(ls.map(l => l.join())).size, ls.length);
  }
});

test("bingoCells and isBlackout", () => {
  for (const n of SIZES) {
    const card = cardFor(ROLE.founder, n), diag = [...Array(n).keys()].map(k => card[k * n + k]);
    assert.deepEqual([...L.bingoCells(card, new Set(diag), n)].sort((a, b) => a - b), [...Array(n).keys()].map(k => k * n + k));
    assert.equal(L.bingoCells(card, new Set(diag.slice(1)), n).size, 0);
    assert.equal(L.isBlackout(card, new Set(card)), true);
    assert.equal(L.isBlackout(card, new Set(card.slice(1))), false);
    assert.equal(L.isBlackout([], new Set()), false);
  }
});

test("places: full card first (earliest), then more marks, then bingo (earliest); ties share", () => {
  const [a, b, c, d, e, f] = PLAYERS;
  const marks = {
    [a]: { marked: ["x"], bingo: false },
    [b]: { marked: ["x", "y", "z"], blackout: true, blackoutAt: ts(20), bingo: true, bingoAt: ts(5) },
    [c]: { marked: ["x", "y", "z"], blackout: true, blackoutAt: ts(10), bingo: true, bingoAt: ts(9) },
    [d]: { marked: ["x", "y"], bingo: true, bingoAt: ts(8) },
    [e]: { marked: ["x", "y"], bingo: true, bingoAt: ts(3) },
    [f]: { marked: ["x"], bingo: false },
  };
  const rows = L.scoreRows(PLAYERS, marks);
  assert.deepEqual(rows.map(r => [r.p, r.place]), [[c, 1], [b, 2], [e, 3], [d, 4], [a, 5], [f, 5]]);
});

test("stars and weights: unrated counts as 1.5 stars, ratings are clamped to 0..3", () => {
  const item = ITEMS[0];
  assert.equal(L.avgStars(item.id, []), null);
  assert.equal(L.weightOf(item, []), 4); // (1.5 + .5)²
  assert.equal(L.weightOf(item, [{ item: item.id, stars: 3 }]), 12.25);
  assert.equal(L.weightOf(item, [{ item: item.id, stars: 0 }]), .25);
  assert.equal(L.weightOf(item, [{ item: item.id, stars: 9 }, { item: item.id, stars: -4 }]), 4); // clamped to 3 and 0
  assert.equal(L.weightOf({ ...item, weight: 2 }, []), 8);
  for (const [, power] of TUNE.stars[1]) assert.equal(L.weightOf(item, [], power), 2 ** power);
});

test("draw: by weight, no repeats, a cap per subject while possible", () => {
  const rand = seeded(7);
  const card = L.draw(ITEMS, 20, [], {}, 2, weight, rand);
  assert.equal(card.length, 20);
  assert.equal(new Set(card).size, 20);
  const per = {};
  card.forEach(id => { const s = L.subjectOf(itemById[id]) ?? ""; per[s] = (per[s] || 0) + 1; });
  // with every subject capped at 2 there are only so many cells; past that the cap gives way instead of leaving gaps
  const subjects = new Set(ITEMS.map(i => L.subjectOf(i) ?? "")).size;
  assert.ok(Object.values(per).filter(n => n > 2).length === 0 || 20 > subjects * 2);
  // the card may start with cells already on it
  const more = L.draw(ITEMS, 3, card.slice(0, 5), {}, Infinity, weight, rand);
  assert.equal(more.length, 8);
  assert.equal(new Set(more).size, 8);
  // a heavier prediction comes first more often
  const heavy = ITEMS[1], wt = i => i === heavy ? 1000 : 1;
  const firsts = Array.from({ length: 50 }, (_, s) => L.draw(ITEMS, 1, [], {}, Infinity, wt, seeded(s + 1))[0]);
  assert.ok(firsts.filter(id => id === heavy.id).length > 40);
});

test("shuffle keeps every element", () => {
  const a = [...ids], b = L.shuffle([...ids], seeded(3));
  assert.deepEqual([...b].sort(), [...a].sort());
  assert.notDeepEqual(b, a);
});

const cards = (N, sharedLevel = 1, mixLevel = 1, seed = 1) => L.makeCards({
  players: PLAYERS, items: ITEMS, N, shared: TUNE.shared[1][sharedLevel][1], mix: TUNE.mix[1][mixLevel][1], weight, rand: seeded(seed),
});

test("makeCards: full cards, no repeats, never about or involving the owner", () => {
  for (const n of SIZES) {
    const N = n * n, c = cards(N);
    assert.deepEqual(Object.keys(c), PLAYERS);
    for (const [p, list] of Object.entries(c)) {
      assert.equal(list.length, N);
      assert.equal(new Set(list).size, N);
      assert.ok(list.every(id => !fxAbout(byId(id)).includes(p)), `${p} got a prediction about them`);
    }
  }
});

test("makeCards: the variety cap holds whenever the pool allows it", () => {
  const N = 16, c = cards(N, 1, 2); // strict: cap = ceil(N / subjects)
  for (const [p, list] of Object.entries(c)) {
    const pool = ITEMS.filter(i => !fxAbout(i).includes(p)), subjects = new Set(pool.map(i => L.subjectOf(i) ?? "")).size;
    const per = {};
    list.forEach(id => { const s = L.subjectOf(itemById[id]) ?? ""; per[s] = (per[s] || 0) + 1; });
    assert.ok(Math.max(...Object.values(per)) <= Math.ceil(N / subjects), `${p}: ${JSON.stringify(per)}`);
  }
});

test("makeCards: more crossings means cards share more cells", () => {
  const N = 16, avg = level => L.cardStats(Array.from({ length: 20 }, (_, s) => Object.values(cards(N, level, 1, s + 1))), itemById).shared;
  const [few, mid, many] = [0, 1, 2].map(avg);
  assert.ok(few < mid && mid < many, JSON.stringify({ few, mid, many }));
});

test("cardStats: shared cells and the most cells about one person", () => {
  const [a, b] = OLD_ITEMS.filter(i => i.about === PLAYERS[0]), c = OLD_ITEMS.find(i => i.about === PLAYERS[1]);
  const got = L.cardStats([[[a.id, b.id, c.id], [a.id, c.id, NEW_ITEMS[0].id]]], itemById);
  assert.equal(got.shared, 2);
  assert.equal(got.top, (2 + 1) / 2);
});

test("enough: ✅ from GOOD× the cells, 👌 from 1×, ❌ below", () => {
  for (const n of SIZES) {
    const N = n * n;
    assert.equal(L.enough(Math.ceil(GOOD * N), n), "✅");
    assert.equal(L.enough(Math.ceil(GOOD * N) - 1, n), N <= Math.ceil(GOOD * N) - 1 ? "👌" : "❌");
    assert.equal(L.enough(N, n), N >= Math.ceil(GOOD * N) ? "✅" : "👌");
    assert.equal(L.enough(N - 1, n), "❌");
  }
});

test("endStats: prophets, the reveal, the journal and the awards", () => {
  const n = 3, gameCards = Object.fromEntries(PLAYERS.map(p => [p, cardFor(p, n)])), marked = marksFor(n);
  const marks = Object.fromEntries(Object.entries(marked).map(([p, m]) => [p, { marked: m }]));
  const events = Object.fromEntries(eventsFor(n).map(e => [`${e.item}_${e.player}`, e]));
  const st = L.endStats({ players: PLAYERS, byId: itemById, cards: gameCards, marks, events, ratings: RATINGS, startAt: ts(PLAY_AT) });
  const onCards = [...new Set(Object.values(gameCards).flat())];
  const came = onCards.filter(id => PLAYERS.some(p => marked[p].includes(id)));
  // a point to the author of every prediction someone marked, places shared on ties
  assert.deepEqual(st.prophets.map(r => [r.p, r.n]), PLAYERS.map(p => [p, came.filter(id => byId(id).author === p).length]).sort((a, b) => b[1] - a[1]));
  st.prophets.forEach((r, k) => assert.equal(r.place, k && st.prophets[k - 1].n === r.n ? st.prophets[k - 1].place : k + 1));
  // every prediction on a card, most-marked first
  assert.equal(st.reveal.length, onCards.length);
  assert.ok(st.reveal.every((r, k) => !k || st.reveal[k - 1].by.length >= r.by.length));
  // the journal: every mark still on, in time order
  assert.equal(st.journal.length, eventsFor(n).length);
  assert.ok(st.journal.every((e, k) => !k || st.journal[k - 1].at.seconds <= e.at.seconds));
  const first = eventsFor(n)[0];
  assert.deepEqual([st.fastest.item.id, st.fastest.player, st.fastest.mins], [first.item, first.player, Math.round((first.at.seconds - PLAY_AT) / 60)]);
  assert.ok(st.crowd.by.length > 1 && st.crowd.by.length === Math.max(...st.reveal.map(r => r.by.length)));
  assert.ok(st.predictable.n > 0);
  // the best-rated prediction nobody marked
  const unmarked = onCards.filter(id => !came.includes(id) && RATINGS.some(r => r.item === id));
  assert.equal(st.missed?.item.id, unmarked.sort((a, b) => L.avgStars(b, RATINGS) - L.avgStars(a, RATINGS))[0]);
});

test("endStats: an unmarked mark leaves the journal; nothing marked, no awards", () => {
  const n = 2, gameCards = Object.fromEntries(PLAYERS.map(p => [p, cardFor(p, n)]));
  const events = Object.fromEntries(eventsFor(n).map(e => [`${e.item}_${e.player}`, e]));
  const st = L.endStats({ players: PLAYERS, byId: itemById, cards: gameCards, marks: {}, events, ratings: [], startAt: ts(PLAY_AT) });
  assert.equal(st.journal.length, 0);
  assert.equal(st.fastest, undefined);
  assert.equal(st.crowd, null);
  assert.equal(st.predictable, null);
  assert.ok(st.prophets.every(r => r.n === 0 && r.place === 1));
});

test("formerPlayers: names that still have data", () => {
  const rest = PLAYERS.filter(p => p !== ROLE.removed);
  assert.deepEqual(L.formerPlayers(ITEMS, {}, {}, rest), [ROLE.removed]);
  assert.deepEqual(L.formerPlayers([], { ghost: {} }, { ghost2: "🚀" }, PLAYERS), ["ghost", "ghost2"]);
  assert.deepEqual(L.formerPlayers(ITEMS, {}, {}, PLAYERS), []);
});

test("the service worker caches every module in js/", () => {
  const sw = readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
  const listed = [...sw.match(/\.\.\.\[([^\]]+)\]\.map\(m => `js\/\$\{m\}\.js`\)/)[1].matchAll(/"(\w+)"/g)].map(m => m[1]).sort();
  const files = readdirSync(new URL("../../js/", import.meta.url)).filter(f => f.endsWith(".js")).map(f => f.slice(0, -3)).sort();
  assert.deepEqual(listed, files);
});
