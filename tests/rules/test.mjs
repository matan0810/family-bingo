// Firestore rules tests against ../../firestore.rules on the local emulator (needs Java).
// Run from tests/: `npm run test:rules`. Names come from ../fixtures.mjs; the fallback family code,
// the emojis and the limits are read from the rules and index.html (../source.mjs). Each t() line is one allow/deny case.
import { initializeTestEnvironment, assertSucceeds as ok, assertFails as no } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, collection, serverTimestamp, writeBatch, query, where } from 'firebase/firestore';
import { PLAYERS, ROLE, FOUNDERS, EXTRA_PLAYER, UNKNOWN, TITLE, NEW_CODE, BULK } from '../fixtures.mjs';
import { RULES, FALLBACK_CODE, EMOJIS, RULES_EMOJIS, MAX, CODE_MIN, SIZES } from '../source.mjs';

const env = await initializeTestEnvironment({ projectId: 'demo-bingo', firestore: { rules: RULES, host: '127.0.0.1', port: 8080 } });
const db = u => u ? env.authenticatedContext(u).firestore() : env.unauthenticatedContext().firestore();
let n = 0, bad = 0;
const t = async (name, p) => { try { await p; n++; } catch (e) { bad++; console.log('FAIL', name, e.message.split('\n')[0]); } };
const section = s => console.log('—', s);

// one device per role; `uid.x` is its auth uid and `x` its Firestore handle
const { founder: F1, founder2: F2, admin: AD, other: OT, player: PL, removed: OLD } = ROLE;
const uid = Object.fromEntries(['f1', 'f2', 'ad', 'ot', 'old', 'x', 'g'].map(k => [k, k + 'U']));
const f1 = db(uid.f1), f2 = db(uid.f2), ad = db(uid.ad), ot = db(uid.ot), x = db(uid.x), anon = db(null);
const long = k => 'x'.repeat(k + 1);
const join = (d, u, code = FALLBACK_CODE) => setDoc(doc(d, 'members', u), { code });
// pick a name: claim players/{name} and record it on the device, in one batch (like the app)
const pick = (d, u, name) => { const b = writeBatch(d); b.set(doc(d, 'players', name), { uid: u }); b.set(doc(d, 'members', u), { name }, { merge: true }); return b.commit(); };
const cfg = (d, v = {}) => setDoc(doc(d, 'config', 'settings'), { title: '', players: PLAYERS, founders: FOUNDERS, admins: [], ...v });
const add = (d, author, about = [PL], { text = 'text', id, ...meta } = {}) => {
  const r = id ? doc(d, 'items', id) : doc(collection(d, 'items')); const b = writeBatch(d);
  b.set(r, { about, author, weight: 1, at: serverTimestamp(), ...meta }); b.set(doc(d, 'texts', r.id), { text });
  return b.commit().then(() => r);
};
const del = (d, id) => { const b = writeBatch(d); b.delete(doc(d, 'items', id)); b.delete(doc(d, 'texts', id)); return b.commit(); };
const state = (d, v) => setDoc(doc(d, 'game', 'state'), { status: 'entry', cards: {}, ...v });
const noMarks = { marked: [], bingo: false, blackout: false };

section('the rules and the app agree');
await t('emojis in the rules match EMOJIS in index.html', JSON.stringify(RULES_EMOJIS) === JSON.stringify(EMOJIS) ? Promise.resolve() : Promise.reject(new Error('emoji lists differ')));

section('membership and the family code');
await t('anon cannot read items', no(getDocs(collection(anon, 'items'))));
await t('stranger cannot read items', no(getDocs(collection(x, 'items'))));
await t('wrong code', no(join(x, uid.x, FALLBACK_CODE + '-wrong')));
await t('join for another uid', no(join(x, uid.f1)));
await t('join', ok(Promise.all([join(f1, uid.f1), join(f2, uid.f2), join(ad, uid.ad), join(ot, uid.ot)])));
await t('read own member doc', ok(getDoc(doc(ad, 'members', uid.ad))));
await t('cannot read another member doc', no(getDoc(doc(ad, 'members', uid.f1))));
await t('member cannot change its code', no(setDoc(doc(ad, 'members', uid.ad), { code: 'x' }, { merge: true })));

