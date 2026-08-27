// 音はすべて WebAudio の合成音で作る。音声ファイルは同梱しないので配布が軽く、
// 素材の権利関係もクリアなまま「効果音＋BGM＋声」がそろう。
//
//   sfx.xxx()      … 単発の効果音（合成）
//   cry.xxx()      … キャラの声。既定はフォルマント合成。voicebank.js に
//                    録音を入れた名前だけ、そちらに切り替わる（既定は空）
//   bgm.play(名前) … ループ再生（タイトル／ステージ）と一発物（クリア等）
//
// BGM は「先読みスケジューラ」で鳴らす。setInterval で 60ms ごとに起きて、
// これから 0.3 秒ぶんの音を AudioContext の時計に予約しておく。こうすると
// タイマーが多少ぶれてもリズムがよれない（WebAudio の定石）。

import { VOICEBANK } from "./voicebank.js";

let ctx = null;
let master = null;
let bgmGain = null;
let sfxGain = null;
let enabled = true;

const MASTER_VOL = 0.45;
const BGM_VOL = 0.60;
const SFX_VOL = 0.62;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_VOL : 0;
    master.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = BGM_VOL;
    bgmGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = SFX_VOL;
    sfxGain.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// 最初のユーザー操作で解錠する（ブラウザの自動再生制限対策）
export function unlockAudio() {
  ensure();
  loadVoicebank();
}

export function setMuted(m) {
  enabled = !m;
  if (master) master.gain.value = enabled ? MASTER_VOL : 0;
}

export function isMuted() {
  return !enabled;
}

// ポーズ中などに音楽だけ小さくする
export function duckBgm(on) {
  if (!bgmGain) return;
  const t = ctx.currentTime;
  bgmGain.gain.cancelScheduledValues(t);
  bgmGain.gain.setTargetAtTime(on ? BGM_VOL * 0.25 : BGM_VOL, t, 0.05);
}

// ---------- 音の素 ----------

const A4 = 69;
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "D#4" や "Bb3" のような表記を MIDI 番号に直す
export function midi(name) {
  let i = 1;
  let n = STEP[name[0].toUpperCase()];
  while (name[i] === "#" || name[i] === "b") n += name[i++] === "#" ? 1 : -1;
  return n + (Number(name.slice(i)) + 1) * 12;
}

function hz(m) {
  return 440 * Math.pow(2, (m - A4) / 12);
}

// 矩形波などの単音。out を差し替えれば効果音にも BGM にも使える。
// 音量は「立ち上がり → 保つ → 減衰」の3段。sustain を上げると音が伸び、
// 下げるとポンと切れる（効果音向き）。
function voice(out, freq, t0, dur, opts = {}) {
  const c = ensure();
  if (!c) return null;
  const {
    type = "square",
    vol = 0.5,
    attack = 0.006,
    sustain = 0.10,
    release = 0.08,
    slideTo = null,
    detune = 0,
  } = opts;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  const rel = Math.min(release, dur * 0.6);
  const hold = Math.max(t0 + attack + 0.002, t0 + dur - rel);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(vol * sustain, hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  return osc;
}

let noiseBuf = null;
function noiseBuffer() {
  const c = ensure();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(out, t0, dur, opts = {}) {
  const c = ensure();
  if (!c) return null;
  const { vol = 0.4, freq = 900, type = "bandpass", q = 1, sweepTo = null } = opts;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  return src;
}

// ---------- 効果音 ----------

function tone(freq, dur, type, vol, slideTo, delay = 0) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  voice(sfxGain, freq, c.currentTime + delay, dur, { type, vol, slideTo });
}

function hit(dur, vol, freq, delay = 0, sweepTo = null) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  noise(sfxGain, c.currentTime + delay, dur, { vol, freq, sweepTo });
}

