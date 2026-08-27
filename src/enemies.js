// 敵とギミック。踏める敵（ノコノコ風の歩行敵）、火柱、トゲ鉄球。
import * as THREE from "three";
import { flat } from "./textures.js";
import { sfx, cry } from "./audio.js";

export class Walker {
  constructor(world, a, b, opts = {}) {
    this.world = world;
    this.a = a.clone();
    this.b = b.clone();
    this.pos = a.clone();
    this.speed = opts.speed ?? 2.4;
    this.radius = 0.6;
    this.dead = false;
    this.deadTimer = 0;
    this.t = 0;
    this.dir = 1;
    this.chaseRange = opts.chaseRange ?? 7;
    this.object = this._build(opts.color ?? 0x8a4b22);
    this.object.position.copy(this.pos);
  }

  _build(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), flat(color));
    body.scale.set(1.05, 0.8, 1);
    body.position.y = 0.5;
    g.add(body);
    this.body = body;

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.66, 0.12, 14),
      flat(0x5d3113)
    );
    brim.position.y = 0.24;
    g.add(brim);

    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), flat(0xffffff));
      eye.position.set(0.2 * s, 0.62, 0.48);
      eye.scale.set(1, 1.25, 1);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), flat(0x1a1410));
      pupil.position.set(0.21 * s, 0.6, 0.58);
      g.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), flat(0x3b2410));
      brow.position.set(0.2 * s, 0.78, 0.5);
      brow.rotation.z = -0.4 * s;
      g.add(brow);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), flat(0x4d2a10));
      foot.scale.set(1, 0.55, 1.4);
      foot.position.set(0.24 * s, 0.1, 0.05);
      g.add(foot);
    }
    return g;
  }

  update(dt, player, game) {
    if (this.dead) {
      this.deadTimer -= dt;
      this.object.scale.y = Math.max(0.05, this.deadTimer * 3);
      this.object.position.y -= dt * 0.4;
      if (this.deadTimer <= 0) game.removeEnemy(this);
      return;
    }
    this.t += dt;

    const toPlayer = new THREE.Vector3().subVectors(player.pos, this.pos);
    const flatDist = Math.hypot(toPlayer.x, toPlayer.z);
    const chasing =
      flatDist < this.chaseRange && Math.abs(toPlayer.y) < 3.5 && !player.dead;

    let vx;
    let vz;
    if (chasing) {
      vx = (toPlayer.x / flatDist) * this.speed * 1.35;
      vz = (toPlayer.z / flatDist) * this.speed * 1.35;
    } else {
      const target = this.dir > 0 ? this.b : this.a;
      const d = new THREE.Vector3().subVectors(target, this.pos);
      d.y = 0;
      if (d.length() < 0.5) this.dir *= -1;
      d.normalize();
      vx = d.x * this.speed;
      vz = d.z * this.speed;
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    // 足元の床に貼り付く（崖の外に出たら引き返す）
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.2, 0.3);
    if (isFinite(g.y) && Math.abs(g.y - this.pos.y) < 2.5) this.pos.y = g.y;
    else {
      this.pos.x -= vx * dt;
      this.pos.z -= vz * dt;
      this.dir *= -1;
    }

    this.object.position.copy(this.pos);
    this.object.position.y += Math.abs(Math.sin(this.t * 7)) * 0.09;
    this.object.rotation.y = Math.atan2(vx, vz);
    this.body.scale.set(1.05, 0.8 + Math.sin(this.t * 7) * 0.06, 1);

    this._collide(player, game);
  }

  _collide(player, game) {
    if (player.dead) return;
    const d = new THREE.Vector3().subVectors(player.pos, this.pos);
    const flatDist = Math.hypot(d.x, d.z);
    if (flatDist > this.radius + player.radius) return;
    if (player.pos.y > this.pos.y + 0.55 && player.vel.y < 0) {
      this.kill(game);
      player.bounce(player.jumpHeldNow ? 15 : 12);
      game.addScore(200);
    } else if (d.y > -1.4 && d.y < 1.5) {
      player.damage(1, this.pos);
    }
  }

  kill(game) {
    if (this.dead) return;
    this.dead = true;
    this.deadTimer = 0.3;
    this.object.scale.set(1.3, 0.2, 1.3);
    sfx.stomp();
    cry.stomp();
    game.burst(this.object.position, 0x8a4b22);
  }
}