section('migration: settings are seeded once from the existing game');
await t('no names before settings exist', no(pick(ad, uid.ad, AD)));
await t('stranger cannot seed settings', no(cfg(x)));
await t('settings need a founder among the players', no(cfg(ad, { founders: [UNKNOWN] })));
await t('settings need at least one founder', no(cfg(ad, { founders: [] })));
await t('any member seeds the settings', ok(cfg(ad)));
await t('…only once', no(cfg(ad, { title: TITLE })));
await t('members read settings', ok(getDoc(doc(ot, 'config', 'settings'))));
await t('stranger cannot read settings', no(getDoc(doc(x, 'config', 'settings'))));

section('upgrade: a phone that already held a name before the upgrade');
const old = db(uid.old);
await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await setDoc(doc(f, 'members', uid.old), { code: FALLBACK_CODE }); await setDoc(doc(f, 'players', OLD), { uid: uid.old }); });
await t('old phone has no recorded name: no rater/admin identity yet', no(setDoc(doc(old, 'members', uid.old), { name: PL }, { merge: true })));
await t('old phone records the name it holds', ok(setDoc(doc(old, 'members', uid.old), { name: OLD }, { merge: true })));
await t('…and can write predictions as that name', ok(add(old, OLD, [PL])));

section('names: claim, record on the device, take over');
await t('pick a name', ok(pick(f1, uid.f1, F1)));
await t('unknown name', no(pick(ad, uid.ad, UNKNOWN)));
await t('claim for another uid', no(setDoc(doc(ad, 'players', AD), { uid: uid.f1 })));
await t('record a name I do not hold', no(setDoc(doc(ad, 'members', uid.ad), { name: F1 }, { merge: true })));
await t('more names', ok(Promise.all([pick(f2, uid.f2, F2), pick(ad, uid.ad, AD), pick(ot, uid.ot, OT)])));
await t('member takes over a taken name', ok(pick(ad, uid.ad, OLD)));
await t('takeover extra field', no(setDoc(doc(ad, 'players', OLD), { uid: uid.ad, x: 1 })));
await t('stranger cannot take over', no(setDoc(doc(x, 'players', OLD), { uid: uid.x })));
await t('back to my own name', ok(pick(ad, uid.ad, AD)));

section('founders and admins');
await t('non-founder cannot change settings', no(cfg(ad, { title: TITLE })));
await t('founder sets the title', ok(cfg(f1, { title: TITLE })));
await t('title too long', no(cfg(f1, { title: long(MAX.title) })));
await t('too many players', no(cfg(f1, { players: [...PLAYERS, ...Array.from({ length: MAX.players + 1 - PLAYERS.length }, (_, i) => 'p' + i)] })));
await t('admins must be players', no(cfg(f1, { admins: [UNKNOWN] })));
await t('extra field', no(cfg(f1, { x: 1 })));
await t('founders are fixed: cannot remove one', no(cfg(f1, { founders: FOUNDERS.slice(1) })));
await t('founders are fixed: cannot add one', no(cfg(f1, { founders: [...FOUNDERS, OT] })));
await t('non-admin cannot write the game', no(state(ad)));
await t('founder writes the game', ok(state(f1)));
await t('second founder writes the game', ok(state(f2)));
await t('founder adds an admin', ok(cfg(f1, { admins: [AD] })));
await t('extra admin writes the game', ok(state(ad)));
await t('extra admin cannot change settings', no(cfg(ad)));
await t('admin removed', ok(cfg(f2, { admins: [] })));
await t('…no admin rights', no(state(ad)));
await pick(ad, uid.ad, F2);
await t('a device whose founder name was taken over loses founder rights', no(state(f2)));
await t('…and the device that took it has them (trust model)', ok(state(ad)));
await pick(f2, uid.f2, F2); await pick(ad, uid.ad, AD);