export const sfx = {
  // ジャンプは掛け声（cry.wa など）が主役。合成音は下敷きなので控えめにする。
  jump: () => tone(430, 0.15, "square", 0.20, 800),
  doubleJump: () => {
    tone(560, 0.14, "square", 0.20, 980);
    tone(840, 0.10, "square", 0.11, null, 0.05);
  },
  tripleJump: () => {
    [660, 880, 1180].forEach((f, i) => tone(f, 0.13, "square", 0.18, f * 1.35, i * 0.075));
  },
  land: () => hit(0.09, 0.22, 380, 0, 150),
  coin: () => {
    // 動画のコイン音の実測値。低い音のあと 0.10 秒おいて、
    // 1オクターブ+5度うえの音が鳴る（参考動画の8回ぶんを測って一致した値）。
    tone(408, 0.10, "square", 0.32);
    tone(1270, 0.20, "square", 0.30, null, 0.10);
  },
  stomp: () => {
    hit(0.12, 0.45, 520, 0, 160);
    tone(300, 0.12, "square", 0.34, 110);
  },
  damage: () => {
    tone(300, 0.30, "sawtooth", 0.40, 95);
    hit(0.16, 0.24, 700, 0, 200);
  },
  fall: () => tone(520, 0.65, "sine", 0.34, 65),
  pound: () => {
    hit(0.20, 0.50, 260, 0, 90);
    tone(170, 0.20, "square", 0.40, 55);
  },
  checkpoint: () => {
    [660, 880, 1175].forEach((f, i) => tone(f, 0.16, "triangle", 0.34, null, i * 0.085));
  },
  pipe: () => tone(190, 0.42, "square", 0.42, 920),
  heart: () => {
    [784, 988, 1319].forEach((f, i) => tone(f, 0.14, "triangle", 0.32, null, i * 0.06));
  },
};

// ---------- 声（叫び） ----------
//
// 声も音声ファイルを持たず、その場で合成する。
// 人の声は「声帯の振動（＝音の高さ）」を「口や喉の形の共鳴（＝フォルマント）」で
// 色づけたもの。ここでは声帯の波形を作り、共鳴の山を5つ縦続に重ねて口とする。
// 母音は、この山の位置の組み合わせだけで決まる。
//
// 数字は母音ごとの共鳴周波数（Hz）。THROAT 倍して使う。
// 「あ」と「い」は参考動画のうさぎの声を実測した値に置き換えてある
// （ケプストラムで包絡を取り、13か所の発声で F1≈870 / F2≈2020Hz。
//  「い」は F1 が低く F2≈2700〜3050Hz）。残りは教科書値。
// THROAT はこの子の喉の大きさぶんの補正で、上げるほど幼い声になる。
export const VOWEL = {
  a: [890, 1755, 2950], // あ（実測 870/2020Hz。合成後に測り直して合わせた値）
  e: [520, 1900, 2600], // え（教科書値）
  i: [330, 2450, 3100], // い（実測 F2 約2800Hz）
  o: [500, 900, 2500], // お（教科書値）
  u: [340, 850, 2300], // う（教科書値）
};
export const THROAT = 1.15;

// 声帯の波形。のこぎり波は倍音が 1/n でまっすぐ落ちるので「ブー」と鳴る。
// 実際の声帯はもう少し急に落ちるので、1/n^1.25 の倍音列を作って使う。
// 位相をずらしてあるのは、全部そろうと波形が尖って耳につくため。
let glottisWave = null;
function glottis() {
  const c = ensure();
  if (!glottisWave) {
    const N = 48;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let n = 1; n < N; n++) {
      const a = 1 / Math.pow(n, 1.25);
      const ph = (n * n * 0.7) % (Math.PI * 2);
      re[n] = a * Math.cos(ph);
      im[n] = a * Math.sin(ph);
    }
    glottisWave = c.createPeriodicWave(re, im, { disableNormalization: false });
  }
  return glottisWave;
}

