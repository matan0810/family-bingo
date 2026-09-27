# CLAUDE.md: family-bingo

A family road-trip bingo web app (Hebrew, RTL, mobile-first). Before the trip, players write predictions about each other ("Dad will say '5 more minutes'"). The admins rate them with stars. Each player then gets a personal bingo card built from predictions that are not about them, and marks cells as things happen on the trip.

- Live: https://matan0810.github.io/family-bingo/ (GitHub Pages, `master` branch, repo root)
- Owner: Matan (מתן), a developer. Replies to him in **Hebrew**, short and direct.
- User-facing docs: `README.md` (Hebrew). Keep it in sync with every user-visible change.

## Files

| File | What |
|---|---|
| `index.html` | The whole app: CSS, HTML shell and dialogs, one `<script type="module">`. No build step. |
| `firestore.rules` | Source of truth for the Firestore security rules. `FAMILY_CODE` is a placeholder (see Security). |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: installable app, network-first service worker, icons (the header logo is `icons/icon-192.png`). |
| `README.md` | Hebrew usage guide for the family plus the admin guide. |
| `tests/` | `fixtures.mjs` (shared test data), `source.mjs` (values read from the app), `ui/run.mjs` + `ui/mock.js` (UI suite), `rules/test.mjs` (rules suite), `package.json`, `firebase.json` (emulator). See "Verifying changes". |

## Stack and hard constraints

- Vanilla JS ES module, single file. **No frameworks, bundlers or build tooling** in the app unless Matan asks (the dev-only `tests/` package is the exception).
- Firebase v10.12.2 from the gstatic CDN: `firebase-app`, `firebase-auth` (anonymous), `firebase-firestore`. Project `family-bingo-4c8e7`; the config is inline, and the public API key is expected.
- Fonts: Google Fonts (Secular One for display, Rubik for body).
- Deployment = push to `master`. Pages caches files for about 10 minutes, and `sw.js` revalidates (`cache: "no-cache"`). Bump `CACHE` in `sw.js` when the shell file list changes.
- Work on the assigned feature branch, then fast-forward `master` (`git push origin <branch>:master`) when Matan says "merge". Matan does not want PRs unless he asks.

## The game (phases in `game/state.status`)

1. **entry**: each player adds predictions `{about, text}`: about one subject (optionally with involved people) or a general event, never about themselves. **Secrecy:** a player sees only the predictions they wrote. The rules enforce this, not just the UI. Authors can edit (✏️) and delete (🗑️) their own predictions.
2. **rate** (fixed phase): **the admins (founders included) are the raters**; there is no rater picker. Each rater gives 0–3 stars (🥱 = 0) to predictions that are neither about them nor written by them. No adding or deleting, but authors can still edit their text, and raters can send the author a wording suggestion (✏️) that the author accepts or declines. Pending suggestions are dropped when the phase ends. From `play` on, texts are locked.
3. **play**: the admin picks the board size (2×2, 3×3, 4×4 or 5×5) and generates the cards. Each card is built by `makeCards` (see "Cards" below). A row, column or diagonal is a bingo, and a full card is a blackout (the main win). Toasts and confetti show for everyone, and a live scoreboard shows places 🥇🥈🥉.
4. **ended**: only the admin ends the game (a blackout does not end it). Results are written to `history`, and everyone sees the winner, the final table and their own card, read-only. "New game" goes back to entry, and predictions and ratings are kept.

The admin can move backwards with a confirmation each time: rate → entry, entry → rate, and play → rate (which wipes the cards and marks). Ratings always survive.

**Places:** a blackout comes first (earliest `blackoutAt` wins), then more marks, then having a bingo (earliest `bingoAt`). Ties share a place.

**Card weights:** `weightOf(i) = (item.weight ?? 1) × (avgStars + 0.5)^power` (power from the tuning, 2 by default), where an unrated prediction counts as 1.5 stars. `item.weight` is the manual-priority hook; keep it.