section('predictions: one person, a group, a general event');
await t('about one person', ok(add(ad, AD, [PL])));
await t('about a group', ok(add(ad, AD, [PL, OT])));
await t('general event (about nobody)', ok(add(ad, AD, [])));
await t('group that includes the author', no(add(ad, AD, [PL, AD])));
await t('unknown name in the group', no(add(ad, AD, [PL, UNKNOWN])));
await t('old single-name format for new items', no(add(ad, AD, PL)));
await t('impersonate the author', no(add(ad, OT, [PL])));
await t('text too long', no(add(ad, AD, [PL], { text: long(MAX.text) })));
await t('extra field', no(add(ad, AD, [PL], { evil: 1 })));
await t('weight', no(add(ad, AD, [PL], { weight: 99 })));
await t('custom id (xss)', no(add(ad, AD, [PL], { id: '"><img src=x onerror=alert(1)>' })));
await t('item without text', no(addDoc(collection(ad, 'items'), { about: [], author: AD, weight: 1, at: serverTimestamp() })));
await t('text without item', no(setDoc(doc(ad, 'texts', 'abcdefghijklmnopqrst'), { text: 'x' })));
const byAdmin = await add(ad, AD, [PL]);         // by the admin about the player
const group = await add(ad, AD, [OT, F1]);       // by the admin about other + founder
const general = await add(ot, OT, []);           // by other, general
const aboutAdmin = await add(f1, F1, [AD]);      // by the founder about the admin
// an item in the old format (about is a single name), as already stored in production
const oldItem = 'legacyItem000000000A';
await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await setDoc(doc(f, 'items', oldItem), { about: F2, author: OT, weight: 1 }); await setDoc(doc(f, 'texts', oldItem), { text: 'old' }); });

section('texts in the writing phase');
await t('author reads own text', ok(getDoc(doc(ad, 'texts', byAdmin.id))));
await t('admin cannot read others texts', no(getDoc(doc(f1, 'texts', byAdmin.id))));
await t('nobody reads a general event yet', no(getDoc(doc(ad, 'texts', general.id))));
await t('cannot list texts', no(getDocs(collection(ad, 'texts'))));
await t('stranger cannot read text', no(getDoc(doc(x, 'texts', byAdmin.id))));
await t('author edits own text', ok(setDoc(doc(ad, 'texts', byAdmin.id), { text: 'edited' })));
await t('edit too long', no(setDoc(doc(ad, 'texts', byAdmin.id), { text: long(MAX.text) })));
await t('edit extra field', no(setDoc(doc(ad, 'texts', byAdmin.id), { text: 'a', x: 1 })));
await t('others cannot edit', no(setDoc(doc(f1, 'texts', byAdmin.id), { text: 'hack' })));
await t('items cannot be updated', no(setDoc(doc(ad, 'items', byAdmin.id), { about: [OT], author: AD, weight: 1, at: serverTimestamp() })));
await t('marks locked while writing', no(setDoc(doc(ad, 'marks', AD), noMarks)));

section('rating phase (the admins are the raters)');
await cfg(f1, { admins: [AD] }); // raters: both founders and the admin
const rt = (d, item, player, stars, id) => setDoc(doc(d, 'ratings', id ?? `${item}_${player}`), { item, player, stars });
await t('cannot rate while writing', no(rt(ad, aboutAdmin.id, AD, MAX.stars)));
await t('non-admin cannot start rating', no(state(ot, { status: 'rate' })));
await t('bad rater name', no(state(f1, { status: 'rate', raters: [UNKNOWN] })));
await t('admin starts rating', ok(state(f1, { status: 'rate', at: serverTimestamp() })));
await t('an old raters list in the game state is still accepted (ignored)', ok(state(f1, { status: 'rate', raters: [OT], at: serverTimestamp() })));
await t('rater reads a text not about them', ok(getDoc(doc(f1, 'texts', byAdmin.id))));
await t('rater reads a general event', ok(getDoc(doc(f1, 'texts', general.id))));
await t('admin from the admins list reads it too', ok(getDoc(doc(ad, 'texts', general.id))));
await t('rater in a group cannot read it', no(getDoc(doc(f1, 'texts', group.id))));
await t('rater cannot read a text about them', no(getDoc(doc(ad, 'texts', aboutAdmin.id))));
await t('non-admin cannot read (even if listed in old raters)', no(getDoc(doc(ot, 'texts', byAdmin.id))));
await t('author still reads own', ok(getDoc(doc(ot, 'texts', general.id))));
await t('rate', ok(rt(ad, general.id, AD, MAX.stars)));
await t('change rating', ok(rt(ad, general.id, AD, 0)));
await t('rate an old-format item', ok(rt(ad, oldItem, AD, 1)));
await t('rate a group item I am in', no(rt(f1, group.id, F1, MAX.stars)));
await t('rate about myself', no(rt(ad, aboutAdmin.id, AD, MAX.stars)));
await t('rate my own', no(rt(ad, byAdmin.id, AD, MAX.stars)));
await t('too many stars', no(rt(ad, general.id, AD, MAX.stars + 1)));
await t('rate as someone else', no(rt(ad, general.id, F1, MAX.stars)));
await t('id mismatch', no(rt(ad, general.id, AD, MAX.stars, 'whatever')));
await t('non-admin cannot rate', no(rt(ot, byAdmin.id, OT, MAX.stars)));
await t('another admin (founder) rates', ok(rt(f2, general.id, F2, 1)));
await t('extra field', no(setDoc(doc(ad, 'ratings', `${general.id}_${AD}`), { item: general.id, player: AD, stars: 1, x: 1 })));
await t('no adding items', no(add(ad, AD, [PL])));
await t('no deleting items', no(del(ad, byAdmin.id)));
await t('author edits own text', ok(setDoc(doc(ot, 'texts', general.id), { text: 'better' })));
await t('rater cannot edit others', no(setDoc(doc(ad, 'texts', general.id), { text: 'hack' })));
await t('members read ratings', ok(getDocs(collection(ot, 'ratings'))));

