#!/bin/bash
#
# deploy-worker.sh - Deploy Mission Control Worker to Cloudflare
#
# Usage: ./infra/deploy-worker.sh [--dry-run] [--env staging|production]
#
# This script:
# - Validates the build locally
# - Deploys to Cloudflare Workers using wrangler
# - Supports staging and production environments
# - Runs post-deployment health checks
#

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly WORKER_DIR="${PROJECT_ROOT}/packages/worker"
readonly HEALTH_CHECK_RETRIES=5
readonly HEALTH_CHECK_DELAY=3

# Environment-specific configuration
declare -A WORKER_NAMES=(
    ["staging"]="mission-control-worker-staging"
    ["production"]="mission-control-worker"
)

declare -A WORKER_URLS=(
    ["staging"]="${STAGING_WORKER_URL:-}"
    ["production"]="${PRODUCTION_WORKER_URL:-}"
)

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Print usage information
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Deploy Mission Control Worker to Cloudflare.

Options:
    --dry-run           Show what would be done without deploying
    --env ENV           Target environment: staging or production (default: staging)
    --skip-typecheck    Skip TypeScript type checking
    --skip-build        Skip build step
    --skip-health       Skip post-deployment health check
    -h, --help          Show this help message

Environment Variables:
    CLOUDFLARE_API_TOKEN    Cloudflare API token for deployment
    CLOUDFLARE_ACCOUNT_ID   Cloudflare account ID
    STAGING_WORKER_URL      URL for staging worker health check
    PRODUCTION_WORKER_URL   URL for production worker health check

Examples:
    $(basename "$0") --env production
    $(basename "$0") --dry-run --env staging
    $(basename "$0") --env production --skip-typecheck
EOF
}

# Parse command line arguments
DRY_RUN=false
ENVIRONMENT="staging"
SKIP_TYPECHECK=false
SKIP_BUILD=false
SKIP_HEALTH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-typecheck)
            SKIP_TYPECHECK=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-health)
            SKIP_HEALTH=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
    exit 1
fi

# Get environment-specific configuration
WORKER_NAME="${WORKER_NAMES[$ENVIRONMENT]}"
WORKER_URL="${WORKER_URLS[$ENVIRONMENT]}"

# Check for required tools
check_requirements() {
    log_info "Checking requirements..."

    if ! command -v wrangler &> /dev/null; then
        log_error "wrangler CLI not found. Install with: npm install -g wrangler"
        exit 1
    fi

    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm not found. Install with: npm install -g pnpm"
        exit 1
    fi

    if [[ ! -d "$WORKER_DIR" ]]; then
        log_error "Worker directory not found: $WORKER_DIR"
        exit 1
    fi

    log_success "All requirements met"
}

# Validate TypeScript types
run_typecheck() {
    if [[ "$SKIP_TYPECHECK" == "true" ]]; then
        log_warn "Skipping type check"
        return 0
    fi

    log_info "Running TypeScript type check..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run: pnpm --filter worker typecheck"
        return 0
    fi

    cd "$PROJECT_ROOT"
    if pnpm --filter worker typecheck; then
        log_success "Type check passed"
    else
        log_error "Type check failed"
        exit 1
    fi
}

# Build the worker
run_build() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        log_warn "Skipping build"
        return 0
    fi

    log_info "Building worker..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run: pnpm --filter worker build"
        return 0
    fi

    cd "$PROJECT_ROOT"
    if pnpm --filter worker build; then
        log_success "Build successful"
    else
        log_error "Build failed"
        exit 1
    fi
}

# Deploy to Cloudflare
deploy_worker() {
    log_info "Deploying to Cloudflare ($ENVIRONMENT)..."

    cd "$WORKER_DIR"

    # Prepare wrangler command
    local wrangler_cmd="wrangler deploy"

    # Add environment flag for staging
    if [[ "$ENVIRONMENT" == "staging" ]]; then
        wrangler_cmd="$wrangler_cmd --env staging"
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run: $wrangler_cmd --dry-run"
        wrangler_cmd="$wrangler_cmd --dry-run"
    fi

    log_info "Executing: $wrangler_cmd"

    if $wrangler_cmd; then
        log_success "Deployment successful"
    else
        log_error "Deployment failed"
        exit 1
    fi
}

# Health check
check_health() {
    if [[ "$SKIP_HEALTH" == "true" ]]; then
        log_warn "Skipping health check"
        return 0
    fi

    if [[ -z "$WORKER_URL" ]]; then
        log_warn "No worker URL configured for health check"
        log_warn "Set ${ENVIRONMENT^^}_WORKER_URL to enable health checks"
        return 0
    fi

    local url="${WORKER_URL}/health"
    local retries=$HEALTH_CHECK_RETRIES
    local delay=$HEALTH_CHECK_DELAY

    log_info "Checking worker health at $url..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would check health at: $url"
        return 0
    fi

    # Wait a bit for deployment to propagate
    log_info "Waiting for deployment to propagate..."
    sleep 5

    while [[ $retries -gt 0 ]]; do
        local response
        local http_code

        # Get both response body and HTTP code
        response=$(curl -sf -w "\n%{http_code}" "$url" 2>/dev/null) || true
        http_code=$(echo "$response" | tail -n1)

        if [[ "$http_code" == "200" ]]; then
            log_success "Health check passed (HTTP $http_code)"
            return 0
        fi

        retries=$((retries - 1))
        if [[ $retries -gt 0 ]]; then
            log_warn "Health check failed (HTTP $http_code), retrying in ${delay}s... ($retries attempts left)"
            sleep $delay
        fi
    done

    log_error "Health check failed after all retries"
    return 1
}

# Show deployment info
show_deployment_info() {
    log_info "Fetching deployment info..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would show deployment info"
        return 0
    fi

    cd "$WORKER_DIR"

    log_info "Recent deployments:"
    wrangler deployments list --limit 3 2>/dev/null || log_warn "Could not fetch deployment list"
}

# Cleanup function for trap
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 && $exit_code -ne 2 ]]; then
        log_error "Deployment failed with exit code: $exit_code"
    fi
}

trap cleanup EXIT

# Main deployment
main() {
    log_info "============================================"
    log_info "Mission Control Worker Deployment"
    log_info "============================================"
    log_info "Environment: $ENVIRONMENT"
    log_info "Worker name: $WORKER_NAME"
    log_info "Worker URL:  ${WORKER_URL:-'(not configured)'}"
    log_info "Dry run:     $DRY_RUN"
    log_info "============================================"

    # Check requirements
    check_requirements

    # Pre-deployment validation
    run_typecheck
    run_build

    # Deploy
    deploy_worker

    # Post-deployment verification
    if check_health; then
        log_info "============================================"
        log_success "Deployment completed successfully!"
        log_info "============================================"
    else
        log_warn "============================================"
        log_warn "Deployment completed but health check failed"
        log_warn "============================================"
        exit 2  # Warning exit code
    fi

    # Show deployment info
    show_deployment_info

    log_info ""
    log_info "Next steps:"
    log_info "  - Monitor logs: wrangler tail"
    log_info "  - View deployments: wrangler deployments list"
    if [[ -n "$WORKER_URL" ]]; then
        log_info "  - Test endpoint: curl ${WORKER_URL}/health"
    fi
}

main
