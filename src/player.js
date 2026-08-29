// プレイヤーのモデルと操作。
// 走り／段差／3段ジャンプ／幅跳び／壁キック／ヒップドロップを備える。
import * as THREE from "three";
import { moveBody } from "./physics.js";
import { buildHeroine } from "./heroine.js";
import { sfx, cry } from "./audio.js";

const GRAVITY = -34;
const MAX_SPEED = 8.5;
const ACCEL = 60;
const FRICTION = 42;
const AIR_ACCEL = 26;
// 到達高さ＝v²/(2G)。1段=約2.9、2段=約3.9、3段=約5.6ブロック分。
const JUMP1 = 14;
const JUMP2 = 16.2;
const JUMP3 = 19.5;
const SCREAM_SPEED = -28; // これより速く落ちたら悲鳴（3段ジャンプの落ち際は -19.5）

export class Player {
  constructor(world) {
    this.world = world;
    this.radius = 0.55;
    this.height = 1.5;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.ground = null;
    this.wallNormal = new THREE.Vector3();
    this.wallTimer = 0;
    this.hitWall = false;

    this.facing = 0; // モデルの向き（ラジアン）
    this.jumpCombo = 0;
    this.comboTimer = 0;
    this.crouchLatch = false; // 跳ぶ瞬間にしゃがみを押していたか
    this.runSpeed = 0; // しゃがむ直前の走りの速さ（幅跳びの判定に使う）
    this.runSpeedTimer = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.pounding = 0; // 0:なし 1:溜め 2:落下
    this.longJumping = false;
    this.spin = 0;
    this.invuln = 0;
    this.hp = 3;
    this.dead = false;
    this.frozen = 0; // クリア演出などで操作を止める
    this.checkpoint = new THREE.Vector3(0, 0, 0);
    this.animTime = 0;
    this.squash = 1;
    this.stride = 0; // 走りの位相
    this.scream = null; // 落下中の悲鳴（鳴っていれば止められる）
    this.armSwing = [0, 0];
    this.lastStep = -1;
    this.emitDust = false;
    this.idleTimer = 0; // 立ち止まっている時間（たまに鳴くのに使う）
    this.nextIdle = 9 + Math.random() * 8;

    this.object = this._buildModel();
    this.shadow = this._buildShadow();
  }

  _buildModel() {
    const r = buildHeroine();
    this.body = r.body;
    this.face = r.face;
    this.ears = r.ears;
    this.arms = r.arms;
    this.feet = r.feet;
    this.tail = r.tail;
    this.rest = r.rest; // 組み立て時の位置と角度（アニメの基準）
    return r.group;
  }

