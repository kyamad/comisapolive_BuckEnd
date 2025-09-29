# Liver Scraper - 3-Worker Automated System

完全自動化された3つのWorkerによる高頻度更新システム

## システム概要

### アーキテクチャ
```
Worker1 (Main) → Worker2 (Details) → Worker3 (Images)
     ↓               ↓                   ↓
  基本データ取得    詳細情報取得      画像収集・保存
  (6時間ごと)     (30分後)        (1-2時間後)
```

### 🔄 **現在の動作状況**
- ✅ Worker1: 基本データ取得 **動作中**
- ✅ Worker2: 詳細情報取得 **動作中** 
- ✅ Worker3: 画像収集・保存 **動作中**
- ✅ 全Workerが自動スケジュール実行中

### Worker構成

#### Worker1: liver-scraper-main
- **ファイル**: `src/main-scraper.js` + `src/index.js`
- **役割**: 基本データ取得 + API提供 + オーケストレーション
- **スケジュール**: `"0 * * * *"` (毎時実行)
- **機能**:
  - `/minimal-scrape?details=0` での全ページ基本データ取得
  - `/api/livers` でのデータAPI提供（画像URL含む）
  - Worker2への詳細取得トリガー送信
  - 進捗管理とステータス監視

#### Worker2: liver-scraper-details  
- **ファイル**: `src/details-scraper.js`
- **役割**: 詳細情報取得専門
- **スケジュール**: `"30 0,6,12,18 * * *"` (メインの30分後)
- **機能**:
  - `/detail-batch?batch=15` の自動実行
  - 全員の詳細完了までループ処理
  - Worker3への画像取得トリガー送信

#### Worker3: liver-scraper-images ✅ **フル稼働中**
- **ファイル**: `src/images-scraper.js` + `src/progressive-image-processor.js`
- **役割**: 画像取得・ダウンロード・保存専門
- **スケジュール**: `"0 2,8,14,20 * * *"` (詳細完了の1-2時間後)  
- **機能**:
  - 画像URLからの実際の画像ファイルダウンロード
  - R2 Bucket (`liver-images`) への画像保存
  - 段階的バッチ処理（8件ずつ安全処理）
  - subrequest制限を考慮した進捗管理
  - 重複チェック機能

## セットアップ手順

### 1. 前提条件
```bash
# Wrangler CLIのインストール
npm install -g wrangler

# Cloudflareにログイン
wrangler login
```

### 2. 設定ファイルの更新
各 `wrangler-*.toml` ファイルの以下の項目を更新:

```toml
# 実際のアカウント情報に更新
DETAIL_WORKER_URL = "https://liver-scraper-details.YOUR-ACCOUNT.workers.dev"
IMAGE_WORKER_URL = "https://liver-scraper-images.YOUR-ACCOUNT.workers.dev"
WORKER_AUTH_TOKEN = "your-secure-token-here"
```

### 3. 一括デプロイ
```bash
# 開発環境にデプロイ
./deploy-all.sh

# 本番環境にデプロイ
./deploy-all.sh prod

# 認証情報付きでデプロイ
LOGIN_EMAIL=your-email@example.com LOGIN_PASSWORD=your-password ./deploy-all.sh
```

### 4. シークレットの設定
```bash
# 各Workerに認証情報を設定
wrangler secret put LOGIN_EMAIL --config wrangler-main.toml
wrangler secret put LOGIN_PASSWORD --config wrangler-main.toml

wrangler secret put LOGIN_EMAIL --config wrangler-details.toml
wrangler secret put LOGIN_PASSWORD --config wrangler-details.toml

wrangler secret put LOGIN_EMAIL --config wrangler-images.toml
wrangler secret put LOGIN_PASSWORD --config wrangler-images.toml
```

## API エンドポイント

### Worker1 (Main) エンドポイント
```bash
# 基本データ取得
GET /minimal-scrape?details=0

# 詳細データ取得（互換性のため）
GET /minimal-scrape?details=1

# 全Workerのステータス確認
GET /status

# Worker2トリガー（手動）
POST /trigger-details
```

### Worker2 (Details) エンドポイント
```bash
# バッチ詳細取得開始
POST /start-batch
Authorization: Bearer your-secure-token-here

# 詳細バッチ処理
GET /detail-batch?batch=15
Authorization: Bearer your-secure-token-here

# 進捗確認
GET /progress
Authorization: Bearer your-secure-token-here
```

