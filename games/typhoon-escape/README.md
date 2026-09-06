# Typhoon Escape — Globe Edition

`lovewcycle.com/games/others/typhoon-escape.html` の再現版。
平面メルカトルを **3D グローブ**へ、日本を **台湾本島**へ、文言をすべて**英語**に置き換えた。

- 台湾本島をドラッグして動かし、追ってくる台風をかわす
- **1 回でも暴風域（赤い内円）に触れたら終わり**。スコアは生存日数
- 実時間 **1 秒 = ゲーム内 1 日**。開始は 2026-08-01
- 台風は **10 ゲーム内日でプレイヤーより速くなる**。逃げ切りは不可能で、かわすしかない
- 他の大陸は**押しのけられる**。南極も含めて**全部の陸**が載っている
- 台風名 140 個は**すべて創作**（実在のアジア名リストではない）

## 動かす

```
npm i
npm run dev        # 開発サーバ
npm run build      # dist/ を作る
npm run standalone # dist/typhoon-escape.html（1 枚完結・約 2.8 MiB）
npm test           # 全テスト（Node + 実ブラウザ）
```

## ファイルの役割

| ファイル | 役割 |
| --- | --- |
| `DESIGN.md` | 設計と検証の記録。**数値の根拠はすべてここ** |
| `CREDITS.md` | 地図データと台風名の出典 |
| `src/world/sphere.js` | 緯度経度⇔ベクトル、大圏移動、接平面基底。純関数 |
| `src/world/tessellate.js` | 球面ポリゴンの三角形分割（極の切り開き・細分） |
| `src/world/geo.js` | 焼き込み地図データの復号 |
| `src/world/storm.js` | 台風の進路・強度・予報円 |
| `src/world/body.js` | 動く陸塊。姿勢と内外判定（経度バケット索引） |
| `src/rules/config.js` | **数値定数はここにしかない**（§1b.3 の換算表） |
| `src/rules/game.js` | 進行・当たり判定・スコア |
| `src/rules/names.js` | 台風名 140 個（創作・手書き） |
| `src/rules/region.js` | 上陸地域の判定 |
| `src/render/*.js` | three.js の描画・カメラ・入力・HUD |
| `src/data/geo.js` | **生成物**。`npm run bake:geo` で作る。手で編集しない |
| `tools/calibrate.mjs` | §1b の換算表を実データから再生成（設計値の出所） |
| `tools/bake-geo.mjs` | world-atlas → `src/data/geo.js` |

## 設計の要点

依存は **`rules/ → world/ → render/` の一方向**に固定してある（`test/layering.test.mjs` が
静的に検査する）。`world/` は three.js にも `rules/` にも依存しないので、球面数学と台風の
挙動を描画なしでテストできる。

元ゲームの手触りは**絶対値ではなく比**で決まっているので、
「致死半径 / 自国の外接半径」など 3 つの無次元比を厳密に保存する方式で移植した。
`test/config.test.mjs` が 13 組の比を 1e-12 以内で照合する。定数をうっかり触ると落ちる。

画像ファイルは 1 枚も使っていない（既存の Tower of Green Pillars と同じ方針）。
