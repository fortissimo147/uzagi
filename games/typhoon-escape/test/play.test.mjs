// 実ブラウザでの通しテスト。既存リポジトリと同じ playwright-core + 同梱 Chromium。
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { join } from "node:path";

// npx 経由で起こすと vite が孫プロセスになり、こちらを kill しても残る。
// 残ったサーバがポートを掴んだままになり、次の実行が固まる（実際に起きた）。
// 直接叩いて親子関係を 1 段にする。
const VITE = join(process.cwd(), "node_modules", ".bin", "vite");
import { check, section, summary } from "./harness.mjs";

const PORT = 4100 + Math.floor(Math.random() * 800);
const URL = `http://127.0.0.1:${PORT}/`;

function serve() {
  const p = spawn(VITE, ["preview", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  // テストが途中で殺されてもサーバを残さない。残すと次回がポートを掴めず固まる。
  const bye = () => p.kill("SIGKILL");
  process.on("exit", bye);
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("preview サーバが起動しない")), 30000);
    p.stdout.on("data", (d) => {
      if (String(d).includes("Local")) {
        clearTimeout(t);
        res(p);
      }
    });
    p.on("error", rej);
  });
}

const server = await serve();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium",
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
} catch (e) {
  console.log(`ブラウザを起動できないので play テストを飛ばします: ${e.message}`);
  server.kill();
  process.exit(0);
}

const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

section("実ブラウザでの起動（DESIGN.md §9 play）");
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__game && window.__game.globe, null, { timeout: 90000 });

check("WebGL コンテキストが取れている", await page.evaluate(() => !!window.__game.renderer.getContext()));
check("ローディング表示が消える", await page.locator("#loading").isHidden());
check("タイトルの文言が英語で出る", (await page.locator("#ptext").textContent()).includes("Escape the typhoons"));
check("開始ボタンが Start the Summer", (await page.locator("#pbtn").textContent()) === "Start the Summer");
check("日付が August 1, 2026", (await page.locator("#time").textContent()) === "August 1, 2026");

const stats = await page.evaluate(() => ({
  land: window.__game.globe.land.parts.length,
  tris: window.__game.globe.land.liveCount / 3,
  storms: window.__game.game.storms.length,
  drawCalls: window.__game.renderer.info.render.calls,
}));
check(`陸ポリゴンが 4,000 本以上（${stats.land}）`, stats.land > 4000);
check(`三角形が 70 万枚以上（${Math.round(stats.tris).toLocaleString()}）`, stats.tris > 700000);
check(`静止時のドローコールが 20 未満（${stats.drawCalls}）— §4.1b のバッチが効いている`, stats.drawCalls < 20);
{
  const c = await page.evaluate(() => ({ vis: window.__game.follow.visible, dist: window.__game.camera.position.length() }));
  check(`タイトルでは地球全体が見える（可視角半径 ${c.vis.toFixed(1)} 度）`, c.vis > 60, JSON.stringify(c));
  check(`カメラが地球の外にいる（距離 ${c.dist.toFixed(2)}）`, c.dist > 1.2);
}

section("プレイ");
await page.locator("#pbtn").click();
await page.waitForTimeout(200);
{
  // ソフトウェア描画だと 1 回の evaluate に数百 ms かかる。ティッカーの行は
  // 3 秒ほどで消えるので、**1 回の evaluate で全部読む**。分けると取りこぼす。
  const d = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#ticker .row")];
    return {
      popup: document.getElementById("popup").className,
      storms: window.__game.game.storms.length,
      n: rows.length,
      text: rows[0] ? rows[0].textContent : "",
      rowsVar: getComputedStyle(document.documentElement).getPropertyValue("--rows"),
    };
  });
  check("ポップアップが消える", d.popup === "hidden", d.popup);
  check("台風が 1 つ発生している", d.storms >= 1, String(d.storms));
  check("ニュース速報が出ている", d.n >= 1, JSON.stringify(d));
  check("速報が英語で「発生」を伝えている", d.text.includes("has formed"), d.text);
  check("行数が CSS 変数 --rows に反映される（スティックが持ち上がる）", Number(d.rowsVar) === d.n, d.rowsVar);
}

// ここから先は事故死しないよう台風を止める（操作と暦の検査を決定的にするため）
await page.evaluate(() => {
  window.__game.cfg.MAX_STORMS = 0;
  window.__game.game.storms.length = 0;
});

const before = await page.evaluate(() => [...window.__game.game.pos]);
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(700);
await page.keyboard.up("ArrowRight");
const after = await page.evaluate(() => [...window.__game.game.pos]);
const moved = Math.acos(Math.min(1, before[0] * after[0] + before[1] * after[1] + before[2] * after[2])) * (180 / Math.PI);
check(`右キーで台湾が動く（${moved.toFixed(2)} 度）`, moved > 0.05);
check("右キーで東へ動く（経度が増える）", await page.evaluate((b) => {
  const lon = (v) => (Math.atan2(v[0], v[2]) * 180) / Math.PI;
  return lon(window.__game.game.pos) > lon(b);
}, before));
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(500);
await page.keyboard.up("ArrowUp");
check("上キーで北へ動く（緯度が増える）", await page.evaluate((a) => {
  const lat = (v) => (Math.asin(v[1]) * 180) / Math.PI;
  return lat(window.__game.game.pos) > lat(a);
}, after));

