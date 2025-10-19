# Liver Scraper - 運用ガイド（comisapolive 環境）

Cloudflare Workers 上で動作する 3 Worker 構成（Main / Details / Images）の最新構成と運用手順をまとめたドキュメントです。comisapolive.com アカウント（`e610573ff233746b39a509deadc4ee36`）へ移行済みの構成を前提とします。

## 1. システム概要

```
Worker1 (Main)  ─┐  基本データ収集 / API 提供 / Worker 連携
                 ├→ Worker2 をトリガー
Worker2 (Details)│  詳細データ収集（セッション維持付き）
                 └→ Worker3 をトリガー
Worker3 (Images)    画像ダウンロード / R2 保存 / 進捗管理
```

- Main: `wrangler-main.toml` / `src/main-scraper.js`
- Details: `wrangler-details.toml` / `src/details-scraper.js`
- Images: `wrangler-images.toml` / `src/images-scraper.js`
- Secrets: `LOGIN_EMAIL`, `LOGIN_PASSWORD`, `WORKER_AUTH_TOKEN`
- バインディングはすべて comisapolive.com アカウントの ID を設定済み

## 2. デプロイと Secrets

```bash
# 依存関係が未インストールの場合
npm ci

# Worker デプロイ
wrangler deploy --config wrangler-main.toml
wrangler deploy --config wrangler-details.toml
wrangler deploy --config wrangler-images.toml

# Secrets 再設定（必要時のみ）
printf 'comisapolive@gmail.com' | wrangler secret put LOGIN_EMAIL --config wrangler-main.toml
printf 'cord3cord3'           | wrangler secret put LOGIN_PASSWORD --config wrangler-main.toml
printf 'Aiyg2x9ATjBRRS347qoRRjPaR9eGp7CHGi6tJDoi6Kk=' | \
  wrangler secret put WORKER_AUTH_TOKEN --config wrangler-main.toml
# details/images も同様に設定
```

## 3. 手動トリガーと監視

| 目的 | コマンド | 備考 |
|------|----------|------|
| 基本データ更新 + Worker2 トリガー | `curl -s -X POST -H "Authorization: Bearer <TOKEN>" "https://liver-scraper-main.liver-scraper-detailsapi.workers.dev/manual-scrape"` | `basicData` 配列は概要データのみ（`hasDetails=false`）。詳細処理は Worker2 に委譲。 |
| 詳細 Worker 起動 | `curl -s -X POST -H "Authorization: Bearer <TOKEN>" "https://liver-scraper-details.liver-scraper-detailsapi.workers.dev/start-batch"` | 15 件ずつ再処理。 |
| 詳細進捗確認 | `curl -s -H "Authorization: Bearer <TOKEN>" "https://liver-scraper-details.liver-scraper-detailsapi.workers.dev/progress"` | `processed`, `lastBatch`, `nextExecution` を確認。 |
| 画像 Worker 起動 | `curl -s -X POST -H "Authorization: Bearer <TOKEN>" "https://liver-scraper-images.liver-scraper-detailsapi.workers.dev/start-batch"` | ProgressiveImageProcessor が 8 件単位で処理。 |
| 詳細件数確認 | `curl -s "https://liver-scraper-main.liver-scraper-detailsapi.workers.dev/api/livers" \| jq '.data | map(select(.hasDetails == true)) | length'` | 61 件より増加しているかを確認。 |
| ログ監視 | `wrangler tail --config wrangler-main.toml` / `--config wrangler-details.toml` など | 再ログイン失敗 (`Re-login failed`) などを把握。 |

### 3-1. 口コミAPIの管理者削除フロー

口コミ機能では、誤投稿や不適切なコメントを削除するための管理者専用エンドポイントを用意しています。Cloudflare Secrets に `ADMIN_SECRET` が登録済みであることを前提に、以下の手順で実施してください。

1. 対象レビューの ID を確認する
   - `GET /api/reviews/:liverId` のレスポンスに `id` が含まれています。
   - 例: `curl -s "https://liver-scraper-main.liver-scraper-detailsapi.workers.dev/api/reviews/158" | jq '.reviews'`
