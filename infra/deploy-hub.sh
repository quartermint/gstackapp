#!/bin/bash
#
# deploy-hub.sh - Deploy Mission Control Hub to Hetzner server
#
# Usage: ./infra/deploy-hub.sh [--dry-run] [--env staging|production]
#
# This script:
# - SSHs to the Hetzner server
# - Pulls latest code from git
# - Installs dependencies and builds
# - Reloads systemd service (graceful restart)
# - Verifies deployment with health check
# - Rolls back on failure
#

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_NAME="mission-control"
readonly SERVICE_NAME="mission-hub"
readonly REMOTE_USER="${REMOTE_USER:-mission}"
readonly REMOTE_DIR="/home/${REMOTE_USER}/${PROJECT_NAME}"
readonly HEALTH_CHECK_RETRIES=5
readonly HEALTH_CHECK_DELAY=3

# Environment-specific configuration
declare -A SERVER_IPS=(
    ["staging"]="${STAGING_SERVER_IP:-}"
    ["production"]="${PRODUCTION_SERVER_IP:-}"
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

Deploy Mission Control Hub to Hetzner server.

Options:
    --dry-run           Show what would be done without making changes
    --env ENV           Target environment: staging or production (default: staging)
    --server IP         Override server IP address
    --skip-build        Skip build step (use existing build)
    --skip-tests        Skip pre-deployment tests
    --force             Force deployment even if health check fails
    -h, --help          Show this help message

Environment Variables:
    STAGING_SERVER_IP       IP address for staging server
    PRODUCTION_SERVER_IP    IP address for production server
    REMOTE_USER             SSH user (default: mission)
    SSH_KEY_PATH            Path to SSH private key

Examples:
    $(basename "$0") --env production
    $(basename "$0") --dry-run --env staging
    $(basename "$0") --server 100.64.0.10 --env production
EOF
}

# Parse command line arguments
DRY_RUN=false
ENVIRONMENT="staging"
SERVER_OVERRIDE=""
SKIP_BUILD=false
SKIP_TESTS=false
FORCE=false

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
        --server)
            SERVER_OVERRIDE="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE=true
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

# Determine server IP
if [[ -n "$SERVER_OVERRIDE" ]]; then
    SERVER_IP="$SERVER_OVERRIDE"
else
    SERVER_IP="${SERVER_IPS[$ENVIRONMENT]}"
fi

if [[ -z "$SERVER_IP" ]]; then
    log_error "No server IP configured for environment: $ENVIRONMENT"
    log_error "Set ${ENVIRONMENT^^}_SERVER_IP environment variable or use --server option"
    exit 1
fi

# SSH options
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
if [[ -n "${SSH_KEY_PATH:-}" ]]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY_PATH"
fi

# Remote command execution
remote_exec() {
    local cmd="$1"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would execute on ${REMOTE_USER}@${SERVER_IP}: $cmd"
        return 0
    fi
    # shellcheck disable=SC2029
    ssh $SSH_OPTS "${REMOTE_USER}@${SERVER_IP}" "$cmd"
}

# Get current git commit for rollback
get_current_commit() {
    remote_exec "cd ${REMOTE_DIR} && git rev-parse HEAD 2>/dev/null || echo 'none'"
}

# Health check
check_health() {
    local url="http://localhost:3000/health"
    local retries=$HEALTH_CHECK_RETRIES
    local delay=$HEALTH_CHECK_DELAY

    log_info "Checking hub health at $url..."

    while [[ $retries -gt 0 ]]; do
        if remote_exec "curl -sf $url > /dev/null 2>&1"; then
            return 0
        fi
        retries=$((retries - 1))
        if [[ $retries -gt 0 ]]; then
            log_warn "Health check failed, retrying in ${delay}s... ($retries attempts left)"
            sleep $delay
        fi
    done

    return 1
}