// 声道（口と喉）。共鳴を1つずつ「山」として重ねた縦続つなぎ。
// 帯域フィルタを並列にすると山と山の間が谷になって、声というより
// ボコーダーの音になる。peaking を直列にすると、素の音の傾きを保ったまま
// 山だけが乗るので、実際の声道に近い。
// 共鳴を5つ縦続に重ねると合計で +45dB ほど増える。効果音と同じ大きさに
// そろえるための一括の下げ幅。これがあるので vol は 0〜1 のまま使える。
const TRACT_TRIM = 0.18;
const FORMANT_Q = [8, 9, 8, 6, 5];
const FORMANT_DB = [14, 12, 9, 6, 4];
// F4・F5 は母音でほとんど動かない（声の明るさを決める）。THROAT 倍して使う。
const UPPER = [3500, 4500];

/**
 * 母音の並びを声にする。
 * @param {Array<{v:string,f:number,d:number}>} seq
 *   v=母音、f=その区間の終わりの高さ(Hz)、d=長さ(秒)。区間の間は滑らかにつながる。
 * @param {object} opts start:最初の高さ / vol / vib:ゆらぎの速さ / vibCents:ゆらぎの深さ
 *   breath は息の量。上げるほど倍音／雑音比が下がって生っぽくなる。
 *   高さ・長さ・息の量は呼ぶたびに少しずつ振れる（同じ声を繰り返さないため）。
 *   vol は帯域を通したあとの大きさが効果音とそろうよう実測で決めてある
 *   （tools/audio-dump.mjs で最大振幅を見る。効果音はどれも 0.09〜0.11）。
 * @returns {{stop:Function}|null} 落下中の悲鳴のように途中で止めたいときは stop() を呼ぶ
 */
function shout(seq, opts = {}) {
  if (!enabled) return null;
  const c = ensure();
  if (!c) return null;
  const {
    start = seq[0].f,
    vol = 0.5,
    vib = 7,
    vibCents = 35,
    breath = 0.1,
    shift = THROAT,
    delay = 0,
  } = opts;

  // 同じ動きでも一回ごとに少し違う声にする。実際の声は二度と同じにならないので、
  // 波形が毎回そっくりだと、ジャンプを連打した瞬間に作り物だと分かってしまう。
  const vp = 1 + (Math.random() - 0.5) * 0.07; // 高さ ±3.5%
  const vt = 1 + (Math.random() - 0.5) * 0.16; // 長さ ±8%
  const vb = 0.85 + Math.random() * 0.4; // 息の量

  const t0 = c.currentTime + delay;
  const total = seq.reduce((s, p) => s + p.d, 0) * vt;
  const end = t0 + total;

  const osc = c.createOscillator();
  osc.setPeriodicWave(glottis());
  osc.frequency.setValueAtTime(start * vp, t0);

  // 声のふるえ。ゆっくりの波（ビブラート）だけだと規則正しすぎるので、
  // 周期ごとの細かいばらつき（ジッタ）も混ぜる。人の声が機械と違うのは
  // ここで、これが無いと倍音がそろいすぎて作り物に聞こえる。
  const lfo = c.createOscillator();
  const lfoG = c.createGain();
  lfo.frequency.value = vib;
  lfoG.gain.value = vibCents;
  lfo.connect(lfoG).connect(osc.detune);
  const jitter = c.createConstantSource();
  jitter.offset.setValueAtTime(0, t0);
  for (let t = t0; t < end; t += 0.009 + Math.random() * 0.006)
    jitter.offset.setValueAtTime((Math.random() - 0.5) * 44, t);
  jitter.connect(osc.detune);

  // 息。声道より前で混ぜるので、母音の共鳴が息にもかかる。
  // 別経路で足すと「声＋ホワイトノイズ」に聞こえて分離してしまう。
  const air = c.createBufferSource();
  air.buffer = noiseBuffer();
  air.loop = true;
  const airG = c.createGain();
  airG.gain.value = breath * 1.7 * vb;

  const src = c.createGain();
  osc.connect(src);
  air.connect(airG).connect(src);

  // 共鳴を縦続につなぐ
  const freqs = (v) => [...VOWEL[v], ...UPPER];
  let node = src;
  const bands = FORMANT_Q.map((q, i) => {
    const f = c.createBiquadFilter();
    f.type = "peaking";
    f.Q.value = q;
    f.gain.value = FORMANT_DB[i];
    f.frequency.setValueAtTime(freqs(seq[0].v)[i] * shift, t0);
    node.connect(f);
    node = f;
    return f;
  });
  // 唇から外へ出るときに低い方が落ちる（放射特性）。これが無いとこもる。
  const lips = c.createBiquadFilter();
  lips.type = "highshelf";
  lips.frequency.value = 900;
  lips.gain.value = 4;
  node.connect(lips);

  // 高さと母音を区間ごとに動かす
  let t = t0;
  for (const p of seq) {
    t += p.d * vt;
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.f * vp), t);
    bands.forEach((bp, i) => bp.frequency.linearRampToValueAtTime(freqs(p.v)[i] * shift, t));
  }

  // 音量。全体の形に加えて、細かいゆらぎ（シマー）を重ねる。
  const env = c.createGain();
  const lvl = vol * TRACT_TRIM;
  const atk = Math.min(0.025, total * 0.2);
  const rel = Math.min(0.10, total * 0.25);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(lvl, t0 + atk);
  for (let u = t0 + atk; u < end - rel; u += 0.02 + Math.random() * 0.02)
    env.gain.setValueAtTime(lvl * (0.86 + Math.random() * 0.14), u);
  env.gain.setValueAtTime(lvl, end - rel);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  lips.connect(env).connect(sfxGain);

  const parts = [osc, lfo, air, jitter];
  for (const p of parts) p.start(t0);
  for (const p of parts) p.stop(end + 0.05);

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      for (const p of parts) p.stop(now + 0.09);
    },
  };
}

