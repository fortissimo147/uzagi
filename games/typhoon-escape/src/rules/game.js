// ゲーム進行。DESIGN.md §1 の元仕様を、world/ の API だけを使って組み立てる。
// three.js には一切触れない（§0.3）。
import * as S from "../world/sphere.js";
import { createStorm, stepStorm, setForecast, outOfPlay, lethalRadius } from "../world/storm.js";
import { createBody, pushBody, slideBody, bodyCenter } from "../world/body.js";
import { CFG, PATTERNS, START_LATLON } from "./config.js";
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
    // 当たり判定に使う海岸線頂点（元の jpPts）。元の経緯度も持つ（上陸地域の判定用）。
    this.localPts = playerRing.map(([lon, lat]) => ({ v: S.toVec(lat, lon), lon, lat }));
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
  }

  /** 台湾を接平面上の (vx, vy) 方向へ動かす。斜めが √2 倍速いのは元の仕様（§6）。 */
  movePlayer(dt) {
    if (!this.vx && !this.vy) return;
    const { east, north } = S.tangentBasis(this.pos);
    const dir = [
      east[0] * this.vx - north[0] * this.vy,
      east[1] * this.vx - north[1] * this.vy,
      east[2] * this.vx - north[2] * this.vy,
    ];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 1e-9) return;
    const speed = CFG.PLAYER_SPD * len; // len が入力の強さ。斜めは √2 になる
    // 軸 n = pos × dir のまわりに **正の** 角度で回すと pos が dir 側へ動く。
    // (n×pos = dir なので p' = p cosθ + dir sinθ)。符号を逆にすると西へ行く。
    const axis = S.cross(this.pos, [dir[0] / len, dir[1] / len, dir[2] / len]);
    S.normalize(axis);
    const dq = S.quatFromAxisAngle(axis, speed * dt * S.DEG);
    this.q = S.quatMul(dq, this.q);
    this.player.q = this.q;
    this.player._dirty = true;
    S.quatApply(dq, this.pos, this.pos);
    S.normalize(this.pos);
  }

  /**
   * 台風を発生させる。
   * 基準はカメラの現在画角ではなく **プレイ画角（CFG.CAM_PLAY）** に固定する。
   * カメラの都合（イントロの引き画など）で発生距離が変わると、
   * 開始直後に画面外遠くへ湧いてそのまま消える、といった事故が起きる。
   * ルール層がカメラの状態を見ないという層構造（§0.3）にも合う。
   */
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
      }
      return;
    }

    this.elapsed += dt;
    this.movePlayer(dt);
    this.updateWorldPts();

    // 押しのけ（§1.8）
    const pc = this.pos;
    for (const b of this.landBodies) {
      pushBody(b, this.worldPts, pc, this.player.radius, CFG);
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

export { createBody, bodyCenter };
