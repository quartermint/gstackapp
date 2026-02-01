#!/bin/bash
#
# health-check.sh - Health check script for Mission Control components
#
# Usage: ./infra/health-check.sh [--component hub|worker|convex|tailscale|all]
#
# This script checks:
# - Hub health endpoint
# - Worker health (if reachable)
# - Convex connectivity
# - Tailscale connectivity
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#   2 - Partial success (some checks passed, some skipped)
#

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default URLs (can be overridden by environment variables)
HUB_URL="${HUB_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-}"
CONVEX_URL="${CONVEX_URL:-}"
TAILSCALE_NETWORK="${TAILSCALE_NETWORK:-100.64.0.0/10}"

# Timeouts
readonly CURL_TIMEOUT=10
readonly TAILSCALE_TIMEOUT=5

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Status tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_SKIPPED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((CHECKS_SKIPPED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Print usage information
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Check health of Mission Control components.

Options:
    --component COMP    Component to check: hub, worker, convex, tailscale, all (default: all)
    --json              Output results as JSON
    --quiet             Suppress detailed output, only show summary
    --verbose           Show detailed response information
    -h, --help          Show this help message

Environment Variables:
    HUB_URL             URL for hub health check (default: http://localhost:3000)
    WORKER_URL          URL for worker health check
    CONVEX_URL          Convex deployment URL
    TAILSCALE_NETWORK   Tailscale network CIDR (default: 100.64.0.0/10)

Exit Codes:
    0 - All checks passed
    1 - One or more checks failed
    2 - Partial success (some passed, some skipped)

Examples:
    $(basename "$0")
    $(basename "$0") --component hub
    $(basename "$0") --component all --verbose
    $(basename "$0") --json
EOF
}

# Parse command line arguments
COMPONENT="all"
JSON_OUTPUT=false
QUIET=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --component)
            COMPONENT="$2"
            shift 2
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

# Validate component
valid_components="hub worker convex tailscale all"
if [[ ! " $valid_components " =~ " $COMPONENT " ]]; then
    echo "Invalid component: $COMPONENT" >&2
    echo "Valid components: $valid_components" >&2
    exit 1
fi

# Check if component should be checked
should_check() {
    local component="$1"
    [[ "$COMPONENT" == "all" || "$COMPONENT" == "$component" ]]
}

# HTTP health check
http_health_check() {
    local name="$1"
    local url="$2"
    local endpoint="${3:-/health}"

    local full_url="${url}${endpoint}"

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Checking $name at $full_url"
    fi

    local response
    local http_code
    local body

    # Get response with both body and HTTP code
    response=$(curl -sf -w "\n%{http_code}" \
        --connect-timeout "$CURL_TIMEOUT" \
        --max-time "$CURL_TIMEOUT" \
        "$full_url" 2>/dev/null) || true

    if [[ -z "$response" ]]; then
        log_fail "$name: Connection failed ($full_url)"
        return 1
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "200" ]]; then
        if [[ "$VERBOSE" == "true" && -n "$body" ]]; then
            log_info "Response: $body"
        fi
        log_success "$name: Healthy (HTTP $http_code)"
        return 0
    else
        log_fail "$name: Unhealthy (HTTP $http_code)"
        if [[ "$VERBOSE" == "true" && -n "$body" ]]; then
            log_info "Response: $body"
        fi
        return 1
    fi
}

# Check Hub health
check_hub() {
    if ! should_check "hub"; then
        return 0
    fi

    log_info "--- Hub Health Check ---"

    if [[ -z "$HUB_URL" ]]; then
        log_skip "Hub: HUB_URL not configured"
        return 0
    fi

    http_health_check "Hub" "$HUB_URL" "/health" || true

    # Also check detailed health endpoint if available
    if [[ "$VERBOSE" == "true" ]]; then
        http_health_check "Hub (detailed)" "$HUB_URL" "/health/detailed" 2>/dev/null || true
    fi
}

# Check Worker health
check_worker() {
    if ! should_check "worker"; then
        return 0
    fi

    log_info "--- Worker Health Check ---"

    if [[ -z "$WORKER_URL" ]]; then
        log_skip "Worker: WORKER_URL not configured"
        return 0
    fi

    http_health_check "Worker" "$WORKER_URL" "/health" || true
}

