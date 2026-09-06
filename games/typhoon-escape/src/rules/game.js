// ゲーム進行。DESIGN.md §1 の元仕様を、world/ の API だけを使って組み立てる。
// three.js には一切触れない（§0.3）。
import * as S from "../world/sphere.js";
import { createStorm, stepStorm, setForecast, outOfPlay, lethalRadius } from "../world/storm.js";
import { createBody, pushBody, slideBody, bodyCenter, pointInBody, coastNear, edgesNear } from "../world/body.js";
import { CFG, PATTERNS, START_LATLON } from "./config.js";

const TMP_C = [0, 0, 0];
const TMP_P = [0, 0, 0];
const TMP_EDGES = [];

/** 線分 AB と CD が交差するか（端点の接触も交差とみなす）。経緯度平面で解く。 */
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if (d1 > 0 === d2 > 0) return false;
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d3 > 0 !== d4 > 0;
}

/**
 * 海岸線を**等間隔に取り直す**。壁の判定点に使う（§1b.8）。
 *
 * 元の頂点をそのまま間引くと、データが疎な所に隙間が残る（実測で最大 39.6 km）。
 * 1 フレームの最大移動 12.9 km より大きい隙間があると、細い岬をその隙間で
 * またいで素通りしうる。距離で取り直せば隙間の上限を設計で決められる。
 */
function resampleRing(ring, maxGapDeg) {
  const v = ring.map(([lon, lat]) => S.toVec(lat, lon));
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    out.push(a);
    const d = S.angleDeg(a, b);
    const n = Math.floor(d / maxGapDeg);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      out.push(S.normalize(m));
    }
  }
  // 近すぎる点は落とす（判定回数を減らす）
  const kept = [];
  for (const p of out) {
    if (!kept.length || S.angleDeg(kept[kept.length - 1], p) >= maxGapDeg * 0.5) kept.push(p);
  }
  return kept;
}

/**
 * 台湾の内部にある点を格子状に拾う。壁のすり抜け防止用（§1b.8）。
 * 海岸線の頂点だけだと、細い半島を台湾がまたいだとき素通りしてしまう。
 */
function interiorSamples(body, ring, n = 9) {
  const b = ring.reduce(
    (a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  const out = [];
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const lon = b[0] + ((b[2] - b[0]) * i) / n;
      const lat = b[1] + ((b[3] - b[1]) * j) / n;
      const v = S.toVec(lat, lon);
      if (pointInBody(body, v)) out.push(v);
    }
  }
  return out;
}
import { NAMES } from "./names.js";
import { region } from "./region.js";

/** 生存日数 → 日付。元の gameDate()。実時間 1 秒 = ゲーム内 1 日。 */
export function gameDate(elapsed) {
  const [y, m, d] = CFG.START_DATE;
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + Math.floor(elapsed));
  return date;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const formatDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

export class Game {
  /**
   * @param {object} o
   * @param {[number,number][]} o.playerRing 台湾本島の海岸線（経緯度）
   * @param {object[]} o.landBodies createBody 済みの他の陸
   * @param {() => number} o.rand
   * @param {(msg: string, kind: string) => void} o.onNews
   */
  constructor({ playerRing, landBodies, rand = Math.random, onNews = () => {} }) {
    this.rand = rand;
    this.onNews = onNews;
    this.landBodies = landBodies;
    this.playerRing = playerRing;
    this.player = createBody([playerRing]);
    // 押せるかどうかは面積で決まり、プレイ中は変わらないので最初に一度だけ判定する。
    // 押せない陸は**壁**になる（§1b.8）。
    for (const b of landBodies) b.pushable = b.area <= this.player.area;
    this.barriers = landBodies.filter((b) => !b.pushable);
    // 当たり判定に使う海岸線頂点（元の jpPts）。元の経緯度も持つ（上陸地域の判定用）。
    this.localPts = playerRing.map(([lon, lat]) => ({ v: S.toVec(lat, lon), lon, lat }));
    // 壁との判定には**内部の点**も要る。海岸線の頂点だけだと、細長い半島を
    // 台湾がまたいだときに「どの頂点も壁の内側でない」状態になりすり抜ける。
    // 壁の判定は**辺と辺の交差**で見るので、海岸線だけでよい（内部の点は要らない）。
    // 交差で見れば、細い岬を台湾がまたいだ場合も辺が必ず交わるので取りこぼさない。
    // 1 フレームの最大移動の半分（約 6.4 km）で取り直して、辺の数を抑える。
    this.blockPts = resampleRing(playerRing, (CFG.PLAYER_SPD * CFG.DT_MAX) / 2);
    this.nCoastBlock = this.blockPts.length;
    this.blockWorld = this.blockPts.map((v) => [...v]);
    this.blockLL = new Float64Array(this.blockPts.length * 2);
    this.reset();
  }

