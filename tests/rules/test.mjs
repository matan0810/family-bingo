// Firestore rules tests against ../../firestore.rules on the local emulator (needs Java).
// Run from tests/: `npm run test:rules`. The family code in the rules file is the placeholder
// FAMILY_CODE, so the tests join with that. Each t() line is one allow/deny case.
import { initializeTestEnvironment, assertSucceeds as ok, assertFails as no } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { Timestamp, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, collection, serverTimestamp, writeBatch, query, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-bingo', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const db = u => u ? env.authenticatedContext(u).firestore() : env.unauthenticatedContext().firestore();
let n = 0, bad = 0;
const t = async (name, p) => { try { await p; n++; } catch (e) { bad++; console.log('FAIL', name, e.message.split('\n')[0]); } };
const section = s => console.log('—', s);

const P6 = ['אבא', 'אמא', 'מתן', 'אורי', 'עדי', 'הדר'];
const A = db('matanU'), U = db('uriU'), K = db('adiU'), M = db('momU'), X = db('strangerU'), anon = db(null);
const join = (d, uid, code = 'FAMILY_CODE') => setDoc(doc(d, 'members', uid), { code });
// pick a name: claim players/{name} and record it on the device, in one batch (like the app)
const pick = (d, uid, name) => { const b = writeBatch(d); b.set(doc(d, 'players', name), { uid }); b.set(doc(d, 'members', uid), { name }, { merge: true }); return b.commit(); };
const cfg = (d, v = {}) => setDoc(doc(d, 'config', 'settings'), { title: '', players: P6, founders: ['מתן', 'אורי'], admins: [], ...v });
const add = (d, author, about = ['אבא'], { text = 'עוד 5 דקות', id, ...meta } = {}) => {
  const r = id ? doc(d, 'items', id) : doc(collection(d, 'items')); const b = writeBatch(d);
  b.set(r, { about, author, weight: 1, at: serverTimestamp(), ...meta }); b.set(doc(d, 'texts', r.id), { text });
  return b.commit().then(() => r);
};
const del = (d, id) => { const b = writeBatch(d); b.delete(doc(d, 'items', id)); b.delete(doc(d, 'texts', id)); return b.commit(); };
const state = (d, v) => setDoc(doc(d, 'game', 'state'), { status: 'entry', cards: {}, ...v });

section('membership and the family code');
await t('anon cannot read items', no(getDocs(collection(anon, 'items'))));
await t('stranger cannot read items', no(getDocs(collection(X, 'items'))));
await t('wrong code', no(join(X, 'strangerU', 'nope')));
await t('join for another uid', no(join(X, 'matanU')));
await t('join', ok(Promise.all([join(A, 'matanU'), join(U, 'uriU'), join(K, 'adiU'), join(M, 'momU')])));
await t('read own member doc', ok(getDoc(doc(K, 'members', 'adiU'))));
await t('cannot read another member doc', no(getDoc(doc(K, 'members', 'matanU'))));
await t('member cannot change its code', no(setDoc(doc(K, 'members', 'adiU'), { code: 'x' }, { merge: true })));

section('migration: settings are seeded once from the existing game');
await t('no names before settings exist', no(pick(K, 'adiU', 'עדי')));
await t('stranger cannot seed settings', no(cfg(X)));
await t('settings need a founder among the players', no(cfg(K, { founders: ['nobody'] })));
await t('settings need at least one founder', no(cfg(K, { founders: [] })));
await t('any member seeds the settings', ok(cfg(K)));
await t('…only once', no(cfg(K, { title: 'hack' })));
await t('members read settings', ok(getDoc(doc(M, 'config', 'settings'))));
await t('stranger cannot read settings', no(getDoc(doc(X, 'config', 'settings'))));

section('upgrade: a phone that already held a name before the upgrade');
const H = db('hadarU');
await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await setDoc(doc(f, 'members', 'hadarU'), { code: 'FAMILY_CODE' }); await setDoc(doc(f, 'players', 'הדר'), { uid: 'hadarU' }); });
await t('old phone has no recorded name: no rater/admin identity yet', no(setDoc(doc(H, 'members', 'hadarU'), { name: 'אבא' }, { merge: true })));
await t('old phone records the name it holds', ok(setDoc(doc(H, 'members', 'hadarU'), { name: 'הדר' }, { merge: true })));
await t('…and can write predictions as that name', ok(add(H, 'הדר', ['אבא'])));