// 叫びの中身（母音と高さの並び）。テストから検算できるよう、
// 鳴らす処理と分けて表にしておく。
//
// いまは voicebank.js に録音が入っているので、そこにある名前はこの合成を通らない。
// 通るのは land（着地の「ふっ」）と idle（立ち止まりの「ん…」）— 息の音なので
// 叫びの録音を当てず、合成のままにしてある。
// 録音を1つ外すと、その名前だけがここに落ちてくる（保険として残してある）。
export const CRIES = {
  // 長さと声の高さは参考動画の実測に合わせてある。
  // 動画の掛け声は 160〜370ms（中央値 320ms）、f0 は 246〜453Hz の範囲で
  // 平ら〜やや上がりの動き。以前は 180ms・280〜520Hz で、短く高すぎた。
  //
  // 落下中の「うわあぁぁ…」。落ちる速さに引きずられて下がっていく。
  // 落ちきる前に助かったら stop() で止める。
  fall: () => ({
    seq: [
      { v: "u", f: 285, d: 0.05 },
      { v: "a", f: 620, d: 0.09 },
      { v: "a", f: 470, d: 0.55 },
      { v: "a", f: 350, d: 0.70 },
      { v: "o", f: 200, d: 0.85 },
    ],
    opts: { start: 280, vol: 0.80, vib: 7.5, vibCents: 45, breath: 0.14 },
  }),
  // ぶつかったときの「あうっ」
  hurt: () => ({
    seq: [
      { v: "a", f: 520, d: 0.05 },
      { v: "u", f: 285, d: 0.16 },
    ],
    opts: { start: 470, vol: 0.72, vib: 9, vibCents: 25 },
  }),
  // 跳ぶときの「わっ！」。/u/ から /a/ へ一気に口を開くと、
  // その渡り（共鳴が低い所から一気に開く動き）が w の音になる。
  wa: () => ({
    seq: [
      { v: "u", f: 285, d: 0.05 },
      { v: "a", f: 400, d: 0.10 },
      { v: "a", f: 430, d: 0.27 },
    ],
    opts: { start: 250, vol: 0.9, vib: 10, vibCents: 22, breath: 0.16 },
  }),
  // 2段ジャンプ・幅跳び・壁キックの「やっ！」。/i/ から /a/ への渡りが y になる。
  ya: () => ({
    seq: [
      { v: "i", f: 280, d: 0.05 },
      { v: "a", f: 430, d: 0.10 },
      { v: "a", f: 450, d: 0.27 },
    ],
    opts: { start: 260, vol: 0.9, vib: 10, vibCents: 24, breath: 0.16 },
  }),
  // 3段ジャンプの「やほー！」。動画のいちばん長い掛け声（370ms）に合わせた。
  wahoo: () => ({
    seq: [
      { v: "i", f: 280, d: 0.05 },
      { v: "a", f: 430, d: 0.12 },
      { v: "o", f: 400, d: 0.12 },
      { v: "o", f: 425, d: 0.22 },
    ],
    opts: { start: 250, vol: 0.95, vib: 8, vibCents: 30, breath: 0.14 },
  }),
  // 幅跳びの「はーっ」。長く飛ぶので、掛け声も長めに伸ばす。
  hup: () => ({
    seq: [
      { v: "a", f: 520, d: 0.05 },
      { v: "a", f: 420, d: 0.22 },
    ],
    opts: { start: 380, vol: 0.9, vib: 9, vibCents: 26, breath: 0.22 },
  }),
  // 壁キックの「たっ」。壁を蹴る一瞬なので短く鋭く。
  kick: () => ({
    seq: [
      { v: "a", f: 560, d: 0.04 },
      { v: "a", f: 470, d: 0.14 },
    ],
    opts: { start: 420, vol: 0.85, vib: 11, vibCents: 20, breath: 0.18 },
  }),
  // 高い所から落ちて着いたときの「ふっ」。息が抜ける音なので breath を強めに。
  land: () => ({
    seq: [
      { v: "u", f: 285, d: 0.04 },
      { v: "u", f: 240, d: 0.10 },
    ],
    opts: { start: 285, vol: 0.55, vib: 8, vibCents: 14, breath: 0.4 },
  }),
  // ヒップドロップで叩きつけたときの「だあっ」
  pound: () => ({
    seq: [
      { v: "a", f: 500, d: 0.05 },
      { v: "a", f: 300, d: 0.18 },
    ],
    opts: { start: 560, vol: 0.9, vib: 7, vibCents: 34, breath: 0.16 },
  }),
  // 敵を踏んだときの「とうっ」
  stomp: () => ({
    seq: [
      { v: "o", f: 420, d: 0.05 },
      { v: "o", f: 320, d: 0.13 },
    ],
    opts: { start: 380, vol: 0.85, vib: 10, vibCents: 22, breath: 0.16 },
  }),
  // ライフが回復したときの「ふぁ〜」。上がって終わるとうれしそうに聞こえる。
  heal: () => ({
    seq: [
      { v: "a", f: 430, d: 0.08 },
      { v: "a", f: 560, d: 0.22 },
    ],
    opts: { start: 350, vol: 0.8, vib: 8.5, vibCents: 30, breath: 0.14 },
  }),
  // 立ち止まっているときにたまに出る「ん…」。うるさくならないよう小さく。
  idle: () => ({
    seq: [
      { v: "u", f: 285, d: 0.10 },
      { v: "u", f: 240, d: 0.18 },
    ],
    opts: { start: 265, vol: 0.42, vib: 6, vibCents: 18, breath: 0.12 },
  }),
  // ゲームオーバーの「あぁぁ…」
  dead: () => ({
    seq: [
      { v: "a", f: 430, d: 0.10 },
      { v: "a", f: 300, d: 0.35 },
      { v: "o", f: 170, d: 0.55 },
    ],
    opts: { start: 500, vol: 0.85, vib: 6, vibCents: 55, breath: 0.16 },
  }),
  // ゴールの「やったー！」
  cheer: () => ({
    seq: [
      { v: "a", f: 430, d: 0.09 },
      { v: "a", f: 400, d: 0.10 },
      { v: "a", f: 620, d: 0.30 },
    ],
    opts: { start: 350, vol: 1.1, vib: 8.5, vibCents: 40 },
  }),
};

