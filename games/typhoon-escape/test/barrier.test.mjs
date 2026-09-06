// 壁（押せない陸）の検査。DESIGN.md §1b.8。
import { check, near, section, summary } from "./harness.mjs";
import * as S from "../src/world/sphere.js";
import { loadLandBodies, loadPlayerRing } from "../src/world/geo.js";
import { createBody, pointInBody } from "../src/world/body.js";
import { Game } from "../src/rules/game.js";
import { CFG } from "../src/rules/config.js";

const ring = loadPlayerRing();
const polys = loadLandBodies();
const mk = () => new Game({ playerRing: ring, landBodies: polys.map((p) => createBody(p.rings)) });
const km = (deg) => (deg * Math.PI * 6371.0088) / 180;

/** 台湾の海岸線がどれかの壁の内側に入っていないか（素朴な全点判定）。 */
function overlapping(g) {
  let n = 0;
  for (const b of g.barriers) for (const p of g.worldPts) if (pointInBody(b, p)) n++;
  return n;
}
/** 入力を与えて N フレーム進める。 */
function drive(g, vx, vy, n, dt = 0.05) {
  g.vx = vx;
  g.vy = vy;
  for (let i = 0; i < n; i++) g.movePlayer(dt);
}

section("壁の構成（§1b.8）");
{
  const g = mk();
  check(`押せない陸がそのまま壁になる（${g.barriers.length} 個）`, g.barriers.length === 43);
  check("壁はすべて台湾より大きい", g.barriers.every((b) => b.area > g.player.area));
  check("押せる陸は壁ではない", g.landBodies.filter((b) => b.pushable).every((b) => !g.barriers.includes(b)));
  check(`判定点は取り直した海岸線（${g.blockPts.length} 点 / 元は ${g.localPts.length} 点）`,
    g.blockPts.length > 150 && g.blockPts.length < 400);
  {
    let maxGap = 0;
    for (let i = 0; i < g.blockPts.length; i++)
      maxGap = Math.max(maxGap, S.angleDeg(g.blockPts[i], g.blockPts[(i + 1) % g.blockPts.length]));
    const step = CFG.PLAYER_SPD * CFG.DT_MAX;
    check(`海岸線の隙間が 1 フレームの最大移動より小さい（${km(maxGap).toFixed(2)} km < ${km(step).toFixed(2)} km）`, maxGap < step);
  }
  check("開始位置は壁の中ではない", g.blockedBy(null) === false);
  check("開始位置で台湾が壁に重なっていない", overlapping(g) === 0);
}

section("teleport は位置と姿勢をそろえる");
{
  const g = mk();
  g.teleport(0, -150); // 太平洋のど真ん中
  const c = S.toLatLon(g.pos);
  near("中心が指定どおりに移る（緯度）", c.lat, 0, 1e-9);
  near("中心が指定どおりに移る（経度）", c.lon, -150, 1e-9);
  // 島の形も一緒に移っていること（海岸線の重心が中心の近くにあること）
  const mid = g.worldPts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  S.normalize(mid);
  check(`島の形も一緒に移る（中心との差 ${S.angleDeg(mid, g.pos).toFixed(3)} 度）`, S.angleDeg(mid, g.pos) < 0.3);
}

section("壁は通れない");
{
  const g = mk();
  const start = [...g.pos];
  drive(g, -1, 0, 400); // ひたすら西（中国大陸へ）
  const moved = S.angleDeg(start, g.pos);
  check(`西へ 20 秒押し続けても壁を貫通しない（${moved.toFixed(2)} 度動いて止まった）`, moved < 5);
  check("動きはした（最初から固まっているのではない）", moved > 0.2, `${moved.toFixed(3)} 度`);
  check("台湾の頂点がひとつも壁の内側に入っていない", overlapping(g) === 0, `${overlapping(g)} 点`);
  check("止まった位置でも壁の外", g.blockedBy(null) === false);
}

