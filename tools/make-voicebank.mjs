// 録音した声を src/voicebank.js に取り込むツール。
//   npm run voicebank
//
// voice/ には「発音」で名前をつけた録音を置く（ha.wav / ya-short.wav …）。
// どの録音をどの動きに当てるかは下の VOICE 表で決める。動きに声を当て直す
// ときは、この表の右側を書き換えて npm run voicebank を実行するだけ。
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

// 動き（audio.js の cry の名前）→ 当てる録音（voice/ のファイル名）。
// 同じ録音を何度書いても、埋め込みは1回だけなので容量は増えない。
const VOICE = {
  // 跳ぶ
  wa: "yaha", // ジャンプ。「やは」と続けて言った録音そのもの
  ya: "ha-rise", // 2段ジャンプ「は」… 続けて跳ぶと「や→は」になる
  wahoo: "ya-rise", // 3段ジャンプ。上がって張る声
  hup: "ha", // 幅跳び
  kick: "ha-rise", // 壁キック
  // 当てる
  stomp: "ya-short", // 敵を踏む
  pound: "ya-short", // ヒップドロップ
  // ひどい目にあう
  fall: "hah", // 落下。いちばん長く伸びる「はー」
  hurt: "hah", // 被弾。「はっ！」
  dead: "uma-long", // ゲームオーバー。いちばん長い声
  // うれしい
  cheer: "ya-rise", // ゴール
  heal: "ha", // ライフ回復
  // land（着地の「ふっ」）と idle（立ち止まりの「ん…」）は息の音。
  // 叫びを当てると出るたびにうるさいので、audio.js の合成のままにしてある。
};

const MIME = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
};

const HEAD = `// 録音した声。audio.js がここに入っている名前は録音で鳴らし、
// 無い名前は合成で鳴らす。
//
// このファイルは tools/make-voicebank.mjs が書き出す。手で編集しないこと。
// どの録音をどの動きに当てるかも、その VOICE 表にある。
//
// 入れてよいのは自分で録った声か、使う権利のある音だけ。
`;

if (!fs.existsSync(IN)) {
  console.error(`${IN} がありません。録音した音声をこのフォルダに置いてください。`);
  process.exit(1);
}

// voice/ にあるファイルを「拡張子なしの名前」で引けるようにする
const files = new Map();
for (const file of fs.readdirSync(IN).sort()) {
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) continue;
  files.set(path.basename(file, ext), file);
}
if (!files.size) {
  console.error(`${IN} に使える音声がありません（${Object.keys(MIME).join(" / ")}）。`);
  process.exit(1);
}

// 表を検算してから読む。綴り違いは黙って無音になるので、ここで止める。
const uses = [];
for (const [name, clip] of Object.entries(VOICE)) {
  if (!(name in CRIES)) {
    console.error(`VOICE の「${name}」は cry にありません（audio.js の CRIES を確認）。`);
    process.exit(1);
  }
  if (!files.has(clip)) {
    console.error(`VOICE の「${name}」が指す ${clip} が ${IN} にありません。`);
    process.exit(1);
  }
  uses.push([name, clip]);
}

// 使う録音だけを読み込む（1本につき1回）
const clips = new Map();
let total = 0;
for (const clip of new Set(uses.map(([, c]) => c))) {
  const file = files.get(clip);
  const buf = fs.readFileSync(path.join(IN, file));
  total += buf.length;
  clips.set(clip, `data:${MIME[path.extname(file).toLowerCase()]};base64,${buf.toString("base64")}`);
}

const ident = (s) => `v_${s.replace(/[^A-Za-z0-9_]/g, "_")}`;
for (const [name, clip] of uses) console.log(`  cry.${name} ← ${files.get(clip)}`);

const unused = [...files.keys()].filter((c) => !clips.has(c));
if (unused.length) console.warn(`  どの動きにも当たっていない録音: ${unused.join(" / ")}`);

// 録音は const にして、当てる先はその名前を指すだけにする。
// こうすると同じ base64 が2度出ないので、単体HTMLが太らない。
const decls = [...clips].map(([c, uri]) => `const ${ident(c)} = "${uri}";`).join("\n");
const body = uses.map(([name, clip]) => `  ${name}: ${ident(clip)},`).join("\n");
fs.writeFileSync(OUT, `${HEAD}${decls}\n\nexport const VOICEBANK = {\n${body}\n};\n`);

// base64 は元のファイルの約1.34倍になる。単体HTMLの大きさに効くので出しておく。
const synth = Object.keys(CRIES).filter((n) => !(n in VOICE));
console.log(
  `${OUT} を書き出しました（録音 ${clips.size}本 → 声 ${uses.length}個 / ` +
    `元 ${(total / 1024) | 0} KB → 埋め込み後 約${((total * 4) / 3 / 1024) | 0} KB）`
);
if (synth.length) console.log(`合成のまま残るもの: ${synth.join(" / ")}`);
