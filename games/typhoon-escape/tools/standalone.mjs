#!/usr/bin/env node
// dist/ を 1 枚の HTML にまとめる。既存リポジトリの standalone.mjs と同じ思想。
//   npm run standalone  →  dist/typhoon-escape.html
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ASSETS = join(DIST, "assets");

let html = readFileSync(join(DIST, "index.html"), "utf8");
const files = readdirSync(ASSETS);
const js = files.find((f) => f.endsWith(".js"));
const css = files.find((f) => f.endsWith(".css"));
if (!js) throw new Error("dist/assets に JS が見つからない。先に npm run build を実行すること。");

const jsCode = readFileSync(join(ASSETS, js), "utf8");
const cssCode = css ? readFileSync(join(ASSETS, css), "utf8") : "";

html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");
html = html.replace("</head>", `<style>${cssCode}</style></head>`);
// </script> がコード中に現れると HTML パーサが早期終了するので割っておく
html = html.replace("</body>", `<script type="module">${jsCode.replace(/<\/script>/g, "<\\/script>")}</script></body>`);

const out = join(DIST, "typhoon-escape.html");
writeFileSync(out, html);
console.log(`${out}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB`);
