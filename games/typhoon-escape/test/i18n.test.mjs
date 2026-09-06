import { check, section, summary } from "./harness.mjs";
import { LANGS, LANG_CODES, STRINGS, REGION_KEYS, bundle, pickLang, DEFAULT_LANG } from "../src/rules/i18n.js";
import { gameDate, formatDate } from "../src/rules/game.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

section("言語の一覧（DESIGN.md §7.2）");

check("3 言語ある", LANGS.length === 3, LANGS.map((l) => l.code).join(" "));
check("英語・日本語・繁體中文", LANG_CODES.join(",") === "en,ja,zh-Hant", LANG_CODES.join(","));
check("既定は英語（元の要件どおり）", DEFAULT_LANG === "en");
for (const { code, label } of LANGS) {
  check(`${code} に束がある`, !!STRINGS[code]);
  check(`${code} のボタン名は自称`, label === { en: "English", ja: "日本語", "zh-Hant": "繁體中文" }[code], label);
}

section("束の網羅性 — どの言語にも同じ鍵が揃っている");

const KEYS = Object.keys(STRINGS.en);
check("英語の束に鍵がある", KEYS.length > 20, `${KEYS.length} 個`);
for (const code of LANG_CODES) {
  const L = STRINGS[code];
  const missing = KEYS.filter((k) => !(k in L));
  check(`${code}: 鍵の欠けが無い`, missing.length === 0, missing.join(", "));
  const extra = Object.keys(L).filter((k) => !KEYS.includes(k));
  check(`${code}: 余分な鍵が無い`, extra.length === 0, extra.join(", "));
  for (const k of KEYS) {
    check(`${code}.${k} が英語と同じ型`, typeof L[k] === typeof STRINGS.en[k], `${typeof L[k]} vs ${typeof STRINGS.en[k]}`);
  }
}

section("文言が実際に翻訳されている（英語の使い回しでない）");

// 作品名 TYPHOON ESCAPE と htmlLang/code は言語をまたいで同じでよい。
const SAME_OK = new Set(["title", "code", "htmlLang"]);
for (const code of ["ja", "zh-Hant"]) {
  const L = STRINGS[code];
  for (const k of KEYS) {
    if (SAME_OK.has(k) || typeof L[k] === "function") continue;
    check(`${code}.${k} が英語と違う`, L[k] !== STRINGS.en[k], String(L[k]).slice(0, 40));
  }
  for (const k of REGION_KEYS) {
    check(`${code}.regions.${k} が英語と違う`, L.regions[k] !== STRINGS.en.regions[k], L.regions[k]);
  }
}

section("生存日数の文言（DESIGN.md §1b.10）");

check("英語 1 日は単数", STRINGS.en.survivedHud(1) === "Survived 1 day", STRINGS.en.survivedHud(1));
check("英語 2 日は複数", STRINGS.en.survivedHud(2) === "Survived 2 days", STRINGS.en.survivedHud(2));
check("英語 0 日は複数", STRINGS.en.survivedHud(0) === "Survived 0 days", STRINGS.en.survivedHud(0));
check("英語のゲームオーバー文も単複を分ける",
  STRINGS.en.survivedOver(1) === "You survived 1 day." && STRINGS.en.survivedOver(3) === "You survived 3 days.",
  `${STRINGS.en.survivedOver(1)} / ${STRINGS.en.survivedOver(3)}`);
for (const code of LANG_CODES) {
  const L = STRINGS[code];
  for (const n of [0, 1, 12, 137]) {
    check(`${code}: HUD に日数 ${n} が入る`, L.survivedHud(n).includes(String(n)), L.survivedHud(n));
    check(`${code}: ゲームオーバーに日数 ${n} が入る`, L.survivedOver(n).includes(String(n)), L.survivedOver(n));
  }
}

section("日付の書式");

// 2026-08-01 は START_DATE そのもの（elapsed 0 日）。
const d0 = gameDate(0);
check("英語は August 1, 2026", formatDate(d0, STRINGS.en) === "August 1, 2026", formatDate(d0, STRINGS.en));
check("日本語は 2026年8月1日", formatDate(d0, STRINGS.ja) === "2026年8月1日", formatDate(d0, STRINGS.ja));
check("繁體中文も 2026年8月1日", formatDate(d0, STRINGS["zh-Hant"]) === "2026年8月1日", formatDate(d0, STRINGS["zh-Hant"]));
// 月の 12 通りすべてで落ちないこと（MONTHS 配列の添字ずれの検出）
const months = [];
for (let m = 0; m < 12; m++) months.push(STRINGS.en.date(2026, m, 1));
check("英語の月名 12 個がすべて異なる", new Set(months).size === 12, months.join(","));
check("英語の月名に undefined が無い", months.every((s) => !s.includes("undefined")), months.join(","));
check("日本語の月は 1 始まり", STRINGS.ja.date(2026, 0, 5) === "2026年1月5日" && STRINGS.ja.date(2026, 11, 5) === "2026年12月5日",
  `${STRINGS.ja.date(2026, 0, 5)} / ${STRINGS.ja.date(2026, 11, 5)}`);

