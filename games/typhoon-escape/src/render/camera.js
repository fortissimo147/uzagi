// 追従カメラ。DESIGN.md §5。
// 「動く時に適宜画面を動かす」要件の実装。北を上に固定し、ロールを入れない。
import * as THREE from "three";
import * as S from "../world/sphere.js";
import { R } from "./globe.js";

const V = new THREE.Vector3();
const M = new THREE.Matrix4();

export class FollowCamera {
  constructor(camera, cfg) {
    this.cam = camera;
    this.cfg = cfg;
    this.q = new THREE.Quaternion();
    this.target = new THREE.Quaternion();
    this.visible = cfg.CAM_PLAY; // 可視角半径[度]
    this.visibleTarget = cfg.CAM_PLAY;
    this.prevNorth = [0, 1, 0];
    this.aspect = 1;
  }

  /** 縦の画角の半分[rad]。 */
  get fovV() {
    return (this.cam.fov * S.DEG) / 2;
  }
  /** 横の画角の半分[rad]。縦長の画面ではこちらのほうが狭い。 */
  get fovH() {
    return Math.atan(Math.tan(this.fovV) * (this.cam.aspect || 1));
  }

  /** 弧 arcDeg を画角の半分 half に収めるカメラ距離。d = cos ρ + sin ρ / tan(half)。 */
  static fit(arcDeg, half) {
    const h = arcDeg * S.DEG;
    return R * (Math.sin(h) / Math.tan(half) + Math.cos(h));
  }

  /**
   * 距離 d のとき、画角の半分 half の方向に見える地表の弧[度]。
   * sin(ρ + half) = d·sin(half) を解く。地平線に届く場合は acos(1/d) で頭打ち。
   */
  static arcAt(d, half) {
    const s = (d / R) * Math.sin(half);
    return (s <= 1 ? Math.asin(s) - half : Math.acos(R / d)) / S.DEG;
  }

  /**
   * 可視角半径[度]からカメラ距離を決める。
   *
   * **縦だけに合わせてはいけない。** 縦長の画面では横の画角のほうが狭く、
   * 元ゲームの窓（400:700）より横が狭くなる。実測で iPhone 相当の 390x844 では
   * 横幅が 924 km となり、元の 1179 km より 22% 狭かった。
   * 縦と横の両方で必要な距離を出し、**遠いほう**を採る。
   *
   * 70 度から先はタイトル用の引き（球が丸ごと収まる距離）へなめらかに繋ぐ。
   */
  distanceFor(visibleDeg) {
    const WIDE = 70;
    const at = (v) => Math.max(FollowCamera.fit(v, this.fovV), FollowCamera.fit(v * this.cfg.WINDOW_ASPECT, this.fovH));
    if (visibleDeg <= WIDE) return at(visibleDeg);
    const fit = R / Math.sin(Math.min(this.fovV, this.fovH) * 0.86);
    const t = Math.min(1, (visibleDeg - WIDE) / (90 - WIDE));
    return at(WIDE) + (fit - at(WIDE)) * t;
  }

  /**
   * 通常プレイ時に実際に見えている地表の角半径[度]（画面の隅まで）。
   * 台風の発生・消滅の基準に使う。カメラの瞬間値ではなく **PLAY 段の値**を使うので、
   * イントロの引き画に引きずられない。画面の形で変わるが、
   * 難度そのもの（速度・半径・発生間隔）は変わらない。
   */
  get playArc() {
    const d = this.distanceFor(this.cfg.CAM_PLAY);
    const corner = Math.atan(Math.hypot(Math.tan(this.fovV), Math.tan(this.fovH)));
    // 横長の画面では隅が地平線近くまで届き、発生距離が伸びて**難度が画面の形で変わって
    // しまう**（横向き 844x390 で隅 ±47.6°）。ゲーム側の基準は上限で頭打ちにする。
    // 縦画面では頭打ちに掛からないので、素直に「画面のすぐ外から湧く」ままになる。
    return Math.min(FollowCamera.arcAt(d, corner), this.cfg.CAM_PLAY * 1.6);
  }

  /**
   * @param {number[]} pos  プレイヤー位置（単位ベクトル）
   * @param {number}   want 望ましい可視角半径[度]
   */
  update(pos, want, dt, snap = false) {
    const { east, north } = S.tangentBasis(pos, this.prevNorth);
    this.prevNorth = north;

    // 右手系 (east, north, up=pos) から目標姿勢を作る。up は常に地表法線＝ロールなし。
    M.makeBasis(V.set(east[0], east[1], east[2]), V.clone().set(north[0], north[1], north[2]), V.clone().set(pos[0], pos[1], pos[2]));
    this.target.setFromRotationMatrix(M);

    // ここでの上限は WORLD（地球全体）。「プレイ中は PLAY より広げない」という
    // 難度側の制約は呼び出し側で掛ける。ここで PLAY に丸めると、
    // タイトルとイントロで地球全体を見せられなくなる。
    this.visibleTarget = Math.max(this.cfg.CAM_FLOOR, Math.min(this.cfg.CAM_WORLD, want));
    if (snap) {
      this.q.copy(this.target);
      this.visible = this.visibleTarget;
    } else {
      // フレームレート非依存の追従。lerp(a,b,k*dt) は可変 fps で挙動が変わる。
      const k = 1 - Math.exp(-this.cfg.CAM_SMOOTH * dt);
      this.q.slerp(this.target, k);
      this.visible += (this.visibleTarget - this.visible) * k;
    }

    const d = this.distanceFor(this.visible);
    this.cam.quaternion.copy(this.q);
    this.cam.position.set(0, 0, 0).applyQuaternion(this.q);
    // 姿勢の第 3 軸（up）方向へ d だけ引く
    V.set(0, 0, 1).applyQuaternion(this.q).multiplyScalar(d);
    this.cam.position.copy(V);
    this.cam.near = Math.max(0.001, d - R * 1.2);
    this.cam.far = d + R * 1.2;
    this.cam.updateProjectionMatrix();
  }

  /**
   * 自動フレーミング（§5.2）。
   * 「最も危険な台風」＝ (角距離 - 致死半径) / 速度 が最小の個体を選び、
   * それとプレイヤーの両方が入る最小の画角を返す。
   */
  frameFor(pos, storms, cfg, tsp) {
    let best = null;
    let bestT = Infinity;
    for (const st of storms) {
      const d = S.angleDeg(pos, st.p);
      const v = Math.max(1e-6, st.stalled ? tsp * cfg.STALL_FACTOR : tsp * st.spd);
      const t = (d - st.r * cfg.LETHAL) / v;
      if (t < bestT) {
        bestT = t;
        best = { d, r: st.r };
      }
    }
    if (!best) return cfg.CAM_PLAY;
    return best.d + best.r + cfg.BODY_DEG * 1.5;
  }
}