  _buildShadow() {
    // 動画と同じく、輪郭のはっきりした真っ黒な楕円
    const geo = new THREE.CircleGeometry(0.58, 24);
    geo.scale(1, 0.82, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    return m;
  }

  respawn(at) {
    this.pos.copy(at || this.checkpoint);
    this.pos.y += 0.6;
    this.vel.set(0, 0, 0);
    this.pounding = 0;
    this.longJumping = false;
    this.jumpCombo = 0;
    this.invuln = 1.2;
    this.stopScream();
  }

  // 落下中の悲鳴。鳴り出したら助かる（または落ちきる）まで続く。
  startScream() {
    if (this.scream) return;
    this.scream = cry.fall() || true; // 消音中は null が返るので、二重発声だけ防ぐ
  }

  stopScream() {
    if (this.scream && this.scream.stop) this.scream.stop();
    this.scream = null;
  }

  damage(amount, fromPos) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= amount;
    this.invuln = 1.6;
    this.pounding = 0;
    this.longJumping = false;
    if (fromPos) {
      const away = new THREE.Vector3()
        .subVectors(this.pos, fromPos)
        .setY(0)
        .normalize();
      if (!isFinite(away.x) || away.lengthSq() < 0.01) away.set(0, 0, 1);
      this.vel.x = away.x * 9;
      this.vel.z = away.z * 9;
      this.vel.y = 8;
    }
    sfx.damage();
    cry.hurt();
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  bounce(power = 12) {
    this.vel.y = power;
    this.grounded = false;
    this.pounding = 0;
  }

  update(dt, input, camYaw) {
    if (this.frozen > 0) {
      this.frozen -= dt;
      input = null;
    }
    if (this.invuln > 0) this.invuln -= dt;
    // 連続ジャンプの段数。comboTimer は着地したときだけ立つので、
    // 「タイマーが切れている」だけで段数を捨てると、空中にいるあいだに
    // 毎フレーム0へ戻ってしまい、次に跳んでも永遠に1段目にしかならない。
    // 段数を捨てるのは、地面にいて次の入力を待つ窓が閉じたときだけにする。
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else if (this.grounded) this.jumpCombo = 0;

    // カメラ基準の入力ベクトル
    let mx = 0;
    let mz = 0;
    if (input) {
      // カメラの向き（yaw）を基準に、奥＝カメラから見て前方へ進むようにする
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      mx = input.move.x * cos - input.move.y * sin;
      mz = -input.move.x * sin - input.move.y * cos;
    }
    const inputLen = Math.hypot(mx, mz);
    const crouch = input ? input.crouchHeld : false;
    this.jumpHeldNow = input ? input.jumpHeld : false;
    if (!crouch) this.crouchLatch = false;

    // 幅跳びの判定に使う「しゃがむ直前の走りの速さ」。しゃがむと接地中の速さは
    // 次のフレームには 3.6 まで落ちるので、跳ぶ瞬間の速さで「5より速いか」を
    // 見ると条件を満たせず、走ってしゃがんで跳んでもただのジャンプになる。
    // そこで、しゃがむ直前の速さを 0.35 秒だけ覚えておいてそちらで判定する。
    if (!crouch) {
      this.runSpeed = Math.hypot(this.vel.x, this.vel.z);
      this.runSpeedTimer = 0.35;
    } else if (this.runSpeedTimer > 0) {
      this.runSpeedTimer -= dt;
    } else {
      this.runSpeed = Math.hypot(this.vel.x, this.vel.z);
    }
    const runSpeed = this.runSpeed;

    // --- ヒップドロップ ---
    if (this.pounding === 1) {
      this.vel.set(0, 0, 0);
      this.poundTimer -= dt;
      this.spin += dt * 26;
      if (this.poundTimer <= 0) {
        this.pounding = 2;
        this.vel.y = -34;
      }
    } else if (this.pounding === 2) {
      this.vel.x = this.vel.z = 0;
      this.vel.y = -34;
    } else {
      // --- 通常の移動 ---
      const accel = this.grounded ? ACCEL : AIR_ACCEL;
      const speedCap = this.longJumping ? 17 : crouch && this.grounded ? 3.6 : MAX_SPEED;
      if (inputLen > 0.05 && !(this.longJumping && this.grounded)) {
        this.vel.x += mx * accel * dt;
        this.vel.z += mz * accel * dt;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > speedCap) {
          this.vel.x = (this.vel.x / sp) * speedCap;
          this.vel.z = (this.vel.z / sp) * speedCap;
        }
        this.facing = Math.atan2(mx, mz);
      } else if (this.grounded) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const drop = FRICTION * dt * (this.longJumping ? 0.35 : 1);
        const ns = Math.max(0, sp - drop);
        if (sp > 1e-4) {
          this.vel.x *= ns / sp;
          this.vel.z *= ns / sp;
        }
      }
    }

    // --- ジャンプ関連 ---
    if (this.grounded) {
      this.coyote = 0.1;
      if (this.longJumping && Math.hypot(this.vel.x, this.vel.z) < 6)
        this.longJumping = false;
    } else this.coyote -= dt;

    if (input && input.jumpEdge) this.jumpBuffer = 0.14;
    else this.jumpBuffer -= dt;

