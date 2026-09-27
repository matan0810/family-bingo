// Pure game logic: no DOM, no Firebase, no module state. Everything it needs comes in as arguments,
// so tests/unit can check it directly (randomness is injectable).
import { EMOJIS, COLOR, GOOD } from "./config.js";

// who a prediction is about: a list of names, empty for a general event (older predictions hold a single name).
// The first name is the subject (the one it counts for); the others are involved: like the subject, they never see it,
// rate it or get it on their card.
export const aboutOf = i => Array.isArray(i.about) ? i.about : i.about ? [i.about] : [];
export const subjectOf = i => aboutOf(i)[0];
export const involves = (i, p) => aboutOf(i).includes(p);
// a prediction by or about a removed player stays stored but is left out of rating and cards
export const isActive = (i, players) => players.includes(i.author) && aboutOf(i).every(x => players.includes(x));
export const secs = t => t?.seconds ?? Infinity; // pending server timestamps sort last
export const without = (list, x) => list.filter(y => y !== x);

// players without a chosen emoji get one by their place in the player list, skipping emojis already taken
export function autoEmoji(p, players, looks) {
  const chosen = new Set(players.map(x => looks[x]).filter(e => COLOR[e])), taken = new Set();
  for (const [k, x] of players.entries()) {
    if (COLOR[looks[x]]) continue;
    const e = [...EMOJIS.slice(k), ...EMOJIS.slice(0, k)].map(([e]) => e).find(e => !chosen.has(e) && !taken.has(e)) ?? "🙂";
    if (x === p) return e;
    taken.add(e);
  }
  return "🙂";
}

// ---- board ----
// every row, column and both diagonals of an n×n board, as cell indexes
export function lines(n) {
  const r = [...Array(n).keys()], L = [];
  r.forEach(i => { L.push(r.map(j => i * n + j)); L.push(r.map(j => j * n + i)); });
  L.push(r.map(i => i * n + i), r.map(i => i * n + n - 1 - i));
  return L;
}
// cell indexes that are part of a completed line
export const bingoCells = (ids, on, n) => new Set(lines(n).filter(l => l.every(k => on.has(ids[k]))).flat());
export const isBlackout = (ids, on) => ids.length > 0 && ids.every(id => on.has(id));

// sorts rows and gives each a place; rows that compare equal share it
export function withPlaces(rows, cmp) {
  rows.sort(cmp);
  rows.forEach((r, k) => r.place = k && !cmp(rows[k - 1], r) ? rows[k - 1].place : k + 1);
  return rows;
}
// places: full card first (earliest wins), then more marks, then bingo (earliest first)
export const byPlace = (a, b) => (b.blackout - a.blackout) || (a.blackout && a.ft - b.ft) || (b.n - a.n) || (b.bingo - a.bingo) || (a.bingo && a.bt - b.bt) || 0;
// rows for the scoreboard, from marks/{player}
export const scoreRows = (players, marks) => withPlaces(players.map(p => {
  const m = marks[p] || {};
  return { p, n: (m.marked || []).length, bingo: !!m.bingo, blackout: !!m.blackout, bt: secs(m.bingoAt), ft: secs(m.blackoutAt) };
}), byPlace);

// ---- ratings and card selection ----
// average stars of a prediction (0..3), or null when nobody rated it
export function avgStars(id, ratings) {
  const rs = ratings.filter(r => r.item === id).map(r => Math.min(3, Math.max(0, +r.stars || 0)));
  return rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null;
}
// weight = item.weight (default 1, hook for manual priority) × (avg stars + .5)^power; unrated counts as 1.5 stars
export const weightOf = (i, ratings, power = 2) => (i.weight ?? 1) * ((avgStars(i.id, ratings) ?? 1.5) + .5) ** power;

const bucket = i => subjectOf(i) ?? ""; // "" = general events
// draws k more predictions into card by weight, at most cap per subject while that is still possible
export function draw(pool, k, card, per, cap, weight, rand = Math.random) {
  const left = pool.filter(i => !card.includes(i.id)).map(i => ({ i, w: weight(i) }));
  for (let n = 0; n < k && left.length; n++) {
    const ok = left.filter(x => (per[bucket(x.i)] || 0) < cap), from = ok.length ? ok : left;
    let r = rand() * from.reduce((s, x) => s + x.w, 0);
    const x = from.find(x => (r -= x.w) < 0) ?? from.at(-1);
    left.splice(left.indexOf(x), 1); card.push(x.i.id);
    per[bucket(x.i)] = (per[bucket(x.i)] || 0) + 1;
  }
  return card;
}
export const shuffle = (a, rand = Math.random) => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };

