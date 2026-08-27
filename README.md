# Tower of Green Pillars

Three.js の 3D 横スクロール／登り系アクション。ブラウザだけで動く。
アセットはすべてコード生成（外部の画像・音声ファイルなし）。

## 動かす

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力（静的ホスティングにそのまま置ける）
npm test         # 物理・音・プレイ通しの自動テスト
npm run standalone  # standalone/tower-of-green-pillars.html （1ファイル完結版）
```

Node 18 以上。`npm test` は playwright-core で Chromium を起動する。

## 操作

| 操作 | キー | タッチ |
| --- | --- | --- |
| 移動 | ← → / A D | 画面左の仮想スティック |
| ジャンプ | Space / W / ↑ | 画面右のボタン |
| ポーズ | P | — |

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/main.js` | 起動・ゲームループ・タイトル／クリア／ゲームオーバーの進行 |
| `src/physics.js` | AABB の当たり判定と移動解決（描画から独立、テスト可能） |
| `src/level.js` | ステージ生成（足場・ギミック・敵の配置） |
| `src/player.js` | プレイヤーの入力反映・状態遷移・アニメーション |
| `src/rabbit.js` | 主人公モデルをジオメトリから組み立てる |
| `src/enemies.js` | 敵とギミック（歩行敵・火柱・鉄球） |
| `src/camera.js` | 追従カメラ |
| `src/input.js` | キーボードとタッチ入力 |
| `src/hud.js` | ライフ・コイン・画面表示 |
| `src/textures.js` | 手続き生成のテクスチャとマテリアル |
| `src/audio.js` | 効果音と声を WebAudio で合成 |
| `src/voicebank.js` | 録音音声の差し込み口（自動生成・手で編集しない） |
| `src/style.css` | 画面まわりの CSS |
| `voice/*.wav` | 主人公の声の素（切り出し済み。ここから voicebank.js を作る） |

`tools/standalone.mjs` はビルド結果を 1 枚の HTML にまとめる。
`tools/make-voicebank.mjs` は `voice/*.wav` を `src/voicebank.js` に取り込む
（入れてよいのは自分で録った音か、使う権利のある音だけ）。

## 主人公の声

`voice/` に7本の録音が入っていて、これが12の動きに当たっている。
1本を複数の動きで使い回している所があり、その表は
`tools/make-voicebank.mjs` の `ALIAS` にある。

| 録音 | 当たっている動き |
| --- | --- |
| `fall.wav` | 落下中の悲鳴 |
| `hurt.wav` | 被弾 |
| `wa.wav` | ジャンプ／敵を踏む |
| `ya.wav` | 2段ジャンプ／壁キック／ヒップドロップ |
| `wahoo.wav` | 3段ジャンプ／幅跳び |
| `dead.wav` | ゲームオーバー |
| `cheer.wav` | ゴール／ライフ回復 |

着地の「ふっ」と立ち止まりの「ん…」は息の音なので、叫びを当てず
`src/audio.js` の合成のままにしてある。

録音を差し替えるときは `voice/` のファイルを置き換えて `npm run voicebank`。
新しい動きに声を足したいときは `ALIAS` に1行足す（同じ録音は1回しか
埋め込まないので、増やしてもファイルは大きくならない）。

## 別リポジトリへ移すとき

このディレクトリの中身をそのまま新しいリポジトリの直下に置けば動く。
外部アセットも相対パスの外への参照もない。依存は `three` と、開発用の
`vite` / `playwright-core` だけ。
