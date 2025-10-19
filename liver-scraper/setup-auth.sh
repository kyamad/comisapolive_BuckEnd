#!/bin/bash

# 認証情報設定スクリプト
# Usage: ./setup-auth.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "🔐 Liver Scraper 認証情報設定"
echo ""

# 認証情報の入力を促す
echo "liver scraper システムにログインするためのComisapo Live認証情報を入力してください："
echo ""

# メールアドレスの入力
read -p "📧 メールアドレス: " LOGIN_EMAIL
if [ -z "$LOGIN_EMAIL" ]; then
    print_error "メールアドレスが入力されていません"
    exit 1
fi

# パスワードの入力（非表示）
read -s -p "🔑 パスワード: " LOGIN_PASSWORD
echo ""
if [ -z "$LOGIN_PASSWORD" ]; then
    print_error "パスワードが入力されていません"
    exit 1
fi

echo ""
print_status "認証情報を確認しています..."

# 入力された認証情報を表示（パスワードは一部のみ）
PASSWORD_MASKED=$(echo "$LOGIN_PASSWORD" | sed 's/./*/g' | cut -c1-8)
echo "メール: $LOGIN_EMAIL"
echo "パスワード: ${PASSWORD_MASKED}..."
echo ""

read -p "この認証情報で設定しますか？ (y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    print_warning "設定をキャンセルしました"
    exit 0
fi

echo ""
print_status "Worker に認証情報を設定中..."

# Worker設定ファイルのリスト
CONFIGS=("wrangler-main.toml" "wrangler-details.toml" "wrangler-images.toml")

# 各Workerに認証情報を設定
for config in "${CONFIGS[@]}"; do
    if [ ! -f "$config" ]; then
        print_warning "$config が見つかりません。スキップします。"
        continue
    fi
    
    WORKER_NAME=$(grep "name =" "$config" | cut -d'"' -f2)
    print_status "  $WORKER_NAME の認証情報を設定中..."
    
    # LOGIN_EMAIL を設定
    if echo "$LOGIN_EMAIL" | wrangler secret put LOGIN_EMAIL --config "$config" >/dev/null 2>&1; then
        print_success "    LOGIN_EMAIL 設定完了"
    else
        print_error "    LOGIN_EMAIL 設定失敗"
        continue
    fi
    
    # LOGIN_PASSWORD を設定
    if echo "$LOGIN_PASSWORD" | wrangler secret put LOGIN_PASSWORD --config "$config" >/dev/null 2>&1; then
        print_success "    LOGIN_PASSWORD 設定完了"
    else
        print_error "    LOGIN_PASSWORD 設定失敗"
        continue
    fi
    
    print_success "  $WORKER_NAME の設定完了"
done

echo ""
print_success "🎉 すべての認証情報の設定が完了しました！"
echo ""

# 設定確認
print_status "設定されたシークレットを確認中..."
for config in "${CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        WORKER_NAME=$(grep "name =" "$config" | cut -d'"' -f2)
        echo "  $WORKER_NAME:"
        wrangler secret list --config "$config" 2>/dev/null | grep -E "(LOGIN_EMAIL|LOGIN_PASSWORD)" | sed 's/^/    /'
    fi
done

echo ""
print_status "🧪 認証テストを実行中..."

# メインWorkerでの認証テスト
MAIN_URL="https://liver-scraper-main.pwaserve8.workers.dev"
print_status "  $MAIN_URL での認証テスト..."

RESPONSE=$(curl -s "$MAIN_URL/minimal-scrape?details=0")
if echo "$RESPONSE" | grep -q '"success":true'; then
    TOTAL=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    print_success "  ✅ 認証成功! $TOTAL 件のデータを取得しました"
elif echo "$RESPONSE" | grep -q '"success":false'; then
    ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    print_warning "  ⚠️ 認証エラー: $ERROR"
    print_status "  認証情報を確認してください"
else
    print_warning "  ⚠️ 予期しない応答: $(echo "$RESPONSE" | head -c 100)..."
fi

echo ""
print_status "📊 システムステータス確認..."
STATUS_RESPONSE=$(curl -s "$MAIN_URL/status")
echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"

echo ""
print_status "🚀 次のステップ:"
echo "1. 手動でスクレイピングをテスト:"
echo "   curl '$MAIN_URL/minimal-scrape?details=0'"
echo ""
echo "2. Worker間通信をテスト:"
echo "   curl -X POST '$MAIN_URL/trigger-details'"
echo ""
echo "3. リアルタイムログを監視:"
echo "   wrangler tail liver-scraper-main"
echo ""
echo "4. スケジュール実行を待機:"
echo "   次回自動実行: 0,6,12,18時の00分"

print_success "設定完了！システムの準備ができました。"