# Check Convex connectivity
check_convex() {
    if ! should_check "convex"; then
        return 0
    fi

    log_info "--- Convex Connectivity Check ---"

    if [[ -z "$CONVEX_URL" ]]; then
        log_skip "Convex: CONVEX_URL not configured"
        return 0
    fi

    # Extract the deployment URL and check if it's reachable
    # Convex URLs typically end with .convex.cloud
    local convex_health_url="${CONVEX_URL}"

    # Try to reach Convex
    local response
    response=$(curl -sf -w "%{http_code}" \
        --connect-timeout "$CURL_TIMEOUT" \
        --max-time "$CURL_TIMEOUT" \
        -o /dev/null \
        "$convex_health_url" 2>/dev/null) || true

    if [[ "$response" == "200" || "$response" == "404" ]]; then
        # 404 is acceptable - it means Convex is reachable but we hit a non-existent endpoint
        log_success "Convex: Reachable (HTTP $response)"
    elif [[ -z "$response" ]]; then
        log_fail "Convex: Connection failed"
    else
        log_warn "Convex: Unexpected response (HTTP $response)"
    fi
}

# Check Tailscale connectivity
check_tailscale() {
    if ! should_check "tailscale"; then
        return 0
    fi

    log_info "--- Tailscale Connectivity Check ---"

    # Check if tailscale command exists
    if ! command -v tailscale &> /dev/null; then
        log_skip "Tailscale: tailscale CLI not installed"
        return 0
    fi

    # Check if tailscale is running
    local status
    status=$(tailscale status --json 2>/dev/null) || true

    if [[ -z "$status" ]]; then
        log_fail "Tailscale: Not running or not authenticated"
        return 0
    fi

    # Parse status
    local backend_state
    backend_state=$(echo "$status" | jq -r '.BackendState // "Unknown"' 2>/dev/null) || backend_state="Unknown"

    if [[ "$backend_state" == "Running" ]]; then
        log_success "Tailscale: Running"

        # Get connected peers count
        if [[ "$VERBOSE" == "true" ]]; then
            local peer_count
            peer_count=$(echo "$status" | jq '.Peer | length' 2>/dev/null) || peer_count="0"
            log_info "Connected peers: $peer_count"

            # Show self IP
            local self_ips
            self_ips=$(echo "$status" | jq -r '.Self.TailscaleIPs | join(", ")' 2>/dev/null) || self_ips="Unknown"
            log_info "Self IPs: $self_ips"
        fi
    else
        log_fail "Tailscale: State is '$backend_state'"
    fi

    # Check if we can reach other nodes in the tailnet
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Checking connectivity to tailnet peers..."
        local peers
        peers=$(echo "$status" | jq -r '.Peer[].TailscaleIPs[0]' 2>/dev/null) || peers=""

        for peer_ip in $peers; do
            if ping -c 1 -W "$TAILSCALE_TIMEOUT" "$peer_ip" &> /dev/null; then
                log_success "Peer $peer_ip: Reachable"
            else
                log_warn "Peer $peer_ip: Not reachable"
            fi
        done
    fi
}

# Output JSON result
output_json() {
    local total=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_SKIPPED))
    local status="healthy"

    if [[ $CHECKS_FAILED -gt 0 ]]; then
        status="unhealthy"
    elif [[ $CHECKS_SKIPPED -gt 0 && $CHECKS_PASSED -eq 0 ]]; then
        status="unknown"
    elif [[ $CHECKS_SKIPPED -gt 0 ]]; then
        status="partial"
    fi

    cat << EOF
{
  "status": "$status",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "checks": {
    "total": $total,
    "passed": $CHECKS_PASSED,
    "failed": $CHECKS_FAILED,
    "skipped": $CHECKS_SKIPPED
  },
  "component": "$COMPONENT"
}
EOF
}

# Print summary
print_summary() {
    echo ""
    log_info "============================================"
    log_info "Health Check Summary"
    log_info "============================================"
    echo -e "Passed:  ${GREEN}$CHECKS_PASSED${NC}"
    echo -e "Failed:  ${RED}$CHECKS_FAILED${NC}"
    echo -e "Skipped: ${YELLOW}$CHECKS_SKIPPED${NC}"
    log_info "============================================"
}

# Determine exit code
get_exit_code() {
    if [[ $CHECKS_FAILED -gt 0 ]]; then
        echo 1
    elif [[ $CHECKS_SKIPPED -gt 0 && $CHECKS_PASSED -gt 0 ]]; then
        echo 2
    elif [[ $CHECKS_PASSED -eq 0 ]]; then
        echo 2
    else
        echo 0
    fi
}

# Main
main() {
    if [[ "$QUIET" == "false" && "$JSON_OUTPUT" == "false" ]]; then
        log_info "============================================"
        log_info "Mission Control Health Check"
        log_info "============================================"
        log_info "Component: $COMPONENT"
        log_info "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        log_info "============================================"
        echo ""
    fi

    # Run checks
    check_hub
    check_worker
    check_convex
    check_tailscale

    # Output results
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
    elif [[ "$QUIET" == "false" ]]; then
        print_summary
    fi

    # Exit with appropriate code
    exit "$(get_exit_code)"
}

main
