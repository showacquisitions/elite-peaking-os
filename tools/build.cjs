// Zero-dependency deterministic builder for Elite OS v5.0
// Assembles modular src/* + supabase/functions/health/parse.mjs into standalone index.html.
// Usage: node tools/build.cjs
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const parseSrc = read("supabase/functions/health/parse.mjs");
const hxStart = parseSrc.indexOf("/*HX-BEGIN*/");
const hxEnd = parseSrc.indexOf("/*HX-END*/");
if (hxStart < 0 || hxEnd < 0) throw new Error("HX markers missing in parse.mjs");
const hxBlock = parseSrc.slice(hxStart, hxEnd + "/*HX-END*/".length);

const styles = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/components.css"
].map(read).join("\n\n");

const engine = [
  read("src/data/exercises.js"),
  read("src/data/foods.js"),
  read("src/engine/core.js"),
  hxBlock
].join("\n\n");

const ui = [
  "src/ui/icons.js",
  "src/ui/dialogs.js",
  "src/ui/charts.js",
  "src/ui/sync.js",
  "src/ui/workout.js",
  "src/ui/fuel.js",
  "src/ui/app.js"
].map(read).join("\n\n");

const tpl = read("src/template.html");
const out = tpl
  .replace("/*__STYLES__*/", () => styles)
  .replace("/*__ENGINE__*/", () => engine)
  .replace("/*__UI__*/", () => ui);

const dest = path.join(root, "index.html");
fs.writeFileSync(dest, out, "utf8");
console.log(`Built index.html (${out.length.toLocaleString()} bytes, ${out.split("\n").length} lines)`);
