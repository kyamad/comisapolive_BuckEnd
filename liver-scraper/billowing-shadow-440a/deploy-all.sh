#!/bin/bash

# Deploy all 3 liver-scraper workers
# Usage: ./deploy-all.sh [environment]
# Environment: dev (default) or prod

set -e

ENVIRONMENT=${1:-dev}
CURRENT_DIR=$(pwd)

echo "🚀 Starting deployment of liver-scraper workers (${ENVIRONMENT})"
echo "Current directory: ${CURRENT_DIR}"

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "wrangler CLI not found. Please install it first:"
    print_error "npm install -g wrangler"
    exit 1
fi

# Check if we're authenticated
print_status "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    print_error "Not authenticated with Cloudflare. Please run: wrangler login"
    exit 1
fi

print_success "Cloudflare authentication confirmed"

# Function to deploy a single worker
deploy_worker() {
    local worker_name=$1
    local config_file=$2
    
    print_status "Deploying ${worker_name}..."
    
    if [ ! -f "${config_file}" ]; then
        print_error "Configuration file ${config_file} not found!"
        return 1
    fi
    
    if [ "${ENVIRONMENT}" = "prod" ]; then
        wrangler deploy --config "${config_file}" --env production
    else
        wrangler deploy --config "${config_file}"
    fi
    
    if [ $? -eq 0 ]; then
        print_success "${worker_name} deployed successfully"
    else
        print_error "Failed to deploy ${worker_name}"
        return 1
    fi
}

# Function to set secrets for a worker
set_worker_secrets() {
    local worker_name=$1
    local config_file=$2
    
    print_status "Setting secrets for ${worker_name}..."
    
    # Check if secrets are already set (non-interactive check)
    if [ "${ENVIRONMENT}" = "prod" ]; then
        ENV_FLAG="--env production"
    else
        ENV_FLAG=""
    fi
    
    # Set LOGIN_EMAIL if provided
    if [ ! -z "${LOGIN_EMAIL}" ]; then
        echo "${LOGIN_EMAIL}" | wrangler secret put LOGIN_EMAIL --config "${config_file}" ${ENV_FLAG}
        print_success "LOGIN_EMAIL set for ${worker_name}"
    else
        print_warning "LOGIN_EMAIL not provided for ${worker_name}"
    fi
    
    # Set LOGIN_PASSWORD if provided
    if [ ! -z "${LOGIN_PASSWORD}" ]; then
        echo "${LOGIN_PASSWORD}" | wrangler secret put LOGIN_PASSWORD --config "${config_file}" ${ENV_FLAG}
        print_success "LOGIN_PASSWORD set for ${worker_name}"
    else
        print_warning "LOGIN_PASSWORD not provided for ${worker_name}"
    fi
}

# Function to update worker URLs in configurations
update_worker_urls() {
    print_status "Updating worker URLs in configurations..."
    
    # Get account info to construct proper URLs
    ACCOUNT_INFO=$(wrangler whoami)
    
    if [ "${ENVIRONMENT}" = "prod" ]; then
        MAIN_URL="https://liver-scraper-main.your-account.workers.dev"
        DETAILS_URL="https://liver-scraper-details.your-account.workers.dev"
        IMAGES_URL="https://liver-scraper-images.your-account.workers.dev"
    else
        MAIN_URL="https://liver-scraper-main.your-account.workers.dev"
        DETAILS_URL="https://liver-scraper-details.your-account.workers.dev"
        IMAGES_URL="https://liver-scraper-images.your-account.workers.dev"
    fi
    
    print_warning "Please update the following URLs in your wrangler config files:"
    print_warning "Main Worker: ${MAIN_URL}"
    print_warning "Details Worker: ${DETAILS_URL}"
    print_warning "Images Worker: ${IMAGES_URL}"
}