    const wantJump = this.jumpBuffer > 0;
    if (wantJump && this.pounding === 0) {
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (this.coyote > 0) {
        this.jumpBuffer = 0;
        this.coyote = 0;
        if (crouch && runSpeed > 5) {
          // 幅跳び
          this.longJumping = true;
          this.vel.y = 10.5;
          const s = speed > 1e-4 ? speed : runSpeed;
          const dirX = this.vel.x / s;
          const dirZ = this.vel.z / s;
          this.vel.x = dirX * 17;
          this.vel.z = dirZ * 17;
          this.jumpCombo = 0;
          sfx.doubleJump();
          cry.hup();
        } else {
          // 3段まで上がったら次は1段目に戻す（3段が延々と続かないように）
          this.jumpCombo =
            this.comboTimer > 0 && this.jumpCombo < 3 ? this.jumpCombo + 1 : 1;
          this.vel.y = [0, JUMP1, JUMP2, JUMP3][this.jumpCombo];
          if (this.jumpCombo === 3) {
            this.spin = 0.001;
            sfx.tripleJump();
            cry.wahoo();
          } else if (this.jumpCombo === 2) {
            sfx.doubleJump();
            cry.ya();
          } else {
            sfx.jump();
            cry.wa();
          }
        }
        this.grounded = false;
        this.squash = 1.35;
        // 跳ぶ瞬間にしゃがみを押しっぱなしだったか。押しっぱなしのまま
        // 跳ぶと、下の判定がその場でヒップドロップに変えてしまうので覚えておく。
        this.crouchLatch = crouch;
      } else if (this.wallTimer > 0 && !this.longJumping) {
        // 壁キック
        this.jumpBuffer = 0;
        this.wallTimer = 0;
        const n = this.wallNormal;
        this.vel.x = n.x * 9.5;
        this.vel.z = n.z * 9.5;
        this.vel.y = 13.5;
        this.facing = Math.atan2(n.x, n.z);
        this.jumpCombo = 1;
        this.spin = 0.001;
        sfx.jump();
        cry.kick();
      }
    }

    // 早離しで低いジャンプ
    if (input && !input.jumpHeld && this.vel.y > 4 && this.pounding === 0)
      this.vel.y -= 26 * dt;

    // 空中でしゃがみ＝ヒップドロップ。ただし跳ぶ前から押しっぱなしのものは数えない
    // （しゃがんだまま跳ぶと、跳んだ端から叩きつけになって跳べなくなるため）。
    if (
      input &&
      crouch &&
      !this.crouchLatch &&
      !this.grounded &&
      this.pounding === 0 &&
      !this.longJumping
    ) {
      this.pounding = 1;
      this.poundTimer = 0.18;
      sfx.pound();
    }

    // --- 重力と衝突 ---
    this.vel.y += GRAVITY * dt;
    if (this.vel.y < -45) this.vel.y = -45;
    const wasAir = !this.grounded;
    const fallSpeed = this.vel.y;
    moveBody(this.world, this, dt);

    // 本気で落ちているときだけ悲鳴を上げる。3段ジャンプの落ち際は -19.5 までしか
    // 出ないので、それより速い SCREAM_SPEED を境にすれば通常のジャンプでは鳴らない。
    // ヒップドロップ（-34）は自分から突っ込んでいるので対象外。
    if (!this.grounded && this.pounding === 0 && this.vel.y < SCREAM_SPEED) this.startScream();
    else if (this.grounded) this.stopScream();

    if (this.grounded && wasAir) {
      if (this.pounding === 2) {
        this.poundLanded = true;
        this.squash = 0.55;
        sfx.pound();
        cry.pound();
      } else if (fallSpeed < -12) {
        this.squash = 0.72;
        sfx.land();
        cry.land();
      }
      this.idleTimer = 0;
      this.pounding = 0;
      this.comboTimer = 0.32; // この間に再ジャンプで連続ジャンプ
      this.spin = 0;
    }

