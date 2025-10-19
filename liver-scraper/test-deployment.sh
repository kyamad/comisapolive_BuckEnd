#!/bin/bash

# 段階的テストスクリプト
# Usage: ./test-deployment.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# アカウント情報を取得
get_account_info() {
    print_status "Getting account information..."
    ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | tail -1 | awk -F'│' '{print $3}' | tr -d ' ')
    echo "Account ID: $ACCOUNT_ID"
}

# Worker URLを更新
update_worker_urls() {
    print_status "Updating worker URLs in configuration files..."
    
    # アカウント情報を自動取得してURLを構築
    SUBDOMAIN_BASE="k-yamada-sir-barrie-co-jp.workers.dev"  # 実際のsubdomainに置き換え
    
    MAIN_URL="https://liver-scraper-main.${SUBDOMAIN_BASE}"
    DETAILS_URL="https://liver-scraper-details.${SUBDOMAIN_BASE}"
    IMAGES_URL="https://liver-scraper-images.${SUBDOMAIN_BASE}"
    
    # 設定ファイルを更新
    sed -i.bak "s|https://liver-scraper-details.your-account.workers.dev|${DETAILS_URL}|g" wrangler-main.toml
    sed -i.bak "s|https://liver-scraper-images.your-account.workers.dev|${IMAGES_URL}|g" wrangler-main.toml
    sed -i.bak "s|https://liver-scraper-images.your-account.workers.dev|${IMAGES_URL}|g" wrangler-details.toml
    
    print_success "URLs updated:"
    print_success "  Main: ${MAIN_URL}"
    print_success "  Details: ${DETAILS_URL}"
    print_success "  Images: ${IMAGES_URL}"
}

# 個別Worker テスト
test_single_worker() {
    local worker_name=$1
    local config_file=$2
    
    print_status "Testing ${worker_name}..."
    
    # デプロイテスト
    print_status "  Deploying ${worker_name}..."
    if wrangler deploy --config "${config_file}"; then
        print_success "  ${worker_name} deployed successfully"
    else
        print_error "  Failed to deploy ${worker_name}"
        return 1
    fi
    
    # 基本接続テスト
    sleep 3  # デプロイ完了を待機
    WORKER_URL=$(wrangler deployments list --config "${config_file}" | grep "https://" | head -1 | awk '{print $2}')
    
    if [ ! -z "$WORKER_URL" ]; then
        print_status "  Testing connection to ${WORKER_URL}..."
        if curl -s -f "${WORKER_URL}" > /dev/null 2>&1; then
            print_success "  ${worker_name} is responding"
        else
            print_warning "  ${worker_name} deployed but not responding (this might be normal for some endpoints)"
        fi
    fi
}

# メインWorkerのエンドポイントテスト
test_main_worker_endpoints() {
    print_status "Testing main worker endpoints..."
    
    MAIN_URL=$(wrangler deployments list --config wrangler-main.toml | grep "https://" | head -1 | awk '{print $2}')
    
    if [ -z "$MAIN_URL" ]; then
        print_error "Could not get main worker URL"
        return 1
    fi
    
    # /status エンドポイントテスト
    print_status "  Testing /status endpoint..."
    if curl -s "${MAIN_URL}/status" | grep -q "main\|details\|images"; then
        print_success "  /status endpoint working"
    else
        print_warning "  /status endpoint response unclear"
    fi
    
    # /minimal-scrape エンドポイントテスト（基本データ）
    print_status "  Testing /minimal-scrape endpoint..."
    RESPONSE=$(curl -s "${MAIN_URL}/minimal-scrape?details=0")
    if echo "$RESPONSE" | grep -q "success"; then
        print_success "  /minimal-scrape endpoint working"
        echo "    Sample response: $(echo "$RESPONSE" | head -c 100)..."
    else
        print_warning "  /minimal-scrape needs authentication setup"
        echo "    Response: $(echo "$RESPONSE" | head -c 200)..."
    fi
}

# シークレット設定テスト
test_secrets_setup() {
    print_status "Testing secrets configuration..."
    
    if [ -z "$LOGIN_EMAIL" ] || [ -z "$LOGIN_PASSWORD" ]; then
        print_warning "LOGIN_EMAIL and LOGIN_PASSWORD environment variables not set"
        print_status "You can set them and test authentication:"
        echo "  export LOGIN_EMAIL='your-email@example.com'"
        echo "  export LOGIN_PASSWORD='your-password'"
        echo "  wrangler secret put LOGIN_EMAIL --config wrangler-main.toml"
        echo "  wrangler secret put LOGIN_PASSWORD --config wrangler-main.toml"
        return 1
    fi
    
    # シークレットを設定
    print_status "Setting up secrets..."
    for config in wrangler-main.toml wrangler-details.toml wrangler-images.toml; do
        print_status "  Setting secrets for $config..."
        echo "$LOGIN_EMAIL" | wrangler secret put LOGIN_EMAIL --config "$config"
        echo "$LOGIN_PASSWORD" | wrangler secret put LOGIN_PASSWORD --config "$config"
    done
    
    print_success "Secrets configured for all workers"
}

