import { check, near, section, summary } from "./harness.mjs";
import * as S from "../src/world/sphere.js";
import { createBody, pointInBody, pushBody, slideBody, bodyCenter } from "../src/world/body.js";
import { loadLandBodies, loadPlayerRing } from "../src/world/geo.js";
import { CFG } from "../src/rules/config.js";

section("内外判定 — 子午線レイキャスト + 経度バケット（DESIGN.md §3.3c）");

// 素朴な全辺走査。バケット索引の答え合わせに使う。
function naiveInside(rings, lon, lat) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const c = r[(i + 1) % r.length];
      let d = c[0] - a[0];
      while (d > 180) d -= 360;
      while (d <= -180) d += 360;
      if (d === 0) continue;
      let e = lon + 1e-5 - a[0];
      while (e > 180) e -= 360;
      while (e <= -180) e += 360;
      const t = e / d;
      if (t < 0 || t >= 1) continue;
      if (a[1] + t * (c[1] - a[1]) > lat) inside = !inside;
    }
  }
  return inside;
}

const land = loadLandBodies();
const bodies = land.map((p) => createBody(p.rings));

// 大陸を数個選んで、ランダム点で素朴版と全一致するか
{
  const picks = [...land.keys()].sort((a, b) => land[b].rings[0].length - land[a].rings[0].length).slice(0, 6);
  let tested = 0;
  let mismatch = 0;
  let rs = 12345;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const i of picks) {
    const b = bodies[i];
    const bb = land[i].bbox;
    for (let k = 0; k < 400; k++) {
      const lon = bb[0] + rnd() * (bb[2] - bb[0]);
      const lat = bb[1] + rnd() * (bb[3] - bb[1]);
      const got = pointInBody(b, S.toVec(lat, lon));
      const want = naiveInside(land[i].rings, lon, lat);
      tested++;
      if (got !== want) mismatch++;
    }
  }
  check(`大きい 6 大陸 × 各 400 点で素朴な全辺走査と完全一致（${tested} 点）`, mismatch === 0, `不一致 ${mismatch}`);
}

// 南極（極を囲むリング）でも動くこと
{
  const ai = land.findIndex((p) => p.rings[0].winding !== 0);
  const b = bodies[ai];
  check("南極点が南極大陸の内側と判定される", pointInBody(b, S.toVec(-89.9, 0)));
  check("南極点付近は経度を変えても内側", [0, 90, -90, 180].every((lo) => pointInBody(b, S.toVec(-89, lo))));
  check("赤道上の点は南極の外側", !pointInBody(b, S.toVec(0, 0)));
  check("南緯 50 度は南極の外側", !pointInBody(b, S.toVec(-50, 0)));
}

// 陸と海の常識的な判定（座標は記憶に依る [推定]。ここで見たいのは索引が壊れていないこと）
{
  const anyLand = (lat, lon) => bodies.some((b) => pointInBody(b, S.toVec(lat, lon)));
  const spots = [
    ["サハラ砂漠 (25N, 10E)", 25, 10, true],
    ["シベリア (65N, 100E)", 65, 100, true],
    ["アマゾン (-5S, -60W)", -5, -60, true],
    ["オーストラリア中央 (-25S, 133E)", -25, 133, true],
    ["太平洋のど真ん中 (0N, -140W)", 0, -140, false],
    ["大西洋 (30N, -40W)", 30, -40, false],
    ["インド洋 (-30S, 80E)", -30, 80, false],
    ["日付変更線上の海 (0N, 180E)", 0, 180, false],
  ];
  for (const [name, lat, lon, want] of spots) {
    check(`${name} が ${want ? "陸" : "海"}`, anyLand(lat, lon) === want);
  }
  check("台湾本島の位置は陸レイヤから除かれている（自国の影がない）", !anyLand(23.76, 120.9));
}