section("壁沿いに滑れる（斜め入力が完全には殺されない）");
{
  const g = mk();
  const lat0 = S.toLatLon(g.pos).lat;
  drive(g, -1, -1, 400); // 西（壁向き）＋北
  const lat1 = S.toLatLon(g.pos).lat;
  // 北は福建の海岸線が東へ張り出すぶん進みにくく、南（バシー海峡）より滑りが小さい。
  check(`壁に当たっても北へ滑る（緯度 ${lat0.toFixed(2)} → ${lat1.toFixed(2)}）`, lat1 > lat0 + 0.5);
  check("滑っている間も壁に重ならない", overlapping(g) === 0, `${overlapping(g)} 点`);
}
{
  // 逆向きにも滑れること
  const g = mk();
  const lat0 = S.toLatLon(g.pos).lat;
  drive(g, -1, 1, 400); // 西＋南
  const lat1 = S.toLatLon(g.pos).lat;
  check(`南へも滑る（緯度 ${lat0.toFixed(2)} → ${lat1.toFixed(2)}）`, lat1 < lat0 - 1);
  check("こちらも壁に重ならない", overlapping(g) === 0);
}

section("海の上では止まらない");
{
  const g = mk();
  g.teleport(0, -150);
  const start = [...g.pos];
  drive(g, 1, 0, 40);
  near("2 秒ぶん素直に進む", S.angleDeg(start, g.pos), CFG.PLAYER_SPD * 2, 1e-3);
}

section("壁でない陸は移動を妨げない");
{
  const g = mk();
  g.barriers = []; // 壁が無ければ、押せる陸の上でも自由に動ける
  const start = [...g.pos];
  let path = 0;
  let prev = [...g.pos];
  g.vx = -1;
  g.vy = 0;
  for (let i = 0; i < 400; i++) {
    g.movePlayer(0.05);
    path += S.angleDeg(prev, g.pos);
    prev = [...g.pos];
  }
  // 「西へ」は毎フレーム現在地の east を取り直すので大圏ではなく等方位角の曲線を描く。
  // 端点間の大圏距離は経路長より短くなるので、経路長のほうで測る。
  near("壁が無ければ 20 秒ぶんまるまる進む", path, CFG.PLAYER_SPD * 20, 1e-2);
  check(`端点間の大圏距離はそれより短い（${S.angleDeg(start, g.pos).toFixed(2)} 度 < ${path.toFixed(2)} 度）`,
    S.angleDeg(start, g.pos) < path);
}

section("性能");
{
  // 壁際まで寄せてから、判定 1 回のコストを測る。
  // movePlayer は動いて条件が変わるので、blockedBy を直接測る。
  const g = mk();
  drive(g, -1, 0, 400); // 壁に張り付かせる
  const dq = S.quatFromAxisAngle([0, 1, 0], 0.001);
  for (let i = 0; i < 500; i++) g.blockedBy(dq);
  const t0 = Date.now();
  const N = 3000;
  for (let i = 0; i < N; i++) g.blockedBy(dq);
  const one = (Date.now() - t0) / N;
  check(`壁際の判定 1 回が 0.6 ms 未満（実測 ${one.toFixed(3)} ms → 1 フレーム最大 ${(one * 3).toFixed(2)} ms）`, one < 0.6);

  const g2 = mk();
  g2.teleport(0, -150);
  for (let i = 0; i < 500; i++) g2.blockedBy(dq);
  const t1 = Date.now();
  for (let i = 0; i < N; i++) g2.blockedBy(dq);
  const two = (Date.now() - t1) / N;
  check(`外洋なら 0.02 ms 未満（実測 ${two.toFixed(4)} ms）— 海岸線セルで弾けている`, two < 0.02);
  check(`外洋は壁際より 10 倍以上速い（${(one / two).toFixed(0)} 倍）`, one / two > 10);
}

summary("barrier");
