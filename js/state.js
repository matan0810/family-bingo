// The app's state (one object, filled by the Firestore listeners in data.js) and the questions asked of it.
import { LEGACY, APP_NAME, COLOR, TUNE } from "./config.js";
import { isActive, involves, weightOf, scoreRows, autoEmoji } from "./logic.js";

const stored = (k, fallback) => { try { return localStorage.getItem(k); } catch { return fallback; } };

export const S = {
  // this device
  me: stored("bingo-me", null),           // the player name this device plays as
  uid: null, member: false,                // anonymous sign-in, and whether it entered the family code
  memberName: null,                        // the name recorded in members/{uid} (the rules identify players by it)
  claiming: false,
  welcomed: !!stored("bingo-welcome", "1"), // welcome screen seen
  // admin mode is toggled in settings and remembered per device (?admin in the URL also turns it on)
  adminOpen: new URLSearchParams(location.search).has("admin") || !!stored("bingo-admin", ""),

  // shared game data (Firestore)
  config: LEGACY,                          // config/settings: title, players, founders, admins
  items: [], game: { status: "entry", cards: {} }, marks: {}, looks: {}, ratings: [], pastGames: [], events: {},
  claims: {},                              // players/{name} = {uid}: which device holds each name
  sugIn: [], sugOut: [],                   // wording suggestions for my predictions / that I sent
  texts: {},                               // item id -> text, fetched one by one (undefined = loading, null = not readable)

  // screen
  view: "",                                // key of the view on screen; "" forces a rebuild
  shown: null,                             // marked ids at the last card render, to animate only new stamps
  sizeSel: null,                           // the admin's board size before generating cards
  tune: { shared: 1, stars: 1, mix: 1 }, tuneOpen: false,

  get players() { return this.config.players; },
};

export const setMe = name => {
  S.me = name;
  try { name ? localStorage.setItem("bingo-me", name) : localStorage.removeItem("bingo-me"); } catch {}
};

// ---- who is who ----
export const isFounderName = p => S.config.founders.includes(p);
export const isAdminName = p => isFounderName(p) || S.config.admins.includes(p);
export const isAdmin = () => S.adminOpen && isAdminName(S.me);
// the admins (founders included) are the raters
export const raters = () => S.players.filter(isAdminName);
export const isRater = () => isAdminName(S.me);
export const appTitle = () => S.config.title || APP_NAME;
export const emo = p => COLOR[S.looks[p]] ? S.looks[p] : autoEmoji(p, S.players, S.looks);
export const colorOf = p => COLOR[emo(p)] ?? "#888";

// ---- predictions ----
export const itemsById = () => Object.fromEntries(S.items.map(i => [i.id, i]));
export const textOf = i => i.text ?? S.texts[i.id];
export const shownText = i => { const t = textOf(i); return t === undefined ? "…" : t ?? "🔒"; };
export const active = i => isActive(i, S.players);
export const activeItems = () => S.items.filter(active);
// nobody rates what is about them or by them
export const rateable = p => S.items.filter(i => active(i) && !involves(i, p) && i.author !== p);
export const myStars = () => Object.fromEntries(S.ratings.filter(r => r.player === S.me).map(r => [r.item, r.stars]));
// what may go on a player's card
export const poolFor = p => S.items.filter(i => active(i) && !involves(i, p));
export const tuned = k => TUNE[k][1][S.tune[k]][1];
export const weight = i => weightOf(i, S.ratings, tuned("stars"));

// ---- the game ----
export const size = () => S.game.size || Math.round(Math.sqrt(S.game.cards?.[S.me]?.length || 9)) || 3;
export const ranking = () => scoreRows(S.players.filter(p => S.game.cards?.[p]), S.marks);
export const myCard = () => S.game.cards?.[S.me] || [];
export const myMarks = () => new Set(S.marks[S.me]?.marked || []);
