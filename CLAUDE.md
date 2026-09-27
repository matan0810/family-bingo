# CLAUDE.md: family-bingo

A family road-trip bingo web app (Hebrew, RTL, mobile-first). Before the trip, players write predictions about each other ("Dad will say '5 more minutes'"). Chosen raters give them stars. Each player then gets a personal bingo card built from predictions that are not about them, and marks cells as things happen on the trip.

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
| `tests/` | `ui/run.mjs` + `ui/mock.js` (UI suite), `rules/test.mjs` (rules suite), `package.json`, `firebase.json` (emulator). See "Verifying changes". |

## Stack and hard constraints

- Vanilla JS ES module, single file. **No frameworks, bundlers or build tooling** in the app unless Matan asks (the dev-only `tests/` package is the exception).
- Firebase v10.12.2 from the gstatic CDN: `firebase-app`, `firebase-auth` (anonymous), `firebase-firestore`. Project `family-bingo-4c8e7`; the config is inline, and the public API key is expected.
- Fonts: Google Fonts (Secular One for display, Rubik for body).
- Deployment = push to `master`. Pages caches files for about 10 minutes, and `sw.js` revalidates (`cache: "no-cache"`). Bump `CACHE` in `sw.js` when the shell file list changes.
- Work on the assigned feature branch, then fast-forward `master` (`git push origin <branch>:master`) when Matan says "merge". Matan does not want PRs unless he asks.

## The game (phases in `game/state.status`)

1. **entry**: each player adds predictions `{about, text}` about others, never about themselves. **Secrecy:** a player sees only the predictions they wrote. The rules enforce this, not just the UI.
2. **rate** (fixed phase): the admin picks raters. Each rater gives 0–3 stars (🥱 = 0) to predictions that are neither about them nor written by them. Predictions are locked (no add or delete).
3. **play**: the admin picks the board size (2×2, 3×3, 4×4 or 5×5) and generates the cards. Each card samples predictions not about its owner, weighted, without replacement. A row, column or diagonal is a bingo, and a full card is a blackout (the main win). Toasts and confetti show for everyone, and a live scoreboard shows places 🥇🥈🥉.
4. **ended**: only the admin ends the game (a blackout does not end it). Results are written to `history`, and everyone sees the winner, the final table and their own card, read-only. "New game" goes back to entry, and predictions and ratings are kept.

The admin can move backwards with a confirmation each time: rate → entry, entry → rate, and play → rate (which wipes the cards and marks). Ratings always survive.

**Places:** a blackout comes first (earliest `blackoutAt` wins), then more marks, then having a bingo (earliest `bingoAt`). Ties share a place.

**Card weights:** `weightOf(i) = (item.weight ?? 1) × (avgStars + 0.5)²`, where an unrated prediction counts as 1.5 stars. `item.weight` is the manual-priority hook; keep it.

## People

- `PLAYERS = ["אבא","אמא","מתן","אורי","עדי","הדר"]`
- `ADMINS = ["מתן","אורי"]`. Admin mode is toggled in settings (`#adminItem`), remembered in `localStorage['bingo-admin']` (or forced on with `?admin`), and shown only for these names.
- `EMOJIS`: 30 avatars, each with a fixed color, stored in `looks/{player}`. `DEFAULT` maps each player to a starting avatar.
- **These three lists also appear in `firestore.rules`. Change both, always.**

## Firestore data model

| Path | Fields | Notes |
|---|---|---|
| `members/{uid}` | `{code}` | Created once per device with the family code. The rules compare it to the code. |
| `players/{name}` | `{uid}` | Which device owns a name. "Switch player" and logout delete it, and admins can release a stuck name. |
| `items/{id}` | `{about, author, weight: 1, at}` | Prediction metadata only, readable by all members. `id` is a 20-char auto ID. |
| `texts/{id}` | `{text}` (≤140) | Created in the same batch as the item. Readable by the author always, by raters in `rate` (via `raterUids`) and by everyone in `play` and `ended`, but never by the person it is about. The client fetches texts one at a time with `getDoc` (no list queries). |
| `game/state` | `{status, cards: {player: [ids]}, size, raters: [names], raterUids: [uids], at}` | Only admins write it. Admin devices auto-sync `raterUids` (`syncRaterUids`) when a rater joins later. |
| `marks/{player}` | `{marked: [ids], bingo, blackout, bingoAt, blackoutAt}` | The owner writes only during `play`; admins write to reset. Timestamps are server time, and the rules reject forged ones. |
| `ratings/{item}_{player}` | `{item, player, stars 0..3}` | Only in `rate`, only chosen raters, never on items about or by the rater. |
| `history/{autoId}` | `{at, size, results: [{p, place, n, bingo, blackout}]}` | Written by an admin when the game ends. |
| `looks/{player}` | `{e}` | The chosen emoji, which must be in `EMOJIS`. |