### Worker3 (Images) エンドポイント ✅ **動作中**
```bash
# バッチ画像処理開始
POST /start-batch
Authorization: Bearer your-secure-token-here

# 段階的画像処理（実際に画像をダウンロード・保存）
GET /fix-images-progressive?batch=10
Authorization: Bearer your-secure-token-here

# 画像統計情報
GET /image-status
Authorization: Bearer your-secure-token-here

# 進捗確認
GET /progress
Authorization: Bearer your-secure-token-here
```

## 動作スケジュール

```
00:00 ── Worker1実行 (基本データ取得)
00:30 ── Worker2実行 (詳細情報取得)
02:00 ── Worker3実行 (画像処理)

06:00 ── Worker1実行
06:30 ── Worker2実行
08:00 ── Worker3実行

12:00 ── Worker1実行
12:30 ── Worker2実行
14:00 ── Worker3実行

18:00 ── Worker1実行
18:30 ── Worker2実行
20:00 ── Worker3実行
```

## 監視とテスト

### ステータス確認
```bash
# 全Workerの状況確認
curl https://liver-scraper-main.YOUR-ACCOUNT.workers.dev/status

# 詳細Workerの進捗確認
curl https://liver-scraper-details.YOUR-ACCOUNT.workers.dev/progress \
  -H "Authorization: Bearer your-secure-token-here"
```

### 手動実行テスト
```bash
# 基本データ取得テスト
curl https://liver-scraper-main.YOUR-ACCOUNT.workers.dev/minimal-scrape

# 詳細取得手動トリガー
curl -X POST https://liver-scraper-details.YOUR-ACCOUNT.workers.dev/start-batch \
  -H "Authorization: Bearer your-secure-token-here"

# 画像処理状況確認
curl https://liver-scraper-images.YOUR-ACCOUNT.workers.dev/image-status \
  -H "Authorization: Bearer your-secure-token-here"
```

## データストレージ

### KVストレージキー
- `latest_basic_data`: Worker1の基本データ
- `latest_detailed_data`: Worker2の詳細データ  
- `latest_data`: APIで提供する統合データ（画像URL含む）
- `worker_status_main`: Worker1のステータス
- `worker_status_details`: Worker2のステータス
- `worker_status_images`: Worker3のステータス
- `image_processing_progress`: 画像処理の進捗状況

### 共有リソース
- **KV Namespaces**: `LIVER_DATA`, `IMAGE_HASHES`
- **R2 Bucket**: `liver-images` ✅ **実際に画像ファイルが保存されています**

## トラブルシューティング

### よくある問題

1. **Worker間の通信エラー**
   ```bash
   # WorkerのURLが正しく設定されているか確認
   wrangler vars list --config wrangler-main.toml
   ```

2. **認証エラー**
   ```bash
   # シークレットが設定されているか確認
   wrangler secret list --config wrangler-main.toml
   ```

3. **スケジュール実行の確認**
   ```bash
   # ログの確認
   wrangler tail liver-scraper-main
   ```

### ログ監視
```bash
# 各Workerのリアルタイムログ
wrangler tail liver-scraper-main
wrangler tail liver-scraper-details
wrangler tail liver-scraper-images
```

## 高度な設定

### カスタムスケジュール
各 `wrangler-*.toml` の `crons` 設定を変更:
```toml
[triggers]
crons = ["0 */4 * * *"]  # 4時間ごと
```

### バッチサイズの調整
APIエンドポイントのクエリパラメータで調整:
```bash
# 詳細取得のバッチサイズを20に変更
GET /detail-batch?batch=20

# 画像処理のバッチサイズを5に変更
GET /fix-images-progressive?batch=5
```

### 環境別デプロイ
```bash
# 開発環境
./deploy-all.sh dev

# 本番環境
./deploy-all.sh prod
```

## セキュリティ

- すべてのWorker間通信は認証トークンで保護
- ログイン認証情報はSecretとして安全に保存
- CORS設定により外部アクセスを制御

## パフォーマンス最適化

