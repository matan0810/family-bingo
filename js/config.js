// Constants: the Firebase project, the one-time migration seed, avatars, phases and texts that never change.

export const firebaseConfig = {
  apiKey: "AIzaSyCvZu7ozy2-NFuE1ysuIU_EnFbO12LntVE",
  authDomain: "family-bingo-4c8e7.firebaseapp.com",
  projectId: "family-bingo-4c8e7",
  storageBucket: "family-bingo-4c8e7.firebasestorage.app",
  messagingSenderId: "564240750544",
  appId: "1:564240750544:web:706f367543d2903c660bd5"
};

// Title, players, founders and admins all come from config/settings (game settings).
// LEGACY is only a one-time migration from the first version, where they were fixed in the code: if config/settings
// doesn't exist yet, the app creates it from these values so the running game carries on unchanged.
export const LEGACY = { title: "", players: ["אבא", "אמא", "מתן", "אורי", "עדי", "הדר"], founders: ["מתן", "אורי"], admins: [] };
export const APP_NAME = "בינגו משפחתי";
export const MAX_PLAYERS = 12;

// avatars a player can choose (looks/{player} = {e}); each emoji has a fixed color. Keep in sync with the rules.
export const EMOJIS = [["🦁","#f59e0b"],["🦄","#ec4899"],["🐬","#3b82f6"],["🐸","#22c55e"],["🐙","#8b5cf6"],["🐢","#14b8a6"],
  ["🦊","#f97316"],["🐼","#64748b"],["🐯","#eab308"],["🐨","#78716c"],["🐷","#f472b6"],["🐵","#a16207"],
  ["🐧","#0ea5e9"],["🦉","#b45309"],["🐝","#ca8a04"],["🦋","#6366f1"],["🐞","#ef4444"],["🦖","#16a34a"],
  ["🐳","#0284c7"],["🦩","#fb7185"],["🐱","#d97706"],["🐰","#d946ef"],["🦈","#0891b2"],["🌵","#65a30d"],
  ["🍕","#dc2626"],["🍉","#e11d48"],["🚀","#7c3aed"],["👽","#84cc16"],["🤖","#06b6d4"],["👻","#a78bfa"]];
export const COLOR = Object.fromEntries(EMOJIS);
export const GENERAL = "#0ea5e9"; // color of general events (🌍)

export const SIZES = [2, 3, 4, 5];
export const MEDAL = ["🥇", "🥈", "🥉"];
export const PHASE = { entry: "🔮 שלב הניחושים", rate: "⭐ שלב הדירוג", play: "🚗 המשחק רץ!", ended: "🏁 המשחק נגמר" };
export const STAGES = { entry: "ניחושים", rate: "דירוג", play: "משחק", ended: "סיום" };

// card tuning the admin picks before generating (index into each list; the middle one is the default)
export const TUNE = {
  shared: ["🔀 הצלבות בין כרטיסים", [["מעט", { f: .2, h: 2 }], ["בינוני", { f: .4, h: 1.5 }], ["הרבה", { f: .6, h: 1.2 }]]],
  stars: ["⭐ כמה הכוכבים קובעים", [["מעט", 1], ["רגיל", 2], ["הרבה", 3]]],
  mix: ["🎨 גיוון בנושאים", [["חופשי", Infinity], ["רגיל", 1], ["קפדני", 0]]],
};
// predictions per player's card for a board size: ✅ from GOOD× the cells (varied, different cards), 👌 from 1×
export const GOOD = 2.5;

export const STEPS = [
  ["🔮", "כותבים ניחושים", "מה כל אחד יגיד או יעשה בטיול? כל אחד רואה רק את מה שהוא כתב 🤫"],
  ["⭐", "מדרגים", "המתכללים נותנים כוכבים, והניחושים הכי שווים עולים לכרטיסים"],
  ["🎲", "מקבלים כרטיס", "כרטיס בינגו אישי לכל אחד, בלי ניחושים עליו עצמו"],
  ["✅", "מסמנים בטיול", "קרה משהו מהכרטיס? לוחצים על המשבצת. שורה, עמודה או אלכסון = בינגו 🎉"],
  ["🏆", "מנצחים", "כרטיס מלא = ניצחון! המתכלל מסיים את המשחק, והתוצאות נשמרות בהיסטוריה"]
];
export const MINI = ["🚗", "☕", "📸", "😴", "🍕", "🎵", "🗺️", "🍦", "🏖️"]; // the welcome screen's little card