Old-format items that still have `text` in the item are migrated by their author's client (`migrate()`).

## Security

- Anonymous Auth plus a family code. The code lives **only** in the published console rules, never in the repo. When you give Matan rules to paste, remind him to replace `FAMILY_CODE`. He knows the code; ask him if needed.
- Any change to what the client writes or reads must be checked against `firestore.rules`. If the rules must change:
  1. Update `firestore.rules`.
  2. Test it on the emulator (see below).
  3. Give Matan the **full** rules text to paste into Firebase Console → Firestore → Rules → Publish.
  4. Tell him the order: code first, then rules, if the old rules would block the new code.
- XSS: every interpolated value goes through `esc()`, including document IDs in `data-*` attributes.
- Accepted limitations: bingo and blackout are computed on the client (honor system), and admins are trusted.
- `legacy` mode (Anonymous Auth disabled, so no code or name claims) is still in the code as a fallback. Auth is enabled in production.

## Client architecture (index.html)

- **State:** module-level `let`s (`items, game, marks, players, looks, ratings, pastGames, texts, me, uid, member, welcomed, …`). **Never shadow browser globals** (a variable named `history` once broke `history.pushState`).
- **Data:** `listen()` starts 7 `onSnapshot` listeners. `ready(k)` renders once all `SOURCES` have delivered.
- **Render:**
  - `render()` works out the `stage` in this order: `load → code → welcome → load → pick → entry|rate|play|ended`.
  - It rebuilds the view HTML only when `view` (the key of me, stage, rater flag and looks) changes, keeping the textarea draft and the chosen chip.
  - Otherwise it calls `fill*()` functions that update lists in place.
  - Set `view = ""` to force a rebuild.
- **Events:** one delegated `#app.onclick` on `data-*` attributes (`data-act`, `data-cell`, `data-rate`, `data-rater`, `data-size`, `data-free`, `data-del`, `data-me`, `data-look`). Admin actions live in the `act` map in `bind()`.
- **Dialogs:** native `<dialog>` with an inner `.dlg`. Tapping the backdrop or `[data-close]` closes it. Emoji picker (`#lookDlg`), settings (`#setDlg`: emoji, install, admin mode for admins, how to play, switch player, logout), how to play (`#howDlg`).
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
| `npm run test:ui` | `ui/run.mjs`: 89 checks. It serves `index.html` with the Firebase imports swapped for `ui/mock.js` and drives it with Playwright/Chromium: entering (code → welcome → name), entry, settings and dialogs, emoji, logo and back button, logout and switch player, admin phases, rating, generating cards 2×2 to 5×5, play, end and history, overflow at 360px, dark mode. |
| `npm run test:rules` | `rules/test.mjs`: 98 allow/deny cases for `../firestore.rules` on the Firestore emulator (needs Java). |
| `npm test` | Both. |

- The UI runner uses `/opt/pw-browsers/chromium` (or `CHROMIUM_PATH`) when present, and falls back to a global Playwright install.
- `ui/mock.js` fixtures are chosen by URL hash params (`m=`, `size=`, `member=0`, `deny=1`, `legacy=1`, `nohist=1`). Extend it when the app reads or writes something new.
- **Add or adjust checks for every behavior you change**: UI checks in `run.mjs`, and allow and deny cases in `rules/test.mjs` for every rule you touch.

Before pushing:
1. Syntax: `python3 -c "s=open('index.html').read();a=s.index('<script type=\"module\">')+22;b=s.index('</script>',a);open('/tmp/x.mjs','w').write(s[a:b])" && node --check /tmp/x.mjs`
2. `npm test` in `tests/`: everything must pass.
3. For visual changes, take Playwright screenshots in light and dark mode at 360–390px and look at them.
4. Re-read the diff, update `README.md` if behavior changed, commit with a clear message, push the branch, and fast-forward `master` if asked.
