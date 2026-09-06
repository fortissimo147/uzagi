// 起動と状態遷移。DESIGN.md §8。
import * as THREE from "three";
import "./style.css";
import { loadLandBodies, loadPlayerRing } from "./world/geo.js";
import { createBody } from "./world/body.js";
import * as S from "./world/sphere.js";
import { buildGlobe } from "./render/globe.js";
import { buildStormView } from "./render/stormview.js";
import { FollowCamera } from "./render/camera.js";
import { Input } from "./render/input.js";
import { Hud } from "./render/hud.js";
import { Game, shareText } from "./rules/game.js";
import { CFG, COLORS } from "./rules/config.js";
import { LANGS, LANG_KEY, bundle, pickLang } from "./rules/i18n.js";

/**
 * シェア文に載せる URL。
 * ビルド時に決め打ちせず、**実際に開かれている URL から取る**。
 * Cloudflare Pages のプレビュー URL でも独自ドメインでも、置いた場所がそのまま入る。
 * （`vite.config.js` の `base: "./"` によりサブディレクトリ配信でも壊れない。）
 */
function shareUrl() {
  try {
    const u = new URL(window.location.href);
    u.hash = "";
    u.search = "";
    return u.href.replace(/index\.html$/, "");
  } catch {
    return window.location.href;
  }
}

/** 言語の保存。プライベートブラウズなどで localStorage が無い環境でも落ちない。 */
function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) || "";
  } catch {
    return "";
  }
}
function writeLang(code) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* 保存できないだけ。次回は既定に戻る */
  }
}

class App {
  constructor() {
    this.app = document.getElementById("app");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(COLORS.space, 1);
    this.app.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.follow = new FollowCamera(this.camera, CFG);

    this.cfg = CFG; // テストから難度をいじれるようにしておく
    this.shareUrl = shareUrl;
    this.shareText = () => shareText(this.game, shareUrl());
    // 言語（§7.2）。保存値 → ブラウザの言語 → 英語 の順に決める。
    this.lang = pickLang(readLang(), navigator.languages || [navigator.language || ""]);
    this.L = bundle(this.lang);
    document.documentElement.lang = this.L.htmlLang;
    this.hud = new Hud(document, { strings: this.L, langs: LANGS, lang: this.lang });
    this.hud.onLang = (code) => this.setLang(code);
    this.input = new Input(this.app, document.getElementById("pad"), document.getElementById("knob"));

    const polygons = loadLandBodies();
    const bodies = polygons.map((p) => createBody(p.rings));
    const playerRing = loadPlayerRing();

    this.globe = buildGlobe(this.scene, { polygons, bodies, playerRing, colors: COLORS });
    this.stormView = buildStormView(this.scene, COLORS);

    this.game = new Game({
      playerRing,
      landBodies: bodies,
      onNews: (msg, kind) => this.hud.news(msg, kind),
      lang: this.lang,
    });

    window.addEventListener("resize", () => this.resize());
    this.resize();

    this.hud.pbtn.onclick = () => this.start();
    this.hud.share.onclick = () => this.share();
    this.hud.showTitle();
    document.getElementById("loading").hidden = true;

    this.last = 0;
    this.cpuMs = 0;
    this.state = "title";
    this.follow.update(this.game.pos, CFG.CAM_WORLD, 0, true);
    this.introT = 0;
    this.snapCam = false;
    requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * 言語を切り替える（§7.2）。
   * 日付や上陸文はゲームの状態から作るので、ポップアップの塗り直しはここが受け持つ。
   * すでに流れているニュース行は作られた時の言語のまま流れきる（作り直さない）。
   */
  setLang(code) {
    this.lang = code;
    this.L = bundle(code);
    writeLang(code);
    document.documentElement.lang = this.L.htmlLang;
    this.game.setLang(code);
    this.hud.setStrings(this.L, code);
    if (this.state === "over" && this.hud.popup.className === "over") {
      this.hud.showOver(this.game.dateText, this.game.landfallText(), this.game.survivedOverText);
    } else if (this.state === "title") {
      this.hud.showTitle();
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.state === "over") {
      this.game.reset();
      this.hud.clearNews();
      this.globe.land.reset();
    }
    this.state = "play";
    this.game.running = true;
    this.introT = 0;
    this.hud.hide();
    this.input.enabled = true;
    this.game.spawn(this.follow.playArc);
    this.goFullscreen();
  }

  goFullscreen() {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen() : null;
    const lock = () => {
      try {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait").catch(() => {});
      } catch {
        /* 端末が対応していないだけ。無視してよい */
      }
    };
    if (p && p.then) p.then(lock).catch(lock);
    else lock();
  }

  share() {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText(this.game, shareUrl()))}`, "_blank");
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    // ゲーム内の dt は元ゲームと同じく 50 ms で頭打ち。描画が重い環境では
    // ゲームがスローになるが、それは元の挙動でもある。
    const wall = Math.min(0.25, (now - this.last) / 1000 || 0);
    const dt = Math.min(CFG.DT_MAX, wall);
    this.last = now;
    const t0 = performance.now();

    const g = this.game;
    if (this.state === "play" || this.state === "over") {
      g.vx = this.input.vx;
      g.vy = this.input.vy;
      g.step(dt, this.follow.playArc);
      if (g.over && this.state === "play") {
        this.state = "over";
        this.overAt = performance.now();
        this.popupAtOver = this.hud.popup.className; // 検査用。死んだ瞬間の表示状態
        this.input.enabled = false;
        this.input.release();
        setTimeout(() => {
          this.hud.showOver(g.dateText, g.landfallText(), g.survivedOverText);
        }, CFG.SLOWMO_MS);
      }
    }

    // カメラ：タイトルは地球全体、開始後 3 秒でプレイ画角へ寄る（§5.2）
    let want;
    if (this.state === "title") {
      want = CFG.CAM_WORLD;
    } else {
      // イントロの寄りは演出なので実時間で進める（dt の頭打ちに引きずられない）
      this.introT = Math.min(1, this.introT + wall / 3);
      // 開始時に地球全体からプレイ画角へ寄るのは 1 回だけ。
      // それ以降は **常に CAM_PLAY のまま**で、状況によって寄ったり引いたりしない。
      want = CFG.CAM_WORLD + (CFG.CAM_PLAY - CFG.CAM_WORLD) * this.introT;
    }
    // カメラの追従も演出なので実時間で。dt の頭打ちに引きずられると寄りが遅れる。
    this.follow.update(g.pos, want, wall, this.snapCam);
    this.snapCam = false;

    this.globe.player.quaternion.set(g.q[0], g.q[1], g.q[2], g.q[3]);
    this.globe.land.update();
    this.stormView.update(g.storms, CFG);
    this.hud.setDate(g.dateText);
    this.hud.setSurvived(g.survivedText);
    // CPU 側の1フレーム時間。GPU の速さに左右されないので、遅い環境でも意味を持つ。
    this.cpuMs = this.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
    this.renderer.render(this.scene, this.camera);
  }
}

// 起動。地図の三角形分割に 1〜2 秒かかるので、ローディング表示を先に出す。
requestAnimationFrame(() => {
  setTimeout(() => {
    window.__game = new App();
  }, 0);
});