# Main deployment sequence
main() {
    print_status "Starting deployment sequence..."
    
    # Deploy workers in order
    print_status "=== Deploying Worker 1: Main Scraper ==="
    deploy_worker "liver-scraper-main" "wrangler-main.toml"
    
    print_status "=== Deploying Worker 2: Details Scraper ==="
    deploy_worker "liver-scraper-details" "wrangler-details.toml"
    
    print_status "=== Deploying Worker 3: Images Scraper ==="
    deploy_worker "liver-scraper-images" "wrangler-images.toml"
    
    # Set secrets if environment variables are provided
    if [ ! -z "${LOGIN_EMAIL}" ] || [ ! -z "${LOGIN_PASSWORD}" ]; then
        print_status "=== Setting Secrets ==="
        set_worker_secrets "liver-scraper-main" "wrangler-main.toml"
        set_worker_secrets "liver-scraper-details" "wrangler-details.toml"
        set_worker_secrets "liver-scraper-images" "wrangler-images.toml"
    else
        print_warning "No LOGIN_EMAIL or LOGIN_PASSWORD environment variables found"
        print_warning "Set secrets manually using: wrangler secret put SECRET_NAME --config CONFIG_FILE"
    fi
    
    # Show deployment summary
    print_success "=== Deployment Complete ==="
    print_success "All 3 workers have been deployed successfully!"
    
    update_worker_urls
    
    print_status "=== Next Steps ==="
    echo "1. Update worker URLs in your configuration files"
    echo "2. Set secrets if not done automatically:"
    echo "   wrangler secret put LOGIN_EMAIL --config wrangler-main.toml"
    echo "   wrangler secret put LOGIN_PASSWORD --config wrangler-main.toml"
    echo "   (repeat for other workers)"
    echo "3. Test the deployment:"
    echo "   curl https://liver-scraper-main.your-account.workers.dev/status"
    echo "4. Monitor the cron schedules:"
    echo "   - Main: Every 6 hours (0,6,12,18)"
    echo "   - Details: 30 minutes after main"
    echo "   - Images: 1-2 hours after details"
    
    print_status "=== Manual Testing Commands ==="
    echo "Test main worker:"
    echo "  curl https://liver-scraper-main.your-account.workers.dev/minimal-scrape"
    echo ""
    echo "Trigger detail worker:"
    echo "  curl -X POST https://liver-scraper-details.your-account.workers.dev/start-batch \\"
    echo "    -H 'Authorization: Bearer your-secure-token-here'"
    echo ""
    echo "Check image worker status:"
    echo "  curl https://liver-scraper-images.your-account.workers.dev/image-status \\"
    echo "    -H 'Authorization: Bearer your-secure-token-here'"
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Check for help flag
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [environment]"
    echo ""
    echo "Arguments:"
    echo "  environment    Deployment environment (dev|prod) [default: dev]"
    echo ""
    echo "Environment Variables:"
    echo "  LOGIN_EMAIL      Email for liver scraper login"
    echo "  LOGIN_PASSWORD   Password for liver scraper login"
    echo ""
    echo "Examples:"
    echo "  $0               # Deploy to dev environment"
    echo "  $0 prod          # Deploy to production environment"
    echo "  LOGIN_EMAIL=user@example.com LOGIN_PASSWORD=pass $0"
    echo ""
    exit 0
fi

# Check if configuration files exist
MISSING_FILES=()
for config in "wrangler-main.toml" "wrangler-details.toml" "wrangler-images.toml"; do
    if [ ! -f "${config}" ]; then
        MISSING_FILES+=("${config}")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    print_error "Missing configuration files:"
    for file in "${MISSING_FILES[@]}"; do
        print_error "  - ${file}"
    done
    exit 1
fi

# Check if source files exist
MISSING_SOURCE=()
for source in "src/main-scraper.js" "src/details-scraper.js" "src/images-scraper.js"; do
    if [ ! -f "${source}" ]; then
        MISSING_SOURCE+=("${source}")
    fi
done

if [ ${#MISSING_SOURCE[@]} -gt 0 ]; then
    print_error "Missing source files:"
    for file in "${MISSING_SOURCE[@]}"; do
        print_error "  - ${file}"
    done
    exit 1
fi

# Run main deployment
main

print_success "🎉 Deployment script completed successfully!"