  reset() {
    this.pos = S.toVec(START_LATLON.lat, START_LATLON.lon);
    this.q = S.quatIdentity();
    this.storms = [];
    this.elapsed = 0;
    this.over = false;
    this.running = false;
    this.spawnT = 0;
    this.tsp = CFG.STORM_SPD0;
    this.tyNo = 0;
    this.hit = null;
    this.nameIdx = Math.floor(this.rand() * NAMES.length);
    this.vx = 0;
    this.vy = 0;
    for (const b of this.landBodies) {
      b.q = S.quatIdentity();
      b.omega = [0, 0, 0];
      b._dirty = true;
    }
    this.player.q = S.quatIdentity();
    this.player._dirty = true;
    this.worldPts = this.localPts.map((p) => [...p.v]);
  }

  /** プレイヤーの海岸線頂点を現在の姿勢で得る。当たり判定と押しのけの両方で使う。 */
  updateWorldPts() {
    const q = this.player.q;
    for (let i = 0; i < this.localPts.length; i++) S.quatApply(q, this.localPts[i].v, this.worldPts[i]);
    for (let i = 0; i < this.blockPts.length; i++) S.quatApply(q, this.blockPts[i], this.blockWorld[i]);
  }

  /**
   * 台湾を接平面上の (vx, vy) 方向へ動かす。斜めが √2 倍速いのは元の仕様（§6）。
   *
   * 自分より大きい陸は**壁**なので、めり込む移動は却下する（§1b.8）。
   * 却下されたら東成分だけ・北成分だけを順に試す。
   * これで壁に沿って滑れる。全部だめなら止まる。
   */
  movePlayer(dt) {
    if (!this.vx && !this.vy) return;
    const { east, north } = S.tangentBasis(this.pos);
    const comp = (vx, vy) => [
      east[0] * vx - north[0] * vy,
      east[1] * vx - north[1] * vy,
      east[2] * vx - north[2] * vy,
    ];
    // すでに壁の中にいるなら閉じ込めない（初期配置や不測の事態への保険）
    const stuck = this.blockedBy(null);
    for (const [vx, vy] of [[this.vx, this.vy], [this.vx, 0], [0, this.vy]]) {
      if (!vx && !vy) continue;
      const dir = comp(vx, vy);
      const len = Math.hypot(dir[0], dir[1], dir[2]);
      if (len < 1e-9) continue;
      const speed = CFG.PLAYER_SPD * len; // len が入力の強さ。斜めは √2 になる
      // 軸 n = pos × dir のまわりに **正の** 角度で回すと pos が dir 側へ動く。
      // (n×pos = dir なので p' = p cosθ + dir sinθ)。符号を逆にすると西へ行く。
      const axis = S.cross(this.pos, [dir[0] / len, dir[1] / len, dir[2] / len]);
      S.normalize(axis);
      const dq = S.quatFromAxisAngle(axis, speed * dt * S.DEG);
      if (!stuck && this.blockedBy(dq)) continue;
      this.q = S.quatMul(dq, this.q);
      this.player.q = this.q;
      this.player._dirty = true;
      S.quatApply(dq, this.pos, this.pos);
      S.normalize(this.pos);
      this.updateWorldPts();
      return;
    }
  }

