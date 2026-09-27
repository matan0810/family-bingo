// Values the tests read from the app itself (Node only), so they are never copied into the tests.
import { readFileSync } from "fs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
export const CONFIG = read("js/config.js"), RULES = read("firestore.rules");
// evaluates `export const NAME = <literal>;` from js/config.js
const constant = name => {
  const m = CONFIG.match(new RegExp(`export const ${name} = ([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`js/config.js has no const ${name}`);
  return Function(`return (${m[1]})`)();
};
export const LEGACY = constant("LEGACY");
export const EMOJIS = constant("EMOJIS").map(([e]) => e);
export const DEFAULT_TITLE = constant("APP_NAME");
// the code that works before a founder sets one (the placeholder in the repo's rules)
export const FALLBACK_CODE = RULES.match(/data\.code : '([^']+)'/)[1];
export const RULES_EMOJIS = [...RULES.match(/d\(\)\.e in \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
// limits the rules enforce
const limit = re => +RULES.match(re)[1];
export const MAX = {
  title: limit(/d\(\)\.title\.size\(\) <= (\d+)/), players: limit(/d\(\)\.players\.size\(\) <= (\d+)/),
  text: limit(/t\.size\(\) <= (\d+)/), marks: limit(/marked\.size\(\) <= (\d+)/), stars: limit(/stars in \[[\d, ]*?(\d+)\]/),
};
export const CODE_MIN = limit(/code\.size\(\) >= (\d+)/);
export const SIZES = constant("SIZES");