// a card = k "hot" predictions from a small set shared by all cards (so some moments make several players shout
// at once; the smaller the set, the more crossings), then the rest by weight, with a cap per subject so every card
// laughs at everyone; positions are shuffled (drawing puts the strongest first, which would crowd the top rows).
// items: the active predictions; shared = { f, h } and mix come from TUNE.
export function makeCards({ players, items, N, shared, mix, weight, rand = Math.random }) {
  const k = Math.max(1, Math.round(N * shared.f));
  const hot = draw(items, Math.max(k, Math.round(k * shared.h)), [], {}, Infinity, weight, rand);
  return Object.fromEntries(players.map(p => {
    const pool = items.filter(i => !involves(i, p)), per = {}, cap = Math.ceil(N / new Set(pool.map(bucket)).size) + mix;
    const card = draw(pool.filter(i => hot.includes(i.id)), k, [], per, cap, weight, rand);
    return [p, shuffle(draw(pool, N - card.length, card, per, cap, weight, rand), rand)];
  }));
}
// what a set of cards feels like: cells two cards share on average, and the most cells one person gets on a card
export function cardStats(cardsList, byId) {
  let shared = 0, pairs = 0, top = 0, n = 0;
  for (const cards of cardsList) {
    cards.forEach((a, x) => cards.slice(x + 1).forEach(b => { shared += a.filter(id => b.includes(id)).length; pairs++; }));
    cards.forEach(c => {
      const per = {};
      c.map(id => subjectOf(byId[id])).filter(Boolean).forEach(p => per[p] = (per[p] || 0) + 1);
      top += Math.max(0, ...Object.values(per)); n++;
    });
  }
  return { shared: pairs ? shared / pairs : 0, top: n ? top / n : 0 };
}
// how good the predictions are for a board size, from the smallest pool any card can draw from
export const enough = (least, n) => least >= Math.ceil(GOOD * n * n) ? "✅" : least >= n * n ? "👌" : "❌";

// ---- end of the game ----
// author points ("prophets"), the reveal, the journal and the raw facts behind the awards
export function endStats({ players, byId, cards, marks, events, ratings, startAt }) {
  const onCards = [...new Set(Object.values(cards || {}).flat())].map(id => byId[id]).filter(Boolean);
  const markers = id => players.filter(p => marks[p]?.marked?.includes(id));
  const reveal = onCards.map(i => ({ i, by: markers(i.id) })).sort((a, b) => b.by.length - a.by.length);
  const came = reveal.filter(r => r.by.length).map(r => r.i);
  const count = key => came.reduce((t, i) => { const k = key(i); if (k) t[k] = (t[k] || 0) + 1; return t; }, {});
  // a point for the author of every prediction that came true (someone marked it)
  const points = count(i => i.author);
  const prophets = withPlaces(players.map(p => ({ p, n: points[p] || 0 })), (a, b) => b.n - a.n);
  // the journal: marks that are still on, by time (a mark made offline is timed when it reached the server)
  const journal = Object.values(events).filter(e => byId[e.item] && marks[e.player]?.marked?.includes(e.item)).sort((a, b) => secs(a.at) - secs(b.at));
  const first = journal[0], mins = first && Math.round((secs(first.at) - secs(startAt)) / 60);
  const [subject, times] = Object.entries(count(subjectOf)).sort((a, b) => b[1] - a[1])[0] ?? [];
  const missed = reveal.filter(r => !r.by.length && avgStars(r.i.id, ratings) !== null).map(r => r.i)
    .sort((a, b) => avgStars(b.id, ratings) - avgStars(a.id, ratings))[0];
  return {
    prophets, reveal, journal,
    fastest: first && { item: byId[first.item], player: first.player, mins: Number.isFinite(mins) && mins >= 0 ? mins : null },
    crowd: reveal[0]?.by.length > 1 ? reveal[0] : null,
    predictable: subject ? { p: subject, n: times } : null,
    missed: missed ? { item: missed, stars: avgStars(missed.id, ratings) } : null,
  };
}

// players who left but still have data (predictions, marks, an emoji); adding them back brings it all back
export const formerPlayers = (items, marks, looks, players) =>
  [...new Set([...items.flatMap(i => [i.author, ...aboutOf(i)]), ...Object.keys(marks), ...Object.keys(looks)])].filter(p => p && !players.includes(p));
