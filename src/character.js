// 主人公の見た目（キャラクター）の選択。タイトル画面のボタンで切り替え、
// 選んだものを localStorage に覚えておく（次に開いたときも同じ見た目）。
const KEY = "uzagi-character";

export const CHARACTERS = [
  { id: "heroine", label: "Suit Girl" },
  { id: "rabbit", label: "Rabbit" },
];

export function getCharacter() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // プライベートブラウズ等で localStorage が使えなくても、既定のキャラで動く
  }
  return CHARACTERS.some((c) => c.id === saved) ? saved : CHARACTERS[0].id;
}

export function setCharacter(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 保存できなくても、そのセッション中の見た目には困らない
  }
}

export function nextCharacter(id) {
  const i = CHARACTERS.findIndex((c) => c.id === id);
  return CHARACTERS[(i + 1) % CHARACTERS.length].id;
}

export function labelOf(id) {
  return CHARACTERS.find((c) => c.id === id)?.label ?? id;
}
