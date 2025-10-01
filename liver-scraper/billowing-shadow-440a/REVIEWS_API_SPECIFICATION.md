# 口コミAPI仕様書

## ベースURL
```
https://liver-scraper-main.pwaserve8.workers.dev
```

## APIエンドポイント一覧

### 1. 口コミ投稿API

**エンドポイント**: `POST /api/reviews`

**リクエスト**:
```json
{
  "liver_id": "158",
  "rating": 5,
  "comment": "素晴らしい配信者です！"
}
```

**パラメータ**:
- `liver_id` (string, 必須): ライバーのID（originalId）
- `rating` (number, 必須): 評価（1〜5の整数）
- `comment` (string, 必須): コメント（最大1000文字）

**成功レスポンス** (201):
```json
{
  "success": true,
  "review_id": 1,
  "message": "Review submitted successfully"
}
```

**バリデーションエラー** (400):
```json
{
  "success": false,
  "error": "rating is required and must be an integer between 1 and 5"
}
```

**レート制限エラー** (429):
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please wait 260 seconds before submitting again.",
  "remainingSeconds": 260
}
```

**制限事項**:
- 同一IPから5分に1回まで投稿可能
- コメント最大1000文字

---

### 2. 口コミ一覧取得API

**エンドポイント**: `GET /api/reviews/:liverId`

**例**: `GET /api/reviews/158`

**成功レスポンス** (200):
```json
{
  "success": true,
  "liver_id": "158",
  "reviews": [
    {
      "id": 1,
      "rating": 5,
      "comment": "素晴らしい配信者です！とても楽しい配信をありがとうございます。",
      "created_at": 1759200430282
    },
    {
      "id": 2,
      "rating": 4,
      "comment": "良い配信者です",
      "created_at": 1759200430100
    }
  ],
  "total": 2
}
```

**表示順序**: 評価高い順、同評価なら新しい順

**エラーレスポンス** (400):
```json
{
  "success": false,
  "error": "liver_id is required"
}
```

---

### 3. 平均評価取得API

**エンドポイント**: `GET /api/reviews/stats/:liverId`

**例**: `GET /api/reviews/stats/158`

**成功レスポンス** (200):
```json
{
  "success": true,
  "liver_id": "158",
  "average_rating": 4.5,
  "review_count": 2
}
```

**口コミが0件の場合**:
```json
{
  "success": true,
  "liver_id": "158",
  "average_rating": 0,
  "review_count": 0
}
```

---

### 4. 口コミ削除API（管理用）

**エンドポイント**: `DELETE /api/reviews/:reviewId`

**例**: `DELETE /api/reviews/1`

**認証**: Bearerトークン必須
```
Authorization: Bearer YOUR_ADMIN_SECRET
```

**成功レスポンス** (200):
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

**認証エラー** (401):
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**削除コマンド例**:
```bash
curl -X DELETE "https://liver-scraper-main.pwaserve8.workers.dev/api/reviews/1" \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET"
```

---

## データ型仕様

### `created_at`
- 型: number
- 形式: Unix timestamp（ミリ秒）
- 例: `1759200430282`
- 変換例（JavaScript）: `new Date(created_at).toLocaleString('ja-JP')`

### `rating`
- 型: number (integer)
- 範囲: 1〜5
- 小数点不可

### `average_rating`
- 型: number (float)
- 範囲: 0〜5
- 小数点第2位まで（例: 4.55）

---

## 注意事項

### アプリ側実装時の推奨事項

1. **レート制限対応**
   - エラー時は`remainingSeconds`を使用して「○○秒後に再試行」を表示
   - 投稿ボタンを一時的に無効化

2. **バリデーション**
   - 評価: 1〜5の必須チェック
   - コメント: 1〜1000文字の範囲チェック
   - サーバー側でも検証されますが、UX向上のためクライアント側でも実施推奨

3. **エラーハンドリング**
   - 400エラー: バリデーションエラーメッセージを表示
   - 429エラー: レート制限メッセージと残り時間を表示
   - 500エラー: 「一時的なエラーです。しばらく経ってから再試行してください」

4. **データ表示**
   - `created_at`は日時形式に変換して表示
   - 平均評価は星マークなどで視覚化推奨
   - 口コミ0件の場合は「まだ口コミがありません」等の表示

---

## テストデータ

現在、以下のテストデータが登録済み：

- ライバーID: `158`
- 口コミ1件: rating 5, "素晴らしい配信者です！とても楽しい配信をありがとうございます。"

テスト用コマンド：
```bash
# 口コミ投稿テスト
curl -X POST "https://liver-scraper-main.pwaserve8.workers.dev/api/reviews" \
  -H "Content-Type: application/json" \
  -d '{"liver_id":"158","rating":5,"comment":"テスト投稿"}'

# 口コミ取得テスト
curl -X GET "https://liver-scraper-main.pwaserve8.workers.dev/api/reviews/158"

# 統計取得テスト
curl -X GET "https://liver-scraper-main.pwaserve8.workers.dev/api/reviews/stats/158"
```

---

## 管理コマンド

### D1データベース直接操作

```bash
# 全口コミ確認
npx wrangler d1 execute liver-reviews-db --command="SELECT * FROM reviews"

# 特定ライバーの口コミ確認
npx wrangler d1 execute liver-reviews-db --command="SELECT * FROM reviews WHERE liver_id='158'"

# 統計確認
npx wrangler d1 execute liver-reviews-db --command="SELECT liver_id, AVG(rating) as avg_rating, COUNT(*) as count FROM reviews GROUP BY liver_id"

# 口コミ削除（D1直接）
npx wrangler d1 execute liver-reviews-db --command="DELETE FROM reviews WHERE id=1"
```

### シークレット管理

```bash
# シークレット一覧
npx wrangler secret list

# シークレット設定
npx wrangler secret put ADMIN_SECRET

# シークレット削除
npx wrangler secret delete ADMIN_SECRET
```

---

## 実装済み機能

- ✅ D1データベース（liver-reviews-db）
- ✅ レート制限（5分に1回、IPベース）
- ✅ データバリデーション
- ✅ 評価順ソート
- ✅ 平均評価計算
- ✅ 管理者削除機能

---

## データベーススキーマ

```sql
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liver_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
```

インデックス:
- `idx_liver_id` ON reviews(liver_id)
- `idx_rating` ON reviews(rating)
- `idx_created_at` ON reviews(created_at)
- `idx_ip_hash_created` ON reviews(ip_hash, created_at)