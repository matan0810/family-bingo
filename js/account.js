// This device's player name: each name is held by one device (players/{name} = {uid}) and recorded in members/{uid}.
import { auth, signOut, setDoc } from "./firebase.js";
import { S, setMe } from "./state.js";
import { ref, batch, removeQuietly, remove } from "./data.js";
import { toast } from "./ui.js";
import { render } from "./views.js";

// one batch: claim the name and record it on the device (the rules check both together)
export async function claim(p) {
  if (S.claiming) return;
  S.claiming = true;
  try {
    const b = batch();
    b.set(ref("players", p), { uid: S.uid });
    b.set(ref("members", S.uid), { name: p }, { merge: true });
    await b.commit();
    S.claims[p] = S.uid; S.memberName = p; setMe(p);
  } catch { toast("⚠️ השם תפוס"); setMe(null); }
  S.claiming = false; render();
}
// a stored name must be held by this device: claim it if free (e.g. after an update), else forget it
export function checkMyName() {
  const { me, claims, uid, claiming } = S;
  if (!me || claims[me] === uid || claiming) return;
  if (claims[me] || !S.players.includes(me)) setMe(null); else claim(me);
}
// devices from before the upgrade hold a name but haven't recorded it yet; once per load, so a failure
// (e.g. rules not updated yet) isn't retried on every render
let naming = false;
export function recordName() {
  if (naming || !S.me || S.claims[S.me] !== S.uid || S.memberName === S.me) return;
  naming = true;
  setDoc(ref("members", S.uid), { name: S.me }, { merge: true }).then(() => { S.memberName = S.me; naming = false; }, e => console.warn("record name", e));
}
// switch player: free the name and pick again
export function release() {
  const name = S.me;
  setMe(null); // first, or render() would see the name free and claim it straight back
  if (S.claims[name] === S.uid) remove("players", name);
  render();
}
// full logout: free the name, drop this device's sign-in, back to the family-code screen
export async function logout() {
  if (!confirm("להתנתק? כדי לחזור צריך להקליד שוב את הקוד המשפחתי ולבחור שם.")) return;
  const name = S.me;
  setMe(null);
  if (S.claims[name] === S.uid) await removeQuietly("players", name);
  await signOut(auth).catch(() => {});
  location.reload();
}
