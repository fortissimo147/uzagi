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

## 配信（Cloudflare Pages）

`vite.config.js` の `base` が `"./"` なので、`dist/` をどこに置いても動く。
`public/_headers` にキャッシュの指定、`.nvmrc` に Node の版が入っている。
**シェア文の URL は実際に開かれている URL から取る**ので、置き場所を決め打ちする設定はない。

サイズは 4 ファイル・計 2.79 MiB（最大 2.78 MiB）。
Pages の 1 ファイル 25 MiB / 20,000 ファイルの制限には余裕がある。
`test/deploy.test.mjs` がこれらとサブディレクトリ配信を毎回検査する。

### A. 独立したプロジェクトとして上げる（既定）

```sh
npm run deploy      # games/typhoon-escape/ で実行
```

`dist/` を Cloudflare Pages のプロジェクト `typhoon-escape` へ送る。
終わると `https://typhoon-escape.pages.dev` で開ける。

`pages.dev` の名前は世界共通なので、すでに使われていると弾かれる。
その場合は `package.json` の `deploy` の `--project-name` を変える。

初回はブラウザで Cloudflare の認可を求められる（2 回目以降は聞かれない）。
ブラウザの無い所で回すなら `CLOUDFLARE_API_TOKEN` を使う。
既存の `uzagi` プロジェクトとは別物なので、そちらの配信には影響しない。

**GitHub につないで push で自動デプロイする場合** — 既存の `uzagi` とは別に
もう 1 つ Pages プロジェクトを作り、次を設定する。

| 項目 | 値 |
| --- | --- |
| Root directory | `games/typhoon-escape` **[推定: ダッシュボードの項目名は要確認]** |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |

### B. 既存の `uzagi` にぶら下げる

1 つの URL にまとめたいならこちら。`uzagi.pages.dev/typhoon-escape/` で開けるようになる。

```sh
# リポジトリのルートで
npm run build                                   # 既存ゲームを dist/ へ
(cd games/typhoon-escape && npm run build)      # このゲームを games/typhoon-escape/dist/ へ
mkdir -p dist/typhoon-escape
cp -r games/typhoon-escape/dist/* dist/typhoon-escape/
npx --yes wrangler@4 pages deploy dist --project-name uzagi
```

サブディレクトリで動くことは `test/deploy.test.mjs` が実際にブラウザで確かめている
（`/games/typhoon-escape/` に置いて起動し、シェア URL がその場所になることまで見る）。

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
| `tools/standalone.mjs` | `dist/` を 1 枚の HTML に（`dist/typhoon-escape.html`） |
| `public/_headers` | Cloudflare Pages のキャッシュ指定 |

## 設計の要点

依存は **`rules/ → world/ → render/` の一方向**に固定してある（`test/layering.test.mjs` が
静的に検査する）。`world/` は three.js にも `rules/` にも依存しないので、球面数学と台風の
挙動を描画なしでテストできる。

元ゲームの手触りは**絶対値ではなく比**で決まっているので、
「致死半径 / 自国の外接半径」など 3 つの無次元比を厳密に保存する方式で移植した。
`test/config.test.mjs` が 13 組の比を 1e-12 以内で照合する。定数をうっかり触ると落ちる。

画像ファイルは 1 枚も使っていない（既存の Tower of Green Pillars と同じ方針）。
