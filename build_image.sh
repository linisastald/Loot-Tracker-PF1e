#!/usr/bin/env bash

# Docker Image Build Script
# Builds production-optimized single container with frontend + backend
# Also supports Discord broker container builds
#
# IMPORTANT: This script requires bash, not sh!
# Usage: bash ./build_image.sh [--stable] [--no-cache] [--discord-broker] [--branch BRANCH]
#        NOT: sh ./build_image.sh (this will fail)

# Check if running with bash (not sh)
if [ -z "$BASH_VERSION" ]; then
    echo "ERROR: This script requires bash, not sh!"
    echo ""
    echo "You ran: sh $0"
    echo "Instead run: bash $0"
    echo ""
    echo "Or make the script executable and run directly: ./$0"
    exit 1
fi

set -uo pipefail

# Track build duration
BUILD_START_SECONDS=$SECONDS

# Default settings (builds unstable/dev image)
BUILD_STABLE=false
USE_CACHE=true
OPTIMIZE_BUILD=true
IMAGE_NAME="pathfinder-loot"
TAG="dev"
AUTO_VERSION=true
VERSION_TYPE="patch"
SYNC_PACKAGE_VERSION=false
VERBOSE=false
DRY_RUN=false

# Discord broker support
BUILD_DISCORD_BROKER=false
DISCORD_IMAGE_NAME="discord-broker"
DISCORD_TAG="dev"

# Build both images
BUILD_ALL=false

# Worktree support
BUILD_PATH=""
WORKTREE_BRANCH=""
ORIGINAL_DIR=""

# Production optimization settings
USE_BUILDKIT=true
ENABLE_SECURITY_SCAN=false

# Version file location
VERSION_FILE=".docker-version"

# Lock file to prevent concurrent builds
LOCK_FILE="/tmp/build_image_$(pwd | md5sum 2>/dev/null | cut -d' ' -f1 || echo 'default').lock"

# Spinner PID (needs to exist for stop_spinner in trap)
SPINNER_PID=""

# Backup tracking
BACKUP_FILES_CREATED=false

# --- Argument validation helper ---

require_arg() {
    local flag="$1"
    local value="${2:-}"
    if [ -z "$value" ] || [[ "$value" =~ ^- ]]; then
        echo "ERROR: $flag requires a value"
        echo "Use --help for usage information"
        exit 1
    fi
}

# Parse ALL arguments first, then handle early-exit flags
PULL_ONLY=false
CLEANUP_ONLY=false
SHOW_STATUS=false

