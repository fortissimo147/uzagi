// 三人称追従カメラ。プレイヤーの少し後ろ上から見下ろし、壁に埋まる時は手前に寄る。
import * as THREE from "three";

export class FollowCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = Math.PI; // 0 で -Z を向く。初期は +Z（塔の進行方向）を背にする
    this.pitch = 0.22;
    this.distance = 9.5;
    this.current = new THREE.Vector3(0, 5, -10);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
  }

  // 復帰時などに即座に定位置へ。旋回角は保つ（プレイヤーの向き感覚を崩さない）。
  reset(player) {
    const target = this._desired(player);
    this.current.copy(target);
    this.camera.position.copy(target);
    this.lookAt.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    this.camera.lookAt(this.lookAt);
  }

  _desired(player) {
    const d = this.distance;
    const h = 3.2 + Math.sin(this.pitch) * 6;
    return new THREE.Vector3(
      player.pos.x + Math.sin(this.yaw) * d * Math.cos(this.pitch),
      player.pos.y + h,
      player.pos.z + Math.cos(this.yaw) * d * Math.cos(this.pitch)
    );
  }

  update(dt, player, input) {
    if (input) {
      this.yaw -= input.camDelta.x;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.camDelta.y, -0.25, 0.85);
    }

    const want = this._desired(player);

    // 地形にめり込むならプレイヤー側へ寄せる
    const focus = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const dir = new THREE.Vector3().subVectors(want, focus);
    const maxLen = dir.length();
    dir.normalize();
    let len = maxLen;
    const step = 0.4;
    // 障害物の手前で止める（めり込まないよう、必ず1歩手前に置く）
    for (let t = 2.8; t < maxLen; t += step) {
      const p = focus.clone().addScaledVector(dir, t);
      if (this._inside(p)) {
        len = Math.max(2.8, t - step);
        break;
      }
    }
    want.copy(focus).addScaledVector(dir, len);

    const k = 1 - Math.pow(0.0018, dt);
    this.current.lerp(want, k);
    this.camera.position.copy(this.current);

    if (this.shake > 0) {
      this.shake -= dt;
      const s = Math.max(0, this.shake) * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.lookAt.lerp(
      new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z),
      1 - Math.pow(0.0005, dt)
    );
    this.camera.lookAt(this.lookAt);
  }

  _inside(p) {
    for (const c of this.world.colliders) {
      if (
        p.x > c.min.x - 0.3 &&
        p.x < c.max.x + 0.3 &&
        p.z > c.min.z - 0.3 &&
        p.z < c.max.z + 0.3 &&
        p.y > c.min.y - 0.3 &&
        p.y < c.topAt(p.x, p.z) + 0.3
      )
        return true;
    }
    return false;
  }
}