# Rollback to previous commit
rollback() {
    local previous_commit="$1"

    if [[ "$previous_commit" == "none" ]]; then
        log_error "No previous commit to rollback to"
        return 1
    fi

    log_warn "Rolling back to commit: $previous_commit"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would rollback to $previous_commit"
        return 0
    fi

    remote_exec "cd ${REMOTE_DIR} && git checkout $previous_commit"
    remote_exec "cd ${REMOTE_DIR} && pnpm install --frozen-lockfile"
    remote_exec "cd ${REMOTE_DIR} && pnpm --filter hub build"
    remote_exec "sudo systemctl restart ${SERVICE_NAME}"

    log_info "Rollback complete, verifying..."
    if check_health; then
        log_success "Rollback successful"
        return 0
    else
        log_error "Rollback failed - manual intervention required"
        return 1
    fi
}

# Cleanup function for trap
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Deployment failed with exit code: $exit_code"
    fi
}

trap cleanup EXIT

# Main deployment
main() {
    log_info "============================================"
    log_info "Mission Control Hub Deployment"
    log_info "============================================"
    log_info "Environment: $ENVIRONMENT"
    log_info "Server: ${REMOTE_USER}@${SERVER_IP}"
    log_info "Dry run: $DRY_RUN"
    log_info "============================================"

    # Check SSH connectivity
    log_info "Checking SSH connectivity..."
    if ! remote_exec "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Cannot connect to server via SSH"
        exit 1
    fi
    log_success "SSH connection verified"

    # Store current commit for rollback
    log_info "Recording current deployment state..."
    PREVIOUS_COMMIT=$(get_current_commit)
    log_info "Current commit: $PREVIOUS_COMMIT"

    # Pre-deployment tests (optional)
    if [[ "$SKIP_TESTS" == "false" ]]; then
        log_info "Running pre-deployment tests..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would run: pnpm test"
        else
            if ! pnpm test > /dev/null 2>&1; then
                log_error "Pre-deployment tests failed"
                exit 1
            fi
        fi
        log_success "Pre-deployment tests passed"
    else
        log_warn "Skipping pre-deployment tests"
    fi

    # Pull latest code
    log_info "Pulling latest code..."
    remote_exec "cd ${REMOTE_DIR} && git fetch origin && git pull origin main"
    log_success "Code updated"

    # Install dependencies
    log_info "Installing dependencies..."
    remote_exec "cd ${REMOTE_DIR} && pnpm install --frozen-lockfile"
    log_success "Dependencies installed"

    # Build
    if [[ "$SKIP_BUILD" == "false" ]]; then
        log_info "Building hub package..."
        remote_exec "cd ${REMOTE_DIR} && pnpm --filter hub build"
        log_success "Build complete"
    else
        log_warn "Skipping build step"
    fi

    # Graceful restart using systemd reload
    log_info "Restarting service (graceful)..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would execute: sudo systemctl reload-or-restart ${SERVICE_NAME}"
    else
        remote_exec "sudo systemctl reload-or-restart ${SERVICE_NAME}"
    fi
    log_success "Service restarted"

    # Wait for service to start
    log_info "Waiting for service to start..."
    sleep 5

    # Verify deployment
    log_info "Verifying deployment..."
    if check_health; then
        log_success "Health check passed"
    else
        log_error "Health check failed"

        if [[ "$FORCE" == "true" ]]; then
            log_warn "Force flag set, continuing despite health check failure"
        else
            log_info "Initiating rollback..."
            if rollback "$PREVIOUS_COMMIT"; then
                exit 2  # Warning: rolled back
            else
                exit 1  # Error: rollback failed
            fi
        fi
    fi

    # Get new commit
    NEW_COMMIT=$(get_current_commit)

    log_info "============================================"
    log_success "Deployment completed successfully!"
    log_info "============================================"
    log_info "Previous commit: $PREVIOUS_COMMIT"
    log_info "Current commit:  $NEW_COMMIT"
    log_info "Environment:     $ENVIRONMENT"
    log_info "============================================"

    # Show recent logs
    log_info "Recent service logs:"
    remote_exec "sudo journalctl -u ${SERVICE_NAME} -n 10 --no-pager" || true
}

main
