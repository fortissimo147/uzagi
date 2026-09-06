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

  /**
   * 可視角半径[度]からカメラ距離を決める。縦方向の画角に合わせる。
   *
   * 球の中心を原点、カメラを距離 d に置くと、地表の弧 v の点が視線となす角は
   * atan(sin v / (d - cos v))。これを画角の半分 φ に等しくすると
   *   d = cos v + sin v / tan φ
   * v → 90 度で d → 1/tan φ = 2.41R となり、地平線が画面いっぱいになる。
   * ただしそれだと球が画面をはみ出して「地球儀」に見えないので、
   * 70 度から先はタイトル用の引き（3.2R）へなめらかに繋ぐ。
   */
  distanceFor(visibleDeg) {
    const fov = (this.cam.fov * S.DEG) / 2;
    const at = (deg) => {
      const h = deg * S.DEG;
      return R * (Math.sin(h) / Math.tan(fov) + Math.cos(h));
    };
    const WIDE = 70;
    if (visibleDeg <= WIDE) return at(visibleDeg);
    // タイトルの引き画は「球が画面に丸ごと収まる」ように決める。縦画面では
    // 横のほうが画角が狭いので、狭いほうに合わせないと左右が切れる。
    const hHalf = Math.atan(Math.tan(fov) * (this.cam.aspect || 1));
    const fit = R / Math.sin(Math.min(fov, hHalf) * 0.86);
    const t = Math.min(1, (visibleDeg - WIDE) / (90 - WIDE));
    return at(WIDE) + (fit - at(WIDE)) * t;
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