// 表をそのまま鳴らせる形にする。cry.fall() のように呼ぶ。
// ---------- 録音した声（あれば合成より優先する） ----------
//
// voicebank.js に音が入っていればそれを鳴らし、無ければ上の合成にまわす。
// 録音は decodeAudioData が非同期なので、解錠したときにまとめて読んでおく。
// まだ読めていないあいだは合成で鳴らすので、音が抜けることはない。
const banked = new Map();
let bankLoading = false;

function loadVoicebank() {
  const c = ensure();
  if (!c || bankLoading) return;
  bankLoading = true;
  for (const [name, uri] of Object.entries(VOICEBANK)) {
    fetch(uri)
      .then((r) => r.arrayBuffer())
      .then((buf) => c.decodeAudioData(buf))
      .then((audio) => banked.set(name, audio))
      .catch((e) => console.warn(`声「${name}」を読めませんでした`, e));
  }
}

// テストや動作確認から「どの声が録音で鳴る状態か」を見るため
export function loadedVoices() {
  return [...banked.keys()].sort();
}

function playSample(buf, vol) {
  const c = ensure();
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g).connect(sfxGain);
  // 時刻を明示する。ふつうは「いま」で同じだが、オフライン合成
  // （tools/audio-dump.mjs）では引数なしだと全部が0秒に重なってしまう。
  src.start(c.currentTime);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      src.stop(now + 0.09);
    },
  };
}

