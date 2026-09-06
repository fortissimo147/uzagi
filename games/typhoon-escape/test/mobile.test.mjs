// 縦画面・小画面でのUI検査。DESIGN.md §9 mobile。
import { chromium, devices } from "playwright-core";
import { spawn } from "node:child_process";
import { check, section, summary } from "./harness.mjs";

const PORT = 4100 + Math.floor(Math.random() * 800);
const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("preview が起動しない")), 30000);
    p.stdout.on("data", (d) => String(d).includes("Local") && (clearTimeout(t), res()));
  });
} catch (e) {
  console.log(`飛ばします: ${e.message}`);
  p.kill();
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
} catch (e) {
  console.log(`ブラウザを起動できないので飛ばします: ${e.message}`);
  p.kill();
  process.exit(0);
}

const sizes = [
  ["小さい縦画面 320x568", 320, 568],
  ["よくある縦画面 390x844", 390, 844],
  ["横向き 844x390", 844, 390],
];

for (const [label, w, h] of sizes) {
  section(label);
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__game, null, { timeout: 90000 });

  const box = (sel) => page.locator(sel).boundingBox();
  const inView = (b) => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 1 && b.y + b.height <= h + 1;

  check("開始ボタンが画面内に収まる", inView(await box("#pbtn")), JSON.stringify(await box("#pbtn")));
  check("メニューボタンが画面内に収まる", inView(await box("#menubtn")), JSON.stringify(await box("#menubtn")));
  const pbtn = await box("#pbtn");
  check("開始ボタンが 44px 以上（指で押せる大きさ）", pbtn.height >= 40 && pbtn.width >= 88, JSON.stringify(pbtn));

  await page.locator("#pbtn").click();
  await page.waitForTimeout(300);
  check("スティックが画面内に収まる", inView(await box("#pad")), JSON.stringify(await box("#pad")));
  check("canvas が画面いっぱいに広がる", await page.evaluate((s) => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    return Math.abs(c.width - s.w) < 2 && Math.abs(c.height - s.h) < 2;
  }, { w, h }));

  // ティッカーが積み上がってもスティックが隠れない（元と同じ --rows の持ち上げ）
  const padBefore = (await box("#pad")).y;
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) window.__game.hud.news(`Typhoon No. ${i} (Wobbles) has formed.`, "formed");
  });
  await page.waitForTimeout(250);
  const padAfter = (await box("#pad")).y;
  check("ニュース速報が増えるとスティックが持ち上がる", padAfter < padBefore - 20, `${padBefore} → ${padAfter}`);
  const ticker = await box("#ticker");
  check("スティックとティッカーが重ならない", (await box("#pad")).y + (await box("#pad")).height <= ticker.y + 2,
    `pad底=${(await box("#pad")).y + (await box("#pad")).height} ticker上=${ticker.y}`);

  // タッチで動かせる
  const before = await page.evaluate(() => [...window.__game.game.pos]);
  await page.touchscreen.tap(Math.round(w / 2), Math.round(h / 2));
  await page.evaluate(() => {
    window.__game.input.cx = 100;
    window.__game.input.cy = 100;
    window.__game.input.setKnob(180, 100);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__game.input.release());
  const after = await page.evaluate(() => [...window.__game.game.pos]);
  const moved = Math.acos(Math.min(1, before[0] * after[0] + before[1] * after[1] + before[2] * after[2])) * (180 / Math.PI);
  check(`仮想スティックで動く（${moved.toFixed(2)} 度）`, moved > 0.05);

  await page.close();
}

await browser.close();
p.kill();
summary("mobile");