- ✅ **段階的画像処理**: バッチサイズ8でsubrequest制限を考慮
- ✅ **バッチ処理**: レート制限対策による効率的処理
- ✅ **Worker間の段階的実行**: リソース分散による安定動作
- ✅ **進捗管理**: 処理状況の追跡と再開機能
- ✅ **重複チェック**: 既存画像の確認による無駄な処理を回避

---

## 🚀 **実稼働システム情報**

### 📊 データ取得状況
- **基本データ**: 毎時更新
- **詳細データ**: 6時間ごと更新  
- **画像データ**: URL情報は即座に取得、ファイルは段階的に保存

### 🖼️ 画像処理システム
- **取得**: profileImages配列から画像URLを取得
- **ダウンロード**: 実際の画像ファイルをダウンロード
- **保存**: R2 Bucket `liver-images` に `{liverId}.jpg` として保存
- **管理**: 進捗追跡と重複回避で効率的処理

### 🔗 主要API
- **データ取得**: `https://liver-scraper-main.pwaserve8.workers.dev/api/livers`
- **進捗確認**: 各Workerの `/progress` エンドポイント

## 注意事項

🔧 **設定の重要性**: Worker間の通信を正しく動作させるため、デプロイ後は必ずWorkerのURLと認証トークンを正しく設定してください。

🎯 **現在の状況**: 全3つのWorkerが正常稼働中。画像収集・保存も含めて完全自動化されています。

---

# 🔄 **引き継ぎ情報 - 2025-08-22現在**

## 📊 **現在のデータ取得状況**

### ✅ **完了済み修正**
1. **画像不整合問題の解決** - データマッピングエラーにより異なるライバーの画像が表示される問題を修正
2. **ID重複問題の解決** - 45件の重複IDを修正し、ユニークIDに変換完了
3. **originalId抽出ロジック修正** - `noimage.png`問題を解決するため、詳細リンクのhrefからID抽出に変更
4. **画像保存機能の有効化** - 無効化されていたimages-scraper.jsの画像保存機能をProgressiveImageProcessorで復活

### 🔢 **現在の件数状況 (2025-08-24 最新)**

| データ種別 | 件数 | 進捗率 | 状況 |
|------------|------|--------|------|
| **概要データ** | **76件** | 100% | ✅ Worker分散処理修正により正常取得完了 |
| **詳細データ** | **60件** | 79% | 🔄 Worker2による段階的処理進行中 |
| **画像データ** | **76/76件** | 100% | ✅ 処理完了対応 |

### 🚨 **要対応項目**

#### ~~1. 詳細データ取得制限問題の解決~~ ✅ **修正完了**

**✅ 完了した修正:**
- **Worker分散処理**: manual-scrapeをWorker1基本データ取得のみに限定
- **Worker2委譲**: 詳細データはdetails-scraper.jsが段階的に処理
- **76件取得成功**: `{"success":true,"total":76,"message":"Basic data updated, details processing triggered"}`

**🔧 実装した技術的解決:**
- **Worker1**: 基本データ76件取得→詳細処理をWorker2にトリガー
- **Worker2**: 3件ずつ段階処理でsubrequest制限回避
- **重複処理削除**: Worker1から詳細取得ロジックを完全削除

#### ~~2. 残りの画像処理完了~~ ✅ **完了済み**
```bash
# 48/48件の画像処理が完了しました
curl -I "https://liver-scraper-main.pwaserve8.workers.dev/api/images/158.jpg" \
  -H "Authorization: Bearer liver-scraper-secure-token-2024"
```

### 🔧 **実施済み修正の詳細**

#### **A. ID重複問題 (45件修正済み)**
- **問題**: 複数ライバーが同じIDを共有 (`_p1_621126`等)
- **解決**: profileImagesのURLから実際のIDを抽出してユニーク化
- **適用方法**: 直接KV操作で重複IDを修正済み

#### **B. originalId抽出ロジック修正**
- **ファイル**: `src/main-scraper.js`
- **変更**: `<img>`のsrcから`<a>`のhrefへ変更
- **効果**: `noimage.png`の場合でも正確なIDを取得

#### **C. 画像保存機能復旧**
- **ファイル**: `src/images-scraper.js`, `src/progressive-image-processor.js`
- **変更**: 無効化されていた処理をProgressiveImageProcessorに置換
- **効果**: 実際の画像ファイルがR2バケットに保存されるように

