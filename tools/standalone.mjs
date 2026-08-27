// dist/ を1枚のHTMLにまとめ直す（standalone/ 用）。
// ファイル1つで動くので、そのまま送ったりローカルで開いたりできる。
//   npm run build && node tools/standalone.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "standalone", "tower-of-green-pillars.html");

const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const assets = path.join(DIST, "assets");
const files = fs.readdirSync(assets);
const css = files.filter((f) => f.endsWith(".css"));
const js = files.filter((f) => f.endsWith(".js"));

if (!js.length) {
  console.error("dist/assets に JS がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const read = (f) => fs.readFileSync(path.join(assets, f), "utf8");
// </script> がJS中に現れると途中で閉じてしまうので割っておく
const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");

let out = html
  .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "")
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const style = css.map((f) => `<style>\n${read(f)}\n</style>`).join("\n");
const script = js.map((f) => `<script type="module">\n${safe(read(f))}\n</script>`).join("\n");

// 差し込む中身に $& などが混ざると置換パターンとして解釈されて壊れるので、
// 置換文字列ではなく関数を渡す（縮小されたJSには実際に $& が現れる）。
out = out
  .replace("</head>", () => `${style}\n</head>`)
  .replace("</body>", () => `${script}\n</body>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`${OUT} を書き出しました（${(out.length / 1024) | 0} KB）`);
