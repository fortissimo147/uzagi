// 入力。DESIGN.md §6。元ゲームの操作系をそのまま移す。
// 画面のどこを押しても、そこに仮想スティックが生まれる。

const KR = 44; // スティックの半径[px]（元と同じ）

export class Input {
  constructor(root, pad, knob) {
    this.vx = 0;
    this.vy = 0;
    this.pid = null;
    this.cx = 0;
    this.cy = 0;
    this.pad = pad;
    this.knob = knob;
    this.keys = Object.create(null);
    this.enabled = true;

    root.addEventListener("pointerdown", (e) => {
      if (!this.enabled || this.pid !== null) return;
      if (e.target.closest("#ticker, #popup, #menubtn, #menu")) return;
      this.pid = e.pointerId;
      root.setPointerCapture(e.pointerId);
      if (e.target.closest("#pad")) {
        const r = pad.getBoundingClientRect();
        this.cx = r.left + r.width / 2;
        this.cy = r.top + r.height / 2;
      } else {
        this.cx = e.clientX;
        this.cy = e.clientY;
        pad.style.left = `${e.clientX - KR}px`;
        pad.style.top = `${e.clientY - KR}px`;
        pad.style.right = "auto";
        pad.style.bottom = "auto";
      }
      pad.classList.add("live");
      this.setKnob(e.clientX, e.clientY);
      e.preventDefault();
    });
    const move = (e) => {
      if (e.pointerId === this.pid) this.setKnob(e.clientX, e.clientY);
    };
    const up = (e) => {
      if (e.pointerId === this.pid) this.release();
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);

    window.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      this.keys[e.key] = true;
      this.keyVel();
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
      this.keyVel();
    });
  }

  setKnob(x, y) {
    let dx = x - this.cx;
    let dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > KR) {
      dx = (dx / d) * KR;
      dy = (dy / d) * KR;
    }
    this.vx = dx / KR;
    this.vy = dy / KR;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  release() {
    this.pid = null;
    this.vx = 0;
    this.vy = 0;
    this.knob.style.transform = "translate(0px, 0px)";
    this.pad.classList.remove("live");
    this.pad.style.left = "";
    this.pad.style.top = "";
    this.pad.style.right = "";
    this.pad.style.bottom = "";
  }

  // 元と同じく生の -1/0/1。斜めが √2 倍速いのは仕様として残す。
  keyVel() {
    const k = this.keys;
    this.vx = (k.ArrowRight || k.d || k.D ? 1 : 0) - (k.ArrowLeft || k.a || k.A ? 1 : 0);
    this.vy = (k.ArrowDown || k.s || k.S ? 1 : 0) - (k.ArrowUp || k.w || k.W ? 1 : 0);
  }
}
