# paper-scan

ブラウザだけで動く個人用ドキュメントスキャナーです。

## Phase 0（実装済み）

- カメラ撮影 / 画像選択
- DocAligner 系（quadscan）による四隅の自動検出
- 四隅の手動ドラッグ修正
- 透視変換（正面化）
- 白黒 / グレー / カラー
- 複数ページ PDF 保存

## 画面の候補

スマホ向けの見た目はまだ本番に入れていません。候補は GitHub Pages で見られます。

https://sunfloweratnight.github.io/paper-scan/

## 公開

Cloudflare Pages に出します。初回だけログインが必要です。

```bash
npx wrangler login
npm run deploy
```

本番 URL は `https://paper-scan.pages.dev` です。

## 起動

```bash
npm install
npm run dev
```

スマホから使う場合は、同じ Wi‑Fi 上で表示された LAN の URL を開いてください（カメラは HTTPS か localhost が必要です）。

## 次の段階

- 影除去など高品質エンハンス
- OCR（任意）
