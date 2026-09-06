import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, section, summary } from "./harness.mjs";

// DESIGN.md §0.3: 依存は rules/ → world/ → render/ の一方向。
// world/ と render/ は rules/ を import しない。render/ はゲーム内容を知らない。
section("層構造（DESIGN.md §0.3）");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
const importsOf = (file) =>
  [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);

// world/ は必ず中身がある。render/ は実装が進むにつれ増える（空でも規約違反ではない）。
check("src/world にファイルがある", walk("src/world").length > 0);

for (const dir of ["src/world", "src/render"]) {
  let files = [];
  try {
    files = walk(dir);
  } catch {
    files = [];
  }
  for (const f of files) {
    const bad = importsOf(f).filter((s) => /(^|\/)rules\//.test(s) || s.includes("../rules"));
    check(`${f} が rules/ を import していない`, bad.length === 0, bad.join(", "));
  }
}

// world/ は three.js にも依存しない（描画から独立してテストできること）
for (const f of walk("src/world")) {
  const bad = importsOf(f).filter((s) => s === "three" || s.startsWith("three/"));
  check(`${f} が three に依存していない`, bad.length === 0, bad.join(", "));
}

summary("layering");