### 📋 **後任者向けの次のアクション**

#### **即座に実行すべき項目**
1. **詳細データ取得の再開**
   ```bash
   # Worker2の詳細取得を手動実行
   curl -X POST "https://liver-scraper-details.pwaserve8.workers.dev/start-batch" \
     -H "Authorization: Bearer liver-scraper-secure-token-2024"
   ```

2. **残りの画像処理完了**
   ```bash
   # 完了まで繰り返し実行
   while true; do
     result=$(curl -s -X POST "https://liver-scraper-images.pwaserve8.workers.dev/start-batch" \
       -H "Authorization: Bearer liver-scraper-secure-token-2024")
     echo "$result"
     if echo "$result" | grep -q '"isCompleted":true'; then
       echo "画像処理完了"
       break
     fi
     sleep 30
   done
   ```

#### **確認コマンド**
```bash
# データ件数確認
curl -s "https://liver-scraper-main.pwaserve8.workers.dev/api/livers" | jq '.total'

# 詳細データ件数確認
npx wrangler kv key get "latest_data" --binding LIVER_DATA --config wrangler-main.toml | \
  jq '[.data[] | select(.hasDetails == true)] | length'

# 画像処理進捗確認
curl -X POST "https://liver-scraper-images.pwaserve8.workers.dev/start-batch" \
  -H "Authorization: Bearer liver-scraper-secure-token-2024" | \
  jq '{total: .total, processed: .processed, completed: .isCompleted}'
```

### 🎯 **目標状態**
- 概要データ: **76件** (現在48件、ページネーション修正で対応)
- 詳細データ: **76件** (現在11件、Worker2分散処理で対応)  
- 画像データ: **76件** (現在48件対応済み、残り28件要追加)

### 📝 **重要な技術的詳細**

#### **修正されたファイル**
- `src/main-scraper.js` - originalId抽出ロジック修正
- `src/images-scraper.js` - 画像保存機能復旧
- `src/progressive-image-processor.js` - imageUrl優先処理
- `src/index.js` - 重複画像処理エンドポイント削除

#### **KVデータ構造**
- `latest_data` - 統合データ（概要+詳細）
- `image_processing_progress` - 画像処理進捗
- 各ライバーデータに`hasDetails`フラグで詳細取得状況を管理

#### **R2ストレージ**
- バケット名: `liver-images`
- 保存形式: `{liverId}.jpg`
- アクセス: `https://liver-scraper-main.pwaserve8.workers.dev/api/images/{id}.jpg`

### ⚡ **緊急時の対応**

#### **システムリセットが必要な場合**
```bash
# 画像処理進捗リセット
curl -X POST "https://liver-scraper-images.pwaserve8.workers.dev/reset-progress" \
  -H "Authorization: Bearer liver-scraper-secure-token-2024"

# 全Workerの再デプロイ
./deploy-all.sh
```

#### **データ整合性チェック**
```bash
# ID重複チェック
npx wrangler kv key get "latest_data" --binding LIVER_DATA --config wrangler-main.toml | \
  jq '[.data[].id] | group_by(.) | map(select(length > 1))'
```

---

---

# 🔧 **追加修正事項 - subrequest制限問題**

## 📊 **76人問題の分析結果**

### ❌ **判明した問題**
1. **概要データ**: 実際76人中48人のみ取得 (63%)
2. **詳細データ**: manual-scrapeがWorker2を使わず、subrequest制限で停止
3. **Worker分散**: Worker1が全処理を担当し、分散効果なし

### 🔍 **根本原因**
- **ページネーション**: 5ページ存在だが3ページで停止
- **subrequest制限**: Worker1で76人の詳細取得→50制限超過
- **アーキテクチャ**: manual-scrapeがdetails-scraperを迂回

### ✅ **修正計画**
1. **Worker1**: 基本データのみ76件取得（詳細取得削除）
2. **Worker2**: details-scraperで段階的詳細取得
3. **Worker3**: 76件対応の画像処理

---

**📞 引き継ぎ完了日**: 2025-08-22  
**🔧 システム状態**: Worker分散処理修正中、76人対応準備完了  
**⏭️ 次のアクション**: Worker1からdetails-scraper呼び出しに変更、重複処理削除