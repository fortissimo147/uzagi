// 言語。DESIGN.md §7。
//
// 画面に出る文字列は**すべてここにある**。rules/ にも render/ にも直書きしない。
// render/ はゲームの中身を知らない（§0.3）ので、束（bundle）を渡してもらう側に徹する。
//
// ## 訳語の根拠（§7.3）
// 出典サイトは本セッションの egress プロキシで軒並み遮断されており、本文を読めなかった。
// 検索結果の**ページ表題**だけが一次資料に近い証拠として得られたので、それを根拠とする。
//   - extratropical cyclone = 溫帶氣旋
//     https://www.interpreting.hku.hk/glossary/?p=78358 （表題 "extratropical cyclone 溫帶氣旋"）
//     https://www.hko.gov.hk/tc/education/tropical-cyclone/classification-naming-characteristics/00146-extratropical-cyclone-vs-tropical-cyclone.html
//     （表題 "「溫帶氣旋」與「熱帶氣旋」 - 香港天文台"）
//   - 温帯低気圧（気象庁の用語。台風と対で説明されている）
//     https://www.jma.go.jp/jma/kishou/know/typhoon/conf/TY-ENQ2006/tropextrop.html （表題 "気象庁｜温帯低気圧と台風"）
//   - 台風の「上陸」（気象庁の統計用語）
//     https://www.data.jma.go.jp/typhoon/statistics/landing/landing.html （表題 "台風の上陸数"）
//   - 颱風の「登陸」（中央氣象署）
//     https://pweb.cwa.gov.tw/PopularScience/pr/pr_5.html
// 一方、次は**未検証 [推定]** である。
//   - 「第 N 號颱風」という番号の言い回し
//   - 地域名（臺灣北部…）。そもそも §1b.5 のとおり本作の地域区分は幾何近似であって
//     中華民國の統計地區標準分類ではないので、公式名称との一致は最初から求めていない。
//   - 台風名 140 個は本作の創作なので、どの言語でも英語のまま出す（訳す対象ではない）。

/** 選べる言語。label は自称（どの言語で見ても同じ綴り）なので訳さない。 */
export const LANGS = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh-Hant", label: "繁體中文" },
];

export const LANG_CODES = LANGS.map((l) => l.code);
export const DEFAULT_LANG = "en";

/** 上陸地域のキー。表示名は言語ごとに持つ（§1b.5）。 */
export const REGION_KEYS = ["N", "C", "S", "E"];

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 英語の複数形。1 だけ単数。 */
const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

const en = {
  code: "en",
  htmlLang: "en",
  title: "TYPHOON ESCAPE",
  intro: "Drag to move Taiwan.\nEscape the typhoons.",
  start: "Start the Summer",
  restart: "Start a New Summer",
  share: "Share on 𝕏",
  tagFormed: "FORMED",
  tagGone: "DISSIPATED",
  survivedHud: (n) => `Survived ${days(n)}`,
  survivedOver: (n) => `You survived ${days(n)}.`,
  date: (y, m, d) => `${MONTHS_EN[m]} ${d}, ${y}`,
  regions: { N: "Northern Taiwan", C: "Central Taiwan", S: "Southern Taiwan", E: "Eastern Taiwan" },
  newsFormed: (no, name) => `Typhoon No. ${no} (${name}) has formed. Stay alert for its forecast track.`,
  newsWeakened: (no, name) => `Typhoon No. ${no} (${name}) has weakened into an extratropical cyclone.`,
  newsAway: (no, name) => `Typhoon No. ${no} (${name}) has moved away from Taiwan and dissipated.`,
  landfall: (no, name, region) => `Typhoon No. ${no} (${name}) made landfall in ${region}`,
  shareHead: "[Game] Move Taiwan and outrun the typhoons!",
  shareBody: (date, landfall, n) => `On ${date}, ${landfall}. I survived ${days(n)}.`,
  menuTitle: "Data sources and licenses",
  mapCredit: "Map data: Natural Earth (public domain), converted to TopoJSON by world-atlas.",
  disclaimer:
    "Typhoon names in this game are entirely fictional and were made up for it. " +
    "They are not the official names assigned by the ESCAP/WMO Typhoon Committee.",
};

