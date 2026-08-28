// キーボード / マウス / タッチ（バーチャルパッド）の入力を1つに束ねる。
export class Input {
  constructor(canvas, hudRoot) {
    this.keys = new Set();
    this.pressed = new Set(); // このフレームで押された瞬間のキー
    this.move = { x: 0, y: 0 }; // 画面基準の進行方向（y=+1が奥）
    this.camDelta = { x: 0, y: 0 };
    this.canvas = canvas;

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k))
        e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => this.keys.clear());

    // マウスドラッグでカメラ旋回
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerType === "touch") return;
      this.camDelta.x += (e.clientX - lastX) * 0.006;
      this.camDelta.y += (e.clientY - lastY) * 0.004;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const endDrag = () => (dragging = false);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this._setupTouch(hudRoot);
  }

  _setupTouch(hudRoot) {
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchJump = false;
    this.touchJumpEdge = false;
    this.touchCrouch = false;
    // ポーズと音の入切。キーボードの P / M にあたるものがタッチには
    // 無かったので、パッドに小さいボタンを置いて押下エッジを立てる。
    this.touchPauseEdge = false;
    this.touchMuteEdge = false;

    const pad = document.createElement("div");
    pad.className = "touch-ui";
    pad.innerHTML = `
      <div class="top-btns">
        <button class="tsmall tbtn-pause" type="button" aria-label="Pause">II</button>
        <button class="tsmall tbtn-sound" type="button" aria-label="Sound">&#9834;</button>
      </div>
      <div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="btn-zone">
        <button class="tbtn tbtn-crouch" type="button">CROUCH</button>
        <button class="tbtn tbtn-jump" type="button">JUMP</button>
      </div>`;
    hudRoot.appendChild(pad);
    this.touchUI = pad;

    const zone = pad.querySelector(".stick-zone");
    const base = pad.querySelector(".stick-base");
    const knob = pad.querySelector(".stick-knob");
    const R = 46;

    zone.addEventListener("pointerdown", (e) => {
      this.stick.active = true;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.style.opacity = "1";
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener("pointermove", (e) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / R;
      this.stick.y = dy / R;
    });
    const stickEnd = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.active = false;
      this.stick.x = this.stick.y = 0;
      knob.style.transform = "translate(0,0)";
      base.style.opacity = "0";
    };
    zone.addEventListener("pointerup", stickEnd);
    zone.addEventListener("pointercancel", stickEnd);

    const jump = pad.querySelector(".tbtn-jump");
    jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.touchJump = true;
      this.touchJumpEdge = true;
    });
    const jumpUp = () => (this.touchJump = false);
    jump.addEventListener("pointerup", jumpUp);
    jump.addEventListener("pointercancel", jumpUp);
    jump.addEventListener("pointerleave", jumpUp);

    const crouch = pad.querySelector(".tbtn-crouch");
    crouch.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.touchCrouch = true;
    });
    const crouchUp = () => (this.touchCrouch = false);
    crouch.addEventListener("pointerup", crouchUp);
    crouch.addEventListener("pointercancel", crouchUp);
    crouch.addEventListener("pointerleave", crouchUp);

    for (const [sel, flag] of [
      [".tbtn-pause", "touchPauseEdge"],
      [".tbtn-sound", "touchMuteEdge"],
    ]) {
      pad.querySelector(sel).addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this[flag] = true;
      });
    }

    // 画面右側のドラッグでカメラ旋回（ボタン以外の領域）
    const camZone = pad.querySelector(".btn-zone");
    let camId = null;
    let cx = 0;
    let cy = 0;
    camZone.addEventListener("pointerdown", (e) => {
      if (e.target !== camZone) return;
      camId = e.pointerId;
      cx = e.clientX;
      cy = e.clientY;
    });
    camZone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== camId) return;
      this.camDelta.x += (e.clientX - cx) * 0.008;
      this.camDelta.y += (e.clientY - cy) * 0.005;
      cx = e.clientX;
      cy = e.clientY;
    });
    const camEnd = (e) => {
      if (e.pointerId === camId) camId = null;
    };
    camZone.addEventListener("pointerup", camEnd);
    camZone.addEventListener("pointercancel", camEnd);
  }

  down(...ks) {
    return ks.some((k) => this.keys.has(k));
  }

  hit(...ks) {
    return ks.some((k) => this.pressed.has(k));
  }

  get jumpHeld() {
    return this.down(" ", "z", "k") || this.touchJump;
  }

  get jumpEdge() {
    return this.hit(" ", "z", "k") || this.touchJumpEdge;
  }

  get crouchHeld() {
    return this.down("shift", "control", "x", "j") || this.touchCrouch;
  }

  get pauseEdge() {
    return this.hit("p") || this.touchPauseEdge;
  }

  get muteEdge() {
    return this.hit("m") || this.touchMuteEdge;
  }

  // 毎フレーム冒頭で呼ぶ。移動ベクトルを更新する。
  update() {
    let x = 0;
    let y = 0;
    if (this.down("a", "arrowleft")) x -= 1;
    if (this.down("d", "arrowright")) x += 1;
    if (this.down("w", "arrowup")) y += 1;
    if (this.down("s", "arrowdown")) y -= 1;
    if (this.stick.active) {
      x += this.stick.x;
      y += -this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;

    if (this.down("q")) this.camDelta.x -= 0.045;
    if (this.down("e")) this.camDelta.x += 0.045;
  }

  // 毎フレーム末尾で呼ぶ。押下エッジを消費する。
  endFrame() {
    this.pressed.clear();
    this.touchJumpEdge = false;
    this.touchPauseEdge = false;
    this.touchMuteEdge = false;
    this.camDelta.x = 0;
    this.camDelta.y = 0;
  }
}