{
  // 元ゲームと同じく dt は 50 ms で頭打ちなので、描画が遅い環境では
  // ゲーム内時間も実時間より遅く進む。壁時計ではなく elapsed との関係で検査する。
  const a = await page.evaluate(() => ({ e: window.__game.game.elapsed, d: window.__game.game.days }));
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => ({ e: window.__game.game.elapsed, d: window.__game.game.days, t: document.getElementById("time").textContent, cpu: window.__game.cpuMs }));
  // swiftshader（ソフトウェア描画）では GPU が律速するので、実時間との比は問わない。
  // CPU 側の 1 フレーム時間は別途 §性能 で検査する。
  check(`ゲーム内時間が進む（${a.e.toFixed(2)} → ${b.e.toFixed(2)} 秒 / CPU ${b.cpu.toFixed(1)}ms/f）`, b.e > a.e);
  check("生存日数 = floor(elapsed)（1 実秒 = ゲーム内 1 日）", b.d === Math.floor(b.e), `days=${b.d} elapsed=${b.e.toFixed(3)}`);
  check("HUD の日付が elapsed に追随する", b.d >= 1 ? b.t !== "August 1, 2026" : b.t === "August 1, 2026", `${b.t} / ${b.d} 日`);
}

section("被弾からゲームオーバーまで");
check("この時点ではまだ生きている", await page.evaluate(() => window.__game.game.over === false));
// 台風を無理やり本島の上に置いて当てる
await page.evaluate(() => {
  const g = window.__game.game;
  window.__game.cfg.MAX_STORMS = 7;
  g.spawn();
  const st = g.storms[g.storms.length - 1];
  st.p = [...g.pos];
  st.r = 2.0;
});
await page.waitForTimeout(200);
{
  // ラウンドトリップ 1 回で全部読む。swiftshader だと 1 回の evaluate に
  // 数百 ms かかることがあり、複数回に分けると時間の検査が壊れる。
  const d = await page.evaluate(() => ({
    over: window.__game.game.over,
    region: window.__game.game.hit && window.__game.game.hit.region,
    state: window.__game.state,
    popupAtOver: window.__game.popupAtOver,
  }));
  check("接触で over になる", d.over === true);
  check("上陸地域が 4 種のいずれか", ["Northern Taiwan", "Central Taiwan", "Southern Taiwan", "Eastern Taiwan"].includes(d.region), d.region);
  check("死んだ瞬間はポップアップが出ていない（1500 ms のスローモーション）", d.popupAtOver === "hidden", d.popupAtOver);
}
await page.waitForTimeout(2000);
{
  const d = await page.evaluate(() => ({
    cls: document.getElementById("popup").className,
    since: performance.now() - window.__game.overAt,
  }));
  check("スローモーション後にポップアップが出る", d.cls === "over", d.cls);
  check(`ポップアップは死後 1500 ms 以降に出る（${Math.round(d.since)}ms 経過）`, d.since >= 1500);
}
check("上陸メッセージが英語で出る", (await page.locator("#ptext").textContent()).startsWith("Typhoon No. "));
check("ボタンが Start a New Summer", (await page.locator("#pbtn").textContent()) === "Start a New Summer");
check("シェアボタンが出る", await page.locator("#sharebtn").isVisible());

section("渦の見た目と当たり判定の一致（§4.3）");
{
  const d = await page.evaluate(() => {
    const g = window.__game.game;
    const v = window.__game.stormView;
    const st = g.storms[0];
    if (!st) return null;
    const maxAng = (attr) => {
      const a = attr.array;
      const n = attr.count * 3;
      let m = 0;
      for (let i = 0; i < n; i += 3) {
        const len = Math.hypot(a[i], a[i + 1], a[i + 2]);
        if (len === 0) continue;
        const dot = (a[i] * st.p[0] + a[i + 1] * st.p[1] + a[i + 2] * st.p[2]) / len;
        const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
        if (ang > m) m = ang;
      }
      return m;
    };
    return {
      r: st.r,
      lethal: st.r * window.__game.cfg.LETHAL,
      bandOuter: maxAng(v.lethalBand.geometry.attributes.position),
      cloudOuter: maxAng(v.cloud.geometry.attributes.position),
      rot: st.rot,
    };
  });
  check("台風が存在する", d !== null);
  if (d) {
    check(`赤い帯の外縁が致死半径と一致（${d.bandOuter.toFixed(4)}° vs ${d.lethal.toFixed(4)}°）`,
      Math.abs(d.bandOuter - d.lethal) < 1e-3);
    check(`渦の雲は外側半径を超えない（${d.cloudOuter.toFixed(3)}° <= ${d.r.toFixed(3)}°）`, d.cloudOuter <= d.r * 1.02);
    check("渦が当たり判定より大きく描かれている（雲は飾りで、判定は赤い帯）", d.cloudOuter > d.lethal);
  }
}
{
  const a = await page.evaluate(() => window.__game.game.storms[0].rot);
  await page.waitForTimeout(900);
  const b = await page.evaluate(() => window.__game.game.storms[0].rot);
  check(`台風が回りながら動いている（rot ${a.toFixed(2)} → ${b.toFixed(2)}）`, b > a);
}

