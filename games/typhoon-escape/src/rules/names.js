// 台風名 140 個。
//
// これは **完全な創作** であり、ESCAP/WMO 台風委員会および気象庁が定める
// 実在のアジア名リストとは一切関係がない。実在リストの取得が本プロジェクトの
// ネットワーク環境で不可能だったため、出典の要らない架空の名前に置き換えた。
// ゲーム内メニューにもその旨を英語で明記すること（DESIGN.md §7）。
//
// 実在リストと同じ「14 グループ × 10 個 = 140 個」の構造だけ踏襲している。
// 元ゲームと同じく、開始時にランダムな位置から順送りで使う。
//
// 表示例: "Typhoon No. 12 (Wobbles) made landfall in Southern Taiwan"
// 名前は 1〜3 語・最大 17 文字に収めてある（HUD とティッカーの折り返し対策）。

/** @type {{group: string, names: string[]}[]} */
import { STRINGS } from "./i18n.js";

export const NAME_GROUPS = [
  {
    group: "Cute but Lethal",
    names: ["Wobbles", "Nibbles", "Squeaky", "Pudding", "Bubbles",
            "Mochi", "Dumpling", "Sprinkles", "Waffles", "Noodle"],
  },
  {
    group: "Undeserved Nobility",
    names: ["Sir Gusty", "Baron Drizzle", "Duke Whirl", "Lady Squall", "Count Blustero",
            "Archduke Puddle", "Viscount Damp", "Empress Breeze", "Lord Sogworth", "Dame Mizzle"],
  },
  {
    group: "Sound Effects",
    names: ["Whoosh", "Kaboom", "Splort", "Fwip", "Rumbleton",
            "Krakadoom", "Ploop", "Whumpf", "Zoinks", "Blorp"],
  },
  {
    group: "Passive Aggressive",
    names: ["Just Saying", "No Worries", "Fine Then", "As Discussed", "Per My Last",
            "Kindly Note", "Circling Back", "Touching Base", "With Respect", "Noted"],
  },
  {
    group: "Domestic Disasters",
    names: ["Wet Socks", "Lost Umbrella", "Flipped Brolly", "Damp Sandwich", "Soggy Toast",
            "Missing Sandal", "Laundry Day", "Open Window", "Unpegged Sheet", "Bin Day"],
  },
  {
    group: "Wildly Underselling It",
    names: ["Definitely Fine", "Probably Nothing", "Small Breeze", "Light Drizzle", "Mild Concern",
            "Slight Chance", "Barely Windy", "Nearly Calm", "Hardly Anything", "Almost Gone"],
  },
  {
    group: "Formidable Relatives",
    names: ["Auntie Mildred", "Nana Doris", "Great Aunt Enid", "Grandma Ethel", "Auntie Winifred",
            "Nana Prudence", "Aunt Hortensia", "Grandma Muriel", "Auntie Nanette", "Nana Gertrude"],
  },
  {
    group: "Snacks with Intent",
    names: ["Hot Sauce", "Bubble Tea", "Stinky Tofu", "Pineapple Cake", "Beef Noodle",
            "Oyster Omelette", "Mango Ice", "Scallion Cake", "Peanut Brittle", "Sticky Rice"],
  },
  {
    group: "Escaped from a Meeting",
    names: ["Synergy", "Deliverable", "Q3 Target", "Action Item", "Deep Dive",
            "Low Hanging", "Bandwidth", "Stakeholder", "Pivot", "Blue Sky"],
  },
  {
    group: "Taking Itself Seriously",
    names: ["Doomcloud", "Skyfist", "Ragewhirl", "Stormlord", "Cloudsplitter",
            "Thunderjaw", "Galebringer", "Tempestus", "Vortexia", "Maelstromp"],
  },
  {
    group: "Deeply Apologetic",
    names: ["So Sorry", "My Bad", "Excuse Me", "Pardon", "Oops",
            "Whoopsie", "My Mistake", "Terribly Sorry", "Do Forgive", "If I May"],
  },
  {
    group: "Animals Behaving Badly",
    names: ["Angry Goose", "Rude Pigeon", "Sneaky Cat", "Loud Frog", "Smug Otter",
            "Feral Hamster", "Cranky Crab", "Wet Dog", "Startled Deer", "Unionised Bees"],
  },
  {
    group: "Unarguable",
    names: ["Actually", "Technically", "Allegedly", "Regardless", "Nevertheless",
            "Furthermore", "Notwithstanding", "Henceforth", "Presumably", "Ostensibly"],
  },
  {
    group: "Final Boss",
    names: ["The Big One", "Not Again", "Oh No", "Here We Go", "Seriously",
            "Come On", "Why Though", "Absolutely Not", "Goodbye Roof", "The Last Straw"],
  },
];

/** 発生順に使う 140 個のフラットな配列。 */
export const NAMES = NAME_GROUPS.flatMap((g) => g.names);

/**
 * 実在リストではないことを示す、メニューに出す一文。
 * 表示は言語ごとに rules/i18n.js が持つ（§7）。ここは英語版への別名にとどめ、
 * 同じ文が二か所に書かれる状態を作らない。
 */
export const NAMES_DISCLAIMER = STRINGS.en.disclaimer;