export const cry = {};
for (const [name, make] of Object.entries(CRIES))
  cry[name] = (...args) => {
    if (!enabled) return null;
    const buf = banked.get(name);
    if (buf) return playSample(buf, 0.9);
    const { seq, opts } = make(...args);
    return shout(seq, opts);
  };

// ---------- 曲 ----------
//
// 1小節＝16ステップ（16分音符）。トークンの意味は
//   音名（"D5" など） … そこで発音
//   "."               … 直前の音を伸ばす
//   "-"               … 休み
// 打楽器トラックは K（バスドラ）／S（スネア）／H（ハイハット）／"-"。

const bar = (s) => s.trim().split(/\s+/);
const rep = (b, n) => Array(n).fill(b).flat();

const REST16 = rep(["-"], 16);

// 「みどりの柱の塔」ステージ曲。120拍/分・ニ短調・8小節でループ。
// 洞窟の中を淡々と登っていく感じを出すため、低音は8分で刻み、
// 上物はアルペジオを薄く敷いて主旋律を上に置く。
const STAGE = {
  bpm: 120,
  tracks: {
    lead: [
      bar("D5 .  .  -  A4 -  D5 -  F5 .  .  -  E5 -  -  -"),
      bar("F5 .  .  -  D5 -  Bb4 - D5 .  .  -  F5 -  -  -"),
      bar("A5 .  .  -  F5 -  C5 -  F5 .  .  -  E5 -  -  -"),
      bar("G5 .  .  -  E5 -  C5 -  E5 .  .  .  .  -  -  -"),
      bar("D5 .  .  -  A4 -  D5 -  F5 .  .  -  A5 -  -  -"),
      bar("Bb5 . .  -  A5 -  F5 -  D5 .  .  -  Bb4 - -  -"),
      bar("G5 .  .  -  D5 -  Bb4 - D5 .  .  -  G5 -  -  -"),
      bar("A5 .  .  -  E5 -  C#5 - E5 .  .  .  .  -  -  -"),
    ].flat(),
    bass: [
      bar("D2 -  D3 -  D2 -  D3 -  D2 -  D3 -  A2 -  A2 -"),
      bar("Bb1 - Bb2 - Bb1 - Bb2 - Bb1 - Bb2 - F2 -  F2 -"),
      bar("F2 -  F3 -  F2 -  F3 -  F2 -  F3 -  C3 -  C3 -"),
      bar("C2 -  C3 -  C2 -  C3 -  C2 -  C3 -  G2 -  G2 -"),
      bar("D2 -  D3 -  D2 -  D3 -  D2 -  D3 -  A2 -  A2 -"),
      bar("Bb1 - Bb2 - Bb1 - Bb2 - Bb1 - Bb2 - F2 -  F2 -"),
      bar("G1 -  G2 -  G1 -  G2 -  G1 -  G2 -  D2 -  D2 -"),
      bar("A1 -  A2 -  A1 -  A2 -  A1 -  A2 -  E2 -  E2 -"),
    ].flat(),
    arp: [
      rep(bar("D4 F4 A4 F4"), 4),
      rep(bar("Bb3 D4 F4 D4"), 4),
      rep(bar("F3 A3 C4 A3"), 4),
      rep(bar("C4 E4 G4 E4"), 4),
      rep(bar("D4 F4 A4 F4"), 4),
      rep(bar("Bb3 D4 F4 D4"), 4),
      rep(bar("G3 Bb3 D4 Bb3"), 4),
      rep(bar("A3 C#4 E4 C#4"), 4),
    ].flat(),
    drum: rep(bar("K -  -  H  S  -  -  H  K  -  K  H  S  -  H  H"), 8),
  },
};