    this._animate(dt);
  }

  _animate(dt) {
    this.animTime += dt;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const run = Math.min(1, speed / MAX_SPEED); // 走りの強さ 0〜1
    this.object.position.copy(this.pos);
    this.squash += (1 - this.squash) * Math.min(1, dt * 9);

    let bob = 0;
    let lean = 0;

    if (this.grounded && speed > 0.4) {
      // 走り：歩幅にあわせて上下し、前へ少し傾ぐ
      this.stride += dt * (4.5 + speed * 1.15);
      const swing = Math.sin(this.stride);
      bob = Math.abs(Math.sin(this.stride)) * 0.09 * run;
      lean = Math.min(0.18, speed * 0.017);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? swing : -swing;
        this.feet[i].position.z = this.rest.feet[i].z + s * 0.14 * run;
        this.feet[i].position.y = this.rest.feet[i].y + Math.max(0, s) * 0.06 * run;
        this.armSwing[i] = -s * run;
      }
      // 足が地面を蹴る瞬間に土ぼこりを出す
      const step = Math.floor(this.stride / Math.PI);
      if (step !== this.lastStep && run > 0.35) {
        this.lastStep = step;
        this.emitDust = true;
      }
      this.idleTimer = 0;
    } else {
      // 立ち止まり：ゆっくり呼吸する
      for (let i = 0; i < 2; i++) {
        this.feet[i].position.z = this.rest.feet[i].z;
        this.feet[i].position.y = this.rest.feet[i].y;
        this.armSwing[i] = Math.sin(this.animTime * 2.1) * 0.10;
      }
      this.stride = 0;
      // 何もせず立っていると、たまに小さく鳴く。間隔をばらけさせないと
      // 機械仕掛けに聞こえるので、次に鳴くまでの時間は毎回引き直す。
      if (this.grounded && this.frozen <= 0 && !this.dead) {
        this.idleTimer += dt;
        if (this.idleTimer >= this.nextIdle) {
          cry.idle();
          this.idleTimer = 0;
          this.nextIdle = 9 + Math.random() * 8;
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const a = this.rest.arms[i];
      this.arms[i].position.y = a.y - this.armSwing[i] * 0.05;
      this.arms[i].rotation.z = a.rz + this.armSwing[i] * 0.26;
    }

    // 潰し・伸ばしは体まるごとにかける（足の裏を軸に縦横を逆比で）。
    // 頭・胴・耳がばらけず、当時のゲームらしい伸び縮みになる。
    let stretch;
    if (this.grounded) {
      stretch = this.squash;
    } else {
      stretch = 1 + THREE.MathUtils.clamp(this.vel.y * 0.013, -0.14, 0.17);
      for (let i = 0; i < 2; i++)
        this.feet[i].position.y = this.rest.feet[i].y + 0.045;
    }

    this.object.position.y += bob;
    this.object.rotation.x = lean;
    this.object.scale.set(1 / stretch, stretch, 1 / stretch);
    this.object.rotation.y = this.facing + (this.spin > 0 ? (this.spin += dt * 18) : 0);
    if (this.pounding === 1) this.object.rotation.y = this.spin;

    // 耳：ふだんはゆらゆら、ジャンプ中は速度と逆向きに靡く
    const sway = Math.sin(this.animTime * 3.4) * 0.05;
    const trail = THREE.MathUtils.clamp(-this.vel.y * 0.026, -0.55, 0.45);
    const flick = this.grounded ? Math.sin(this.stride * 2) * 0.09 * run : 0;
    for (let i = 0; i < 2; i++) {
      const rest = this.rest.ears[i];
      const t = i === 0 ? 1 : -1;
      this.ears[i].rotation.x = rest.rx + trail + flick + sway * 0.5;
      this.ears[i].rotation.z = rest.rz + (sway + Math.sin(this.animTime * 2.7) * 0.03) * t;
    }

    // 無敵中は点滅
    this.object.visible = this.invuln <= 0 || Math.floor(this.animTime * 18) % 2 === 0;

    // 影
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.2, this.radius * 0.5);
    if (isFinite(g.y)) {
      this.shadow.visible = true;
      this.shadow.position.set(this.pos.x, g.y + 0.03, this.pos.z);
      const d = THREE.MathUtils.clamp(this.pos.y - g.y, 0, 12);
      const k = 1 - d / 16;
      this.shadow.scale.setScalar(Math.max(0.35, k));
      this.shadow.material.opacity = 0.66 * Math.max(0.3, k);
    } else this.shadow.visible = false;
  }
}