while [ $# -gt 0 ]; do
    case $1 in
        --stable)
            BUILD_STABLE=true
            TAG="latest"
            shift
            ;;
        --keep-cache)
            USE_CACHE=true
            shift
            ;;
        --no-cache)
            USE_CACHE=false
            shift
            ;;
        --no-optimize)
            OPTIMIZE_BUILD=false
            shift
            ;;
        --security-scan)
            ENABLE_SECURITY_SCAN=true
            shift
            ;;
        --no-buildkit)
            USE_BUILDKIT=false
            shift
            ;;
        --tag)
            require_arg "--tag" "${2:-}"
            TAG="$2"
            AUTO_VERSION=false
            shift 2
            ;;
        --no-version)
            AUTO_VERSION=false
            shift
            ;;
        --version-type)
            require_arg "--version-type" "${2:-}"
            VERSION_TYPE="$2"
            shift 2
            ;;
        --sync-version)
            SYNC_PACKAGE_VERSION=true
            shift
            ;;
        --branch)
            require_arg "--branch" "${2:-}"
            WORKTREE_BRANCH="$2"
            shift 2
            ;;
        --discord-broker)
            BUILD_DISCORD_BROKER=true
            shift
            ;;
        --discord-tag)
            require_arg "--discord-tag" "${2:-}"
            DISCORD_TAG="$2"
            shift 2
            ;;
        --all)
            BUILD_ALL=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --pull-only)
            PULL_ONLY=true
            shift
            ;;
        --cleanup)
            CLEANUP_ONLY=true
            shift
            ;;
        --status)
            SHOW_STATUS=true
            shift
            ;;
        -h|--help)
            echo "Usage: bash $0 [--stable] [--no-cache] [--tag TAG] [--discord-broker] [--branch BRANCH]"
            echo ""
            echo "  NOTE: This script requires bash, not sh. Run with: bash $0"
            echo ""
            echo "  DEFAULT BEHAVIOR (dev build):"
            echo "    - Builds pathfinder-loot:dev"
            echo "    - Always pulls latest code from git or uses worktree"
            echo "    - Uses Docker cache (safe: Dockerfile labels placed last)"
            echo ""
            echo "  OPTIONS:"
            echo "    --stable          Build stable/latest image (pathfinder-loot:latest)"
            echo "                      - Does NOT pull from git (uses current local code)"
            echo "                      - Archives previous 'latest' to versioned image"
            echo "                      - Updates dev image to match stable version"
            echo "    --keep-cache      Use Docker build cache (default)"
            echo "    --no-cache        Force fresh build without Docker cache"
            echo "    --no-optimize     Disable production optimizations"
            echo "    --security-scan   Enable container security scanning"
            echo "    --no-buildkit     Disable Docker BuildKit (use legacy builder)"
            echo "    --tag TAG         Override default tag (disables auto-versioning)"
            echo "    --no-version      Disable automatic version incrementing"
            echo "    --version-type    Type of version increment: major, minor, patch (default: patch)"
            echo "    --sync-version    Sync version with package.json (resets to app version)"
            echo "    --branch BRANCH   Specify branch to build from (creates worktree if needed)"
            echo "    --discord-broker  Build Discord broker container instead of main app"
            echo "    --discord-tag TAG Override Discord broker tag (default: dev)"
            echo "    --all             Build both main app and Discord broker"
            echo "    --verbose, -v     Show detailed Docker build output"
            echo "    --dry-run         Show what would be done without executing"
            echo "    --pull-only       Pull latest from remote and exit (no build)"
            echo "    --cleanup         Remove all dangling images and exit"
            echo "    --status          Show current version, images, and disk info"
            echo ""
            echo "  WORKTREE SUPPORT:"
            echo "    - Use --branch to build from feature branches without switching"
            echo "    - Creates temporary worktrees in ../worktrees/ directory"
            echo "    - Preserves your current branch and working directory"
            echo ""
            echo "  DISCORD BROKER:"
            echo "    - Use --discord-broker to build the Discord integration service"
            echo "    - Creates discord-broker image instead of pathfinder-loot"
            echo "    - Uses discord-handler directory with Node.js Discord.js bot"
            echo "    - Can be combined with --branch for feature branch builds"
            echo ""
            echo "  AUTO-VERSIONING:"
            echo "    - Dev builds: Creates v0.7.1-dev.N tags (increments build number)"
            echo "    - Stable builds: Creates v0.X.Y tags (increments version)"
            echo "    - Version file: .docker-version tracks current version"
            echo "    - Use --version-type to control increment (major/minor/patch)"
            echo "    - Use --sync-version to reset to package.json version"
            echo "    - Automatically updates package.json files to keep versions synced"
            echo ""
            echo "  EXAMPLES:"
            echo "    bash $0                        # Build dev image with cache and auto-versioning"
            echo "    bash $0 dev                    # Same as above (shorthand)"
            echo "    bash $0 latest                 # Build latest image with auto-versioning"
            echo "    bash $0 --stable               # Build stable release from current code"
            echo "    bash $0 --stable --tag v2.1.0  # Build and tag as specific version"
            echo "    bash $0 --stable --version-type minor  # Increment minor version"
            echo "    bash $0 --no-cache             # Force fresh build without cache"
            echo "    bash $0 --sync-version         # Reset to package.json version"
            echo "    bash $0 --security-scan        # Build with security vulnerability scanning"
            echo "    bash $0 --branch feature/foo   # Build from specific feature branch"
            echo "    bash $0 --all                  # Build both main app and Discord broker"
            echo "    bash $0 --dry-run --stable     # Preview what a stable build would do"
            echo "    bash $0 --status               # Show current build status and images"
            exit 0
            ;;
        *)
            if [[ ! "$1" =~ ^- ]]; then
                TAG="$1"
                echo "Using positional argument as tag: $TAG"
                shift
            else
                echo "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
            fi
            ;;
    esac
done

# Resolve discord-broker flags after full parse (order-independent)
if [ "$BUILD_DISCORD_BROKER" = true ] && [ "$BUILD_ALL" = false ]; then
    IMAGE_NAME="$DISCORD_IMAGE_NAME"
    TAG="$DISCORD_TAG"
fi

# Get the script directory to ensure we're in the right place
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGINAL_DIR="$SCRIPT_DIR"

# Determine the git branch for pull operations
GIT_BRANCH="${WORKTREE_BRANCH:-master}"

# --- Utility functions ---