// タイトル画面。同じ調のまま、旋律を減らして静かにする。
const TITLE = {
  bpm: 108,
  tracks: {
    lead: [
      bar("A4 .  .  .  .  -  -  -  D5 .  .  .  .  -  -  -"),
      bar("F5 .  .  .  .  -  E5 -  D5 .  .  .  .  .  .  -"),
      bar("C5 .  .  .  .  -  -  -  E5 .  .  .  .  -  -  -"),
      bar("G5 .  .  .  .  -  F5 -  E5 .  .  .  .  .  .  -"),
    ].flat(),
    bass: [
      bar("D2 -  -  -  -  -  -  -  D2 -  -  -  A2 -  -  -"),
      bar("Bb1 - -  -  -  -  -  -  Bb1 - -  -  F2 -  -  -"),
      bar("C2 -  -  -  -  -  -  -  C2 -  -  -  G2 -  -  -"),
      bar("A1 -  -  -  -  -  -  -  A1 -  -  -  E2 -  -  -"),
    ].flat(),
    arp: [
      rep(bar("D4 F4 A4 F4"), 4),
      rep(bar("Bb3 D4 F4 D4"), 4),
      rep(bar("C4 E4 G4 E4"), 4),
      rep(bar("A3 C#4 E4 C#4"), 4),
    ].flat(),
    drum: REST16,
  },
};

// クリアのファンファーレ（1回だけ）
const CLEAR = {
  bpm: 132,
  once: true,
  tracks: {
    lead: [
      bar("D5 -  F5 -  A5 -  D6 .  .  -  A5 -  D6 .  .  ."),
      bar(".  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -"),
    ].flat(),
    bass: [
      bar("D2 -  D2 -  D3 -  D2 -  A2 -  A2 -  D2 .  .  ."),
      bar(".  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -"),
    ].flat(),
    arp: [
      bar("D4 F4 A4 D5 F5 A5 D6 -  A5 -  F5 -  D5 .  .  ."),
      bar(".  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -"),
    ].flat(),
    drum: [
      bar("K -  S  -  K  -  S  -  K  S  K  S  K  -  -  -"),
      REST16,
    ].flat(),
  },
};

// ゲームオーバー（1回だけ）
const OVER = {
  bpm: 100,
  once: true,
  tracks: {
    lead: [
      bar("A4 .  .  -  G4 .  .  -  F4 .  .  -  E4 .  .  ."),
      bar("D4 .  .  .  .  .  .  .  -  -  -  -  -  -  -  -"),
    ].flat(),
    bass: [
      bar("A2 -  -  -  G2 -  -  -  F2 -  -  -  E2 -  -  -"),
      bar("D2 .  .  .  .  .  .  .  -  -  -  -  -  -  -  -"),
    ].flat(),
    arp: REST16.concat(REST16),
    drum: REST16.concat(REST16),
  },
};