section('names: claim, record on the device, take over');
await t('pick a name', ok(pick(A, 'matanU', 'מתן')));
await t('unknown name', no(pick(K, 'adiU', 'hacker')));
await t('claim for another uid', no(setDoc(doc(K, 'players', 'עדי'), { uid: 'matanU' })));
await t('record a name I do not hold', no(setDoc(doc(K, 'members', 'adiU'), { name: 'מתן' }, { merge: true })));
await t('more names', ok(Promise.all([pick(U, 'uriU', 'אורי'), pick(K, 'adiU', 'עדי'), pick(M, 'momU', 'אמא')])));
await t('member takes over a taken name', ok(pick(K, 'adiU', 'הדר')));
await t('takeover extra field', no(setDoc(doc(K, 'players', 'הדר'), { uid: 'adiU', x: 1 })));
await t('stranger cannot take over', no(setDoc(doc(X, 'players', 'הדר'), { uid: 'strangerU' })));
await t('back to my own name', ok(pick(K, 'adiU', 'עדי')));

section('founders and admins');
await t('non-founder cannot change settings', no(cfg(K, { title: 'x' })));
await t('founder sets the title', ok(cfg(A, { title: 'טיול צפון' })));
await t('title max 40', no(cfg(A, { title: 'x'.repeat(41) })));
await t('max 12 players', no(cfg(A, { players: [...P6, ...'abcdefg'.split('')] })));
await t('admins must be players', no(cfg(A, { admins: ['hacker'] })));
await t('extra field', no(cfg(A, { x: 1 })));
await t('founders are fixed: cannot remove one', no(cfg(A, { founders: ['מתן'] })));
await t('founders are fixed: cannot add one', no(cfg(A, { founders: ['מתן', 'אורי', 'אמא'] })));
await t('non-admin cannot write the game', no(state(K)));
await t('founder writes the game', ok(state(A)));
await t('second founder writes the game', ok(state(U)));
await t('founder adds an admin', ok(cfg(A, { admins: ['עדי'] })));
await t('extra admin writes the game', ok(state(K)));
await t('extra admin cannot change settings', no(cfg(K)));
await t('admin removed', ok(cfg(U, { admins: [] })));
await t('…no admin rights', no(state(K)));
await pick(K, 'adiU', 'אורי');
await t('a device whose founder name was taken over loses founder rights', no(state(U)));
await t('…and the device that took it has them (trust model)', ok(state(K)));
await pick(U, 'uriU', 'אורי'); await pick(K, 'adiU', 'עדי');

section('predictions: one person, a group, a general event');
await t('about one person', ok(add(K, 'עדי', ['אבא'])));
await t('about a group', ok(add(K, 'עדי', ['אבא', 'אמא'])));
await t('general event (about nobody)', ok(add(K, 'עדי', [])));
await t('group that includes the author', no(add(K, 'עדי', ['אבא', 'עדי'])));
await t('unknown name in the group', no(add(K, 'עדי', ['אבא', 'hacker'])));
await t('old single-name format for new items', no(add(K, 'עדי', 'אבא')));
await t('impersonate the author', no(add(K, 'אמא', ['אבא'])));
await t('text too long', no(add(K, 'עדי', ['אבא'], { text: 'x'.repeat(141) })));
await t('extra field', no(add(K, 'עדי', ['אבא'], { evil: 1 })));
await t('weight', no(add(K, 'עדי', ['אבא'], { weight: 99 })));
await t('custom id (xss)', no(add(K, 'עדי', ['אבא'], { id: '"><img src=x onerror=alert(1)>' })));
await t('item without text', no(addDoc(collection(K, 'items'), { about: [], author: 'עדי', weight: 1, at: serverTimestamp() })));
await t('text without item', no(setDoc(doc(K, 'texts', 'abcdefghijklmnopqrst'), { text: 'x' })));
const kid1 = await add(K, 'עדי', ['אבא']);                 // by עדי about אבא
const group = await add(K, 'עדי', ['אמא', 'מתן']);         // by עדי about אמא+מתן
const general = await add(M, 'אמא', []);                  // by אמא, general
const byMatan = await add(A, 'מתן', ['עדי']);             // by מתן about עדי
// an item in the old format (about is a single name), as already stored in production
await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await setDoc(doc(f, 'items', 'legacyItem000000000A'), { about: 'אורי', author: 'אמא', weight: 1 }); await setDoc(doc(f, 'texts', 'legacyItem000000000A'), { text: 'ישן' }); });

