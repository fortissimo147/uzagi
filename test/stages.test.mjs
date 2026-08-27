// ステージの通しの確認。ブラウザで実際に組み立ててから、
//   - 足がかり（スタート・各チェックポイント・ゴール）に本当に床があるか
//   - そこに置いた主人公が落ちずに立てるか
//   - 面をクリアすると次の面に進み、最後まで行くと総合クリアになるか
// を見る。ステージを足したときに「登れない面」を出さないための番人。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { check, section, summary } from "./harness.mjs";
import { installAutopilot, runSegments } from "./autopilot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.STAGE_TEST_PORT || 5178);

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
// 区間がジャンプでつながっているか。1面は play.test.mjs が見ているので、
// ここは足したばかりの2面・3面を見る。
// 昇降機（縦に動く床）は「乗って待つ」動きなので、その降り口から始めている。
const SEGMENTS = {
  1: [
    ["火の廊下 → 工房の門", [0, 0.2, -5], [[16, 0.2, 0], [30, 1.2, 0]], 18],
    ["鉄の坂 → 溶鉄の足場", [30, 1.2, 0], [[40, 3.5, 0], [49, 7.2, 0], [56, 7.2, 0]], 20],
    ["高所デッキ → 火柱の飛び石", [78, 15.7, 0], [[78, 16.2, -11], [78, 17.7, -18], [78, 19.2, -25], [78, 21.2, -32]], 26],
    ["型枠の階段", [78, 21.2, -38], [[70, 23.2, -42], [64, 25.2, -45], [58, 27.2, -42]], 22],
    ["昇降機の上 → てっぺん", [52, 29.2, -35], [[44, 30.2, -30]], 14],
  ],
  2: [
    ["氷の坂 → 霜の踊り場", [0, 0.2, -4], [[0, 0.5, 10], [0, 4.2, 24]], 18],
    ["氷瀑の棚 → 尖塔の足場", [0, 10.7, 42], [[11, 12.2, 42]], 14],
    ["氷河デッキ → 氷柱の階段", [25, 20.2, 25], [[25, 22.2, 14], [25, 24.2, 7], [25, 26.2, 0]], 24],
    ["昇降機の上 → てっぺん", [17, 28.2, -6], [[4, 28.2, -10]], 14],
  ],
};

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
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
  await page.evaluate(() => window.__game.startRun());
  await page.waitForTimeout(500);
  await installAutopilot(page);

  const stageCount = await page.evaluate(() => window.__game.level.stageCount);
  check("ステージが2つ以上ある", stageCount >= 2, `${stageCount} 面`);

  for (let i = 0; i < stageCount; i++) {
    // ---------- 面ごとの足がかりを調べる ----------
    const info = await page.evaluate((idx) => {
      const g = window.__game;
      g.enterStage(idx);
      const L = g.level;
      const anchors = [
        { label: "start", pos: { x: L.spawn.x, y: L.spawn.y, z: L.spawn.z } },
        ...L.checkpoints.map((c) => ({
          label: c.label,
          pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z },
        })),
        { label: "goal", pos: { x: L.goal.pos.x, y: L.goal.pos.y, z: L.goal.pos.z } },
      ];
      // 足がかりの真下にある床の高さ。少し上から探す。
      for (const a of anchors) a.ground = g.world.groundAt(a.pos.x, a.pos.z, a.pos.y + 1.2, 0.4).y;
      return {
        name: L.stage.name,
        area: L.stage.startArea,
        coins: L.totalCoins,
        enemies: L.enemies.length,
        movers: L.movers.length,
        killY: g.world.killY,
        anchors,
      };
    }, i);

    section(`${i + 1}. ${info.name}`);
    check("コインが置いてある", info.coins >= 10, `${info.coins} 枚`);
    check("敵かギミックがいる", info.enemies >= 3, `${info.enemies} 体`);

    for (const a of info.anchors) {
      // groundAt は床が無いと -Infinity を返す
      const supported = Number.isFinite(a.ground) && a.pos.y - a.ground <= 1.6;
      check(
        `「${a.label}」の足元に床がある`,
        supported,
        `足がかり y=${a.pos.y.toFixed(1)} / 床 y=${
          Number.isFinite(a.ground) ? a.ground.toFixed(1) : "なし"
        }`
      );
    }

    // ---------- そこに置いた主人公が落ちずに立てるか ----------
    for (const a of info.anchors.filter((a) => a.label !== "goal")) {
      const landed = await page.evaluate(
        async ({ pos }) => {
          const g = window.__game;
          const p = g.player;
          p.invuln = 99; // 敵に当たって飛ばされると別の理由で落ちるので無敵にする
          p.dead = false;
          p.vel.set(0, 0, 0);
          p.pos.set(pos.x, pos.y + 0.6, pos.z);
          await new Promise((r) => setTimeout(r, 700));
          return { y: p.pos.y, grounded: p.grounded, state: g.state };
        },
        { pos: a.pos }
      );
      check(
        `「${a.label}」に立てる`,
        landed.grounded && landed.y > info.killY + 5,
        `y=${landed.y.toFixed(1)} grounded=${landed.grounded}`
      );
    }

    if (SEGMENTS[i]) await runSegments(page, SEGMENTS[i]);
  }

  // ---------- 面から面へ ----------
  section(`${stageCount + 1}. 面の進み方`);
  await page.evaluate(() => window.__game.startRun());
  await page.waitForTimeout(600);

  for (let i = 0; i < stageCount; i++) {
    const before = await page.evaluate(() => window.__game.stageIndex + 1);
    check(`${i + 1}面から始まっている`, before === i + 1, `stage=${before}`);

    await page.evaluate(() => {
      const g = window.__game;
      g.player.invuln = 99;
      g.player.pos.copy(g.level.goal.pos).y += 0.1;
      g.player.vel.set(0, 0, 0);
    });
    await page.waitForTimeout(2600);

    const last = i === stageCount - 1;
    check(`${i + 1}面：土管でクリアになる`, (await page.evaluate(() => window.__game.state)) === "clear");
    if (last) {
      check("最後の面のあとは総合クリアが出る", await page.isVisible("#screenClear"));
      check("次の面の入口は出ない", !(await page.isVisible("#screenStage")));
    } else {
      check(`${i + 1}面：次の面の入口が出る`, await page.isVisible("#screenStage"));
      await page.click("#btnNext");
      await page.waitForTimeout(800);
    }
  }

  // 3面を通した時点での積み上がりを見る（この下でやり直すと0に戻るので先に取る）
  const run = await page.evaluate(() => {
    const g = window.__game;
    return { past: g.pastCoins, max: g.pastCoinsMax, score: g.score };
  });
  check(
    "通しのコイン枚数が積み上がっている",
    run.max > 0 && run.max >= run.past,
    JSON.stringify(run)
  );
  check("通しの得点が入っている", run.score > 0, `score=${run.score}`);

  // 土管の当たり判定は四角なので、真ん中でなく角のほうに乗ることがある。
  // そこでもクリアになること（中心からの距離だけで見ていると取りこぼす）。
  section(`${stageCount + 2}. 土管の端に乗ってもクリアになる`);
  for (const [dx, dz] of [
    [1.5, 1.5],
    [-1.5, 1.5],
    [1.5, -1.5],
    [-1.5, -1.5],
  ]) {
    await page.evaluate(() => window.__game.startRun());
    await page.waitForTimeout(700);
    const got = await page.evaluate(
      async ([ox, oz]) => {
        const g = window.__game;
        g.player.invuln = 99;
        g.player.pos.copy(g.level.goal.pos);
        g.player.pos.x += ox;
        g.player.pos.z += oz;
        g.player.pos.y += 0.1;
        g.player.vel.set(0, 0, 0);
        await new Promise((r) => setTimeout(r, 1200));
        return { state: g.state, y: g.player.pos.y };
      },
      [dx, dz]
    );
    check(`角 (${dx}, ${dz}) に乗ってもクリアになる`, got.state === "clear", JSON.stringify(got));
  }

  await page.evaluate(() => window.__game.startRun());
  await page.waitForTimeout(600);
  const totals = await page.evaluate(() => {
    const g = window.__game;
    return { past: g.pastCoins, max: g.pastCoinsMax, score: g.score };
  });
  check("やり直すと通しの記録が0に戻る", totals.past === 0 && totals.score === 0, JSON.stringify(totals));

  section(`${stageCount + 3}. エラー`);
  check("コンソールエラーが出ていない", errors.length === 0, errors.join(" / "));
} finally {
  await browser.close();
  server.close();
}

summary("stages.test.mjs");
