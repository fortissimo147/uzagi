// 録音した声を src/voicebank.js に取り込むツール。
//   npm run voicebank [入力フォルダ]
// 既定の入力は voice/。ファイル名が cry の名前になる（wa.wav → cry.wa）。
//
// 音声ファイルは data URI としてJSに埋め込む。こうすると単体HTMLに
// そのまま入るので、別ファイルを持ち歩かなくてよい。
//
// 入れてよいのは自分で録った声か、使う権利のある音だけ。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRIES } from "../src/audio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IN = process.argv[2] || path.join(ROOT, "voice");
const OUT = path.join(ROOT, "src", "voicebank.js");

// cry に無い名前を入れても鳴らないので、ここで気づけるようにする。
// audio.js の CRIES から採るので、声を足しても表を直さなくてよい。
const KNOWN = Object.keys(CRIES);
const MIME = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
};

// 1本の録音を複数の動きに当てる表（当てる先: 録音の名前）。
// 声そのものは切り出したまま。鳴らす場所だけ増やす。
// 同じ data URI は下で1回しか書き出さないので、増やしても容量は変わらない。
const ALIAS = {
  hup: "wahoo", // 幅跳び。大きく跳ぶので、3段ジャンプと同じ長い掛け声
  kick: "ya", // 壁キック。cry.ya の説明どおり「やっ」で蹴る
  stomp: "wa", // 敵を踏む。短い掛け声
  pound: "ya", // ヒップドロップ。叩きつける一声
  heal: "cheer", // 回復。うれしいときの声
};
// land（着地の「ふっ」）と idle（立ち止まりの「ん…」）は息の音で、
// 叫びを当てると出るたびにうるさい。ここは合成のままにしてある。

const HEAD = `// 録音した声。audio.js がここに入っている名前は録音で鳴らし、
// 無い名前は合成で鳴らす。
//
// このファイルは tools/make-voicebank.mjs が書き出す。手で編集しないこと。
//   1. voice/ に wa.wav / ya.wav … と置く（名前は cry の名前と同じ）
//   2. npm run voicebank
//
// 同じ録音を複数の動きで使うときは、その表も make-voicebank.mjs にある。
//
// 入れてよいのは自分で録った声か、使う権利のある音だけ。
`;

if (!fs.existsSync(IN)) {
  console.error(`${IN} がありません。録音した音声をこのフォルダに置いてください。`);
  console.error(`使える名前: ${KNOWN.join(" / ")}`);
  process.exit(1);
}

const clips = []; // 録音そのもの（1本につき1つ）
let total = 0;
for (const file of fs.readdirSync(IN).sort()) {
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file, ext);
  if (!MIME[ext]) continue;
  if (!KNOWN.includes(name)) {
    console.warn(`  ${file} … cry に「${name}」は無いので飛ばします`);
    continue;
  }
  const buf = fs.readFileSync(path.join(IN, file));
  total += buf.length;
  clips.push({ name, uri: `data:${MIME[ext]};base64,${buf.toString("base64")}` });
  console.log(`  ${file} → cry.${name}（${(buf.length / 1024) | 0} KB）`);
}

if (!clips.length) {
  console.error(`${IN} に使える音声がありません（${Object.keys(MIME).join(" / ")}）。`);
  process.exit(1);
}

// 当てる先を組み立てる。録音そのものが先、使い回しがあと。
const have = new Set(clips.map((c) => c.name));
const uses = clips.map((c) => [c.name, c.name]);
for (const [to, from] of Object.entries(ALIAS)) {
  if (!KNOWN.includes(to)) {
    console.warn(`  使い回し ${to} … cry に無い名前なので飛ばします`);
    continue;
  }
  if (have.has(to)) continue; // その名前の録音があるなら、そちらが優先
  if (!have.has(from)) {
    console.warn(`  使い回し ${to} … 元の「${from}」の録音が無いので飛ばします`);
    continue;
  }
  uses.push([to, from]);
  console.log(`  cry.${to} ← ${from} の録音を使い回し`);
}

// 録音は const にして、使い回しはその名前を指すだけにする。
// こうすると同じ base64 が2度出ないので、単体HTMLが太らない。
const decls = clips.map((c) => `const v_${c.name} = "${c.uri}";`).join("\n");
const body = uses.map(([to, from]) => `  ${to}: v_${from},`).join("\n");
fs.writeFileSync(OUT, `${HEAD}${decls}\n\nexport const VOICEBANK = {\n${body}\n};\n`);

// base64 は元のファイルの約1.34倍になる。単体HTMLの大きさに効くので出しておく。
const synth = KNOWN.filter((n) => !uses.some(([to]) => to === n));
console.log(
  `${OUT} を書き出しました（録音 ${clips.length}本 → 声 ${uses.length}個 / ` +
    `元 ${(total / 1024) | 0} KB → 埋め込み後 約${((total * 4) / 3 / 1024) | 0} KB）`
);
if (synth.length) console.log(`合成のまま残るもの: ${synth.join(" / ")}`);