format_duration() {
    local total_seconds=$1
    local minutes=$((total_seconds / 60))
    local seconds=$((total_seconds % 60))
    if [ $minutes -gt 0 ]; then
        echo "${minutes}m ${seconds}s"
    else
        echo "${seconds}s"
    fi
}

format_bytes() {
    local bytes=$1
    if command -v numfmt >/dev/null 2>&1; then
        numfmt --to=iec "$bytes" 2>/dev/null && return
    fi
    # Fallback: pure bash
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$((bytes / 1073741824)).$((bytes % 1073741824 * 10 / 1073741824)) GiB"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$((bytes / 1048576)).$((bytes % 1048576 * 10 / 1048576)) MiB"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$((bytes / 1024)) KiB"
    else
        echo "${bytes} B"
    fi
}

sed_inplace() {
    local expression="$1"
    local file="$2"
    sed -i.bak "$expression" "$file" && rm -f "${file}.bak"
}

sanitize_branch_path() {
    echo "$1" | tr '/' '--'
}

# Background spinner for non-verbose builds
start_spinner() {
    if [ "$VERBOSE" = true ] || [ "$DRY_RUN" = true ]; then
        return
    fi
    (
        local spin_chars='|/-\'
        local i=0
        while true; do
            local elapsed=$((SECONDS - BUILD_START_SECONDS))
            local formatted
            formatted=$(format_duration $elapsed)
            printf "\r   Building... %s (%s)  " "${spin_chars:i++%4:1}" "$formatted" >&2
            sleep 1
        done
    ) &
    SPINNER_PID=$!
}

stop_spinner() {
    if [ -n "${SPINNER_PID}" ]; then
        kill "$SPINNER_PID" 2>/dev/null || true
        wait "$SPINNER_PID" 2>/dev/null || true
        printf "\r                                                \r" >&2
        SPINNER_PID=""
    fi
}

# --- Handle early-exit flags (after full argument parsing) ---

if [ "$PULL_ONLY" = true ]; then
    echo "Pulling latest from remote ($GIT_BRANCH)..."
    git pull origin "$GIT_BRANCH"
    echo "Pull complete"
    exit 0
fi

if [ "$CLEANUP_ONLY" = true ]; then
    echo "Cleaning up dangling images..."
    OUTPUT=$(docker image prune -f 2>&1)
    echo "$OUTPUT"
    RECLAIMED=$(echo "$OUTPUT" | grep -oP 'reclaimed\s+\K.*' 2>/dev/null || true)
    if [ -n "$RECLAIMED" ]; then
        echo "Space reclaimed: $RECLAIMED"
    fi
    echo "Cleanup complete"
    exit 0
fi

if [ "$SHOW_STATUS" = true ]; then
    echo "BUILD STATUS"
    echo "============"
    echo ""

    # Version info
    if [ -f "$VERSION_FILE" ]; then
        . "$VERSION_FILE"
        echo "Current version: v${VERSION:-unknown}"
        echo "Last build:      ${LAST_BUILD:-unknown}"
        echo "Build number:    #${BUILD_NUMBER:-0}"
    else
        echo "No version file found ($VERSION_FILE)"
    fi

    # Git info
    echo ""
    echo "Git branch:      $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "Git commit:      $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    local_changes=$(git status --porcelain 2>/dev/null | wc -l)
    echo "Uncommitted:     ${local_changes} file(s)"

    # Docker images
    echo ""
    echo "DOCKER IMAGES"
    echo "-------------"
    if docker info >/dev/null 2>&1; then
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" \
            --filter "reference=${IMAGE_NAME}" \
            --filter "reference=${DISCORD_IMAGE_NAME}" 2>/dev/null || echo "No images found"

        # Disk usage
        echo ""
        echo "Docker disk usage:"
        docker system df 2>/dev/null | head -5
    else
        echo "Docker is not running"
    fi

    # Worktrees
    local_worktrees=$(git worktree list 2>/dev/null | tail -n +2)
    if [ -n "$local_worktrees" ]; then
        echo ""
        echo "ACTIVE WORKTREES"
        echo "----------------"
        echo "$local_worktrees"
    fi

    exit 0
fi

# --- Pre-flight checks ---

preflight_check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo "ERROR: Docker is not running or not accessible."
        echo "Start Docker Desktop or the Docker daemon before building."
        exit 1
    fi
}

