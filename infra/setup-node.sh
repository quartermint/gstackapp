#!/bin/bash
#
# setup-node.sh - Initialize a new compute node (Mac)
#
# Usage: ./infra/setup-node.sh [--hub-url URL] [--hostname NAME]
#
# This script:
# - Installs dependencies (Node.js, pnpm)
# - Clones and builds the project
# - Configures launchd service
# - Registers with the hub
#

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_NAME="mission-control"
readonly SERVICE_LABEL="com.mission-control.compute"
readonly DEFAULT_PORT=3001
readonly NODE_VERSION="20"

# Installation paths
readonly INSTALL_DIR="${HOME}/${PROJECT_NAME}"
readonly LAUNCHD_PLIST="${HOME}/Library/LaunchAgents/${SERVICE_LABEL}.plist"
readonly LOG_DIR="${HOME}/Library/Logs"
readonly ENV_FILE="${INSTALL_DIR}/.env"

# Git repository
readonly GIT_REPO="${GIT_REPO:-https://github.com/your-org/mission-control.git}"

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

Initialize a new Mission Control compute node (Mac).

Options:
    --hub-url URL       Hub URL for registration (e.g., http://100.64.0.10:3000)
    --hostname NAME     Hostname for this node (default: system hostname)
    --port PORT         Port for compute service (default: 3001)
    --dry-run           Show what would be done without making changes
    --skip-deps         Skip dependency installation
    --skip-register     Skip hub registration
    --uninstall         Uninstall the compute node
    -h, --help          Show this help message

Environment Variables:
    GIT_REPO            Git repository URL (for cloning)
    JWT_SECRET          JWT secret for authentication
    CONVEX_URL          Convex deployment URL
    CONVEX_DEPLOY_KEY   Convex deploy key

Examples:
    $(basename "$0") --hub-url http://100.64.0.10:3000
    $(basename "$0") --hostname macmini-01 --port 3001
    $(basename "$0") --dry-run
    $(basename "$0") --uninstall
EOF
}

# Parse command line arguments
HUB_URL=""
HOSTNAME_OVERRIDE=""
PORT=$DEFAULT_PORT
DRY_RUN=false
SKIP_DEPS=false
SKIP_REGISTER=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --hub-url)
            HUB_URL="$2"
            shift 2
            ;;
        --hostname)
            HOSTNAME_OVERRIDE="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-register)
            SKIP_REGISTER=true
            shift
            ;;
        --uninstall)
            UNINSTALL=true
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

# Get hostname
NODE_HOSTNAME="${HOSTNAME_OVERRIDE:-$(hostname -s)}"

# Check if running on macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        log_error "This script is designed for macOS only"
        exit 1
    fi
    log_success "Running on macOS"
}

# Execute or dry-run a command
run_cmd() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run: $*"
        return 0
    fi
    "$@"
}

# Install Homebrew if not present
install_homebrew() {
    if command -v brew &> /dev/null; then
        log_success "Homebrew already installed"
        return 0
    fi

    log_info "Installing Homebrew..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install Homebrew"
        return 0
    fi

    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    log_success "Homebrew installed"
}

# Install Node.js
install_node() {
    if command -v node &> /dev/null; then
        local current_version
        current_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$current_version" -ge "$NODE_VERSION" ]]; then
            log_success "Node.js v$(node -v) already installed"
            return 0
        fi
    fi

    log_info "Installing Node.js v${NODE_VERSION}..."
    run_cmd brew install "node@${NODE_VERSION}"

    # Add to PATH if needed
    if [[ -d "/opt/homebrew/opt/node@${NODE_VERSION}/bin" ]]; then
        export PATH="/opt/homebrew/opt/node@${NODE_VERSION}/bin:$PATH"
    fi

    log_success "Node.js installed"
}

# Install pnpm
install_pnpm() {
    if command -v pnpm &> /dev/null; then
        log_success "pnpm already installed"
        return 0
    fi

    log_info "Installing pnpm..."
    run_cmd npm install -g pnpm
    log_success "pnpm installed"
}

