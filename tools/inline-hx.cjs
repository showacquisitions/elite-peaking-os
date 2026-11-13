// Copies the HX normalizer block from supabase/functions/health/parse.mjs into index.html (between the HX markers).
// Run after editing parse.mjs:  node tools/inline-hx.cjs
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), cut = s => { const a = s.indexOf("/*HX-BEGIN*/"), b = s.indexOf("/*HX-END*/"); if (a < 0 || b < 0) throw new Error("HX markers missing"); return [a, b + 10] };
const src = fs.readFileSync(path.join(root, "supabase/functions/health/parse.mjs"), "utf8"), [a, b] = cut(src);
const file = path.join(root, "index.html"), html = fs.readFileSync(file, "utf8"), [c, d] = cut(html);
fs.writeFileSync(file, html.slice(0, c) + src.slice(a, b) + html.slice(d));
console.log("HX block inlined (" + (b - a) + " bytes)");
