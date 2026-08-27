// 画面表示（コイン・ライフ・タイム・各種スクリーン）はDOMで作る。
// プレイヤーに見せる文字はすべて英語。
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud">
        <div class="hud-life" id="life"></div>
        <div class="hud-coins"><span class="coin-icon"></span><span class="x">×</span><span id="coinCount">0</span><span class="of" id="coinTotal"></span></div>
        <div class="hud-right"><div id="stage">Stage 1/3</div><div id="area">Start Plaza</div><div id="timer">0:00</div><div id="sound">♪ ON</div></div>
      </div>
      <div class="toast" id="toast"></div>
      <div class="screen" id="screenTitle">
        <div class="panel">
          <h1>Tower of Green Pillars</h1>
          <p class="sub">3D Action &mdash; three stages, each ending at the pipe on top</p>
          <ul class="keys">
            <li><b>WASD / Arrow keys</b> Move</li>
            <li><b>Space</b> Jump &mdash; land and tap again at once for a higher double / triple jump</li>
            <li><b>Shift</b> Crouch &mdash; run, then Shift + Space for a long jump</li>
            <li><b>Shift in mid-air</b> Ground pound</li>
            <li><b>Space against a wall</b> Wall kick</li>
            <li><b>Drag / Q &amp; E</b> Turn camera &nbsp; <b>P</b> Pause &nbsp; <b>M</b> Sound</li>
          </ul>
          <button class="btn" id="btnStart">START</button>
          <p class="note">On a phone, use the stick on the left and the buttons on the right.</p>
        </div>
      </div>
      <div class="screen hidden" id="screenPause">
        <div class="panel">
          <h2>Paused</h2>
          <button class="btn" id="btnResume">Resume</button>
          <button class="btn ghost" id="btnRestart">Start Over</button>
        </div>
      </div>
      <div class="screen hidden" id="screenOver">
        <div class="panel">
          <h2>Game Over</h2>
          <p id="overStat"></p>
          <button class="btn" id="btnRetry">Try Again</button>
        </div>
      </div>
      <div class="screen hidden" id="screenStage">
        <div class="panel clear">
          <h2 id="stageTitle">Stage Clear!</h2>
          <p id="stageStat"></p>
          <button class="btn" id="btnNext">Next Stage</button>
        </div>
      </div>
      <div class="screen hidden" id="screenClear">
        <div class="panel clear">
          <h2>All Stages Clear!</h2>
          <p id="clearStat"></p>
          <button class="btn" id="btnAgain">Play Again</button>
        </div>
      </div>`;

    this.life = root.querySelector("#life");
    this.coinCount = root.querySelector("#coinCount");
    this.coinTotal = root.querySelector("#coinTotal");
    this.area = root.querySelector("#area");
    this.stage = root.querySelector("#stage");
    this.timer = root.querySelector("#timer");
    this.toastEl = root.querySelector("#toast");
    this.sound = root.querySelector("#sound");
    this.screens = {
      title: root.querySelector("#screenTitle"),
      pause: root.querySelector("#screenPause"),
      over: root.querySelector("#screenOver"),
      clear: root.querySelector("#screenClear"),
      stage: root.querySelector("#screenStage"),
    };
    this._hp = -1;
  }

  on(id, fn) {
    this.root.querySelector(id).addEventListener("click", fn);
  }

  setHp(hp, max = 3) {
    if (hp === this._hp) return;
    this._hp = hp;
    this.life.innerHTML = "";
    for (let i = 0; i < max; i++) {
      const h = document.createElement("span");
      h.className = `heart${i < hp ? "" : " empty"}`;
      this.life.appendChild(h);
    }
  }

  setCoins(n, total) {
    this.coinCount.textContent = n;
    this.coinTotal.textContent = ` / ${total}`;
  }

  setArea(name) {
    this.area.textContent = name;
  }

  setStage(n, total, name) {
    this.stage.textContent = `Stage ${n}/${total} \u00b7 ${name}`;
  }

  setMuted(muted) {
    this.sound.textContent = muted ? "♪ OFF" : "♪ ON";
    this.sound.classList.toggle("off", muted);
  }

  setTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    this.timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }

  toast(text, ms = 1600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove("show"), ms);
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens))
      el.classList.toggle("hidden", k !== name);
  }

  hideAll() {
    for (const el of Object.values(this.screens)) el.classList.add("hidden");
  }

  // 面クリア（まだ先がある）。次に何が来るかまで出す。
  setStageResult(n, name, coins, total, score, nextName) {
    this.root.querySelector("#stageTitle").textContent = `Stage ${n} Clear! \u2014 ${name}`;
    this.root.querySelector("#stageStat").innerHTML =
      `Coins ${coins} / ${total} &nbsp; Score ${score}<br>Next: ${nextName}`;
  }

  setResult(id, coins, total, time, score) {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    this.root.querySelector(id).innerHTML =
      `Coins ${coins} / ${total} &nbsp; Time ${m}:${String(s).padStart(2, "0")}<br>Score ${score}`;
  }
}