# Install all dependencies
install_dependencies() {
    if [[ "$SKIP_DEPS" == "true" ]]; then
        log_warn "Skipping dependency installation"
        return 0
    fi

    log_info "Installing dependencies..."
    install_homebrew
    install_node
    install_pnpm
    log_success "All dependencies installed"
}

# Clone or update repository
setup_repository() {
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "Updating existing repository..."
        run_cmd git -C "$INSTALL_DIR" fetch origin
        run_cmd git -C "$INSTALL_DIR" pull origin main
    else
        log_info "Cloning repository..."
        run_cmd git clone "$GIT_REPO" "$INSTALL_DIR"
    fi
    log_success "Repository ready"
}

# Build the project
build_project() {
    log_info "Installing project dependencies..."
    run_cmd pnpm --dir "$INSTALL_DIR" install --frozen-lockfile

    log_info "Building compute package..."
    run_cmd pnpm --dir "$INSTALL_DIR" --filter compute build

    log_success "Project built"
}

# Create environment file
create_env_file() {
    log_info "Creating environment file..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create $ENV_FILE"
        return 0
    fi

    if [[ -f "$ENV_FILE" ]]; then
        log_warn "Environment file already exists, backing up..."
        cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
    fi

    cat > "$ENV_FILE" << EOF
# Mission Control Compute Node Configuration
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

NODE_ENV=production
PORT=${PORT}
HOSTNAME=${NODE_HOSTNAME}

# Hub connection
HUB_URL=${HUB_URL}

# Convex (optional, set if using Convex)
CONVEX_URL=${CONVEX_URL:-}
CONVEX_DEPLOY_KEY=${CONVEX_DEPLOY_KEY:-}

# Authentication
JWT_SECRET=${JWT_SECRET:-}

# Sandbox settings
SANDBOX_ENABLED=true
SANDBOX_WORKDIR=/tmp/sandbox
EOF

    log_success "Environment file created"
    log_warn "Remember to set JWT_SECRET and other required values in $ENV_FILE"
}

# Create launchd plist
create_launchd_plist() {
    log_info "Creating launchd service..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create $LAUNCHD_PLIST"
        return 0
    fi

    # Ensure LaunchAgents directory exists
    mkdir -p "$(dirname "$LAUNCHD_PLIST")"

    # Get node path
    local node_path
    node_path=$(which node)

    cat > "$LAUNCHD_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${node_path}</string>
        <string>${INSTALL_DIR}/packages/compute/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}/packages/compute</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>${PORT}</string>
        <key>HOSTNAME</key>
        <string>${NODE_HOSTNAME}</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/mission-control-compute.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/mission-control-compute.error.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>SoftResourceLimits</key>
    <dict>
        <key>NumberOfFiles</key>
        <integer>4096</integer>
    </dict>
</dict>
</plist>
EOF

    log_success "Launchd plist created"
}

# Load launchd service
load_service() {
    log_info "Loading launchd service..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would load launchd service"
        return 0
    fi

    # Unload if already loaded
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true

    # Load the service
    launchctl load "$LAUNCHD_PLIST"

    # Check if it's running
    sleep 2
    if launchctl list | grep -q "$SERVICE_LABEL"; then
        log_success "Service loaded and running"
    else
        log_error "Service failed to start"
        log_info "Check logs at: ${LOG_DIR}/mission-control-compute.error.log"
        return 1
    fi
}