const ja = {
  code: "ja",
  htmlLang: "ja",
  title: "TYPHOON ESCAPE", // 作品名なので訳さない
  intro: "ドラッグして台湾を動かそう。\n台風から逃げきれ。",
  start: "この夏を始める",
  restart: "新しい夏を始める",
  share: "𝕏 で共有",
  tagFormed: "発生",
  tagGone: "消滅",
  survivedHud: (n) => `${n} 日生存`,
  survivedOver: (n) => `${n} 日間生き延びた。`,
  date: (y, m, d) => `${y}年${m + 1}月${d}日`,
  regions: { N: "台湾北部", C: "台湾中部", S: "台湾南部", E: "台湾東部" },
  newsFormed: (no, name) => `台風${no}号（${name}）が発生しました。今後の進路にご注意ください。`,
  newsWeakened: (no, name) => `台風${no}号（${name}）は温帯低気圧に変わりました。`,
  newsAway: (no, name) => `台風${no}号（${name}）は台湾から離れ、消滅しました。`,
  landfall: (no, name, region) => `台風${no}号（${name}）が${region}に上陸`,
  shareHead: "【ゲーム】台湾を動かして台風から逃げろ！",
  shareBody: (date, landfall, n) => `${date}、${landfall}。${n}日間生き延びた。`,
  menuTitle: "出典とライセンス",
  mapCredit:
    "地図データ：Natural Earth（パブリックドメイン）を world-atlas が TopoJSON に変換したもの。",
  disclaimer:
    "このゲームに出てくる台風の名前はすべて架空のもので、本作のために作られたものです。" +
    "ESCAP/WMO 台風委員会が定める正式な名称ではありません。",
};

const zhHant = {
  code: "zh-Hant",
  htmlLang: "zh-Hant",
  title: "TYPHOON ESCAPE",
  intro: "拖曳以移動臺灣。\n逃離颱風。",
  start: "開始這個夏天",
  restart: "開始新的夏天",
  share: "分享到 𝕏",
  tagFormed: "生成",
  tagGone: "消散",
  survivedHud: (n) => `已生存 ${n} 天`,
  survivedOver: (n) => `你生存了 ${n} 天。`,
  date: (y, m, d) => `${y}年${m + 1}月${d}日`,
  regions: { N: "臺灣北部", C: "臺灣中部", S: "臺灣南部", E: "臺灣東部" },
  newsFormed: (no, name) => `第 ${no} 號颱風（${name}）已生成，請留意後續路徑預報。`,
  newsWeakened: (no, name) => `第 ${no} 號颱風（${name}）已減弱為溫帶氣旋。`,
  newsAway: (no, name) => `第 ${no} 號颱風（${name}）已遠離臺灣並消散。`,
  landfall: (no, name, region) => `第 ${no} 號颱風（${name}）於${region}登陸`,
  shareHead: "【遊戲】移動臺灣，逃離颱風！",
  shareBody: (date, landfall, n) => `${date}，${landfall}。我生存了 ${n} 天。`,
  menuTitle: "資料來源與授權",
  mapCredit: "地圖資料：Natural Earth（公有領域），由 world-atlas 轉換為 TopoJSON。",
  disclaimer:
    "本遊戲中的颱風名稱全屬虛構，為本作品自行創作，" +
    "並非 ESCAP/WMO 颱風委員會所訂定的正式名稱。",
};

export const STRINGS = { en, ja, "zh-Hant": zhHant };

/** 未知のコードでも必ず束を返す。 */
export function bundle(code) {
  return STRINGS[code] || STRINGS[DEFAULT_LANG];
}

/**
 * 保存値 → ブラウザの言語 → 既定（英語）の順に決める。
 * `zh-TW` `zh-HK` `zh-Hant-TW` などはすべて繁體中文に寄せる。
 * 簡体字（`zh-CN` `zh-Hans`）は選択肢に無いので英語のまま。
 */
export function pickLang(stored, navLangs = []) {
  if (stored && STRINGS[stored]) return stored;
  for (const raw of navLangs) {
    const s = String(raw).toLowerCase();
    if (s === "zh" || s.startsWith("zh-hant") || /^zh-(tw|hk|mo)\b/.test(s)) return "zh-Hant";
    if (s.startsWith("ja")) return "ja";
    if (s.startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}

export const LANG_KEY = "typhoon-escape.lang";