section('texts in the writing phase');
await t('author reads own text', ok(getDoc(doc(K, 'texts', kid1.id))));
await t('admin cannot read others texts', no(getDoc(doc(A, 'texts', kid1.id))));
await t('nobody reads a general event yet', no(getDoc(doc(K, 'texts', general.id))));
await t('cannot list texts', no(getDocs(collection(K, 'texts'))));
await t('stranger cannot read text', no(getDoc(doc(X, 'texts', kid1.id))));
await t('author edits own text', ok(setDoc(doc(K, 'texts', kid1.id), { text: 'ניסוח חדש' })));
await t('edit too long', no(setDoc(doc(K, 'texts', kid1.id), { text: 'x'.repeat(141) })));
await t('edit extra field', no(setDoc(doc(K, 'texts', kid1.id), { text: 'a', x: 1 })));
await t('others cannot edit', no(setDoc(doc(A, 'texts', kid1.id), { text: 'hack' })));
await t('items cannot be updated', no(setDoc(doc(K, 'items', kid1.id), { about: ['אמא'], author: 'עדי', weight: 1, at: serverTimestamp() })));
await t('marks locked while writing', no(setDoc(doc(K, 'marks', 'עדי'), { marked: [], bingo: false, blackout: false })));

section('rating phase (the admins are the raters)');
await cfg(A, { admins: ['עדי'] }); // raters: founders מתן + אורי, admin עדי
const rt = (d, item, player, stars, id) => setDoc(doc(d, 'ratings', id ?? `${item}_${player}`), { item, player, stars });
await t('cannot rate while writing', no(rt(K, byMatan.id, 'עדי', 3)));
await t('non-admin cannot start rating', no(state(M, { status: 'rate' })));
await t('bad rater name', no(state(A, { status: 'rate', raters: ['hacker'] })));
await t('admin starts rating', ok(state(A, { status: 'rate', at: serverTimestamp() })));
await t('an old raters list in the game state is still accepted (ignored)', ok(state(A, { status: 'rate', raters: ['אמא'], at: serverTimestamp() })));
await t('rater reads a text not about them', ok(getDoc(doc(A, 'texts', kid1.id))));
await t('rater reads a general event', ok(getDoc(doc(A, 'texts', general.id))));
await t('admin from the admins list reads it too', ok(getDoc(doc(K, 'texts', general.id))));
await t('rater in a group cannot read it', no(getDoc(doc(A, 'texts', group.id))));
await t('rater cannot read a text about them', no(getDoc(doc(K, 'texts', byMatan.id))));
await t('non-admin cannot read (even if listed in old raters)', no(getDoc(doc(M, 'texts', kid1.id))));
await t('author still reads own', ok(getDoc(doc(M, 'texts', general.id))));
await t('rate', ok(rt(K, general.id, 'עדי', 3)));
await t('change rating', ok(rt(K, general.id, 'עדי', 0)));
await t('rate an old-format item', ok(rt(K, 'legacyItem000000000A', 'עדי', 2)));
await t('rate a group item I am in', no(rt(A, group.id, 'מתן', 3)));
await t('rate about myself', no(rt(K, byMatan.id, 'עדי', 3)));
await t('rate my own', no(rt(K, kid1.id, 'עדי', 3)));
await t('4 stars', no(rt(K, general.id, 'עדי', 4)));
await t('rate as someone else', no(rt(K, general.id, 'מתן', 3)));
await t('id mismatch', no(rt(K, general.id, 'עדי', 3, 'whatever')));
await t('non-admin cannot rate', no(rt(M, kid1.id, 'אמא', 3)));
await t('another admin (founder) rates', ok(rt(U, general.id, 'אורי', 2)));
await t('extra field', no(setDoc(doc(K, 'ratings', `${general.id}_עדי`), { item: general.id, player: 'עדי', stars: 1, x: 1 })));
await t('no adding items', no(add(K, 'עדי', ['אבא'])));
await t('no deleting items', no(del(K, kid1.id)));
await t('author edits own text', ok(setDoc(doc(M, 'texts', general.id), { text: 'ניסוח משופר' })));
await t('rater cannot edit others', no(setDoc(doc(K, 'texts', general.id), { text: 'hack' })));
await t('members read ratings', ok(getDocs(collection(M, 'ratings'))));

