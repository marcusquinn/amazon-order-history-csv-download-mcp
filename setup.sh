#!/bin/bash
# Amazon Order History CSV Download MCP - Setup Script
# Version: 0.3.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    local msg="$1"
    echo -e "${BLUE}[INFO]${NC} $msg"
    return 0
}

print_success() {
    local msg="$1"
    echo -e "${GREEN}[SUCCESS]${NC} $msg"
    return 0
}

print_warning() {
    local msg="$1"
    echo -e "${YELLOW}[WARNING]${NC} $msg"
    return 0
}

print_error() {
    local msg="$1"
    echo -e "${RED}[ERROR]${NC} $msg" >&2
    return 0
}

check_requirements() {
    print_info "Checking requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed"
        print_info "Install from: https://nodejs.org/"
        return 1
    fi
    
    local node_version
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js 18 or higher required (found: $(node -v))"
        return 1
    fi
    print_success "Node.js $(node -v) found"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is required but not installed"
        return 1
    fi
    print_success "npm $(npm -v) found"
    
    return 0
}

install_dependencies() {
    print_info "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
    return 0
}

install_playwright() {
    print_info "Installing Playwright browsers..."
    npx playwright install chromium
    print_success "Playwright browsers installed"
    return 0
}

build_project() {
    print_info "Building project..."
    npm run build
    print_success "Project built"
    return 0
}

run_tests() {
    print_info "Running tests..."
    if npm test; then
        print_success "All tests passed"
        return 0
    else
        print_warning "Some tests failed - check output above"
        return 0
    fi
}

install_opencode_agent() {
    print_info "Installing OpenCode agent..."
    
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local agent_source="$script_dir/.agent/amazon-order-history.md"
    local agent_target="$HOME/.opencode/agent/amazon-order-history.md"
    
    # Check if source exists
    if [ ! -f "$agent_source" ]; then
        print_warning "Agent file not found: $agent_source"
        return 0
    fi
    
    # Create target directory
    mkdir -p "$HOME/.opencode/agent"
    
    # Remove old symlink if exists
    if [ -L "$agent_target" ] || [ -f "$agent_target" ]; then
        rm -f "$agent_target"
    fi
    
    # Create symlink
    ln -sf "$agent_source" "$agent_target"
    
    if [ -L "$agent_target" ]; then
        print_success "OpenCode agent installed: @amazon-order-history"
    else
        print_warning "Failed to create agent symlink"
    fi
    
    return 0
}

show_help() {
    cat << EOF
Amazon Order History CSV Download MCP - Setup Script

USAGE:
    ./setup.sh [COMMAND]

COMMANDS:
    install     Install dependencies and build (default)
    dev         Set up for development (includes dev dependencies)
    help        Show this help message

EXAMPLES:
    ./setup.sh              # Full installation
    ./setup.sh install      # Same as above
    ./setup.sh dev          # Development setup

DOCUMENTATION:
    See README.md for usage instructions
    See AGENTS.md for development guidelines
EOF
    return 0
}

main() {
    local command="${1:-install}"
    
    echo "================================================"
    echo "Amazon Order History CSV Download MCP"
    echo "Setup Script v0.3.0"
    echo "================================================"
    echo ""
    
    case "$command" in
        "help"|"-h"|"--help")
            show_help
            return 0
            ;;
        "install"|"dev")
            check_requirements || return 1
            install_dependencies || return 1
            install_playwright || return 1
            build_project || return 1
            run_tests || return 1
            install_opencode_agent || return 1
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            return 1
            ;;
    esac
    
    echo ""
    print_success "Setup complete!"
    echo ""
    print_info "Next steps:"
    echo "  1. Configure your MCP client (see README.md)"
    echo "  2. Log in to Amazon in the browser session"
    echo "  3. Use @amazon-order-history agent or MCP tools directly"
    echo ""
    
    return 0
}

main "$@"