**Cards (`makeCards(N)`):** all weighted draws without replacement (`draw`), from `poolFor(p)` (active predictions not about or involving `p`):
1. **Shared moments:** one small "hot" set is drawn from all active ones; each card first takes `k` of them (those allowed for its owner), so some events hit several cards at once. The smaller the set relative to `k`, the more crossings.
2. **Variety:** the rest is drawn with a cap per subject (`bucket`: `subjectOf(i)`, general events as one bucket) of `ceil(N / subjects in the pool) + extra`. When nothing under the cap is left, the cap is ignored rather than leaving cells empty.
3. **Shuffle:** positions are shuffled, since drawing by weight puts the strongest predictions first (they would crowd the top rows).
4. **Enough predictions (📊 `#enough`, admin panel in entry and rate):** per board size, from the smallest `poolFor` across players: ✅ at 2.5× the cells, 👌 at 1×, ❌ below.
5. **Tuning (`TUNE`, `tune`):** the admin picks, in a collapsed "🎛️ כוונון הכרטיסים" before generating, three levels (middle = default): crossings (`k = round(N·f)`, hot set `k·h`), how much stars count (the power 1/2/3), and subject variety (cap extra ∞/1/0). It lives in memory only (not in `game/state`, so no rules change). While open, `cardStats` averages a few dry runs of `makeCards` into a preview: cells two cards share, and the most cells one person gets on a card.

## People and game settings

- **No names or codes are hard-coded** in the code, the rules or UI text. Title, players, founders and admins all live in `config/settings` (`{title, players, founders, admins}`). `PLAYERS` is a live `let`; `appTitle()` falls back to "בינגו משפחתי".
- **Migration (`LEGACY`):** the only names in `index.html` are the one-time seed from the first version. If `config/settings` doesn't exist, the first client to load creates it from `LEGACY` (the rules allow any member to create it once), so the running game carries on with nothing lost. Never delete data in a migration. Normalize old shapes on read instead (see `aboutOf`).
- **Players** are managed in the app by founders (max 12, only in entry).
  - Removing a player is treated as dangerous: it is its own action in the danger zone (`removePlayer`, not part of the draft), entry only, never a founder, blocked while the draft is dirty, and confirmed by typing the name after a prompt that counts what leaves the game. It writes settings at once and frees the name.
  - Removing keeps all data; `active(i)` leaves predictions by or about removed players out of rating and cards. `formerPlayers()` (names found in items, marks or looks) shows them as "↩️" chips that add them back through the draft.
  - Names are document IDs everywhere, so renaming isn't supported (remove and add instead).