section('wording suggestions');
const sg = (d, item, from, fromUid, toUid, extra = {}) => addDoc(collection(d, 'suggestions'), { item, from, fromUid, toUid, text: 'הצעה', at: serverTimestamp(), ...extra });
await t('rater suggests on a general event', ok(sg(K, general.id, 'עדי', 'adiU', 'momU')));
await t('rater in the group cannot suggest', no(sg(A, group.id, 'מתן', 'matanU', 'adiU')));
await t('about myself', no(sg(K, byMatan.id, 'עדי', 'adiU', 'matanU')));
await t('on my own prediction', no(sg(K, kid1.id, 'עדי', 'adiU', 'adiU')));
await t('wrong author device', no(sg(K, general.id, 'עדי', 'adiU', 'matanU')));
await t('forged fromUid', no(sg(K, general.id, 'עדי', 'matanU', 'momU')));
await t('forged from', no(sg(K, general.id, 'מתן', 'adiU', 'momU')));
await t('non-rater', no(sg(M, kid1.id, 'אמא', 'momU', 'adiU')));
await t('too long', no(sg(K, general.id, 'עדי', 'adiU', 'momU', { text: 'x'.repeat(141) })));
await t('author lists own', ok(getDocs(query(collection(M, 'suggestions'), where('toUid', '==', 'momU')))));
await t('suggester lists own', ok(getDocs(query(collection(K, 'suggestions'), where('fromUid', '==', 'adiU')))));
await t('others cannot list', no(getDocs(query(collection(A, 'suggestions'), where('toUid', '==', 'momU')))));
await t('nobody lists all', no(getDocs(collection(M, 'suggestions'))));
const mySug = (await getDocs(query(collection(M, 'suggestions'), where('toUid', '==', 'momU')))).docs[0];
await t('author accepts (edit text + delete)', ok((() => { const b = writeBatch(M); b.set(doc(M, 'texts', general.id), { text: 'הצעה' }); b.delete(doc(M, 'suggestions', mySug.id)); return b.commit(); })()));

section('play and ended');
await t('size 6', no(state(A, { status: 'play', size: 6 })));
await t('bad status', no(state(A, { status: 'weird' })));
await t('cards only for players', no(state(A, { status: 'play', cards: { hacker: [] } })));
const gen = writeBatch(A);
gen.set(doc(A, 'game', 'state'), { status: 'play', cards: { 'עדי': [general.id] }, size: 3, raters: ['עדי', 'מתן'], at: serverTimestamp() });
P6.forEach(p => gen.set(doc(A, 'marks', p), { marked: [], bingo: false, blackout: false, bingoAt: null, blackoutAt: null }));
await t('generate cards (batch)', ok(gen.commit()));
await t('mark own card', ok(setDoc(doc(K, 'marks', 'עדי'), { marked: ['a'], bingo: true, blackout: false, bingoAt: serverTimestamp(), blackoutAt: null })));
await t('keep the same bingoAt', ok(getDoc(doc(K, 'marks', 'עדי')).then(s => setDoc(doc(K, 'marks', 'עדי'), { ...s.data(), marked: ['a', 'b'] }))));
await t('forged bingoAt', no(setDoc(doc(K, 'marks', 'עדי'), { marked: ['a'], bingo: true, blackout: false, bingoAt: Timestamp.fromDate(new Date(2000, 1, 1)), blackoutAt: null })));
await t('too many marks', no(setDoc(doc(K, 'marks', 'עדי'), { marked: Array(26).fill('x'), bingo: false, blackout: false })));
await t('mark someone else', no(setDoc(doc(M, 'marks', 'מתן'), { marked: [], bingo: true, blackout: true })));
await t('everyone reads a general event', ok(getDoc(doc(K, 'texts', general.id))));
await t('group members cannot read it', no(getDoc(doc(A, 'texts', group.id))));
await t('others read it', ok(getDoc(doc(U, 'texts', group.id))));
await t('old-format item: its person cannot read', no(getDoc(doc(U, 'texts', 'legacyItem000000000A'))));
await t('old-format item: others read', ok(getDoc(doc(K, 'texts', 'legacyItem000000000A'))));
await t('texts locked', no(setDoc(doc(M, 'texts', general.id), { text: 'late' })));
await t('suggestions locked', no(sg(K, general.id, 'עדי', 'adiU', 'momU')));
await t('ratings locked', no(rt(K, general.id, 'עדי', 2)));
await t('non-admin cannot write history', no(addDoc(collection(M, 'history'), { at: serverTimestamp(), size: 3, results: [] })));
await t('history extra field', no(addDoc(collection(A, 'history'), { at: serverTimestamp(), size: 3, results: [], x: 1 })));
await t('end game: history with title + ended', ok((() => { const b = writeBatch(A); b.set(doc(collection(A, 'history')), { at: serverTimestamp(), size: 3, title: 'טיול צפון', results: [{ p: 'עדי', place: 1, n: 3, bingo: true, blackout: false }] }); b.set(doc(A, 'game', 'state'), { status: 'ended', cards: { 'עדי': [general.id] }, size: 3, at: serverTimestamp() }); return b.commit(); })()));
await t('members read history', ok(getDocs(collection(M, 'history'))));
await t('marks locked after the game', no(setDoc(doc(M, 'marks', 'אמא'), { marked: [], bingo: false, blackout: false })));
await t('new game', ok(state(A)));

