// HUD。DESIGN.md §7 の英語文言をそのまま出す。
// render/ はゲームの中身を知らない（§0.3）ので、文言は呼び出し側から受け取る。

export class Hud {
  constructor(doc, { disclaimer = "" } = {}) {
    this.time = doc.getElementById("time");
    this.popup = doc.getElementById("popup");
    this.ptitle = doc.getElementById("ptitle");
    this.ptext = doc.getElementById("ptext");
    this.pbtn = doc.getElementById("pbtn");
    this.share = doc.getElementById("sharebtn");
    this.ticker = doc.getElementById("ticker");
    this.pad = doc.getElementById("pad");
    this.doc = doc;
    doc.getElementById("disclaimer").textContent = disclaimer;
    doc.getElementById("menubtn").onclick = () => doc.getElementById("menu").classList.add("open");
    doc.getElementById("menuclose").onclick = () => doc.getElementById("menu").classList.remove("open");
  }

  setDate(text) {
    this.time.textContent = text;
  }

  showTitle() {
    this.pad.hidden = true;
    this.popup.className = "";
    this.ptitle.textContent = "TYPHOON ESCAPE";
    this.ptext.textContent = "Drag to move Taiwan.\nEscape the typhoons.";
    this.pbtn.textContent = "Start the Summer";
    this.share.hidden = true;
  }

  showOver(dateText, landfall) {
    this.pad.hidden = true;
    this.popup.className = "over";
    this.ptitle.textContent = dateText;
    this.ptext.textContent = landfall;
    this.pbtn.textContent = "Start a New Summer";
    this.share.hidden = false;
  }

  hide() {
    this.pad.hidden = false;
    this.popup.className = "hidden";
  }

  /** 下から流れるニュース速報。行が増えるとスティックが持ち上がる（元と同じ）。 */
  news(msg, kind) {
    this.newsCount = (this.newsCount || 0) + 1;
    const row = this.doc.createElement("div");
    row.className = `row ${kind === "formed" ? "red" : "yellow"}`;
    const tag = this.doc.createElement("div");
    tag.className = "tag";
    tag.textContent = kind === "formed" ? "FORMED" : "DISSIPATED";
    const track = this.doc.createElement("div");
    track.className = "track";
    const text = this.doc.createElement("div");
    text.className = "ttext";
    text.textContent = msg;
    track.appendChild(text);
    row.append(tag, track);
    this.ticker.appendChild(row);
    this.rows();

    // 幅は DOM に入れてからでないと測れない。だが CSS の `animation: tk linear forwards`
    // は既定の duration が 0s なので、挿入直後に animationend が飛んで行が即座に消える。
    // 一度アニメーションを外し、リフローを挟んでから正しい duration で貼り直す。
    const dist = track.clientWidth + text.offsetWidth || 600;
    text.style.animation = "none";
    void text.offsetWidth; // 強制リフロー。これがないと下の再設定が効かない
    text.style.setProperty("--dist", `${-dist}px`);
    const dur = dist / 300;
    text.style.animation = `tk ${dur}s linear forwards`;
    this.lastDur = dur;
    // animationend には頼らない。挿入直後に走る duration 0s のアニメーションが
    // 「終わった」イベントを撃ってしまい、行が即座に消えた（実測）。
    // 消すのは setTimeout だけで行う。
    const done = () => {
      if (!row.isConnected) return;
      this.lastRemovedAt = performance.now();
      row.remove();
      this.rows();
    };
    setTimeout(done, dur * 1000 + 200);
  }

  rows() {
    this.doc.documentElement.style.setProperty("--rows", String(this.ticker.children.length));
  }

  clearNews() {
    this.ticker.innerHTML = "";
    this.rows();
  }
}
