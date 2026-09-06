// HUD。DESIGN.md §7 / §8。
// render/ はゲームの中身を知らない（§0.3）ので、**文言は束（bundle）で受け取る**。
// ここには英語も日本語も繁體中文も一切書かない。書いてよいのは DOM の組み立てだけ。

export class Hud {
  /**
   * @param {Document} doc
   * @param {object} o
   * @param {object} o.strings rules/i18n.js の束。title/intro/start/… を持つ
   * @param {{code:string,label:string}[]} o.langs 言語ボタン。label は自称なので訳さない
   * @param {string} o.lang 選択中の言語コード
   */
  constructor(doc, { strings, langs = [], lang = "" } = {}) {
    this.time = doc.getElementById("time");
    this.survived = doc.getElementById("survived");
    this.popup = doc.getElementById("popup");
    this.ptitle = doc.getElementById("ptitle");
    this.ptext = doc.getElementById("ptext");
    this.pdays = doc.getElementById("pdays");
    this.pbtn = doc.getElementById("pbtn");
    this.share = doc.getElementById("sharebtn");
    this.ticker = doc.getElementById("ticker");
    this.pad = doc.getElementById("pad");
    this.langbox = doc.getElementById("langs");
    this.menuTitle = doc.getElementById("menutitle");
    this.mapCredit = doc.getElementById("mapcredit");
    this.disclaimer = doc.getElementById("disclaimer");
    this.doc = doc;
    this.L = strings;
    this.lang = lang;
    /** 言語ボタンが押されたとき。呼び出し側が差し替える。 */
    this.onLang = () => {};
    this.buildLangs(langs);
    this.applyStrings();
    doc.getElementById("menubtn").onclick = () => doc.getElementById("menu").classList.add("open");
    doc.getElementById("menuclose").onclick = () => doc.getElementById("menu").classList.remove("open");
  }

  /** 言語ボタンを一度だけ作る。中身（自称）は言語が変わっても変わらない。 */
  buildLangs(langs) {
    this.langBtns = [];
    if (!this.langbox) return;
    this.langbox.innerHTML = "";
    for (const { code, label } of langs) {
      const b = this.doc.createElement("button");
      b.className = "lang";
      b.dataset.lang = code;
      b.textContent = label;
      b.onclick = () => this.onLang(code);
      this.langbox.appendChild(b);
      this.langBtns.push(b);
    }
    this.markLang();
  }

  markLang() {
    for (const b of this.langBtns || []) {
      const on = b.dataset.lang === this.lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  /**
   * 言語を切り替える。ポップアップの現在の中身は**呼び出し側**が描き直す
   * （日付や上陸文はゲームの状態から作るもので、HUD は知らない）。
   */
  setStrings(strings, lang) {
    this.L = strings;
    if (lang) this.lang = lang;
    this.markLang();
    this.applyStrings();
  }

  /** 言語に依存するだけで、ゲームの状態には依存しない場所を塗り直す。 */
  applyStrings() {
    const L = this.L;
    if (!L) return;
    this.share.textContent = L.share;
    if (this.menuTitle) this.menuTitle.textContent = L.menuTitle;
    if (this.mapCredit) this.mapCredit.textContent = L.mapCredit;
    if (this.disclaimer) this.disclaimer.textContent = L.disclaimer;
  }

  setDate(text) {
    this.time.textContent = text;
  }

  /** 生き延びた日数（§1b.10）。文言は束が作るので、ここは受け取って出すだけ。 */
  setSurvived(text) {
    if (this.survived) this.survived.textContent = text;
  }

  showTitle() {
    this.pad.hidden = true;
    this.popup.className = "";
    this.ptitle.textContent = this.L.title;
    this.ptext.textContent = this.L.intro;
    this.pdays.hidden = true;
    this.pdays.textContent = "";
    this.pbtn.textContent = this.L.start;
    this.share.hidden = true;
    if (this.survived) this.survived.hidden = true;
    if (this.langbox) this.langbox.hidden = false;
  }

  showOver(dateText, landfall, survivedText) {
    this.pad.hidden = true;
    this.popup.className = "over";
    this.ptitle.textContent = dateText;
    this.ptext.textContent = landfall;
    this.pdays.hidden = false;
    this.pdays.textContent = survivedText;
    this.pbtn.textContent = this.L.restart;
    this.share.hidden = false;
    if (this.survived) this.survived.hidden = true;
    // ゲームオーバー画面もまた「開始画面」なので、ここでも言語を選べる。
    if (this.langbox) this.langbox.hidden = false;
  }

  hide() {
    this.pad.hidden = false;
    this.popup.className = "hidden";
    if (this.survived) this.survived.hidden = false;
  }

  /** 下から流れるニュース速報。行が増えるとスティックが持ち上がる（元と同じ）。 */
  news(msg, kind) {
    this.newsCount = (this.newsCount || 0) + 1;
    const row = this.doc.createElement("div");
    row.className = `row ${kind === "formed" ? "red" : "yellow"}`;
    const tag = this.doc.createElement("div");
    tag.className = "tag";
    tag.textContent = kind === "formed" ? this.L.tagFormed : this.L.tagGone;
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