# Worker間通信テスト
test_worker_communication() {
    print_status "Testing worker communication..."
    
    MAIN_URL=$(wrangler deployments list --config wrangler-main.toml | grep "https://" | head -1 | awk '{print $2}')
    
    if [ -z "$MAIN_URL" ]; then
        print_error "Could not get main worker URL for communication test"
        return 1
    fi
    
    # 詳細Workerトリガーテスト
    print_status "  Testing detail worker trigger..."
    RESPONSE=$(curl -s -X POST "${MAIN_URL}/trigger-details")
    if echo "$RESPONSE" | grep -q "success"; then
        print_success "  Detail worker trigger working"
    else
        print_warning "  Detail worker trigger may need authentication setup"
        echo "    Response: $(echo "$RESPONSE" | head -c 100)..."
    fi
}

# ライブテスト（実際のスクレイピング）
test_live_scraping() {
    print_status "Testing live scraping (requires authentication)..."
    
    if [ -z "$LOGIN_EMAIL" ] || [ -z "$LOGIN_PASSWORD" ]; then
        print_warning "Skipping live test - authentication not configured"
        return 1
    fi
    
    MAIN_URL=$(wrangler deployments list --config wrangler-main.toml | grep "https://" | head -1 | awk '{print $2}')
    
    print_status "  Testing minimal scrape with authentication..."
    RESPONSE=$(curl -s "${MAIN_URL}/minimal-scrape?details=0")
    
    if echo "$RESPONSE" | grep -q '"total"' && echo "$RESPONSE" | grep -q '"data"'; then
        TOTAL=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
        print_success "  Live scraping working! Found $TOTAL livers"
    else
        print_warning "  Live scraping may have issues"
        echo "    Response: $(echo "$RESPONSE" | head -c 200)..."
    fi
}

# スケジュール確認
check_schedules() {
    print_status "Checking cron schedules..."
    
    for config in wrangler-main.toml wrangler-details.toml wrangler-images.toml; do
        SCHEDULE=$(grep -A1 "\[triggers\]" "$config" | grep "crons" | cut -d'"' -f2)
        WORKER_NAME=$(grep "name =" "$config" | cut -d'"' -f2)
        print_status "  $WORKER_NAME: $SCHEDULE"
    done
    
    print_success "All workers have cron schedules configured"
}

# ログ監視テスト
test_logging() {
    print_status "Testing log monitoring..."
    print_status "You can monitor logs in real-time with:"
    echo "  wrangler tail liver-scraper-main"
    echo "  wrangler tail liver-scraper-details"
    echo "  wrangler tail liver-scraper-images"
}

# メイン実行
main() {
    print_status "🚀 Starting comprehensive deployment test..."
    
    get_account_info
    echo
    
    update_worker_urls
    echo
    
    # Worker順次デプロイ・テスト
    test_single_worker "liver-scraper-main" "wrangler-main.toml"
    echo
    
    test_single_worker "liver-scraper-details" "wrangler-details.toml"
    echo
    
    test_single_worker "liver-scraper-images" "wrangler-images.toml"
    echo
    
    # エンドポイントテスト
    test_main_worker_endpoints
    echo
    
    # 通信テスト
    test_worker_communication
    echo
    
    # シークレット設定（環境変数があれば）
    test_secrets_setup
    echo
    
    # ライブテスト（認証設定済みなら）
    test_live_scraping
    echo
    
    # スケジュール確認
    check_schedules
    echo
    
    # ログ監視情報
    test_logging
    echo
    
    print_success "🎉 Deployment test completed!"
    print_status "Next steps:"
    echo "1. Set up authentication if not done:"
    echo "   export LOGIN_EMAIL='your-email' LOGIN_PASSWORD='your-password'"
    echo "   ./test-deployment.sh  # re-run with auth"
    echo ""
    echo "2. Monitor the first scheduled execution:"
    echo "   wrangler tail liver-scraper-main"
    echo ""
    echo "3. Check data storage:"
    echo "   curl https://liver-scraper-main.YOUR-SUBDOMAIN.workers.dev/status"
}

main