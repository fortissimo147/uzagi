// 音まわりの単体テスト。audio.js は読み込むだけならブラウザのAPIに触れないので、
// Node からそのまま import して曲データを確かめられる。
// 「小節のトークンを1個書き落とす」とリズムが静かにずれるので、そこを機械的に守る。
import { SONGS, midi, songData, CRIES, VOWEL, THROAT } from "../src/audio.js";
import { VOICEBANK } from "../src/voicebank.js";
import { check, section, summary } from "./harness.mjs";

section("1. 音名の解釈");
const NOTES = [
  ["C4", 60],
  ["A4", 69],
  ["D5", 74],
  ["Bb4", 70],
  ["C#5", 73],
  ["A1", 33],
  ["G1", 31],
  ["D6", 86],
];
for (const [name, want] of NOTES)
  check(`${name} → ${want}`, midi(name) === want, `実際 ${midi(name)}`);

section("2. 曲データの形");
const EXPECT = { title: true, stage: true, clear: true, over: true };
for (const name of Object.keys(EXPECT)) {
  const song = SONGS[name];
  check(`${name}: 曲が存在する`, !!song);
  check(`${name}: テンポが妥当`, song.bpm >= 60 && song.bpm <= 200, `bpm=${song.bpm}`);

  const lengths = Object.entries(song.tracks).map(([k, v]) => [k, v.length]);
  for (const [track, len] of lengths)
    check(
      `${name}/${track}: 小節がきちんと16ステップで割り切れる`,
      len % 16 === 0 && len > 0,
      `${len} ステップ`
    );

  // 打楽器以外のトラックは長さがそろっていること（そろっていないと途中でずれる）
  const melodic = lengths.filter(([k]) => k !== "drum").map(([, l]) => l);
  check(
    `${name}: 旋律系トラックの長さがそろっている`,
    new Set(melodic).size === 1,
    melodic.join(" / ")
  );

  const d = songData(song);
  for (const [track, items] of Object.entries(d.tracks)) {
    if (track === "drum") {
      const bad = items.filter((t) => !"KSH-".includes(t));
      check(`${name}/drum: 未知の記号がない`, bad.length === 0, bad.join(","));
      continue;
    }
    const bad = items.filter((it) => !Number.isFinite(midi(it.note)));
    check(`${name}/${track}: 読めない音名がない`, bad.length === 0, bad.map((b) => b.note).join(","));
    const over = items.filter((it) => it.step + it.len > d.steps);
    check(`${name}/${track}: 曲の終わりをはみ出す音がない`, over.length === 0);
  }
}

section("3. ループと一発物の区別");
check("ステージ曲はループする", !SONGS.stage.once);
check("タイトル曲はループする", !SONGS.title.once);
check("クリアは1回だけ", SONGS.clear.once === true);
check("ゲームオーバーは1回だけ", SONGS.over.once === true);

section("4. ステージ曲の中身");
const stage = songData(SONGS.stage);
check("8小節ある", stage.steps === 128, `${stage.steps} ステップ`);
check("主旋律に音が入っている", stage.tracks.lead.length > 20);
check("低音に音が入っている", stage.tracks.bass.length > 30);
check(
  "打楽器にバスドラとスネアが入っている",
  stage.tracks.drum.includes("K") && stage.tracks.drum.includes("S")
);
// ニ短調なので、主旋律の音はすべて D E F G A Bb C（＋導音の C#）に収まるはず
const SCALE = new Set([2, 4, 5, 7, 9, 10, 0, 1]); // D E F G A Bb C C#
const outOfKey = stage.tracks.lead.filter((n) => !SCALE.has(midi(n.note) % 12));
check("主旋律がニ短調から外れない", outOfKey.length === 0, outOfKey.map((n) => n.note).join(","));

