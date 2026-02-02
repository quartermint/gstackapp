#!/bin/bash
#
# Notify worktrees about package changes
# Usage: ./scripts/notify-package-change.sh <package> <branch>
#
# Example:
#   ./scripts/notify-package-change.sh MissionControlModels packages/swift/models/add-user-preferences
#

set -e

PACKAGE=${1:-"(unspecified)"}
BRANCH=${2:-$(git branch --show-current)}

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel)

# Get all worktrees
WORKTREES=$(git worktree list --porcelain | grep "^worktree" | cut -d' ' -f2)

echo "=== Package Change Notification ==="
echo "Package: $PACKAGE"
echo "Branch: $BRANCH"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

echo "Affected worktrees need to sync with these commands:"
echo ""

for wt in $WORKTREES; do
    # Skip current worktree
    [[ "$wt" == "$PWD" ]] && continue
    [[ "$wt" == "$REPO_ROOT" ]] && continue

    # Get worktree name for display
    WT_NAME=$(basename "$wt")

    echo "# $WT_NAME"
    echo "cd $wt && git fetch origin $BRANCH && git merge origin/$BRANCH"
    echo ""
done

echo "=== Reminder ==="
echo "1. Update SWIFT_PACKAGE_COORDINATION.md to remove your active modification entry"
echo "2. Notify team members in appropriate channels"
echo "3. Run ./scripts/verify-all-apps.sh after all worktrees are synced"
