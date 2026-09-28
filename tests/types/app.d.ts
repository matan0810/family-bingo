// The shapes of the app's data (Firestore documents and the client state), for type checking the JSDoc in js/.
// Global on purpose: js/ uses them as {Item}, {Game}, … without importing anything at runtime.

/** A Firestore server timestamp as the app reads it (null/absent while still pending). */
type Stamp = { seconds: number } | null | undefined;

/** config/settings */
type Config = { title: string; players: string[]; founders: string[]; admins: string[] };

/** items/{id}: who a prediction is about ([subject, ...involved], [] = general; old items hold one name) */
type Item = { id: string; about: string[] | string; author: string; weight?: number; at?: Stamp; text?: string };

/** game/state */
type Game = { status: "entry" | "rate" | "play" | "ended"; cards: Record<string, string[]>; size?: number; at?: Stamp };

/** marks/{player} */
type Marks = { marked: string[]; bingo: boolean; blackout: boolean; bingoAt?: Stamp; blackoutAt?: Stamp };

/** ratings/{item}_{player} */
type Rating = { item: string; player: string; stars: number };

/** events/{item}_{player}: when a cell was marked */
type MarkEvent = { item: string; player: string; at: Stamp };

/** suggestions/{id} */
type Suggestion = { id: string; item: string; from: string; fromUid: string; toUid: string; text: string; at?: Stamp };

/** history/{id} */
type PastGame = { id: string; at: Stamp; size: number; title?: string; results: { p: string; place: number; n: number; bingo: boolean; blackout: boolean }[]; prophets?: { p: string; n: number }[] };

/** a scoreboard row */
type ScoreRow = { p: string; n: number; bingo: boolean; blackout: boolean; bt: number; ft: number; place?: number };
