// Values the tests read from the app itself (Node only), so they are never copied into the tests.
import { readFileSync } from "fs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
export const HTML = read("index.html"), RULES = read("firestore.rules");
// evaluates `const NAME = <literal>;` from index.html
const constant = name => {
  const m = HTML.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`index.html has no const ${name}`);
  return Function(`return (${m[1]})`)();
};
export const LEGACY = constant("LEGACY");
export const EMOJIS = constant("EMOJIS").map(([e]) => e);
export const DEFAULT_TITLE = HTML.match(/<title>(.*?)<\/title>/)[1];
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
export const SIZES = Function(`return ${HTML.match(/const SIZES = (\[[^\]]*\]);/)[1]}`)();