section('wording suggestions');
const sg = (d, item, from, fromUid, toUid, extra = {}) => addDoc(collection(d, 'suggestions'), { item, from, fromUid, toUid, text: 'suggestion', at: serverTimestamp(), ...extra });
await t('rater suggests on a general event', ok(sg(ad, general.id, AD, uid.ad, uid.ot)));
await t('rater in the group cannot suggest', no(sg(f1, group.id, F1, uid.f1, uid.ad)));
await t('about myself', no(sg(ad, aboutAdmin.id, AD, uid.ad, uid.f1)));
await t('on my own prediction', no(sg(ad, byAdmin.id, AD, uid.ad, uid.ad)));
await t('wrong author device', no(sg(ad, general.id, AD, uid.ad, uid.f1)));
await t('forged fromUid', no(sg(ad, general.id, AD, uid.f1, uid.ot)));
await t('forged from', no(sg(ad, general.id, F1, uid.ad, uid.ot)));
await t('non-rater', no(sg(ot, byAdmin.id, OT, uid.ot, uid.ad)));
await t('too long', no(sg(ad, general.id, AD, uid.ad, uid.ot, { text: long(MAX.text) })));
await t('author lists own', ok(getDocs(query(collection(ot, 'suggestions'), where('toUid', '==', uid.ot)))));
await t('suggester lists own', ok(getDocs(query(collection(ad, 'suggestions'), where('fromUid', '==', uid.ad)))));
await t('others cannot list', no(getDocs(query(collection(f1, 'suggestions'), where('toUid', '==', uid.ot)))));
await t('nobody lists all', no(getDocs(collection(ot, 'suggestions'))));
const mySug = (await getDocs(query(collection(ot, 'suggestions'), where('toUid', '==', uid.ot)))).docs[0];
await t('author accepts (edit text + delete)', ok((() => { const b = writeBatch(ot); b.set(doc(ot, 'texts', general.id), { text: mySug.data().text }); b.delete(doc(ot, 'suggestions', mySug.id)); return b.commit(); })()));