preflight_check_disk_space() {
    local required_mb=2048
    local available_mb

    # Try to get available space on the Docker root directory
    # df output varies, grab the available column from the mount containing pwd
    available_mb=$(df -m . 2>/dev/null | awk 'NR==2 {print $4}')

    if [ -n "$available_mb" ] && [ "$available_mb" -lt "$required_mb" ] 2>/dev/null; then
        echo "ERROR: Insufficient disk space."
        echo "   Available: ${available_mb} MB"
        echo "   Required:  ~${required_mb} MB"
        echo "   Free up space or run: bash $0 --cleanup"
        exit 1
    fi
}

preflight_check_dirty_tree() {
    if [ "$BUILD_STABLE" = true ]; then
        return
    fi
    local dirty
    dirty=$(git status --porcelain 2>/dev/null || true)
    if [ -n "$dirty" ]; then
        echo "WARNING: Working tree has uncommitted changes."
        echo "   These changes will be included in the build but NOT in the git pull."
        echo "   Consider committing or stashing before building."
        echo ""
    fi
}

preflight_check_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid
        lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
        if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
            echo "ERROR: Another build is already running (PID $lock_pid)."
            echo "   If this is stale, remove $LOCK_FILE"
            exit 1
        else
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
}

remove_lock() {
    rm -f "$LOCK_FILE"
}

# --- Worktree functions ---

setup_worktree() {
    local branch="$1"
    local current_branch
    current_branch=$(git branch --show-current)

    if [ "$branch" = "$current_branch" ]; then
        echo "Building from current branch ($current_branch), no worktree needed"
        BUILD_PATH="$ORIGINAL_DIR"
        return 0
    fi

    local sanitized
    sanitized=$(sanitize_branch_path "$branch")
    local worktree_dir="../worktrees"
    local worktree_path="$worktree_dir/$sanitized"

    echo "Setting up worktree for branch: $branch"
    mkdir -p "$worktree_dir"

    if [ -d "$worktree_path" ]; then
        echo "Worktree already exists at $worktree_path"
        if git worktree list | grep -q "$worktree_path"; then
            echo "Updating worktree with latest changes..."
            (
                cd "$worktree_path"
                git fetch origin
                if ! git merge --ff-only "origin/$branch"; then
                    echo "ERROR: Worktree has diverged from origin/$branch"
                    echo "Resolve manually: cd $worktree_path && git status"
                    exit 1
                fi
                echo "Worktree updated to latest $branch"
            )
        else
            echo "Cleaning up invalid worktree directory"
            rm -rf "$worktree_path"
            create_new_worktree "$branch" "$worktree_path"
        fi
    else
        create_new_worktree "$branch" "$worktree_path"
    fi

    BUILD_PATH="$worktree_path"
    echo "Build will use worktree at: $BUILD_PATH"
}

create_new_worktree() {
    local branch="$1"
    local path="$2"

    echo "Creating new worktree for $branch at $path"
    echo "Fetching latest from remote..."
    git fetch origin || echo "Warning: Could not fetch from remote"

    if git worktree add "$path" "origin/$branch"; then
        echo "Worktree created successfully"
    elif git worktree add "$path" "$branch"; then
        echo "Worktree created from local branch"
    else
        echo "ERROR: Failed to create worktree for branch: $branch"
        echo "Available branches:"
        git branch -a | head -10
        exit 1
    fi
}

cleanup_worktree() {
    if [ -n "$WORKTREE_BRANCH" ] && [ -n "$BUILD_PATH" ] && [ "$BUILD_PATH" != "$ORIGINAL_DIR" ]; then
        cd "$ORIGINAL_DIR"
        echo "Worktree preserved at $BUILD_PATH for future builds"
    fi
}

# --- Version file backup/restore ---

BACKUP_TARGETS=(
    "$VERSION_FILE"
    "package.json"
    "frontend/package.json"
    "backend/package.json"
    "app-metadata.yaml"
)

create_version_backups() {
    BACKUP_FILES_CREATED=true
    for file in "${BACKUP_TARGETS[@]}"; do
        cp "$file" "${file}.backup" 2>/dev/null || true
    done
}

remove_version_backups() {
    for file in "${BACKUP_TARGETS[@]}"; do
        rm -f "${file}.backup"
    done
    BACKUP_FILES_CREATED=false
}

restore_version_backups() {
    if [ "$BACKUP_FILES_CREATED" != true ]; then
        return
    fi
    echo "Restoring version files from backup..."
    for file in "${BACKUP_TARGETS[@]}"; do
        if [ -f "${file}.backup" ]; then
            mv "${file}.backup" "$file"
            echo "  Restored $file"
        fi
    done
    BACKUP_FILES_CREATED=false
}