section("性能 — 台風 7 個の最悪条件");
await page.locator("#pbtn").click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = window.__game.game;
  window.__game.cfg.MAX_STORMS = 7;
  while (g.storms.length < 7) g.spawn();
});
await page.waitForTimeout(6000); // ソフトウェア描画だと数 fps しか出ないので長めに待つ
{
  const d = await page.evaluate(() => ({
    cpu: window.__game.cpuMs,
    storms: window.__game.game.storms.length,
    calls: window.__game.renderer.info.render.calls,
  }));
  check(`台風 ${d.storms} 個で CPU 側 1 フレームが 8 ms 未満（実測 ${d.cpu.toFixed(2)} ms）`, d.cpu < 8);
  check(`台風 7 個でもドローコールが 40 未満（${d.calls}）`, d.calls < 40);
{
  // イントロの 90 度から寄ってくる。ソフトウェア描画では数 fps しか出ず
  // 収束に実時間がかかるので、壁時計で待たずに収束そのものを待つ。
  let ok = true;
  try {
    await page.waitForFunction(() => window.__game.follow.visible <= window.__game.cfg.CAM_PLAY * 1.02, null, { timeout: 40000 });
  } catch {
    ok = false;
  }
  const v = await page.evaluate(() => window.__game.follow.visible);
  const floor = await page.evaluate(() => window.__game.cfg.CAM_FLOOR);
  check(`プレイ中は PLAY 画角より引かない（${v.toFixed(2)} 度）`, ok && v >= floor * 0.99);
}
}
// 元に戻す
await page.evaluate(() => {
  const g = window.__game.game;
  g.storms.length = 0;
  const st = g.storms;
  window.__game.cfg.MAX_STORMS = 7;
  void st;
  g.over = true;
});
await page.waitForTimeout(1900);

section("面積で押せるかが決まる（§1b.6）");
{
  const d = await page.evaluate(async () => {
    const g = window.__game.game;
    g.reset(); // 直前のゲームオーバー状態だと step() が動かないので戻す
    const big = g.landBodies.filter((b) => !b.pushable);
    const small = g.landBodies.filter((b) => b.pushable);
    // 大陸へ向かってひたすら押し当てる
    const lat0 = (Math.asin(g.pos[1]) * 180) / Math.PI;
    g.vx = -1;
    g.vy = 0;
    for (let i = 0; i < 300; i++) g.step(0.05);
    const bigMoved = big.filter((b) => b.q[3] !== 1).length;
    const lon = (v) => (Math.atan2(v[0], v[2]) * 180) / Math.PI;
    return {
      nBig: big.length,
      nSmall: small.length,
      bigMoved,
      blocked: g.blockedBy(null),
      lonNow: lon(g.pos),
      lat0,
      playerKm2: g.player.area * 6371.0088 ** 2,
    };
  });
  check(`台湾（${Math.round(d.playerKm2).toLocaleString()} km²）より大きい陸が ${d.nBig} 個ある`, d.nBig > 30);
  check(`小さい陸が ${d.nSmall} 個ある`, d.nSmall > 3900);
  check("大陸へ押し当てても、大きい陸はひとつも動かない", d.bigMoved === 0, `${d.bigMoved} 個動いた`);
  check(`大陸に阻まれて止まる（経度 120.9 → ${d.lonNow.toFixed(2)}）`, d.lonNow > 117 && d.lonNow < 120.9);
  check("止まった位置で壁にめり込んでいない", d.blocked === false);
}

section("やり直し");
await page.locator("#pbtn").click();
await page.waitForTimeout(300);
check("リセットで日付が初日に戻る", (await page.evaluate(() => window.__game.game.days)) === 0);
check("リセットで over が下りる", (await page.evaluate(() => window.__game.game.over)) === false);

section("メニュー");
await page.locator("#menubtn").click();
check("メニューが開く", await page.locator("#menu").evaluate((e) => e.classList.contains("open")));
const disc = await page.locator("#disclaimer").textContent();
check("台風名が架空である旨が英語で書かれている", /fictional/i.test(disc) && /not the official/i.test(disc));
check("Natural Earth の出典が書かれている", (await page.locator("#menu").textContent()).includes("Natural Earth"));
await page.locator("#menuclose").click();

check("JS エラーがひとつも出ていない", errors.length === 0, errors.slice(0, 3).join(" / "));

await browser.close();
server.kill();
summary("play");
