// 実際にブラウザでゲームを動かす結合テスト。
// ビルド済みの dist/ をローカルサーバで配信し、ヘッドレスChromiumで操作して確認する。
//   - 起動〜スタート、走行・ジャンプ、各区画の足場、コイン／回復、敵、火柱
//   - チェックポイント復帰、落下、ゴール、ポーズ、リトライ、後始末（リーク）
// Chromiumが見つからない環境では理由を表示してスキップする（終了コード0）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { check, near, section, summary } from "./harness.mjs";
import { VOICEBANK } from "../src/voicebank.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PLAY_TEST_PORT || 5177);

// ---------- Chromiumを探す ----------
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
  console.log(
    "Chromiumが見つからないためスキップします。" +
      "`npx playwright install chromium` を実行するか、PLAYWRIGHT_CHROMIUM_PATH を設定してください。"
  );
  process.exit(0);
}

// ---------- dist が無ければビルド ----------
if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.log("dist/ が無いのでビルドします …");
  execFileSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit" });
}

// ---------- 静的サーバ ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
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
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader", // GPUの無いCIでもWebGLを動かす
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
  ],
});
const page = await browser.newPage({ viewport: { width: 540, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) errors.push(`console: ${m.text()}`);
});

const probe = () =>
  page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    return {
      state: g.state,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      grounded: p.grounded,
      hp: p.hp,
      coins: g.coins,
      total: g.level.totalCoins,
      enemies: g.level.enemies.length,
      fps: g.fps,
    };
  });

const put = (x, y, z, opts = {}) =>
  page.evaluate(
    ([x, y, z, invuln]) => {
      const g = window.__game;
      g.state = "play";
      g.hud.hideAll();
      g.player.pos.set(x, y, z);
      g.player.vel.set(0, 0, 0);
      g.player.dead = false;
      g.player.invuln = invuln;
      g.camera3.reset(g.player);
    },
    [x, y, z, opts.invuln ?? 0]
  );

// キーを押したまま「ゲーム内で」指定秒ぶん待つ。
// 実時間で待つと、描画が重い環境（SwiftShaderなど）ではフレームレートが
// dt の上限 0.05 秒に張りつき、実時間とゲーム内時間がずれて結果が安定しない。
async function holdKeys(keys, ms, taps = []) {
  const seconds = ms / 1000;
  for (const k of keys) await page.keyboard.down(k);
  const t0 = await page.evaluate(() => window.__game.time);
  for (let guard = 0; guard < 200; guard++) {
    for (const k of taps) {
      await page.keyboard.down(k);
      await page.waitForTimeout(40);
      await page.keyboard.up(k);
    }
    await page.waitForTimeout(100);
    const done = await page.evaluate(
      ([t0, sec]) => window.__game.time - t0 >= sec,
      [t0, seconds]
    );
    if (done) break;
  }
  for (const k of keys) await page.keyboard.up(k);
}