# Register with hub
register_with_hub() {
    if [[ "$SKIP_REGISTER" == "true" ]]; then
        log_warn "Skipping hub registration"
        return 0
    fi

    if [[ -z "$HUB_URL" ]]; then
        log_warn "No hub URL provided, skipping registration"
        return 0
    fi

    log_info "Registering with hub at $HUB_URL..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would register with hub"
        return 0
    fi

    # Get local IP
    local local_ip
    local_ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")

    # Registration payload
    local payload
    payload=$(cat << EOF
{
  "hostname": "${NODE_HOSTNAME}",
  "ip": "${local_ip}",
  "port": ${PORT},
  "capabilities": ["compute", "sandbox"]
}
EOF
)

    # Try to register
    local response
    response=$(curl -sf -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${HUB_URL}/api/nodes/register" 2>/dev/null) || true

    if [[ -n "$response" ]]; then
        log_success "Registered with hub"
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Response: $response"
        fi
    else
        log_warn "Could not register with hub (hub may not be running)"
        log_warn "You can manually register later or the node will auto-register on first connection"
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."

    local errors=0

    # Check node
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        ((errors++))
    fi

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm not found"
        ((errors++))
    fi

    # Check project directory
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_error "Project directory not found"
        ((errors++))
    fi

    # Check build
    if [[ ! -f "$INSTALL_DIR/packages/compute/dist/index.js" ]]; then
        log_error "Build not found"
        ((errors++))
    fi

    # Check service
    if ! launchctl list | grep -q "$SERVICE_LABEL"; then
        log_error "Service not running"
        ((errors++))
    fi

    # Check health endpoint
    local health_response
    health_response=$(curl -sf "http://localhost:${PORT}/health" 2>/dev/null) || true
    if [[ -z "$health_response" ]]; then
        log_warn "Health endpoint not responding (may still be starting)"
    else
        log_success "Health endpoint responding"
    fi

    if [[ $errors -gt 0 ]]; then
        log_error "Verification failed with $errors errors"
        return 1
    fi

    log_success "Installation verified"
}

# Uninstall compute node
uninstall() {
    log_info "Uninstalling compute node..."

    # Stop and unload service
    if [[ -f "$LAUNCHD_PLIST" ]]; then
        log_info "Stopping service..."
        run_cmd launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
        run_cmd rm -f "$LAUNCHD_PLIST"
        log_success "Service removed"
    fi

    # Remove project directory (optional)
    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "Project directory exists at: $INSTALL_DIR"
        echo -n "Remove project directory? [y/N] "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            run_cmd rm -rf "$INSTALL_DIR"
            log_success "Project directory removed"
        else
            log_info "Project directory kept"
        fi
    fi

    log_success "Uninstall complete"
}

# Print summary
print_summary() {
    echo ""
    log_info "============================================"
    log_info "Setup Summary"
    log_info "============================================"
    log_info "Hostname:    $NODE_HOSTNAME"
    log_info "Port:        $PORT"
    log_info "Install dir: $INSTALL_DIR"
    log_info "Service:     $SERVICE_LABEL"
    log_info "Logs:        ${LOG_DIR}/mission-control-compute.log"
    if [[ -n "$HUB_URL" ]]; then
        log_info "Hub URL:     $HUB_URL"
    fi
    log_info "============================================"
    echo ""
    log_info "Management commands:"
    log_info "  Start:   launchctl load $LAUNCHD_PLIST"
    log_info "  Stop:    launchctl unload $LAUNCHD_PLIST"
    log_info "  Logs:    tail -f ${LOG_DIR}/mission-control-compute.log"
    log_info "  Status:  launchctl list | grep mission-control"
    log_info "============================================"
}

# Main
main() {
    log_info "============================================"
    log_info "Mission Control Compute Node Setup"
    log_info "============================================"

    # Handle uninstall
    if [[ "$UNINSTALL" == "true" ]]; then
        uninstall
        exit 0
    fi

    # Check platform
    check_macos

    # Install dependencies
    install_dependencies

    # Setup project
    setup_repository
    build_project

    # Configure
    create_env_file
    create_launchd_plist

    # Start service
    load_service

    # Register with hub
    register_with_hub

    # Verify
    if [[ "$DRY_RUN" == "false" ]]; then
        verify_installation
    fi

    # Print summary
    print_summary

    log_success "Setup complete!"
}

main