section('play and ended');
const size = SIZES[0];
await t('bad size', no(state(f1, { status: 'play', size: Math.max(...SIZES) + 1 })));
await t('bad status', no(state(f1, { status: 'weird' })));
await t('cards only for players', no(state(f1, { status: 'play', cards: { [UNKNOWN]: [] } })));
const gen = writeBatch(f1);
gen.set(doc(f1, 'game', 'state'), { status: 'play', cards: { [AD]: [general.id] }, size, raters: [AD, F1], at: serverTimestamp() });
PLAYERS.forEach(p => gen.set(doc(f1, 'marks', p), { ...noMarks, bingoAt: null, blackoutAt: null }));
await t('generate cards (batch)', ok(gen.commit()));
await t('mark own card', ok(setDoc(doc(ad, 'marks', AD), { marked: ['a'], bingo: true, blackout: false, bingoAt: serverTimestamp(), blackoutAt: null })));
await t('keep the same bingoAt', ok(getDoc(doc(ad, 'marks', AD)).then(s => setDoc(doc(ad, 'marks', AD), { ...s.data(), marked: ['a', 'b'] }))));
await t('forged bingoAt', no(setDoc(doc(ad, 'marks', AD), { marked: ['a'], bingo: true, blackout: false, bingoAt: Timestamp.fromDate(new Date(2000, 1, 1)), blackoutAt: null })));
await t('too many marks', no(setDoc(doc(ad, 'marks', AD), { ...noMarks, marked: Array(MAX.marks + 1).fill('x') })));
await t('mark someone else', no(setDoc(doc(ot, 'marks', F1), { marked: [], bingo: true, blackout: true })));
await t('everyone reads a general event', ok(getDoc(doc(ad, 'texts', general.id))));
await t('group members cannot read it', no(getDoc(doc(f1, 'texts', group.id))));
await t('others read it', ok(getDoc(doc(f2, 'texts', group.id))));
await t('old-format item: its person cannot read', no(getDoc(doc(f2, 'texts', oldItem))));
await t('old-format item: others read', ok(getDoc(doc(ad, 'texts', oldItem))));
await t('texts locked', no(setDoc(doc(ot, 'texts', general.id), { text: 'late' })));
await t('suggestions locked', no(sg(ad, general.id, AD, uid.ad, uid.ot)));
await t('ratings locked', no(rt(ad, general.id, AD, 1)));
await t('non-admin cannot write history', no(addDoc(collection(ot, 'history'), { at: serverTimestamp(), size, results: [] })));
await t('history extra field', no(addDoc(collection(f1, 'history'), { at: serverTimestamp(), size, results: [], x: 1 })));
await t('end game: history with title + ended', ok((() => { const b = writeBatch(f1); b.set(doc(collection(f1, 'history')), { at: serverTimestamp(), size, title: TITLE, results: [{ p: AD, place: 1, n: 1, bingo: true, blackout: false }] }); b.set(doc(f1, 'game', 'state'), { status: 'ended', cards: { [AD]: [general.id] }, size, at: serverTimestamp() }); return b.commit(); })()));
await t('members read history', ok(getDocs(collection(ot, 'history'))));
await t('marks locked after the game', no(setDoc(doc(ot, 'marks', OT), noMarks)));
await t('new game', ok(state(f1)));

section('game settings: players, family code, new trip');
const g = db(uid.g);
await t('founder adds a player', ok(cfg(f1, { players: [...PLAYERS, EXTRA_PLAYER] })));
await t('new player joins and picks the name', ok(join(g, uid.g).then(() => pick(g, uid.g, EXTRA_PLAYER))));
await t('prediction about the new player', ok(add(ad, AD, [EXTRA_PLAYER, PL])));
await t('looks for a player only', no(setDoc(doc(ad, 'looks', UNKNOWN), { e: EMOJIS[0] })));
await t('own look', ok(setDoc(doc(ad, 'looks', AD), { e: EMOJIS[0] })));
await t('look not in the list', no(setDoc(doc(ad, 'looks', AD), { e: '💩' })));
await t("someone else's look", no(setDoc(doc(ad, 'looks', OT), { e: EMOJIS[0] })));
await t('non-founder cannot read the code', no(getDoc(doc(ad, 'config', 'secret'))));
await t('code too short', no(setDoc(doc(f1, 'config', 'secret'), { code: 'x'.repeat(CODE_MIN - 1) })));
await t('founder sets a new code', ok(setDoc(doc(f1, 'config', 'secret'), { code: NEW_CODE })));
await t('founder reads it', ok(getDoc(doc(f2, 'config', 'secret'))));
await t('old fallback code no longer works', no(join(db('newU1'), 'newU1')));
await t('new code works', ok(join(db('newU2'), 'newU2', NEW_CODE)));
const many = []; for (let i = 0; i < BULK; i++) many.push((await add(ad, AD, [PL], { text: 't' + i })).id);
await t(`new trip: admin deletes ${BULK} predictions in one batch`, ok((() => { const b = writeBatch(f1); many.forEach(id => { b.delete(doc(f1, 'items', id)); b.delete(doc(f1, 'texts', id)); }); return b.commit(); })()));
await t('non-admin cannot delete history', no(getDocs(collection(ot, 'history')).then(s => deleteDoc(doc(ot, 'history', s.docs[0].id)))));
await t('admin deletes history', ok(getDocs(collection(f1, 'history')).then(s => deleteDoc(doc(f1, 'history', s.docs[0].id)))));
await t('admin releases a name', ok(deleteDoc(doc(f1, 'players', EXTRA_PLAYER))));
await t('non-admin cannot release others', no(deleteDoc(doc(ad, 'players', OT))));
await t('release my own name', ok(deleteDoc(doc(ot, 'players', OT))));
await t('other collections are closed', no(setDoc(doc(f1, 'junk', 'x'), { a: 1 })));

console.log(`${n} passed, ${bad} failed`);
await env.cleanup(); process.exit(bad ? 1 : 0);