section("5. 叫び声");
// 叫びは「声帯の高さ(f0)」を「口の共鳴(F1)」より下に置かないと母音が消え、
// ただの電子音になる。ここが一番壊れやすいので機械で守る。
for (const [name, make] of Object.entries(CRIES)) {
  const { seq, opts } = make();
  check(`${name}: 母音がそろっている`, seq.every((p) => VOWEL[p.v]), seq.map((p) => p.v).join(""));
  check(`${name}: 長さが正`, seq.every((p) => p.d > 0));
  check(`${name}: 音量が正`, opts.vol > 0);
  const total = seq.reduce((a, p) => a + p.d, 0);
  check(`${name}: 全体が 0.05〜3秒に収まる`, total > 0.05 && total <= 3, `${total.toFixed(2)}秒`);
  const pitches = [opts.start ?? seq[0].f, ...seq.map((p) => p.f)];
  check(`${name}: 高さがすべて正`, pitches.every((f) => f > 0));
  // shout() は区間の「終わり」で共鳴がその母音に到達する。始まりの時点では
  // まだ前の母音の形なので、比べる相手は「その瞬間に鳴っている母音」にする。
  const knots = [[pitches[0], seq[0].v], ...seq.map((p, i) => [pitches[i + 1], p.v])];
  const bad = knots.filter(([f, v]) => f >= VOWEL[v][0] * THROAT * 0.75);
  check(
    `${name}: 声の高さが第1共鳴を越えない`,
    bad.length === 0,
    bad.map(([f, v]) => `${v}@${f}Hz`).join(",")
  );
}
// 落下の悲鳴だけは、途中で止められるよう長め（落ちきるまで鳴らす）
check("落下の悲鳴は2秒以上ある", CRIES.fall().seq.reduce((a, p) => a + p.d, 0) >= 2);
// 掛け声の子音は「母音の渡り」で作る。わ は う→あ、や は い→あ。
check("わっ は う から あ へ渡る", CRIES.wa().seq[0].v === "u" && CRIES.wa().seq[1].v === "a");
check("やっ は い から あ へ渡る", CRIES.ya().seq[0].v === "i" && CRIES.ya().seq[1].v === "a");
// 3段ジャンプの掛け声は上がって終わる（跳んだ感じを出すため）
const y = CRIES.wahoo();
check("わほー は上がって終わる", y.seq[y.seq.length - 1].f > (y.opts.start ?? y.seq[0].f));
// 動画の実測（160〜370ms、246〜453Hz）から大きく外れないこと
for (const n of ["wa", "ya", "wahoo"]) {
  const { seq, opts } = CRIES[n]();
  const d = seq.reduce((a, p) => a + p.d, 0);
  check(`${n} の長さが実測の範囲(0.25〜0.55秒)`, d >= 0.25 && d <= 0.55, `${d.toFixed(2)}秒`);
  const fs = [opts.start ?? seq[0].f, ...seq.map((p) => p.f)];
  check(
    `${n} の高さが実測の範囲(240〜460Hz)`,
    Math.min(...fs) >= 240 && Math.max(...fs) <= 460,
    `${Math.min(...fs)}〜${Math.max(...fs)}Hz`
  );
}
// 掛け声は短くないとジャンプの連打で重なる
// 表の長さには最後の減衰も含まれる。実際に鳴っている長さは約320msで、
// 動画の実測（310〜368ms）と同じ。連打しても重なりすぎない上限として 0.45 を見る。
for (const n of ["wa", "ya"])
  check(`${n} は 0.45秒以内`, CRIES[n]().seq.reduce((a, p) => a + p.d, 0) <= 0.45);

section("6. 録音した声（voicebank）");
// 録音は任意。既定は空で、全部フォルマント合成で鳴る。
// 録音を入れた名前だけそちらに切り替わるので、入っているものについてだけ
// data URI を base64 から戻して WAV の頭を読み、ゲームで使える形か見る。
const bankNames = Object.keys(VOICEBANK);
check(
  "voicebank の名前はすべて cry にある",
  bankNames.every((n) => n in CRIES),
  bankNames.filter((n) => !(n in CRIES)).join(",") || "問題なし"
);
check(
  "voicebank の中身は data URI",
  Object.values(VOICEBANK).every((v) => /^data:audio\/[\w.+-]+;base64,/.test(v))
);
const synthNames = Object.keys(CRIES).filter((n) => !(n in VOICEBANK));
check(
  `録音 ${bankNames.length}件 / 合成 ${synthNames.length}件`,
  true,
  synthNames.length ? `合成で鳴る: ${synthNames.join(",")}` : "すべて録音"
);

// WAV の頭（RIFF/fmt/data）だけ読む。中身は 16bit PCM しか出さないので、
// 波形の頭打ちもここで一緒に見ておく。
function readWav(uri) {
  const buf = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE")
    return null;
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("latin1", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ")
      fmt = {
        channels: buf.readUInt16LE(pos + 10),
        rate: buf.readUInt32LE(pos + 12),
        bits: buf.readUInt16LE(pos + 22),
      };
    else if (id === "data") data = { start: pos + 8, size: Math.min(size, buf.length - pos - 8) };
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) return null;
  const n = (data.size / (fmt.bits / 8)) | 0;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf.readInt16LE(data.start + i * 2)));
  return { ...fmt, seconds: n / fmt.channels / fmt.rate, peak: peak / 32768 };
}

for (const [name, uri] of Object.entries(VOICEBANK)) {
  if (!/^data:audio\/wav/.test(uri)) continue; // wav 以外はブラウザ任せ
  const w = readWav(uri);
  if (!check(`${name}: WAV として読める`, !!w)) continue;
  check(`${name}: モノラル`, w.channels === 1, `${w.channels}ch`);
  check(`${name}: 16bit`, w.bits === 16, `${w.bits}bit`);
  // 頭打ちすると歪む。書き出すときに余裕を残しておくこと。
  check(`${name}: 頭打ちしていない`, w.peak < 0.99, `最大 ${w.peak.toFixed(3)}`);
  // 落下の悲鳴は途中で止める前提なので長め、掛け声は連打で重なるので短め。
  // 長さは録音そのもので決まる（切り出した声に手を入れない方針）ので、
  // ここは「その用途に耐える範囲か」だけを見る。
  if (name === "fall")
    check(`${name}: 落ちるあいだ持つ長さがある`, w.seconds >= 0.6, `${w.seconds.toFixed(2)}秒`);
  // 跳ぶ・蹴る・踏むは連打されるので、次の一声までに終わっていること
  if (["wa", "ya", "kick", "stomp", "pound"].includes(name))
    check(`${name}: 0.45秒以内`, w.seconds <= 0.45, `${w.seconds.toFixed(2)}秒`);
  // 被弾は連続で食らっても重ならない程度に
  if (name === "hurt") check(`${name}: 0.7秒以内`, w.seconds <= 0.7, `${w.seconds.toFixed(2)}秒`);
}

summary("audio.test.mjs");