section("面積で押せるかを決める（§1b.6）");
{
  const R_KM = 6371.0088;
  const player = createBody([loadPlayerRing()]);
  const km2 = (b) => b.area * R_KM * R_KM;
  near("台湾本島の面積 35,938 km²", km2(player), 35938, 5);

  for (const b of bodies) b.pushable = b.area <= player.area;
  const movable = bodies.filter((b) => b.pushable).length;
  check(`可動 ${movable} / 不動 ${bodies.length - movable}`, movable > 3900 && bodies.length - movable > 30);
  check("自分より大きい陸はひとつも押せない扱いになる",
    bodies.every((b) => b.pushable === b.area <= player.area));

  // bbox で実在の島を特定して、可動／不動が直感と合うか見る
  const find = (lo, la, lo2, la2) =>
    bodies.find((b, i) => {
      const x = land[i].bbox;
      return Math.abs(x[0] - lo) < 0.4 && Math.abs(x[1] - la) < 0.4 && Math.abs(x[2] - lo2) < 0.4 && Math.abs(x[3] - la2) < 0.4;
    });
  const cases = [
    ["ユーラシア＋アフリカ", -180, -34.82, 179.96, 77.74, false],
    ["南北アメリカ", -168.14, -53.89, -34.79, 72.0, false],
    ["南極大陸", -180, -85.22, 179.79, -63.21, false],
    ["オーストラリア", 113.16, -39.15, 153.63, -10.69, false],
    ["本州", 130.86, 33.43, 142.07, 41.55, false],
    ["九州（台湾より少し大きい）", 129.55, 31.0, 132.08, 33.97, false],
    ["四国", 132.01, 32.71, 134.75, 34.39, true],
    ["海南島（台湾より少し小さい）", 108.61, 18.17, 111.03, 20.16, true],
    ["シチリア島", 12.43, 36.65, 15.65, 38.3, true],
  ];
  for (const [name, a, b2, c, d, want] of cases) {
    const body = find(a, b2, c, d);
    if (!body) {
      check(`${name} が見つかる`, false, "bbox 不一致");
      continue;
    }
    check(`${name} は${want ? "押せる" : "押せない"}（${(km2(body) / 1e4).toFixed(2)} 万km²）`, body.pushable === want);
  }
}

section("押しのけ（§1.8 の球面版）");
{
  const ring = loadPlayerRing();
  const player = createBody([ring]);
  const pts = ring.map(([lon, lat]) => S.toVec(lat, lon));
  const pc = bodyCenter(player);

  // 台湾を大陸に思い切りめり込ませる（中国東岸へ）
  const target = S.toVec(23.5, 116.5);
  const moved = pts.map((p) => {
    const q = [...p];
    const t = S.tangentFromBearing(q, S.bearing(q, target));
    S.advance(q, t, S.angle(pc, target));
    return q;
  });
  const movedCenter = (() => {
    const q = [...pc];
    const t = S.tangentFromBearing(q, S.bearing(q, target));
    S.advance(q, t, S.angle(pc, target));
    return q;
  })();

  let pushed = 0;
  for (const b of bodies) if (b.pushable && pushBody(b, moved, movedCenter, player.radius, CFG)) pushed++;
  check("めり込ませた大陸が押される", pushed >= 1, `${pushed} 個`);
  check("遠くの大陸は押されない（外接キャップで早期棄却）", pushed <= 3, `${pushed} 個`);

  const b = bodies.find((x) => x.moved);
  const before = [...bodyCenter(b)]; // 返る配列は内部キャッシュなので複製する
  slideBody(b, 1, CFG);
  const after = [...bodyCenter(b)];
  // 剛体回転なので、回転軸から離れた点ほど動きが小さい。回転角そのもので測る。
  near("1 秒の回転角が押しのけ速度と一致", 2 * Math.acos(Math.min(1, Math.abs(b.q[3]))) / S.DEG, CFG.PUSH_SPD, 1e-6);
  check("重心も動いている", S.angleDeg(before, after) > 0.5, `${S.angleDeg(before, after).toFixed(3)} 度`);
  check("押された向きはプレイヤーから遠ざかる向き", S.angleDeg(after, movedCenter) > S.angleDeg(before, movedCenter));

  // 減衰して止まること
  let steps = 0;
  while (b.omega.some((v) => v !== 0) && steps < 1000) {
    slideBody(b, 1 / 60, CFG);
    steps++;
  }
  check("慣性は有限時間で止まる", steps < 1000, `${steps} フレーム = ${(steps / 60).toFixed(2)} 秒`);
  near("減衰は 0.12^dt（1 秒で 12%）", Math.pow(CFG.SLIDE_DAMP, 1), 0.12, 1e-12);
}

section("性能 — 毎フレーム回るか（§3.3c）");
{
  const ring = loadPlayerRing();
  const player = createBody([ring]);
  const pts = ring.map(([lon, lat]) => S.toVec(lat, lon));
  const pc = bodyCenter(player);
  for (const b of bodies) b.pushable = b.area <= player.area;
  const t0 = Date.now();
  const N = 60;
  for (let k = 0; k < N; k++) for (const b of bodies) if (b.pushable) pushBody(b, pts, pc, player.radius, CFG);
  const ms = (Date.now() - t0) / N;
  check(`押しのけ判定 1 フレームが 5 ms 未満（実測 ${ms.toFixed(2)} ms）`, ms < 5);
}

summary("body");