section("日付と生存日数が食い違わない（§1b.10）");
// 表示日付は START_DATE + floor(elapsed) なので、日数と日付は同じ量から出ている。
for (const days of [0, 1, 30, 31, 200]) {
  const a = gameDate(days + 0.9);
  const b = gameDate(days);
  check(`elapsed ${days}.9 と ${days} は同じ日付`, a.getTime() === b.getTime(), `${a} / ${b}`);
}
const ms = gameDate(45) - gameDate(0);
check("45 日進むと 45 日ぶん進む", Math.round(ms / 86400000) === 45, `${ms / 86400000} 日`);

section("ニュース文と上陸文に番号と名前が入る");
for (const code of LANG_CODES) {
  const L = STRINGS[code];
  for (const fn of ["newsFormed", "newsWeakened", "newsAway"]) {
    const s = L[fn](7, "Oh No");
    check(`${code}.${fn} に番号と名前`, s.includes("7") && s.includes("Oh No"), s);
  }
  const lf = L.landfall(7, "Oh No", L.regions.N);
  check(`${code}.landfall に番号・名前・地域`, lf.includes("7") && lf.includes("Oh No") && lf.includes(L.regions.N), lf);
  const sb = L.shareBody("D", "LF", 9);
  check(`${code}.shareBody に日付・上陸文・日数`, sb.includes("D") && sb.includes("LF") && sb.includes("9"), sb);
}

section("台風名は訳さない（創作なので対訳が存在しない）");
check("どの言語の束にも台風名の一覧が無い", LANG_CODES.every((c) => !("names" in STRINGS[c])));

section("言語の決め方（pickLang）");
const CASES = [
  [["ja-JP", "en-US"], "ja", "ブラウザが日本語"],
  [["zh-TW"], "zh-Hant", "台湾"],
  [["zh-HK"], "zh-Hant", "香港"],
  [["zh-Hant-TW"], "zh-Hant", "明示的な繁体字"],
  [["zh"], "zh-Hant", "素の zh は繁體へ寄せる（本作の選択）"],
  [["zh-CN"], "en", "簡体字は選択肢が無いので英語"],
  [["fr-FR"], "en", "未対応の言語は英語"],
  [[], "en", "情報が無ければ英語"],
];
for (const [navs, want, why] of CASES) {
  check(`${why}: ${JSON.stringify(navs)} → ${want}`, pickLang("", navs) === want, pickLang("", navs));
}
check("保存値が最優先", pickLang("ja", ["en-US"]) === "ja");
check("壊れた保存値は無視する", pickLang("xx", ["en-US"]) === "en");
check("bundle は未知のコードでも落ちない", bundle("xx") === STRINGS.en && bundle(undefined) === STRINGS.en);

section("文言の置き場所（§0.3 / §7.1）");
// 画面に出る文字列は i18n.js だけが持つ。他所に生の日本語・繁體中文が混ざっていないか。
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
// コメントは日本語で書く方針なので、**文字列リテラルの中だけ**を見る。
const LIT = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
const CJK = /[぀-ヿ一-鿿]/;
for (const f of walk("src").filter((f) => !f.endsWith("i18n.js"))) {
  const src = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "") // ブロックコメント
    .replace(/^\s*\/\/.*$/gm, ""); // 行コメント
  const bad = [...src.matchAll(LIT)].map((m) => m[2]).filter((s) => CJK.test(s));
  check(`${f} に画面用の CJK 文字列が無い`, bad.length === 0, bad.join(" | "));
}

section("HTML に文言を直書きしていない");
const html = readFileSync("index.html", "utf8");
for (const id of ["ptitle", "ptext", "pdays", "pbtn", "sharebtn", "menutitle", "mapcredit", "disclaimer", "time", "survived", "langs"]) {
  check(`#${id} が存在する`, new RegExp(`id="${id}"`).test(html));
}
// 文言を持つ要素は空で出荷し、起動時に束から入れる。
for (const [tag, id] of [["h1", "ptitle"], ["p", "ptext"], ["p", "pdays"], ["button", "pbtn"], ["button", "sharebtn"], ["h3", "menutitle"], ["p", "mapcredit"], ["div", "time"]]) {
  const m = html.match(new RegExp(`<${tag} id="${id}"[^>]*>([^<]*)</${tag}>`));
  check(`#${id} は空で出荷される`, m && m[1].trim() === "", m ? m[1] : "見つからない");
}

summary("i18n");
