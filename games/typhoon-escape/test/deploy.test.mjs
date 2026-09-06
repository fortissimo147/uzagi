// 配信形態の検査。DESIGN.md §8（base: "./"）と Cloudflare Pages 前提。
// サブディレクトリに置いても動くこと、シェア文の URL が置いた場所になることを見る。
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { check, section, summary } from "./harness.mjs";

const DIST = "dist";
section("ビルド成果物");
check("dist/index.html がある", existsSync(join(DIST, "index.html")));
check("dist/_headers が入っている（public/ から複写される）", existsSync(join(DIST, "_headers")));
if (existsSync(join(DIST, "_headers"))) {
  const h = readFileSync(join(DIST, "_headers"), "utf8");
  check("assets/* が長期キャッシュ", /\/assets\/\*[\s\S]*immutable/.test(h));
  check("index.html は毎回取りに行かせる", /index\.html[\s\S]*must-revalidate/.test(h));
}
{
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const abs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  check("絶対パス参照がない（どのサブディレクトリに置いても動く）", abs.length === 0, abs.join(", "));
  check("アセット参照が相対（./assets/）", /(?:src|href)="\.\/assets\//.test(html));
}
{
  // Cloudflare Pages の 1 ファイル 25 MiB 制限を超えないこと
  const sizes = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else sizes.push([p, st.size]);
    }
  };
  walk(DIST);
  const big = sizes.filter(([, n]) => n > 25 * 1024 * 1024);
  const total = sizes.reduce((a, [, n]) => a + n, 0);
  check(`1 ファイル 25 MiB 制限に収まる（最大 ${(Math.max(...sizes.map((s) => s[1])) / 1024 / 1024).toFixed(2)} MiB）`, big.length === 0, big.map((b) => b[0]).join(", "));
  check(`ファイル数が 20,000 未満（${sizes.length} 個・計 ${(total / 1024 / 1024).toFixed(2)} MiB）`, sizes.length < 20000);
}

// --- サブディレクトリ配信で実際に動くか ---
const MOUNT = "/games/typhoon-escape/";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith(MOUNT)) {
    res.writeHead(404).end("not found");
    return;
  }
  let rel = p.slice(MOUNT.length) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = join(DIST, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
const PORT = 4900 + Math.floor(Math.random() * 90);
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
} catch (e) {
  console.log(`ブラウザを起動できないので飛ばします: ${e.message}`);
  server.close();
  summary("deploy");
  process.exit(0);
}

section(`サブディレクトリ配信（${MOUNT}）`);
const page = await browser.newPage({ viewport: { width: 400, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const base = `http://127.0.0.1:${PORT}${MOUNT}`;
await page.goto(base, { waitUntil: "load" });
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
check("サブディレクトリでも起動する", await page.evaluate(() => !!window.__game.globe));
check("読み込みエラーが出ていない", errors.length === 0, errors.slice(0, 2).join(" / "));

{
  const d = await page.evaluate(() => ({ url: window.__game.shareUrl(), text: window.__game.shareText() }));
  check("シェアURLが置いた場所になる（決め打ちしていない）", d.url === base, `${d.url} vs ${base}`);
  check("シェアURLに元ゲームのドメインが残っていない", !/lovewcycle/.test(d.text), d.text);
  check("シェア文が英語", d.text.startsWith("[Game] Move Taiwan and outrun the typhoons!"), d.text.slice(0, 60));
  check("シェア文にハッシュタグが入る", d.text.includes("#TyphoonEscape"));
}
// クエリやハッシュが付いていても URL が汚れないこと
await page.goto(`${base}?utm=x#frag`, { waitUntil: "load" });
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
check("クエリとハッシュはシェアURLに含めない", (await page.evaluate(() => window.__game.shareUrl())) === base);

await browser.close();
server.close();
summary("deploy");
