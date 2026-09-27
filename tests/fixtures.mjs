// The test world, shared by the rules suite (Node), the UI suite (Node) and the mock (browser).
// Tests derive every expectation from these values or from the app's own source
// (see source.mjs), so names, texts and amounts live here and nowhere else.

// players are made-up test names, on purpose not the real family
export const PLAYERS = ["Ada", "Ben", "Cleo", "Dov", "Eli", "Fay"];
export const ROLE = {
  founder: PLAYERS[2],   // the device under test (uid ME_UID) plays as this founder
  founder2: PLAYERS[3],
  admin: PLAYERS[4],     // extra admin in the "full" settings
  player: PLAYERS[0],    // a regular player with no device
  other: PLAYERS[1],     // holds a name on another device (OTHER_UID)
  removed: PLAYERS[5],   // left out in the "removed" settings
};
export const FOUNDERS = [ROLE.founder, ROLE.founder2];
export const EXTRA_PLAYER = "Gil", NEW_PLAYER = "Hal";
export const UNKNOWN = "not-a-player";
export const TITLE = "Trip North", TITLE2 = "Trip South", TITLE3 = "Restored";
export const CODE = "test-code", NEW_CODE = "test-code-2";
export const ME_UID = "U1", OTHER_UID = "OTHER";
export const SIZE = 3; // board size when the mock gets no size=
export const BINGO_AT = 50; // when the founder got their bingo
export const BULK = 40; // predictions deleted in one admin batch (rules read limits)

// game settings (config/settings) variants the mock can serve
export const SETTINGS = {
  base: { title: "", players: PLAYERS, founders: FOUNDERS, admins: [] },
  full: { title: TITLE, players: [...PLAYERS, EXTRA_PLAYER], founders: FOUNDERS, admins: [ROLE.admin, ROLE.other] }, // admins not in player order, on purpose
  removed: { title: "", players: PLAYERS.filter(p => p !== ROLE.removed), founders: FOUNDERS, admins: [] },
};

// predictions: OLD_COUNT in the first version's format (about = one name), then the new format (lists)
export const OLD_COUNT = 36;
const n = PLAYERS.length;
export const OLD_ITEMS = Array.from({ length: OLD_COUNT }, (_, i) => ({ id: "i" + i, about: PLAYERS[i % n], author: PLAYERS[(i + 2) % n], text: `prediction ${i}`, at: i }));
export const NEW_ITEMS = [
  { id: "g1", about: [], author: ROLE.other, text: "general event by another player" },
  { id: "g2", about: [ROLE.player, ROLE.admin], author: ROLE.founder2, text: "group event" },
  { id: "g3", about: [], author: ROLE.founder, text: "general event by me" },
  { id: "g4", about: [ROLE.player, ROLE.other], author: ROLE.founder, text: "group event by me" },
].map((it, k) => ({ ...it, at: OLD_COUNT + k }));
export const ITEMS = [...OLD_ITEMS, ...NEW_ITEMS];
export const aboutOf = i => Array.isArray(i.about) ? i.about : [i.about];
export const byId = id => ITEMS.find(i => i.id === id);
// what a rater may rate / what may go on a player's card
export const rateableFor = (p, players = PLAYERS) => ITEMS.filter(i => i.author !== p && !aboutOf(i).includes(p) && players.includes(i.author) && aboutOf(i).every(x => players.includes(x)));
export const poolFor = p => ITEMS.filter(i => !aboutOf(i).includes(p));
// cards take the new-format items first, so they show up on every board size
export const cardFor = (p, size) => [...NEW_ITEMS, ...OLD_ITEMS].filter(i => !aboutOf(i).includes(p)).slice(0, size * size).map(i => i.id);

// an old-format prediction of mine that still holds its text (mock legacy=1): migrated by the app
export const MIGRATED = OLD_ITEMS.find(i => i.author === ROLE.founder);
// a prediction written by someone else with a device, and one whose author has no device
export const OTHERS_ITEM = rateableFor(ROLE.founder).find(i => i.author === ROLE.other);
export const NO_DEVICE_ITEM = rateableFor(ROLE.founder).find(i => i.author === ROLE.player);
export const RATINGS = [
  { item: rateableFor(ROLE.founder)[0].id, player: ROLE.founder, stars: 3 },
  { item: rateableFor(ROLE.founder)[1].id, player: ROLE.founder, stars: 0 },
  { item: rateableFor(ROLE.founder2)[0].id, player: ROLE.founder2, stars: 2 },
];
export const SUGGESTION = { id: "s1", item: MIGRATED.id, from: ROLE.other, fromUid: OTHER_UID, toUid: ME_UID, text: "suggested wording", at: { seconds: 99 } };
export const HISTORY = [{ id: "h", at: { seconds: 1790000000 }, size: 3, title: TITLE, results: PLAYERS.slice(0, 3).map((p, k) => ({ p, place: k + 1, n: 9 - k * 2, bingo: k < 2, blackout: k === 0 })) }];
// which device holds which name at the start
export const CLAIMS = { [ROLE.founder]: ME_UID, [ROLE.other]: OTHER_UID };