2. `ADMIN_SECRET` を確認する
   - 端末側に保存していない場合は `wrangler secret inspect ADMIN_SECRET --config wrangler-main.toml` で確認できます。
3. 削除リクエストを送る

```bash
curl -X DELETE \
  -H "Authorization: Bearer <ADMIN_SECRET>" \
  "https://liver-scraper-main.liver-scraper-detailsapi.workers.dev/api/reviews/<REVIEW_ID>"
```

- `<ADMIN_SECRET>` には実際のシークレット値をそのまま記載します。
- `<REVIEW_ID>` には手順 1 で確認した数値 ID を指定します。

成功すると以下のようなレスポンスが返り、HTTP ステータス 200 が確認できます。

```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

認証ヘッダーが無い、もしくは値が間違っている場合は 401 `Unauthorized` が返ります。誤って複数回実行しても既に削除済みであれば 404 `Review not found` が返るだけなので、基本的に API 側で重複削除を防いでくれます。

TOKEN には `WORKER_AUTH_TOKEN`（`Aiyg2x9ATjBRRS347qoRRjPaR9eGp7CHGi6tJDoi6Kk=`）を指定します。

## 4. 詳細 Worker の再ログイン仕様

- `login_session`（KV）に cookie と userAgent を保存し、30 分以内であれば再利用します。
- 詳細ページが `/login/` へリダイレクトされた場合は即座に再ログイン→同じライバーを再試行します。
- 再試行後も取得できない場合は `detailError` に理由を残し、`hasDetails=false` のまま保持します。
- これによりセッション切れで 61 件から増えない問題を抑制します。

## 5. ストレージ構成

| 仕組み | キー / バケット | 内容 |
|--------|------------------|------|
| KV | `latest_basic_data` | Main Worker が書き込む概要データ（76 件） |
| KV | `latest_detailed_data` | Details Worker 内部の途中結果 |
| KV | `latest_integrated_data*` | 統合済みデータ。複数キー（primary/secondary/backup）に書き込み、データを保護 |
| KV | `detail_processing_progress` | 小バッチの進捗 (`completed`, `lastIndex`) |
| KV | `login_session` | セッション cookie/userAgent（TTL 30 分） |
| R2 | `liver-images` | 画像ファイル `{originalId}.jpg` |

## 6. 監視とトラブルシューティング

1. **詳細件数が増えない**
   - `/progress` の `processed` が進んでいるか確認。
   - `wrangler tail --config wrangler-details.toml` で `Authentication required` や `Re-login failed` の頻度をチェック。
   - `wrangler kv key get --namespace-id a9658ebf09ed49bba4ea6b35af67f9eb detail_processing_progress` で失敗 ID を確認。

2. **API が古いデータを返す**
   - `latest_integrated_data_primary` などが最新に更新されているか確認。
   - `integrateWithExistingDetails` は詳細件数が減る場合、旧データを保護するため、自然と件数は一定に見える場合があります。

3. **画像処理が止まる**
   - `wrangler tail --config wrangler-images.toml` を確認。
   - `wrangler kv key get ... image_processing_progress` で次バッチの開始位置を判断。

## 7. 便利な診断コマンド集

```bash
# KV キー一覧
wrangler kv key list --namespace-id a9658ebf09ed49bba4ea6b35af67f9eb

# 統合データの概要
wrangler kv key get --namespace-id a9658ebf09ed49bba4ea6b35af67f9eb latest_integrated_data_primary | jq '.integration'

# 保存済みセッションの確認
wrangler kv key get --namespace-id a9658ebf09ed49bba4ea6b35af67f9eb login_session

# R2 のオブジェクト確認（API トークンが必要）
wrangler r2 object list liver-images --limit 10
```

## 8. 注意事項

- `manual-scrape` のレスポンスに含まれる `basicData` は概要データのみです。詳細件数は `/api/livers` で確認してください。
- Secrets はすべて Cloudflare 側に登録済みです。Toml には平文を残さないでください。
- 旧 `pwaserve8.com` 用の手順はこの README から除外しています。必要に応じて `old_derails-scraper` など過去ファイルを参照してください。

---

この README は 2025-10-19 時点の comisapolive.com 環境に合わせた最新の運用手順です。今後の仕様変更があれば本ファイルを更新してください。