try {
  // ================= 起動 =================
  section("1. 起動とタイトル");
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  check("タイトル画面が出る", await page.isVisible("#screenTitle"));
  check("WebGLが初期化されている", await page.evaluate(() => !!window.__game?.renderer));
  await page.click("#btnStart");
  await page.waitForTimeout(500);
  let s = await probe();
  check("スタートでプレイ状態になる", s.state === "play");
  check("初期ライフは3", s.hp === 3);
  check("コインが配置されている", s.total > 15, `total=${s.total}`);
  check("敵とギミックが配置されている", s.enemies >= 5, `enemies=${s.enemies}`);

  // ================= 走る・登る =================
  section("2. 走って坂を登る");
  const before = await probe();
  await holdKeys(["w"], 2600);
  const after = await probe();
  check(
    "前進キーで奥（+Z）へ進む",
    after.z > before.z + 8,
    `z ${before.z.toFixed(1)} → ${after.z.toFixed(1)}`
  );
  check("坂を登って高くなっている", after.y > 1.5, `y=${after.y.toFixed(2)}`);
  check("走行中にコインを取れる", after.coins > 0, `coins=${after.coins}`);
  check("描画が回っている", after.fps > 10, `fps=${after.fps}`);

  // ================= 各区画の足場 =================
  section("3. 各区画に足場がある");
  const spots = [
    ["石の広場", 0, 7, 26],
    ["木の坂", 14, 10, 27],
    ["木の足場", 34, 14, 27],
    ["クリスタルの間", 34, 18, -6],
    ["鉄の足場", 9, 24, -9],
    ["鉄の回廊", -9, 25, -11],
    ["チェッカーの階段", -4, 28, -25],
    ["てっぺん", 16, 36, -4],
  ];
  for (const [name, x, y, z] of spots) {
    await put(x, y, z, { invuln: 9 });
    await page.waitForTimeout(1000);
    const st = await probe();
    check(`${name} に着地できる`, st.grounded, `y=${st.y.toFixed(2)}`);
  }

  // ================= アイテム =================
  section("4. コインと回復");
  const coinRes = await page.evaluate(async () => {
    const g = window.__game;
    const c = g.level.coins.find((c) => !c.taken);
    const n0 = g.coins;
    g.player.pos.set(c.pos.x, c.pos.y - 0.8, c.pos.z);
    g.player.vel.set(0, 0, 0);
    g.player.invuln = 9;
    await new Promise((r) => setTimeout(r, 400));
    return { n0, n1: g.coins, taken: c.taken };
  });
  check("コインを取ると増える", coinRes.n1 === coinRes.n0 + 1 && coinRes.taken, JSON.stringify(coinRes));

  const heartRes = await page.evaluate(async () => {
    const g = window.__game;
    const h = g.level.hearts.find((h) => !h.taken);
    g.player.hp = 1;
    g.player.pos.set(h.pos.x, h.pos.y - 1.1, h.pos.z);
    g.player.vel.set(0, 0, 0);
    g.player.invuln = 9;
    await new Promise((r) => setTimeout(r, 400));
    return { hp: g.player.hp, taken: h.taken };
  });
  check("ハートでライフが回復する", heartRes.hp === 2 && heartRes.taken, JSON.stringify(heartRes));

  // ================= 敵とギミック =================
  section("5. 敵・火柱・動く床");
  const stomp = await page.evaluate(async () => {
    const g = window.__game;
    const w = g.level.enemies.find((e) => e.a && e.b && e.kill); // 歩行敵
    const n0 = g.level.enemies.length;
    const s0 = g.score;
    g.player.hp = 3;
    g.player.invuln = 0;
    g.player.pos.set(w.pos.x, w.pos.y + 3.2, w.pos.z);
    g.player.vel.set(0, -2, 0);
    // 踏んだ瞬間に跳ね返っているかを見る（着地まで待つと速度が0に戻ってしまう）
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (w.dead) {
        bounced = g.player.vel.y > 3;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    return { n0, n1: g.level.enemies.length, gain: g.score - s0, dead: w.dead, bounced };
  });
  // ライフは見ない。近くにもう1体いると踏んだ直後に横から触れることがあり、
  // それは仕様どおりの挙動なので、踏みつけの判定とは切り離す。
  check("上から踏むと敵を倒せる", stomp.dead && stomp.n1 < stomp.n0, JSON.stringify(stomp));
  check("踏んだ反動で跳ね上がる", stomp.bounced, JSON.stringify(stomp));
  check("撃破でスコアが入る", stomp.gain >= 200, `+${stomp.gain}`);

  const hurt = await page.evaluate(async () => {
    const g = window.__game;
    const w = g.level.enemies.find((e) => e.a && e.b && e.kill);
    g.player.hp = 3;
    g.player.invuln = 0;
    g.player.pos.set(w.pos.x + 0.4, w.pos.y, w.pos.z);
    g.player.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 700));
    return { hp: g.player.hp };
  });
  check("横から触れるとダメージを受ける", hurt.hp === 2, JSON.stringify(hurt));

  const fire = await page.evaluate(async () => {
    const g = window.__game;
    const f = g.level.enemies.find((e) => e.flames); // 火柱
    g.player.hp = 3;
    for (let i = 0; i < 45; i++) {
      g.player.pos.set(f.pos.x, f.pos.y + 0.5, f.pos.z);
      g.player.vel.set(0, 0, 0);
      g.player.invuln = 0;
      await new Promise((r) => setTimeout(r, 100));
      if (g.player.hp < 3) break;
    }
    return { hp: g.player.hp };
  });
  check("火柱に当たるとダメージを受ける", fire.hp < 3, JSON.stringify(fire));

  const carry = await page.evaluate(async () => {
    const g = window.__game;
    const c = g.world.colliders.find((c) => c.delta.lengthSq() > 0); // 動いている床
    g.player.hp = 3;
    g.player.invuln = 9;
    g.player.pos.set((c.min.x + c.max.x) / 2, c.max.y + 0.05, (c.min.z + c.max.z) / 2);
    g.player.vel.set(0, 0, 0);
    g.camera3.reset(g.player);
    const p0 = g.player.pos.clone();
    await new Promise((r) => setTimeout(r, 1500));
    return {
      moved: Math.hypot(g.player.pos.z - p0.z, g.player.pos.y - p0.y),
      grounded: g.player.grounded,
    };
  });
  check("動く床が乗ったまま運んでくれる", carry.moved > 1 && carry.grounded, JSON.stringify(carry));

  // ================= ジャンプ =================
  section("6. ジャンプの段階");
  const jumps = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    p.hp = 3;
    p.dead = false;
    p.invuln = 99;
    g.input.touchJump = true; // ボタン長押し＝最大の高さで跳ぶ
    const res = [];
    for (let n = 1; n <= 3; n++) {
      p.pos.set(0, 0.2, 0);
      p.vel.set(0, 0, 0);
      p.jumpCombo = n - 1;
      p.comboTimer = n > 1 ? 0.3 : 0;
      p.coyote = 0.1;
      p.grounded = true;
      p.jumpBuffer = 0.14;
      let peak = 0;
      for (let i = 0; i < 70; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        peak = Math.max(peak, p.pos.y);
        if (i > 6 && p.grounded) break;
      }
      res.push(+peak.toFixed(2));
    }
    g.input.touchJump = false;
    return res;
  });
  check(
    "2段・3段ジャンプほど高く跳ぶ",
    jumps[0] < jumps[1] && jumps[1] < jumps[2],
    JSON.stringify(jumps)
  );
  // ステージの段差は最大2.0。押しっぱなしの1段ジャンプに余裕があることを確かめる。
  check("1段ジャンプで2ユニットの段差に余裕がある", jumps[0] > 2.4, `最高到達点=${jumps[0]}`);

  // ================= チェックポイントと落下 =================
  section("7. チェックポイントと落下");
  const fall = await page.evaluate(async () => {
    const g = window.__game;
    const cp = g.level.checkpoints[0];
    g.player.hp = 3;
    g.player.dead = false;
    g.player.invuln = 9;
    g.player.pos.set(cp.pos.x, cp.pos.y + 0.3, cp.pos.z);
    g.player.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 500));
    const activated = cp.active;
    g.player.pos.set(cp.pos.x, -80, cp.pos.z);
    await new Promise((r) => setTimeout(r, 900));
    return {
      activated,
      hp: g.player.hp,
      dist: Math.hypot(g.player.pos.x - cp.pos.x, g.player.pos.y - cp.pos.y, g.player.pos.z - cp.pos.z),
    };
  });
  check("チェックポイントが作動する", fall.activated);
  check("落下でライフが1減る", fall.hp === 2, `hp=${fall.hp}`);
  check("チェックポイントから再開する", fall.dist < 2, `距離=${fall.dist.toFixed(2)}`);

  // 落下中の悲鳴。速く落ちている間だけ鳴り、復帰したら止まること。
  const scream = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    p.hp = 3;
    p.dead = false;
    p.invuln = 9;
    p.stopScream();
    const cp = g.level.checkpoints[0];
    // ふつうに跳んだだけでは鳴らない（3段ジャンプの落ち際でも -19.5 まで）
    p.pos.set(cp.pos.x, cp.pos.y + 0.3, cp.pos.z);
    p.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 200));
    p.vel.y = -19;
    p.grounded = false;
    await new Promise((r) => setTimeout(r, 60));
    const onJump = !!p.scream;
    // 奈落へ落とすと鳴る
    p.pos.set(cp.pos.x, cp.pos.y + 40, cp.pos.z);
    p.vel.set(0, -40, 0);
    p.grounded = false;
    await new Promise((r) => setTimeout(r, 80));
    const onPlunge = !!p.scream;
    // 落ちきって復帰したら止まる
    p.pos.set(cp.pos.x, -80, cp.pos.z);
    await new Promise((r) => setTimeout(r, 700));
    return { onJump, onPlunge, afterRespawn: !!p.scream, hp: p.hp };
  });
  check("ふつうのジャンプでは悲鳴が出ない", !scream.onJump);
  check("奈落へ落ちると悲鳴が出る", scream.onPlunge);
  check("復帰したら悲鳴が止まる", !scream.afterRespawn);

  // ================= 区間の到達性（オートパイロット） =================
  section("8. 各区間をジャンプで越えられる");
  await page.evaluate(() => {
    // 目標へ走り、崖の縁または段差の手前でジャンプする簡易AI
    window.__auto = async (tx, ty, tz, seconds) => {
      const g = window.__game;
      const p = g.player;
      const i = g.input;
      i.stick.active = true;
      i.touchJump = true;
      // 実時間ではなくゲーム内時間（g.time）で数える。描画が重い環境でも
      // 「ゲーム内で何秒ぶん動かしたか」が変わらないようにするため。
      // ただし落下などで g.time が止まったまま抜けられなくなるので、
      // 実時間の上限も併せて持たせておく。
      const t0 = g.time;
      const wall0 = performance.now();
      let best = Infinity;
      let lastJump = -1;
      while (g.time - t0 < seconds && performance.now() - wall0 < seconds * 4000) {
        const now = g.time;
        const dx = tx - p.pos.x;
        const dz = tz - p.pos.z;
        const d = Math.hypot(dx, dz);
        best = Math.min(best, Math.hypot(dx, ty - p.pos.y, dz));
        g.camera3.yaw = Math.atan2(-dx, -dz);
        i.stick.x = 0;
        i.stick.y = d < 1.6 ? 0 : -1;
        const needUp = ty > p.pos.y + 0.5;
        const fx = dx / (d || 1);
        const fz = dz / (d || 1);
        const ahead = g.world.groundAt(p.pos.x + fx * 1.5, p.pos.z + fz * 1.5, p.pos.y + 0.5, 0.2);
        const gap = !isFinite(ahead.y) || ahead.y < p.pos.y - 1;
        if (p.grounded && now - lastJump > 0.5 && (gap || (needUp && d < 3) || (!needUp && d > 1.6 && d < 2.4))) {
          i.touchJumpEdge = true;
          lastJump = now;
        }
        await new Promise((r) => requestAnimationFrame(r));
        if (d < 1.6 && Math.abs(p.pos.y - ty) < 1.2 && p.grounded) break;
      }
      i.stick.active = false;
      i.stick.x = i.stick.y = 0;
      i.touchJump = false;
      return { x: p.pos.x, y: p.pos.y, z: p.pos.z, best: +best.toFixed(2) };
    };
  });

  const segments = [
    ["石の坂 → 石の広場", [0, 0.2, -5], [[0, 0.2, 6], [0, 5, 26]], 14],
    ["木の坂 → 木の足場", [0, 5.2, 26], [[10, 6, 27], [26, 11.5, 27], [34, 12, 30]], 16],
    ["クリスタル → 鉄の足場", [34, 16.2, -6], [[27, 16, -9], [22, 18, -9]], 12],
    ["鉄の回廊 → チェッカー3段目", [-9, 24.2, -11], [[-9, 26, -21], [-4, 28, -25], [2, 30, -23]], 22],
    ["最上段 → てっぺん", [9, 32.2, -18.5], [[16, 34, -12], [12, 34, -8]], 14],
  ];
  for (const [name, from, waypoints, secs] of segments) {
    await page.evaluate(
      ([f]) => {
        const g = window.__game;
        g.state = "play";
        g.hud.hideAll();
        g.player.pos.set(f[0], f[1], f[2]);
        g.player.checkpoint.set(f[0], f[1], f[2]); // 失敗しても同じ区間をやり直す
        g.player.vel.set(0, 0, 0);
        g.player.hp = 3;
        g.player.dead = false;
        g.player.invuln = 999; // 到達性だけを見たいので無敵
        g.camera3.reset(g.player);
      },
      [from]
    );
    await page.waitForTimeout(400);
    let last = null;
    for (const w of waypoints)
      last = await page.evaluate((a) => window.__auto(a[0], a[1], a[2], a[3]), [...w, secs]);
    const t = waypoints[waypoints.length - 1];
    const reached =
      (Math.hypot(last.x - t[0], last.z - t[2]) < 3 && Math.abs(last.y - t[1]) < 2.6) ||
      last.best < 2.2;
    check(
      `${name} を自動操作で越えられる`,
      reached,
      `到達 (${last.x.toFixed(1)}, ${last.y.toFixed(1)}, ${last.z.toFixed(1)}) 最接近 ${last.best}`
    );
  }

  // ================= ゴール =================
  section("9. ゴールとクリア");
  await page.evaluate(() => {
    const g = window.__game;
    g.player.invuln = 9;
    g.player.pos.copy(g.level.goal.pos).y += 0.1;
    g.player.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(2600);
  check("土管に乗るとクリアになる", (await probe()).state === "clear");
  check("クリア画面が出る", await page.isVisible("#screenClear"));

  // ================= ポーズ・リトライ =================
  section("10. ポーズとリトライ");
  await page.click("#btnAgain");
  await page.waitForTimeout(900);
  const restarted = await probe();
  check("リトライで最初から始まる", restarted.state === "play" && restarted.coins === 0 && restarted.hp === 3, JSON.stringify(restarted));
  near("スタート地点に戻る", restarted.z, -5, 1);
  check("敵が作り直されている", restarted.enemies >= 5, `enemies=${restarted.enemies}`);

  await page.keyboard.press("p");
  await page.waitForTimeout(400);
  check("Pキーでポーズできる", await page.isVisible("#screenPause"));
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  check("もう一度Pキーで再開する", (await probe()).state === "play");

  const mem0 = await page.evaluate(() => window.__game.renderer.info.memory.geometries);
  await page.evaluate(() => window.__game.startRun());
  await page.waitForTimeout(800);
  const mem1 = await page.evaluate(() => window.__game.renderer.info.memory.geometries);
  check(
    "作り直してもジオメトリが増え続けない",
    mem1 <= mem0 + 5,
    `${mem0} → ${mem1}`
  );

  // ================= ゲームオーバー =================
  section("11. ゲームオーバー");
  await page.evaluate(() => {
    const g = window.__game;
    g.player.hp = 1;
    g.player.invuln = 0;
    g.player.pos.set(0, -90, 0);
  });
  await page.waitForTimeout(900);
  check("ライフが尽きるとゲームオーバー", (await probe()).state === "over");
  check("ゲームオーバー画面が出る", await page.isVisible("#screenOver"));
  await page.click("#btnRetry");
  await page.waitForTimeout(800);
  check("もう一度で再開できる", (await probe()).state === "play");

  // ================= 録音した声 =================
  // 単体テストは WAV の頭しか見ない。ここでは実際のブラウザに
  // decodeAudioData させて、入れた録音が本当に鳴らせる状態になるかを見る。
  // voicebank が空なら全部合成で鳴るので、この節は何も確かめずに通す。
  section("12. 録音した声が読み込める");
  const want = Object.keys(VOICEBANK).length;
  const voices = await page
    .waitForFunction(
      (n) => (window.__voices?.().length === n ? window.__voices() : false),
      want,
      { timeout: 8000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => []);
  check(
    want ? `入れた録音 ${want} 件がすべて鳴らせる` : "録音は無し（すべて合成で鳴る）",
    voices.length === want,
    voices.length ? voices.join(", ") : "読み込めていない"
  );
  // 実際に鳴らせているかは、ここまでの走行で何度もジャンプ・被弾・落下を
  // させているので、下の「コンソールエラーが出ていない」が受け持つ。

  section("13. エラー");
  check("コンソールエラーが出ていない", errors.length === 0, errors.join(" / "));
} finally {
  await browser.close();
  server.close();
}

summary("play.test.mjs");
