// スマホ（タッチ操作）まわりの確認。
// 同じビルドを「指で触る端末」として開き、
//   - 仮想パッドが出るか
//   - HUD が重なっていないか
//   - 各画面のボタンが本当に押せるか（パッドに覆われていないか）
//   - スティック・JUMP・CROUCH・カメラ・ポーズ・音が効くか
//   - 縦でも横でも成り立つか
// を見る。ここが壊れると「スマホだけ遊べない」状態になり、
// パソコンでの確認では気づけないので機械で見張る。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { check, section, summary } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.MOBILE_TEST_PORT || 5179);

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (!dir.startsWith("chromium-")) continue;
      const exe = path.join(base, dir, "chrome-linux", "chrome");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

let chromium;
try {
  ({ chromium } = (await import("playwright-core")).default ?? (await import("playwright-core")));
} catch {
  console.log("playwright-core が見つからないためスキップします（npm install で入ります）");
  process.exit(0);
}
const exe = findChromium();
if (!exe) {
  console.log("Chromiumが見つからないためスキップします。");
  process.exit(0);
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.log("dist/ が無いのでビルドします …");
  execFileSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit" });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const rel = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});

/** 指で触る端末として1ページ開く */
async function openPhone(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  const cdp = await ctx.newCDPSession(page);

  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((t, i) => ({ x: t[0], y: t[1], id: t[2] ?? i })),
    });

  /** 要素の真ん中を指で叩く。覆われていれば blocked=true を返す。 */
  const tap = async (sel) => {
    const at = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {
        cx: Math.round(cx),
        cy: Math.round(cy),
        blocked: !(top === el || el.contains(top)),
      };
    }, sel);
    if (!at) return { missing: true, blocked: true };
    await touch("touchStart", [[at.cx, at.cy]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(550);
    return at;
  };

  const state = () => page.evaluate(() => window.__game.state);
  return { ctx, page, errors, touch, tap, state };
}