- **Founders** (`config/settings.founders`) are **fixed**: seeded from `LEGACY` and never changed afterwards (the rules reject any change to `founders`, and the settings dialog only shows them). They are always admins, can't be removed as players, and alone open "👑 הגדרות משחק" (`#cfgDlg`): title, players, extra admins and family code (`config/secret`).
- **Admins are the raters:** `raters()` = `PLAYERS.filter(isAdminName)` on the client and `isRater() = isAdmin()` in the rules. `game/state.raters` from older versions is ignored (still accepted, never written).
  - Edits go into a `draft` and are written only by "💾 שמירת שינויים" (`saveCfg`). Leaving with unsaved changes asks first (`leaveCfg`, also on Esc and backdrop).
  - Destructive tools live in a collapsed "⚠️ אזור מסוכן" `<details>`: backup download (`downloadBackup`, everything this device may read), restore from a backup file (settings, code, game state, marks, looks, and history if empty; predictions and ratings can't be restored under the rules), new-trip wipe and history wipe. Wipes need the typed word "מחיקה" and download a backup first. **Extra admins** (`config/settings.admins`) run the game. The client helpers are `isFounderName(p)` and `isAdminName(p)`.
- **Identity in the rules:** a device records the name it holds in `members/{uid}.name`, in the same batch as claiming `players/{name}` (the rules check it with `getAfter`). The rules trust `myName()` only together with `owns(myName())`. `iAm()`, `isFounder()`, `isAdmin()` and `isRater()` all build on that, so there are no per-device uid lists to sync. Devices from before the upgrade record their name on load (`recordName`).
- **Admin mode** is toggled in settings (`#adminItem`), remembered in `localStorage['bingo-admin']` (or forced on with `?admin`).
- `EMOJIS`: 30 avatars, each with a fixed color, stored in `looks/{player}`. A player without a chosen one gets `autoEmoji(p)`: the emoji at their position in the player list, skipping ones already taken. This keeps the original avatars stable.
- **`EMOJIS` also appears in `firestore.rules` (the looks list). Change both, always.**

## Firestore data model

| Path | Fields | Notes |
|---|---|---|
| `members/{uid}` | `{code, name}` | Created once per device with the family code. The rules compare it to `config/secret.code`, or to `FAMILY_CODE` in the rules when there's no secret yet. |
| `config/settings` | `{title, players, founders, admins}` | Game settings. Any member may create it once (the `LEGACY` seed); after that only founders update it, and `founders` must stay unchanged. Members read it. |
| `config/secret` | `{code}` | The family code. Only founders read or write it. |
| `players/{name}` | `{uid}` | Which device owns a name. Any member may take a name over (the app asks "זה אתם?"; trust model). "Switch player" and logout delete it, and admins can release a stuck name. |
| `items/{id}` | `{about, author, weight: 1, at}` | Prediction metadata only, readable by all members. `id` is a 20-char auto ID. `about` is a list of names: `[subject, ...involved]`, or `[]` for a general event. It never includes the author. The subject (`subjectOf(i)`, the first name) is who the prediction counts for (counts per player); everyone in the list is treated alike for secrecy, rating, suggestions and cards. Earlier multi-name items read the same way (first name = subject), so no migration. Items from the first version hold a single name string; `aboutOf(i)` on the client and `aboutOf()` in the rules normalize both. |
| `texts/{id}` | `{text}` (≤140) | Created in the same batch as the item. Readable by the author always, by raters in `rate` and by everyone in `play` and `ended`, but never by anyone it is about. The author may update it in `entry` and `rate`. The client fetches texts one at a time with `getDoc` (no list queries). |
| `suggestions/{autoId}` | `{item, from, fromUid, toUid, text, at}` | Wording suggestions from raters, created only in `rate`. Only `toUid` (the author's device) and `fromUid` can read or delete them, and the client queries by those fields. Accepting means one batch: set the text and delete the suggestion. `cleanSuggestions()` drops them outside `rate` or when the item is gone. |
| `game/state` | `{status, cards: {player: [ids]}, size, at}` | Only admins write it. `raters`/`raterUids` from older versions are still accepted but ignored. |
| `marks/{player}` | `{marked: [ids], bingo, blackout, bingoAt, blackoutAt}` | The owner writes only during `play`; admins write to reset. Timestamps are server time, and the rules reject forged ones. |
| `ratings/{item}_{player}` | `{item, player, stars 0..3}` | Only in `rate`, only admins, never on items about or by the rater. Ratings by former raters are kept and still count. |
| `history/{autoId}` | `{at, size, title, results: [{p, place, n, bingo, blackout}]}` | Written by an admin when the game ends. Admins can delete it ("🗑️ מחיקת היסטוריה"). |
| `looks/{player}` | `{e}` | The chosen emoji, which must be in `EMOJIS`. |

Old-format items that still have `text` in the item are migrated by their author's client (`migrate()`).

## Security

- Anonymous Auth plus a family code. The code lives in `config/secret` (set by founders in the app) and, as a fallback, in the published console rules. It is never in the repo. When you give Matan rules to paste, remind him to replace `FAMILY_CODE`. He knows the code; ask him if needed.
- **Trust model:** anyone who entered the code is a trusted family member. That's why any member can take over any name, including founders' names (accepted by Matan); whoever holds a founder's name has founder rights.
- **Involved people and general events:** a prediction is hidden from, never rated by, never suggested on and never put on the card of anyone in its `about` list. A general event (`[]`) can go on everyone's card.
- **Rules `get()` limits:** at most 10 document reads per request (20 for batches), and `exists()` and `get()` on the same document count separately. `owns()` therefore uses a single `get()` (a missing doc just fails), and `isFounder()`/`isAdmin()` read `settings()` without `exists()`. The texts-in-rating path is the tightest; the rules suite covers it. Admin checks also come first in `||` chains (`isAdmin() || owns(...)`) so bulk admin batches (new trip) don't do one `get()` per document. Keep it that way; the rules suite has a bulk-delete case (`BULK` in `tests/fixtures.mjs`).
- Any change to what the client writes or reads must be checked against `firestore.rules`. If the rules must change:
  1. Update `firestore.rules`.
  2. Test it on the emulator (see below).
  3. Give Matan the **full** rules text to paste into Firebase Console → Firestore → Rules → Publish.
  4. Tell him the order: code first, then rules, if the old rules would block the new code.
- XSS: every interpolated value goes through `esc()`, including document IDs in `data-*` attributes.
- Accepted limitations: bingo and blackout are computed on the client (honor system), and admins are trusted.
- `legacy` mode (Anonymous Auth disabled, so no code or name claims) is still in the code as a fallback. Auth is enabled in production.

### Future feature: stronger security (not built yet)

Matan chose the simple trust model for now. When it's time to harden it, ideas in rough order of value:
1. **Protected names:** founders' and admins' names can't be taken over; they move only through "switch player" on the old phone or a founder's approval.
2. **Device list and revoke:** founders see the connected devices (`members`) and can disconnect one. Changing the code could optionally disconnect every other device.
3. **Approval to join:** a new device waits until a founder approves it, instead of the code alone being enough.
4. **Server-side checks:** a Cloud Function that validates bingo and blackout and fills in timestamps, instead of the honor system.
5. **App Check** (reCAPTCHA) and an API key restricted to the Pages domain, to block scripted access with the public config.

## Client architecture (index.html)

- **State:** module-level `let`s (`items, game, marks, players, looks, ratings, pastGames, texts, me, uid, member, welcomed, …`). **Never shadow browser globals** (a variable named `history` once broke `history.pushState`).
- **Data:** `listen()` starts 8 counted `onSnapshot` listeners (`SOURCES`), and `ready(k)` renders once all have delivered. It also starts two suggestion queries (`toUid`/`fromUid` equal to my uid) that don't block rendering. A missing `config/settings` is seeded from `LEGACY`; an unreadable one (e.g. old rules) falls back to `LEGACY` in memory.
- **Render:**
  - `render()` works out the `stage` in this order: `load → code → welcome → load → pick → entry|rate|play|ended`.
  - It rebuilds the view HTML only when `view` (the key of me, stage, rater flag and looks) changes, keeping the textarea draft and the chosen chip.
  - Otherwise it calls `fill*()` functions that update lists in place.
  - Set `view = ""` to force a rebuild.
- **Events:** one delegated `#app.onclick` on `data-*` attributes (`data-act`, `data-cell`, `data-rate`, `data-size`, `data-free`, `data-del`, `data-edit`, `data-suggest`, `data-accept`, `data-reject`, `data-me`, `data-look`). Admin actions live in the `act` map in `bind()`. Game settings use `data-cfg` inside `#cfgBox`.
- **Dialogs:** native `<dialog>` with an inner `.dlg`. Tapping the backdrop or `[data-close]` closes it. Emoji picker (`#lookDlg`), settings (`#setDlg`: emoji, install, admin mode for admins, game settings for founders, how to play, switch player, logout), edit or suggest wording (`#editDlg`), game settings (`#cfgDlg`), how to play (`#howDlg`).
- **Welcome screen:** shown right after the family code, and again from the header logo. The back button or "יאללה" returns via `history.pushState`/`popstate`.
- **Writes:** wrap them in `safe(promise)`, which shows a toast on failure and resolves true or false. Use `writeBatch` for multi-document changes.
- **Install:** `beforeinstallprompt` on Android, instructions on iOS. The install item appears only in settings.

## Coding guidelines

- Match the existing style: compact modern JS (arrow functions, template literals, optional chaining), 2-space indent, double quotes, few comments that explain *why*. No dead code; remove what a change makes unused.
- UI text is Hebrew, playful, gender-neutral where possible, and plural-addressed ("לוחצים", "בוחרים"). Emojis are welcome, but don't overload.
- CSS:
  - Use the tokens on `:root` (`--bg --card --ink --muted --line --hot --sun --sky --shadow --me`), redefined for dark mode in both places (`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`).
  - Per-player color is `--c`.
  - RTL-safe: use logical properties (`inset-inline-*`, `margin-inline-*`).
  - Honor `prefers-reduced-motion`; the global rule already stops animations.
- Mobile first: check 360–390px width, no horizontal overflow, 44px+ tap targets.
- Keep the admin UI calm. Put rare or edge-case tools in collapsed `<details>`. Every phase change or destructive action needs `confirm()` with clear Hebrew text.
- Don't add features Matan didn't ask for. When a request is ambiguous or cut off, state the assumption briefly and proceed.

## Verifying changes (do this before every push)

Tests live in `tests/` (run from there, after `npm install`):

| Command | What |
|---|---|
| `npm run test:ui` | `ui/run.mjs`: serves `index.html` with the Firebase imports swapped for `ui/mock.js` and drives it with Playwright/Chromium: entering (code → welcome → name), entry, settings and dialogs, emoji, logo and back button, logout and switch player, admin phases, rating, generating cards 2×2 to 5×5, play, end and history, overflow at 360px, dark mode. |
| `npm run test:rules` | `rules/test.mjs`: allow/deny cases for `../firestore.rules` on the Firestore emulator (needs Java). |
| `npm test` | Both. |

- The UI runner uses `/opt/pw-browsers/chromium` (or `CHROMIUM_PATH`) when present, and falls back to a global Playwright install.
- **No hardcoded test data.** Names, roles, titles, codes, predictions, ratings and history live only in `tests/fixtures.mjs` (made-up names, not the family), which the browser mock and both suites import. Values the app owns (`LEGACY`, `EMOJIS`, `SIZES`, the default title, the fallback code and the limits in the rules) are read from the source by `tests/source.mjs`. Every expectation (counts, who sees what) is computed from these, never typed in. Don't write test counts in the docs either.
- `ui/mock.js` fixtures are chosen by URL hash params (`m=`, `size=`, `cfg=base|full|removed|none`, `claim=`, `member=0`, `deny=1`, `legacy=1`, `nohist=1`, `sugg=1`). With `cfg=none` the app seeds settings from `LEGACY`. `OLD_ITEMS` use the old single-name format, and `NEW_ITEMS` the list format (general and group). Extend the fixtures and the mock when the app reads or writes something new.
- **Add or adjust checks for every behavior you change**: UI checks in `run.mjs`, and allow and deny cases in `rules/test.mjs` for every rule you touch.

Before pushing:
1. Syntax: `python3 -c "s=open('index.html').read();a=s.index('<script type=\"module\">')+22;b=s.index('</script>',a);open('/tmp/x.mjs','w').write(s[a:b])" && node --check /tmp/x.mjs`
2. `npm test` in `tests/`: everything must pass.
3. For visual changes, take Playwright screenshots in light and dark mode at 360–390px and look at them.
4. Re-read the diff, update `README.md` if behavior changed, commit with a clear message, push the branch, and fast-forward `master` if asked.