  /**
   * dq を適用した後の台湾が、壁（押せない陸）にめり込むか。
   * dq が null なら現在位置で判定する。
   */
  blockedBy(dq) {
    const center = dq ? S.quatApply(dq, this.pos, TMP_C) : this.pos;
    const c = S.toLatLon(center);
    const pad = this.player.radius;

    for (const b of this.barriers) {
      // 1) 粗く弾く。ユーラシアのような巨大な陸は外接キャップが効かないので bbox で見る。
      if (c.lat < b.bbox[1] - pad || c.lat > b.bbox[3] + pad) continue;
      if (!b.wrapsLon) {
        let d = c.lon - (b.bbox[0] + b.bbox[2]) / 2;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        if (Math.abs(d) > (b.bbox[2] - b.bbox[0]) / 2 + pad) continue;
      }
      // 2) 海岸線から離れていれば、台湾は丸ごと内側か丸ごと外側。中心 1 点で決まる。
      if (!coastNear(b, c.lon - pad, c.lat - pad, c.lon + pad, c.lat + pad)) {
        if (pointInBody(b, center)) return true;
        continue;
      }
      // 3) 近傍の辺だけ集めて、台湾の海岸線と交差するかを見る。
      const E = edgesNear(b, c.lon, c.lon - pad, c.lat - pad, c.lon + pad, c.lat + pad, TMP_EDGES);
      const P = this.blockLonLat(dq, c.lon);
      const n = this.nCoastBlock * 2;
      for (let i = 0; i < n; i += 2) {
        const ax = P[i];
        const ay = P[i + 1];
        const bx = P[(i + 2) % n];
        const by = P[(i + 3) % n];
        for (let j = 0; j < E.length; j += 4) {
          if (segCross(ax, ay, bx, by, E[j], E[j + 1], E[j + 2], E[j + 3])) return true;
        }
      }
      // 4) 交差が無いなら、丸ごと内側か丸ごと外側。中心で決める。
      if (pointInBody(b, center)) return true;
    }
    return false;
  }

  /**
   * 台湾を指定の経緯度へ移す。
   * **pos だけ書き換えてはいけない。** 島の形は player.q が持っているので、
   * 両方に同じ回転を掛けないと「中心はここ、島はあそこ」という状態になる。
   */
  teleport(lat, lon) {
    const target = S.toVec(lat, lon);
    const axis = S.cross(this.pos, target);
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    if (len > 1e-12) {
      S.normalize(axis);
      const dq = S.quatFromAxisAngle(axis, S.angle(this.pos, target));
      this.q = S.quatMul(dq, this.q);
      this.player.q = this.q;
      this.player._dirty = true;
    }
    this.pos = target;
    this.updateWorldPts();
    return this;
  }

  /** 壁の判定に使う海岸線を、refLon と同じ枝の経緯度で得る。 */
  blockLonLat(dq, refLon) {
    const out = this.blockLL;
    for (let i = 0; i < this.nCoastBlock; i++) {
      const w = dq ? S.quatApply(dq, this.blockWorld[i], TMP_P) : this.blockWorld[i];
      const y = w[1] < -1 ? -1 : w[1] > 1 ? 1 : w[1];
      out[i * 2 + 1] = Math.asin(y) / S.DEG;
      let lon = Math.atan2(w[0], w[2]) / S.DEG - refLon;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      out[i * 2] = lon + refLon;
    }
    return out;
  }

  spawn(visibleDeg = CFG.CAM_PLAY) {
    this.tyNo++;
    const name = NAMES[this.nameIdx % NAMES.length];
    this.nameIdx++;
    const pattern = PATTERNS[Math.floor(this.rand() * PATTERNS.length)];

    // 元は画面 4 辺の外 60px。球面には辺がないので、可視円の外周に一様分布させる（§1b.4）。
    const bearingFromPlayer = this.rand() * Math.PI * 2;
    const p = [...this.pos];
    const t = S.tangentFromBearing(p, bearingFromPlayer);
    S.advance(p, t, (visibleDeg + CFG.SPAWN_MARGIN) * S.DEG);

    // 発生直後は必ずプレイヤー方向を向く（元と同じ）
    const bearing = S.bearing(p, this.pos) + (this.rand() - 0.5) * CFG.SPAWN_ANGLE_JITTER;
    const st = createStorm({ pos: p, bearing, pattern, cfg: CFG, rand: this.rand, no: this.tyNo, name });
    setForecast(st, this.tsp, CFG);
    this.storms.push(st);
    this.onNews(`Typhoon No. ${st.no} (${st.name}) has formed. Stay alert for its forecast track.`, "formed");
  }

