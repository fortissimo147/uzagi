// ゲーム本体。状態管理・毎フレームの更新・描画。
import * as THREE from "three";
import { World } from "./physics.js";
import { buildLevel, stageInfo } from "./level.js";
import { Player } from "./player.js";
import { FollowCamera } from "./camera.js";
import { Input } from "./input.js";
import { Hud } from "./hud.js";
import {
  sfx,
  cry,
  bgm,
  setMuted,
  isMuted,
  unlockAudio,
  duckBgm,
  loadedVoices,
} from "./audio.js";
import "./style.css";

const app = document.getElementById("app");
const canvas = document.createElement("canvas");
canvas.id = "view";
app.appendChild(canvas);
const uiRoot = document.createElement("div");
uiRoot.id = "ui";
app.appendChild(uiRoot);

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    // 解像度を落としてニアレスト拡大＝当時の3Dらしいざらつきを出す
    this.renderScale = 0.72;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.hud = new Hud(uiRoot);
    this.input = new Input(canvas, uiRoot);

    this.state = "title";
    this.time = 0;
    this.score = 0;
    this.coins = 0;
    this.pastCoins = 0;    // 前の面までに取ったコイン
    this.pastCoinsMax = 0; // 前の面までに置いてあったコイン
    this.particles = [];

    this.buildStage();
    this.hud.show("title");
    this.hud.setMuted(isMuted());

    this.hud.on("#btnStart", () => this.startRun());
    // 自動再生の制限があるので、最初のクリック／キー操作で音を解錠する
    const wake = () => {
      unlockAudio();
      if (this.state === "title") bgm.play("title");
    };
    addEventListener("pointerdown", wake);
    addEventListener("keydown", wake);
    this.hud.on("#btnResume", () => this.setPaused(false));
    this.hud.on("#btnRestart", () => this.startRun());
    this.hud.on("#btnRetry", () => this.startRun());
    this.hud.on("#btnAgain", () => this.startRun());
    this.hud.on("#btnNext", () => this.nextStage());

    addEventListener("resize", () => this.resize());
    this.resize();

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- ステージの生成・破棄 ----------
  // 空の色・光・背景はステージごとに違うので level.js が持っている。
  buildStage(stageIndex = 0) {
    const scene = new THREE.Scene();
    const world = new World();
    const level = buildLevel(scene, world, stageIndex);
    const player = new Player(world);
    player.pos.copy(level.spawn);
    player.checkpoint.copy(level.spawn);
    scene.add(player.object, player.shadow);
    for (const e of level.enemies) scene.add(e.object);

    this.scene = scene;
    this.world = world;
    this.level = level;
    this.player = player;
    this.camera3 = new FollowCamera(this.camera, world);
    this.camera3.reset(player);
    this.particleGroup = new THREE.Group();
    scene.add(this.particleGroup);
    this.particles = [];
    this.stageIndex = level.stageIndex;
    this.areaName = level.stage.startArea;

    this.hud.setHp(player.hp);
    this.hud.setCoins(0, level.totalCoins);
    this.hud.setArea(this.areaName);
    this.hud.setStage(level.stageIndex + 1, level.stageCount, level.stage.name);
    this.hud.setTime(this.time);
  }

  disposeStage() {
    this.scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
  }

  // 最初から。ステージ1に戻し、通しの記録も0に戻す。
  startRun() {
    this.time = 0;
    this.score = 0;
    this.pastCoins = 0;
    this.pastCoinsMax = 0;
    this.enterStage(0);
  }

  // クリアして次の面へ。コイン・得点・時間は通しで持ち越し、ライフだけ満タンに戻す。
  nextStage() {
    this.pastCoins += this.coins;
    this.pastCoinsMax += this.level.totalCoins;
    this.enterStage(this.stageIndex + 1);
  }

  enterStage(index) {
    this.player?.stopScream();
    this.disposeStage();
    this.buildStage(index);
    this.state = "play";
    this.coins = 0;
    this.clearTimer = 0;
    this.clearShown = false;
    this.pendingNext = false;
    this.hud.hideAll();
    this.hud.toast(`Stage ${index + 1}: ${this.level.stage.name}`, 2200);
    unlockAudio();
    bgm.play("stage");
  }

  setPaused(p) {
    if (this.state === "play" && p) {
      this.state = "pause";
      this.player.stopScream();
      this.hud.show("pause");
      duckBgm(true);
    } else if (this.state === "pause" && !p) {
      this.state = "play";
      this.hud.hideAll();
      duckBgm(false);
    }
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(
      Math.floor(w * this.renderScale),
      Math.floor(h * this.renderScale),
      false
    );
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 演出 ----------
  burst(pos, color, n = 10) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.position.y += 0.5;
      this.particleGroup.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          2 + Math.random() * 6,
          (Math.random() - 0.5) * 6
        ),
        life: 0.7,
      });
    }
  }

  // 走っているときに足元から出る土ぼこり。動画と同じく、平たい白い粒が
  // 後ろへ流れて、すぐ薄くなって消える。
  dust(pos, dir) {
    if (!this.dustGeo) {
      this.dustGeo = new THREE.PlaneGeometry(0.28, 0.28);
      this.dustMat = new THREE.MeshBasicMaterial({
        color: 0xfff6dc,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      m.position.set(pos.x, pos.y + 0.12, pos.z);
      m.rotation.z = Math.random() * Math.PI;
      this.particleGroup.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          -dir.x * (1.4 + Math.random()) + (Math.random() - 0.5) * 1.4,
          1.1 + Math.random() * 1.1,
          -dir.z * (1.4 + Math.random()) + (Math.random() - 0.5) * 1.4
        ),
        life: 0.32,
        maxLife: 0.32,
        gravity: 4,
        grow: 2.2,
      });
    }
  }

  addScore(n) {
    this.score += n;
  }

  removeEnemy(e) {
    this.scene.remove(e.object);
    const i = this.level.enemies.indexOf(e);
    if (i >= 0) this.level.enemies.splice(i, 1);
  }

  // ---------- 毎フレーム ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // タブ復帰時などの巨大なdtを抑える
    this.fps = Math.round(this.fps ? this.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1 : 1 / dt);

    this.input.update();
    if (this.input.hit("p")) this.setPaused(this.state === "play");
    if (this.input.hit("m")) {
      setMuted(!isMuted());
      this.hud.setMuted(isMuted());
    }
    if (this.state === "title" && (this.input.jumpEdge || this.input.hit("enter")))
      this.startRun();
    if (this.state === "clear" && this.pendingNext && (this.input.jumpEdge || this.input.hit("enter")))
      this.nextStage();
    else if ((this.state === "over" || this.state === "clear") && this.input.hit("r"))
      this.startRun();

    if (this.state === "play" || this.state === "clear") this.update(dt);
    else if (this.state === "title") this.updateIdle(dt);

    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updateIdle(dt) {
    // タイトル中はステージをゆっくり見回す
    this.camera3.yaw += dt * 0.15;
    this.camera3.update(dt, this.player, null);
    this.spinItems(dt);
  }

  update(dt) {
    const p = this.player;

    if (this.state === "play") {
      this.time += dt;
      this.hud.setTime(this.time);
      p.update(dt, this.input, this.camera3.yaw);
    } else {
      // クリア演出：土管に吸い込まれる
      this.clearTimer += dt;
      p.object.position.y -= dt * 1.6;
      const s = Math.max(0.01, 1 - this.clearTimer * 0.9);
      p.object.scale.setScalar(s);
      p.shadow.visible = false;
      if (this.clearTimer > 1.3 && !this.clearShown) {
        this.clearShown = true;
        const bonus = Math.max(0, 6000 - Math.floor(this.time * 20));
        this.score += bonus + this.coins * 100;
        if (this.stageIndex < this.level.stageCount - 1) {
          // まだ先がある。次の面の入口を出す。
          this.pendingNext = true;
          this.hud.setStageResult(
            this.stageIndex + 1,
            this.level.stage.name,
            this.coins,
            this.level.totalCoins,
            this.score,
            stageInfo(this.stageIndex + 1).name
          );
          this.hud.show("stage");
        } else {
          this.hud.setResult(
            "#clearStat",
            this.pastCoins + this.coins,
            this.pastCoinsMax + this.level.totalCoins,
            this.time,
            this.score
          );
          this.hud.show("clear");
        }
      }
    }

    for (const m of this.level.movers) m.update(dt);
    for (const e of [...this.level.enemies]) e.update(dt, p, this);
    this.spinItems(dt);

    if (this.state !== "play") {
      this.camera3.update(dt, p, null);
      return;
    }

    // 走ったときの土ぼこり
    if (p.emitDust) {
      p.emitDust = false;
      const sp = Math.hypot(p.vel.x, p.vel.z) || 1;
      this.dust(p.pos, { x: p.vel.x / sp, z: p.vel.z / sp });
    }

    this.collectItems();
    this.checkCheckpoints();

    // ヒップドロップの衝撃波
    if (p.poundLanded) {
      p.poundLanded = false;
      this.camera3.shake = 0.35;
      this.burst(p.pos, 0xffe9a8, 14);
      for (const e of [...this.level.enemies]) {
        if (e.kill && !e.dead && e.pos && e.pos.distanceTo(p.pos) < 4.5) {
          e.kill(this);
          this.addScore(200);
        }
      }
    }

    // 落下
    if (p.pos.y < this.world.killY && !p.dead) {
      p.stopScream();
      sfx.fall();
      p.hp -= 1;
      if (p.hp <= 0) p.dead = true;
      else p.respawn(p.checkpoint);
      this.camera3.reset(p);
    }

    this.hud.setHp(Math.max(0, p.hp));

    if (p.dead) {
      this.state = "over";
      p.stopScream();
      cry.dead();
      bgm.play("over");
      this.hud.setResult(
        "#overStat",
        this.pastCoins + this.coins,
        this.pastCoinsMax + this.level.totalCoins,
        this.time,
        this.score + this.coins * 100
      );
      this.hud.show("over");
      return;
    }

    // ゴール判定。土管の上に乗れたらクリアでいい。
    //
    // 土管の当たり判定は四角（±1.7）なのに、ここを中心からの距離 1.9 で
    // 見ていたので、角のほうに乗ると（中心から最大 2.4 離れる）足は着いて
    // いるのにクリアにならなかった。乗っている床が土管かどうかを直接見て、
    // そのうえで「ふちに触れている」場合も拾うようにする。
    const g = this.level.goal;
    const onPipe = p.grounded && p.ground?.tag === "pipe";
    const nearPipe =
      Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z) < 2.7 &&
      Math.abs(p.pos.y - g.pos.y) < 1.8;
    if (onPipe || nearPipe) {
      this.state = "clear";
      this.clearTimer = 0;
      this.clearShown = false;
      p.frozen = 99;
      p.vel.set(0, 0, 0);
      sfx.pipe();
      cry.cheer();
      bgm.stop();
      setTimeout(() => bgm.play("clear"), 420);
    }

    this.camera3.update(dt, p, this.input);
  }

  spinItems(dt) {
    const t = performance.now() / 1000;
    for (const c of this.level.coins) {
      if (c.taken) continue;
      c.mesh.rotation.z += dt * 3.4;
      c.mesh.position.y += Math.sin(t * 2.4 + c.phase) * dt * 0.35;
    }
    for (const h of this.level.hearts) {
      if (h.taken) continue;
      h.object.rotation.y += dt * 1.6;
      h.object.position.y += Math.sin(t * 2) * dt * 0.3;
    }
  }

  collectItems() {
    const p = this.player;
    const px = p.pos.x;
    const pz = p.pos.z;
    for (const c of this.level.coins) {
      if (c.taken) continue;
      if (
        Math.hypot(px - c.pos.x, pz - c.pos.z) < 1.15 &&
        Math.abs(c.pos.y - (p.pos.y + 0.8)) < 1.5
      ) {
        c.taken = true;
        c.mesh.visible = false;
        this.coins++;
        this.addScore(100);
        this.hud.setCoins(this.coins, this.level.totalCoins);
        sfx.coin();
        this.burst(c.pos, 0xffd23f, 6);
      }
    }
    for (const h of this.level.hearts) {
      if (h.taken) continue;
      if (
        Math.hypot(px - h.pos.x, pz - h.pos.z) < 1.3 &&
        Math.abs(h.pos.y - (p.pos.y + 0.8)) < 1.7
      ) {
        h.taken = true;
        h.object.visible = false;
        p.hp = Math.min(3, p.hp + 1);
        sfx.heart();
        cry.heal();
        this.hud.toast("Life restored!");
        this.burst(h.pos, 0xff5a7a, 8);
      }
    }
  }

  checkCheckpoints() {
    const p = this.player;
    for (const cp of this.level.checkpoints) {
      if (cp.active) continue;
      if (
        Math.hypot(p.pos.x - cp.pos.x, p.pos.z - cp.pos.z) < 2.2 &&
        Math.abs(p.pos.y - cp.pos.y) < 2.5
      ) {
        cp.active = true;
        cp.flag.material.color.set(0xff4d4d);
        p.checkpoint.copy(cp.pos);
        this.areaName = cp.label;
        this.hud.setArea(cp.label);
        this.hud.toast(`Checkpoint: ${cp.label}`);
        sfx.checkpoint();
        this.addScore(300);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.vel.y -= (pt.gravity ?? 26) * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      if (pt.grow) {
        // 土ぼこり：ふくらみながら消える。板はいつもカメラを向かせる。
        const t = 1 - pt.life / pt.maxLife;
        pt.mesh.scale.setScalar(0.5 + t * pt.grow);
        pt.mesh.material.opacity = 0.85 * (1 - t) ** 1.4;
        pt.mesh.quaternion.copy(this.camera.quaternion);
      } else {
        pt.mesh.rotation.x += dt * 8;
        pt.mesh.rotation.y += dt * 6;
      }
      if (pt.life <= 0) {
        this.particleGroup.remove(pt.mesh);
        if (pt.grow) pt.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}

const game = new Game();
// 動作確認用のフック（ブラウザのコンソールから状態を覗ける）
window.__game = game;
// いまどの叫びが録音で鳴るか。読み込みは非同期なので、最初の操作の少しあとに見る。
window.__voices = loadedVoices;