section('game settings: players, family code, new trip');
const G = db('grandU');
await t('founder adds a player', ok(cfg(A, { players: [...P6, 'סבתא'] })));
await t('new player joins and picks the name', ok(join(G, 'grandU').then(() => pick(G, 'grandU', 'סבתא'))));
await t('prediction about the new player', ok(add(K, 'עדי', ['סבתא', 'אבא'])));
await t('looks for a player only', no(setDoc(doc(K, 'looks', 'hacker'), { e: '🚀' })));
await t('own look', ok(setDoc(doc(K, 'looks', 'עדי'), { e: '🚀' })));
await t('look not in the list', no(setDoc(doc(K, 'looks', 'עדי'), { e: '💩' })));
await t("someone else's look", no(setDoc(doc(K, 'looks', 'אמא'), { e: '🚀' })));
await t('non-founder cannot read the code', no(getDoc(doc(K, 'config', 'secret'))));
await t('code too short', no(setDoc(doc(A, 'config', 'secret'), { code: 'ab' })));
await t('founder sets a new code', ok(setDoc(doc(A, 'config', 'secret'), { code: 'new-code' })));
await t('founder reads it', ok(getDoc(doc(U, 'config', 'secret'))));
await t('old fallback code no longer works', no(join(db('newU1'), 'newU1')));
await t('new code works', ok(join(db('newU2'), 'newU2', 'new-code')));
const many = []; for (let i = 0; i < 40; i++) many.push((await add(K, 'עדי', ['אבא'], { text: 't' + i })).id);
await t('new trip: admin deletes 40 predictions in one batch', ok((() => { const b = writeBatch(A); many.forEach(id => { b.delete(doc(A, 'items', id)); b.delete(doc(A, 'texts', id)); }); return b.commit(); })()));
await t('non-admin cannot delete history', no(getDocs(collection(M, 'history')).then(s => deleteDoc(doc(M, 'history', s.docs[0].id)))));
await t('admin deletes history', ok(getDocs(collection(A, 'history')).then(s => deleteDoc(doc(A, 'history', s.docs[0].id)))));
await t('admin releases a name', ok(deleteDoc(doc(A, 'players', 'סבתא'))));
await t('non-admin cannot release others', no(deleteDoc(doc(K, 'players', 'אמא'))));
await t('release my own name', ok(deleteDoc(doc(M, 'players', 'אמא'))));
await t('other collections are closed', no(setDoc(doc(A, 'junk', 'x'), { a: 1 })));

console.log(`${n} passed, ${bad} failed`);
await env.cleanup(); process.exit(bad ? 1 : 0);