  /** 1 フレーム。visibleDeg は発生・消滅の基準となるプレイ画角。 */
  step(dt, visibleDeg = CFG.CAM_PLAY) {
    if (this.over) {
      // 敗北演出中もスローモーションで動き続ける（元と同じ）
      const d = dt * CFG.SLOWMO;
      for (const b of this.landBodies) slideBody(b, d, CFG);
      for (const st of this.storms) {
        const v = st.stalled ? this.tsp * CFG.STALL_FACTOR : this.tsp * st.spd;
        S.advance(st.p, st.t, v * d * S.DEG);
        st.rot += (st.p[1] >= 0 ? 1 : -1) * CFG.SPIN * d;
      }
      return;
    }

    this.elapsed += dt;
    this.movePlayer(dt);
    this.updateWorldPts();

    // 押しのけ（§1.8 / §1b.6）。
    // **自分より面積の大きい陸は押せない**。台湾（35,938 km²）で大陸が動くのは
    // さすがに無理があるので、質量の代わりに面積で線を引く。
    const pc = this.pos;
    for (const b of this.landBodies) {
      if (b.pushable) pushBody(b, this.worldPts, pc, this.player.radius, CFG);
      slideBody(b, dt, CFG);
    }

    this.tsp = CFG.STORM_SPD0 + this.elapsed * CFG.STORM_ACC;

    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      const res = stepStorm(st, dt, this.pos, this.tsp, CFG, this.rand);
      if (res === "weakened") {
        this.storms.splice(i, 1);
        this.onNews(`Typhoon No. ${st.no} (${st.name}) has weakened into an extratropical cyclone.`, "gone");
        continue;
      }
      if (outOfPlay(st, this.pos, visibleDeg, CFG)) {
        this.storms.splice(i, 1);
        this.onNews(`Typhoon No. ${st.no} (${st.name}) has moved away from Taiwan and dissipated.`, "gone");
      }
    }

    this.spawnT += dt;
    const interval = Math.max(CFG.SPAWN_INTERVAL_MIN, CFG.SPAWN_INTERVAL0 - this.elapsed * CFG.SPAWN_INTERVAL_DECAY);
    if (this.spawnT > interval && this.storms.length < CFG.MAX_STORMS) {
      this.spawnT = 0;
      this.spawn(visibleDeg);
    }

    this.checkHit();
  }

  /**
   * 当たり判定（§1.3）。海岸線の全頂点 × 全台風。
   * 致死半径は内側の赤い円＝外側の 0.55 倍。見た目と完全に一致させる。
   */
  checkHit() {
    for (const st of this.storms) {
      const lethal = lethalRadius(st, CFG);
      const cosR = Math.cos(lethal * S.DEG);
      // まず本体の外接キャップで棄却
      if (S.dot(this.pos, st.p) < Math.cos((lethal + CFG.BODY_DEG * 1.2) * S.DEG)) continue;
      for (let i = 0; i < this.worldPts.length; i++) {
        if (S.dot(this.worldPts[i], st.p) > cosR) {
          this.over = true;
          this.hit = {
            no: st.no,
            name: st.name,
            region: region(this.localPts[i].lon, this.localPts[i].lat),
          };
          this.vx = 0;
          this.vy = 0;
          return;
        }
      }
    }
  }

  get days() {
    return Math.floor(this.elapsed);
  }
  get dateText() {
    return formatDate(gameDate(this.elapsed));
  }
  landfallText() {
    return this.hit ? `Typhoon No. ${this.hit.no} (${this.hit.name}) made landfall in ${this.hit.region}` : "";
  }
}

/**
 * X へ流すシェア文（§7）。元の日本語文の対訳。
 * URL は呼び出し側が渡す（実際に開かれている URL から取る）。
 */
export function shareText(game, url) {
  return (
    `[Game] Move Taiwan and outrun the typhoons!\n` +
    `On ${game.dateText}, ${game.landfallText()}. I survived ${game.days} days.\n\n` +
    `#TyphoonEscape\n${url}`
  );
}

export { createBody, bodyCenter };