export class FireJet {
  constructor(pos, opts = {}) {
    this.pos = pos.clone();
    this.height = opts.height ?? 5;
    this.period = opts.period ?? 3;
    this.onTime = opts.onTime ?? 1.3;
    this.t = opts.offset ?? 0;
    this.radius = opts.radius ?? 1.5;
    this.object = this._build();
    this.object.position.copy(this.pos);
    this.active = false;
  }

  _build() {
    const g = new THREE.Group();
    const vent = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.35, 10),
      flat(0x53534f)
    );
    vent.position.y = 0.17;
    g.add(vent);

    this.flames = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(1.05 - i * 0.16, 2.4, 9, 1, true),
        new THREE.MeshBasicMaterial({
          color: [0xff4a1e, 0xff7a1e, 0xffb033, 0xffe089][i],
          transparent: true,
          opacity: 0.62 - i * 0.06,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      m.position.y = 1.4 + i * 0.9;
      g.add(m);
      this.flames.push(m);
    }
    return g;
  }

  update(dt, player, game) {
    this.t = (this.t + dt) % this.period;
    const phase = this.t / this.onTime;
    this.active = this.t < this.onTime;
    const grow = this.active
      ? Math.min(1, phase * 3) * (1 - Math.max(0, phase - 0.75) * 2.5)
      : 0;
    const k = Math.max(0, grow);
    this.flames.forEach((f, i) => {
      f.visible = k > 0.02;
      f.scale.set(k, k * (this.height / 6) * 1.5, k);
      f.position.y = (1.2 + i * 0.85) * k * (this.height / 5);
      f.rotation.y += dt * (2 + i);
    });

    if (k > 0.25 && !player.dead) {
      const dx = player.pos.x - this.pos.x;
      const dz = player.pos.z - this.pos.z;
      const dy = player.pos.y - this.pos.y;
      if (
        Math.hypot(dx, dz) < this.radius + player.radius &&
        dy > -1 &&
        dy < this.height * k
      ) {
        if (player.damage(1, this.pos)) game.camera.shake = 0.25;
      }
    }
  }
}

export class SpikeBall {
  constructor(world, from, to, opts = {}) {
    this.world = world;
    this.from = from.clone();
    this.to = to.clone();
    this.speed = opts.speed ?? 6;
    this.radius = 0.85;
    this.pos = from.clone();
    this.t = opts.offset ?? 0;
    this.object = this._build();
  }

  _build() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 14, 10),
      flat(0x4c4c52)
    );
    g.add(ball);
    this.ball = ball;
    const spikeGeo = new THREE.ConeGeometry(0.2, 0.45, 6);
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [x, y, z] of dirs) {
      const s = new THREE.Mesh(spikeGeo, flat(0x6f6f77));
      s.position.set(x, y, z).multiplyScalar(this.radius * 0.95);
      s.lookAt(new THREE.Vector3(x, y, z).multiplyScalar(3));
      s.rotateX(Math.PI / 2);
      ball.add(s);
    }
    return g;
  }

  update(dt, player, game) {
    const total = this.from.distanceTo(this.to) / this.speed;
    this.t = (this.t + dt) % (total + 1.2);
    const k = THREE.MathUtils.clamp(this.t / total, 0, 1);
    this.pos.lerpVectors(this.from, this.to, k);
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 2, 0.3);
    if (isFinite(g.y)) this.pos.y = Math.max(this.pos.y, g.y + this.radius);
    this.object.position.copy(this.pos);
    const travel = this.from.distanceTo(this.to) * k;
    this.ball.rotation.x = travel / this.radius;

    if (!player.dead) {
      const d = this.pos.distanceTo(
        new THREE.Vector3(player.pos.x, player.pos.y + 0.7, player.pos.z)
      );
      if (d < this.radius + player.radius) {
        if (player.damage(1, this.pos)) game.camera.shake = 0.3;
      }
    }
  }
}