try {
  // ================= 縦向き =================
  {
    const { ctx, page, errors, touch, tap, state } = await openPhone(390, 844);
    section("1. 縦向き（390x844）");

    check("説明がタッチ用に入れ替わる", await page.isVisible(".keys-touch"));
    check("キーボードの説明は出さない", !(await page.isVisible(".keys-key")));

    // HUD の3つ（ライフ・コイン・右上）が重ならないこと
    const hud = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const ov = (a, b) =>
        !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const life = r(".hud-life");
      const coins = r(".hud-coins");
      const right = r(".hud-right");
      return { a: ov(life, coins), b: ov(coins, right), text: document.querySelector("#stage").innerText };
    });
    check("ライフとコインが重ならない", !hud.a);
    check("コインと右上の表示が重ならない", !hud.b);
    check("狭い画面では面の名前を出さない", !hud.text.includes("·"), hud.text);

    // タイトルの START。パッドに覆われていると押せない（実際に一度そうなっていた）
    let at = await tap("#btnStart");
    check("START がパッドに覆われていない", !at.blocked);
    check("START でゲームが始まる", (await state()) === "play");

    // パッドは遊んでいるあいだだけ出す（タイトルが開いているうちは隠れている）
    check("遊び始めると仮想パッドが出る", await page.isVisible(".touch-ui"));
    check("スティックが出る", await page.isVisible(".stick-zone"));
    check("JUMP ボタンが出る", await page.isVisible(".tbtn-jump"));
    check("CROUCH ボタンが出る", await page.isVisible(".tbtn-crouch"));

    // 画面が開いているあいだはパッドを引っ込める
    await page.evaluate(() => window.__game.setPaused(true));
    await page.waitForTimeout(300);
    check("画面が開くとパッドが隠れる", !(await page.isVisible(".touch-ui")));
    at = await tap("#btnResume");
    check("Resume が押せる", !at.blocked && (await state()) === "play");
    check("再開するとパッドが戻る", await page.isVisible(".touch-ui"));

    // 右上（ハートの下）の小さいボタン
    at = await tap(".tbtn-pause");
    check("ポーズボタンが押せる", !at.blocked && (await state()) === "pause");
    await tap("#btnResume");
    const soundBefore = await page.evaluate(() => window.__game.hud.sound.textContent);
    at = await tap(".tbtn-sound");
    const soundAfter = await page.evaluate(() => window.__game.hud.sound.textContent);
    check("音ボタンで入切が変わる", !at.blocked && soundBefore !== soundAfter, `${soundBefore} → ${soundAfter}`);
    await tap(".tbtn-sound"); // 元に戻す

    section("2. スティックとボタンで動かせる");
    const put = () =>
      page.evaluate(() => {
        const g = window.__game;
        g.player.pos.set(0, 0.2, 0);
        g.player.vel.set(0, 0, 0);
        g.player.jumpCombo = 0;
        g.player.comboTimer = 0;
        g.camera3.yaw = 0;
        g.camera3.reset(g.player);
      });
    const snap = () =>
      page.evaluate(() => {
        const g = window.__game;
        const p = g.player;
        return {
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          stick: g.input.stick.active,
          jump: g.input.touchJump,
          combo: p.jumpCombo,
          yaw: g.camera3.yaw,
        };
      });

    // スティックを上へ倒す＝奥へ進む
    await put();
    await page.waitForTimeout(200);
    const s0 = await snap();
    await touch("touchStart", [[88, 650]]);
    await touch("touchMove", [[88, 600]]);
    await page.waitForTimeout(500);
    const s1 = await snap();
    await touch("touchEnd", []);
    await page.waitForTimeout(150);
    const s2 = await snap();
    check("スティックで奥へ進む", s1.z - s0.z < -1.5, `Δz=${(s1.z - s0.z).toFixed(2)}`);
    check("指を離すとスティックが戻る", !s2.stick);

    // JUMP ボタン
    await put();
    await page.waitForTimeout(300);
    const j0 = await snap();
    const jb = await page.evaluate(() => {
      const b = document.querySelector(".tbtn-jump").getBoundingClientRect();
      return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
    });
    await touch("touchStart", [[jb[0], jb[1]]]);
    await page.waitForTimeout(160);
    const j1 = await snap();
    await touch("touchEnd", []);
    check("JUMP ボタンで跳べる", j1.y - j0.y > 0.3, `Δy=${(j1.y - j0.y).toFixed(2)}`);

    // 指をボタンの外へずらして離しても、押しっぱなしにならないこと
    await touch("touchStart", [[jb[0], jb[1]]]);
    await page.waitForTimeout(120);
    await touch("touchMove", [[jb[0] - 160, jb[1] - 220]]);
    await page.waitForTimeout(120);
    await touch("touchEnd", []);
    await page.waitForTimeout(250);
    check("ボタンの外で離しても押しっぱなしにならない", !(await snap()).jump);

    // 右側のドラッグでカメラが回る
    await page.waitForTimeout(200);
    const c0 = await snap();
    await touch("touchStart", [[300, 450]]);
    for (let i = 1; i <= 6; i++) {
      await touch("touchMove", [[300 + i * 15, 450]]);
      await page.waitForTimeout(30);
    }
    await touch("touchEnd", []);
    await page.waitForTimeout(150);
    const c1 = await snap();
    check("右側のドラッグでカメラが回る", Math.abs(c1.yaw - c0.yaw) > 0.05, `${c0.yaw.toFixed(2)} → ${c1.yaw.toFixed(2)}`);

    section("3. 縦向きのエラー");
    check("コンソールエラーが出ていない", errors.length === 0, errors.join(" / "));
    await ctx.close();
  }

  // ================= 横向きと小さい画面 =================
  for (const [label, w, h] of [
    ["横向き", 844, 390],
    ["小さめの縦", 360, 640],
  ]) {
    const { ctx, page, errors, tap, state } = await openPhone(w, h);
    section(`4. ${label}（${w}x${h}）で各画面のボタンが押せる`);

    // 縦が短いとタイトルの説明が長すぎて START が画面の外へ出る（実際に出ていた）
    const fits = await page.evaluate(() => {
      const panel = document.querySelector("#screenTitle .panel");
      const btn = document.querySelector("#btnStart");
      const p = panel.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return { inside: b.bottom <= p.bottom + 1, panelH: Math.round(p.height), btnBottom: Math.round(b.bottom) };
    });
    check("START がパネルの中に収まっている", fits.inside, JSON.stringify(fits));

    let at = await tap("#btnStart");
    check("START が押せる", !at.blocked && (await state()) === "play");

    await page.evaluate(() => window.__game.setPaused(true));
    await page.waitForTimeout(300);
    at = await tap("#btnResume");
    check("Resume が押せる", !at.blocked && (await state()) === "play");

    // 面クリア → 次の面
    await page.evaluate(() => {
      const g = window.__game;
      g.player.invuln = 99;
      g.player.pos.copy(g.level.goal.pos);
      g.player.pos.y += 0.1;
      g.player.vel.set(0, 0, 0);
    });
    await page.waitForTimeout(2600);
    at = await tap("#btnNext");
    const stage = await page.evaluate(() => window.__game.stageIndex + 1);
    check("Next Stage が押せる", !at.blocked && stage === 2, `stage=${stage}`);

    // ゲームオーバー → もう一度
    await page.evaluate(() => {
      const g = window.__game;
      g.player.hp = 1;
      g.player.invuln = 0;
      g.player.pos.set(0, -90, 0);
    });
    await page.waitForTimeout(900);
    at = await tap("#btnRetry");
    check("Try Again が押せる", !at.blocked && (await state()) === "play");

    check("コンソールエラーが出ていない", errors.length === 0, errors.join(" / "));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

summary("mobile.test.mjs");