# Signal handler: stop spinner, restore backups, clean up worktree and lock
handle_exit() {
    local exit_code=$?
    stop_spinner
    if [ $exit_code -ne 0 ] && [ "$BACKUP_FILES_CREATED" = true ]; then
        restore_version_backups
    fi
    cleanup_worktree
    remove_lock
}

trap handle_exit EXIT

# --- Run pre-flight checks ---

preflight_check_docker
preflight_check_disk_space
preflight_check_dirty_tree
preflight_check_lock

# --- Handle worktree setup ---

if [ -n "$WORKTREE_BRANCH" ]; then
    setup_worktree "$WORKTREE_BRANCH"
    cd "$BUILD_PATH"
else
    BUILD_PATH="$SCRIPT_DIR"
    cd "$BUILD_PATH"
fi

# --- Version functions ---

sync_version_from_package() {
    if [ -f "package.json" ]; then
        local pkg_version
        pkg_version=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        if [ -n "$pkg_version" ]; then
            echo "$pkg_version"
            return
        fi
    fi
    echo "0.1.0"
}

increment_version() {
    local version=$1
    local increment_type=$2

    local major minor patch
    major=$(echo "$version" | cut -d'.' -f1)
    minor=$(echo "$version" | cut -d'.' -f2)
    patch=$(echo "$version" | cut -d'.' -f3)

    major=${major:-0}
    minor=${minor:-0}
    patch=${patch:-0}

    case $increment_type in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
        *)
            echo "Invalid version increment type: $increment_type" >&2
            return 1
            ;;
    esac

    echo "${major}.${minor}.${patch}"
}

update_version_file() {
    local new_version=$1
    local new_build_number=$2
    local timestamp
    timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

    cat > "$VERSION_FILE" << EOF
# Docker Image Version Tracking
# This file is used by build_image.sh to track and auto-increment version numbers
# Format: MAJOR.MINOR.PATCH

# Current version
VERSION=$new_version

# Last build timestamp
LAST_BUILD=$timestamp

# Build counter (incremented with each build)
BUILD_NUMBER=$new_build_number
EOF

    echo "Updated version file: v$new_version (build #$new_build_number)"
}

update_truenas_metadata() {
    local new_version=$1
    local metadata_file="app-metadata.yaml"

    if [ -f "$metadata_file" ]; then
        echo "Updating local app-metadata.yaml reference..."
        sed_inplace "s/version: \"[^\"]*\"/version: \"$new_version\"/g" "$metadata_file"
        sed_inplace "s/app_version: \"[^\"]*\"/app_version: \"$new_version\"/g" "$metadata_file"
        echo "Updated $metadata_file to v$new_version"
    fi
}

update_package_json_files() {
    local new_version=$1
    local updated_count=0

    for file in "package.json" "frontend/package.json" "backend/package.json"; do
        if [ -f "$file" ]; then
            if sed_inplace "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/g" "$file"; then
                updated_count=$((updated_count + 1))
                echo "Updated $file to v$new_version"
            else
                echo "Warning: Failed to update $file"
            fi
        else
            echo "Warning: $file not found"
        fi
    done

    if [ $updated_count -gt 0 ]; then
        echo "Updated $updated_count package.json file(s) to v$new_version"
    fi
}