// テストから中身を確かめられるよう外に出しておく
export const SONGS = { title: TITLE, stage: STAGE, clear: CLEAR, over: OVER };

// トラックごとの音色
const PATCH = {
  // 主旋律はよく伸びる矩形波、低音は短い三角波、アルペジオは小さくポンと切る
  lead: (out, f, t, d) =>
    voice(out, f, t, d, {
      type: "square",
      vol: 0.26,
      attack: 0.012,
      sustain: 0.80,
      release: 0.09,
    }),
  bass: (out, f, t, d) =>
    voice(out, f, t, Math.min(d, 0.22), {
      type: "triangle",
      vol: 0.40,
      attack: 0.004,
      sustain: 0.45,
      release: 0.05,
    }),
  arp: (out, f, t) =>
    voice(out, f, t, 0.11, { type: "square", vol: 0.075, attack: 0.004, sustain: 0.25 }),
};

function drumHit(out, kind, t) {
  if (kind === "K") {
    voice(out, 130, t, 0.16, {
      type: "sine",
      vol: 0.55,
      slideTo: 42,
      attack: 0.002,
      sustain: 0.05,
    });
  } else if (kind === "S") {
    noise(out, t, 0.13, { vol: 0.22, freq: 1600, q: 0.8 });
    voice(out, 210, t, 0.07, { type: "triangle", vol: 0.16, sustain: 0.05 });
  } else if (kind === "H") {
    noise(out, t, 0.045, { vol: 0.075, freq: 7000, type: "highpass" });
  }
}

// 直前の発音を "." で伸ばすため、各ステップの「実際の長さ」を先に数えておく。
function compile(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-" || t === ".") continue;
    let len = 1;
    while (i + len < tokens.length && tokens[i + len] === ".") len++;
    out.push({ step: i, note: t, len });
  }
  return out;
}

const compiled = new WeakMap();
export function songData(song) {
  let d = compiled.get(song);
  if (!d) {
    d = { steps: 0, tracks: {} };
    for (const [name, tokens] of Object.entries(song.tracks)) {
      d.steps = Math.max(d.steps, tokens.length);
      d.tracks[name] = name === "drum" ? tokens : compile(tokens);
    }
    compiled.set(song, d);
  }
  return d;
}

class Player {
  constructor() {
    this.song = null;
    this.name = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.done = 0;
  }

  play(name) {
    const song = SONGS[name];
    if (!song || (this.name === name && this.timer)) return;
    const c = ensure();
    if (!c) return;
    this.stop();
    this.song = song;
    this.name = name;
    this.data = songData(song);
    this.stepDur = 60 / song.bpm / 4;
    this.step = 0;
    this.done = 0;
    this.nextTime = c.currentTime + 0.06;
    this._tick();
    this.timer = setInterval(() => this._tick(), 60);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.name = null;
    this.song = null;
    this.done = 0;
  }

  _tick() {
    const c = ctx;
    if (!c || !this.song) return;
    // 一発物は最後まで予約し終えたら、鳴り終わる時刻に自分で止まる
    if (this.done) {
      if (c.currentTime > this.done) this.stop();
      return;
    }
    const horizon = c.currentTime + 0.3;
    while (this.nextTime < horizon) {
      const s = this.step;
      for (const [track, items] of Object.entries(this.data.tracks)) {
        if (track === "drum") {
          const k = items[s % items.length];
          if (k && k !== "-") drumHit(bgmGain, k, this.nextTime);
          continue;
        }
        const patch = PATCH[track];
        if (!patch) continue;
        for (const n of items) {
          if (n.step !== s) continue;
          patch(bgmGain, hz(midi(n.note)), this.nextTime, n.len * this.stepDur * 0.9);
        }
      }
      this.step++;
      this.nextTime += this.stepDur;
      if (this.step >= this.data.steps) {
        if (this.song.once) {
          this.done = this.nextTime + 0.6;
          return;
        }
        this.step = 0;
      }
    }
  }
}

export const bgm = new Player();