get_git_commit() {
    git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

get_timestamp() {
    date +"%Y%m%d-%H%M%S"
}

archive_latest_image() {
    echo "Checking for existing ${IMAGE_NAME}:latest image..."
    if docker image inspect "${IMAGE_NAME}:latest" >/dev/null 2>&1; then
        local timestamp commit archive_tag
        timestamp=$(get_timestamp)
        commit=$(get_git_commit)
        archive_tag="stable-${timestamp}-${commit}"

        echo "Archiving current latest image as ${IMAGE_NAME}:${archive_tag}"
        if docker tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${archive_tag}"; then
            echo "Previous latest image archived as: ${IMAGE_NAME}:${archive_tag}"
        else
            echo "Warning: Failed to archive previous latest image"
        fi
    else
        echo "No existing ${IMAGE_NAME}:latest image found to archive"
    fi
}

# --- Core build function ---
# Returns 0 on success, 1 on failure. Does NOT use set -e internally
# so that the caller's || pattern works correctly.

run_build() {
    local build_image_name="$1"
    local build_tag="$2"
    local build_dockerfile="$3"
    local build_context="$4"
    local build_version_tag="${5:-}"
    local build_additional_tag="${6:-}"
    local build_new_version="${7:-}"
    local build_new_build_number="${8:-}"

    echo ""
    echo "Building ${build_image_name}:${build_tag}"
    if [ -n "$build_version_tag" ]; then
        echo "   Version: ${build_version_tag}"
    fi
    if [ -n "$WORKTREE_BRANCH" ]; then
        echo "   Branch: $WORKTREE_BRANCH"
    fi

    # Verify Dockerfile exists
    if [ ! -f "$build_dockerfile" ]; then
        echo "ERROR: Dockerfile not found: $build_dockerfile"
        return 1
    fi

    # Build the docker command as an array (safe from word-splitting / injection)
    local BUILD_ARGS=()
    BUILD_ARGS+=(docker build)

    if [ "$USE_CACHE" = false ]; then
        BUILD_ARGS+=(--no-cache)
        echo "   Building without cache (fresh build)"
    else
        echo "   Building with cache (source file changes detected automatically)"
    fi

    BUILD_ARGS+=(--build-arg "BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')")
    BUILD_ARGS+=(--build-arg "GIT_COMMIT=$(get_git_commit)")
    BUILD_ARGS+=(--build-arg "BUILD_TYPE=$([ "$BUILD_STABLE" = true ] && echo "stable" || echo "dev")")
    BUILD_ARGS+=(--build-arg "NODE_ENV=production")
    BUILD_ARGS+=(--build-arg "OPTIMIZE_BUILD=$([ "$OPTIMIZE_BUILD" = true ] && echo "true" || echo "false")")

    local app_version_arg="${build_new_version:-${VERSION:-0.0.0}}"
    BUILD_ARGS+=(--build-arg "APP_VERSION=${app_version_arg}")
    if [ -n "$build_version_tag" ]; then
        BUILD_ARGS+=(--build-arg "VERSION=${build_version_tag}")
    fi

    if [ "$OPTIMIZE_BUILD" = true ]; then
        BUILD_ARGS+=(--build-arg "NPM_CONFIG_PRODUCTION=true")
        BUILD_ARGS+=(--build-arg "NODE_OPTIONS=--max-old-space-size=4096")
    fi

    BUILD_ARGS+=(-f "$build_dockerfile" -t "${build_image_name}:${build_tag}" "$build_context")

    # Dry run: show command and return
    if [ "$DRY_RUN" = true ]; then
        echo ""
        echo "[DRY RUN] Would execute:"
        echo "   ${BUILD_ARGS[*]}"
        if [ -n "$build_additional_tag" ]; then
            echo "   docker tag ${build_image_name}:${build_tag} ${build_additional_tag}"
        fi
        if [ "$BUILD_STABLE" = true ]; then
            echo "   docker tag ${build_image_name}:${build_tag} ${build_image_name}:dev"
        fi
        return 0
    fi

    # Execute the build
    local build_phase_start=$SECONDS
    local BUILD_EXIT_CODE=0

    if [ "$VERBOSE" = true ]; then
        "${BUILD_ARGS[@]}" || BUILD_EXIT_CODE=$?
    else
        local BUILD_LOG
        BUILD_LOG=$(mktemp)
        start_spinner
        "${BUILD_ARGS[@]}" > "$BUILD_LOG" 2>&1 || BUILD_EXIT_CODE=$?
        stop_spinner

        if [ $BUILD_EXIT_CODE -ne 0 ]; then
            echo ""
            echo "BUILD FAILED! Showing build output:"
            echo "===================================="
            cat "$BUILD_LOG"
            echo "===================================="
        fi
        rm -f "$BUILD_LOG"
    fi

    local build_duration=$((SECONDS - build_phase_start))

    # Run security scan if enabled and build succeeded
    if [ $BUILD_EXIT_CODE -eq 0 ] && [ "$ENABLE_SECURITY_SCAN" = true ]; then
        echo ""
        echo "Running security vulnerability scan..."
        if command -v docker-scout >/dev/null 2>&1; then
            docker scout quickview "${build_image_name}:${build_tag}" || echo "Security scan completed with findings"
        elif command -v trivy >/dev/null 2>&1; then
            trivy image "${build_image_name}:${build_tag}" || echo "Security scan completed with findings"
        else
            echo "No security scanner found. Install 'docker scout' or 'trivy' for vulnerability scanning."
        fi
    fi

    if [ $BUILD_EXIT_CODE -ne 0 ]; then
        echo ""
        echo "BUILD FAILED: ${build_image_name}:${build_tag} (after $(format_duration $build_duration))"
        echo "=============="
        echo ""
        echo "Check the output above for error details"
        echo "Common issues:"
        echo "  - Insufficient disk space (need ~2GB free)"
        echo "  - Dockerfile syntax errors"
        echo "  - Missing dependencies in Dockerfile"
        echo "  - Network issues downloading base images"
        echo "  - BuildKit not available (try --no-buildkit)"
        return 1
    fi

    # Tag with additional version tag
    if [ -n "$build_additional_tag" ]; then
        echo "Adding version tag: ${build_additional_tag}"
        if docker tag "${build_image_name}:${build_tag}" "${build_additional_tag}"; then
            echo "Successfully tagged as ${build_additional_tag}"
        else
            echo "Warning: Failed to add version tag"
        fi
    fi

    # For stable builds, update the dev image to match the new version
    if [ "$BUILD_STABLE" = true ]; then
        echo "Updating dev image to match stable version..."
        if docker tag "${build_image_name}:${build_tag}" "${build_image_name}:dev"; then
            echo "Successfully updated ${build_image_name}:dev to v${build_new_version:-$build_tag}"
        else
            echo "Warning: Failed to update dev tag (dev image may be on an older version)"
        fi
    fi

    # Verify the image was created
    if docker image inspect "${build_image_name}:${build_tag}" >/dev/null 2>&1; then
        echo ""
        echo "BUILD COMPLETED: ${build_image_name}:${build_tag} ($(format_duration $build_duration))"
        echo "================================"
        echo "Image created: ${build_image_name}:${build_tag}"
        if [ -n "$build_additional_tag" ]; then
            echo "Version tagged: ${build_additional_tag}"
        fi
        echo "Build type: $([ "$BUILD_STABLE" = true ] && echo "STABLE/PRODUCTION" || echo "DEV/UNSTABLE")"
        if [ -n "$build_version_tag" ]; then
            echo "Version: ${build_version_tag}"
            echo "Build number: #${build_new_build_number}"
        fi
        echo "Git commit: $(get_git_commit)"
        echo ""
        local IMAGE_SIZE
        IMAGE_SIZE=$(docker image inspect "${build_image_name}:${build_tag}" --format='{{.Size}}' 2>/dev/null || true)
        if [ -n "$IMAGE_SIZE" ]; then
            echo "IMAGE INFORMATION:"
            echo "   Image size: $(format_bytes "$IMAGE_SIZE")"
        fi
    else
        echo ""
        echo "BUILD WARNING: Image built but not properly tagged"
        echo "Attempting to find and tag the latest untagged image..."

        local LATEST_UNTAGGED
        LATEST_UNTAGGED=$(docker images --filter "dangling=true" --format "{{.ID}}" | head -n1)
        if [ -n "$LATEST_UNTAGGED" ]; then
            echo "Found untagged image: $LATEST_UNTAGGED"
            if docker tag "$LATEST_UNTAGGED" "${build_image_name}:${build_tag}"; then
                echo "Successfully tagged image as ${build_image_name}:${build_tag}"
            else
                echo "ERROR: Failed to tag image"
                return 1
            fi
        else
            echo "ERROR: No untagged images found. Build may have failed."
            return 1
        fi
    fi

    return 0
}

# --- Handle auto-versioning ---

if [ "$AUTO_VERSION" = true ]; then
    if [ "$SYNC_PACKAGE_VERSION" = true ]; then
        VERSION=$(sync_version_from_package)
        BUILD_NUMBER=0
        echo "Syncing version with package.json: v${VERSION}"
    elif [ -f "$VERSION_FILE" ]; then
        . "$VERSION_FILE"
    else
        VERSION="0.1.0"
        BUILD_NUMBER=0
    fi

    if [ "$BUILD_STABLE" = true ]; then
        NEW_VERSION=$(increment_version "$VERSION" "$VERSION_TYPE")
        NEW_BUILD_NUMBER=0
        VERSION_TAG="v${NEW_VERSION}"
        if [ "$TAG" = "latest" ]; then
            ADDITIONAL_TAG="${IMAGE_NAME}:${VERSION_TAG}"
        fi
    else
        NEW_VERSION="$VERSION"
        NEW_BUILD_NUMBER=$((BUILD_NUMBER + 1))
        VERSION_TAG="v${VERSION}-dev.${NEW_BUILD_NUMBER}"
        TAG="dev"
        ADDITIONAL_TAG="${IMAGE_NAME}:${VERSION_TAG}"
    fi
else
    NEW_VERSION=""
    NEW_BUILD_NUMBER=""
    VERSION_TAG=""
    ADDITIONAL_TAG=""
fi

# Handle git operations
if [ "$BUILD_STABLE" = true ]; then
    if [ "$TAG" = "latest" ]; then
        archive_latest_image
    fi
elif [ -z "$WORKTREE_BRANCH" ]; then
    echo "Pulling latest from $GIT_BRANCH..."
    if ! git pull origin "$GIT_BRANCH" 2>&1; then
        echo "ERROR: git pull failed. Check your network connection and branch status."
        echo "You can skip the pull with --branch $(git branch --show-current)"
        exit 1
    fi
fi

# Enable Docker BuildKit
if [ "$USE_BUILDKIT" = true ]; then
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
fi

# Update version files BEFORE build so they're included in the Docker image
if [ "$AUTO_VERSION" = true ] && [ -n "$NEW_VERSION" ]; then
    if [ "$BUILD_PATH" = "$ORIGINAL_DIR" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo ""
            echo "[DRY RUN] Would update version files to v$NEW_VERSION"
            echo "   .docker-version, package.json, frontend/package.json, backend/package.json, app-metadata.yaml"
        else
            echo "Updating version files before build..."
            create_version_backups
            update_version_file "$NEW_VERSION" "$NEW_BUILD_NUMBER"
            update_package_json_files "$NEW_VERSION"
            update_truenas_metadata "$NEW_VERSION"
        fi
    else
        echo "Skipping version file updates (building from worktree)"
    fi
fi

# --- Execute builds ---

BUILD_FAILED=false

if [ "$BUILD_ALL" = true ]; then
    echo ""
    echo "==============================="
    echo "Building all images"
    echo "==============================="

    echo ""
    echo "--- Main Application ---"
    if ! run_build "$IMAGE_NAME" "$TAG" "docker/Dockerfile.backend" "." \
        "${VERSION_TAG:-}" "${ADDITIONAL_TAG:-}" "${NEW_VERSION:-}" "${NEW_BUILD_NUMBER:-}"; then
        BUILD_FAILED=true
        echo "Main app build failed, skipping Discord broker build"
    else
        echo ""
        echo "--- Discord Broker ---"
        if ! run_build "$DISCORD_IMAGE_NAME" "$DISCORD_TAG" "discord-handler/Dockerfile" "./discord-handler" \
            "" "" "" ""; then
            BUILD_FAILED=true
        fi
    fi
elif [ "$BUILD_DISCORD_BROKER" = true ]; then
    run_build "$DISCORD_IMAGE_NAME" "$DISCORD_TAG" "discord-handler/Dockerfile" "./discord-handler" \
        "" "" "" "" || BUILD_FAILED=true
else
    run_build "$IMAGE_NAME" "$TAG" "docker/Dockerfile.backend" "." \
        "${VERSION_TAG:-}" "${ADDITIONAL_TAG:-}" "${NEW_VERSION:-}" "${NEW_BUILD_NUMBER:-}" || BUILD_FAILED=true
fi

if [ "$BUILD_FAILED" = true ]; then
    # EXIT trap handles backup restoration
    exit 1
fi

# Build succeeded - clean up backups and commit version changes
if [ "$AUTO_VERSION" = true ] && [ -n "$NEW_VERSION" ] && [ "$BUILD_PATH" = "$ORIGINAL_DIR" ] && [ "$DRY_RUN" = false ]; then
    remove_version_backups

    echo ""
    echo "Committing version updates to repository..."
    git add .docker-version package.json frontend/package.json backend/package.json app-metadata.yaml 2>/dev/null || true
    if git commit -m "build: Auto-increment version to v$NEW_VERSION

Generated by build_image.sh auto-versioning"; then
        echo "Version changes committed locally"
        if git push origin "$GIT_BRANCH" 2>/dev/null; then
            echo "Version changes pushed to remote repository"
        else
            echo "Warning: Could not push changes (likely no credentials configured)"
            echo "   Run 'git push origin $GIT_BRANCH' manually or configure git credentials"
        fi
    else
        echo "No version changes to commit"
    fi
fi

# Final summary
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "[DRY RUN] No changes were made."
else
    total_duration=$((SECONDS - BUILD_START_SECONDS))
    echo ""
    echo "Total build time: $(format_duration $total_duration)"
fi
