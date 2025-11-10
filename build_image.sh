#!/usr/bin/env bash

# Optimized Docker Image Build Script
# Builds production-optimized single container with frontend + backend
# 
# IMPORTANT: This script requires bash, not sh!
# Usage: bash ./build_image.sh [--stable] [--keep-cache] [--optimize]
#        NOT: sh ./build_image.sh (this will fail)

set -e

# Check if running with bash (not sh)
if [ -z "$BASH_VERSION" ]; then
    echo "❌ ERROR: This script requires bash, not sh!"
    echo ""
    echo "You ran: sh $0"
    echo "Instead run: bash $0"
    echo ""
    echo "Or make the script executable and run directly: ./$0"
    exit 1
fi

# Default settings (builds unstable/dev image)
BUILD_STABLE=false
USE_CACHE=false  # Default: no-cache for dev builds
OPTIMIZE_BUILD=true  # Always optimize by default
IMAGE_NAME="pathfinder-loot"
TAG="dev"  # Default to dev/unstable tag
AUTO_VERSION=true  # Auto-increment version numbers
VERSION_TYPE="patch"  # Default version increment type (major, minor, patch)
SYNC_PACKAGE_VERSION=false  # Sync version with package.json
GIT_BRANCH=""  # Branch to pull from (auto-detected if empty)

# Production optimization settings
USE_BUILDKIT=true
ENABLE_SECURITY_SCAN=false

# Version file location
VERSION_FILE=".docker-version"

# Parse command line arguments
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
            TAG="$2"
            AUTO_VERSION=false  # Disable auto-versioning when tag is manually specified
            shift 2
            ;;
        --no-version)
            AUTO_VERSION=false
            shift
            ;;
        --version-type)
            VERSION_TYPE="$2"
            shift 2
            ;;
        --sync-version)
            SYNC_PACKAGE_VERSION=true
            shift
            ;;
        --branch)
            GIT_BRANCH="$2"
            shift 2
            ;;
        --cleanup)
            echo "🧹 Cleaning up dangling images..."
            docker image prune -f
            echo "✅ Cleanup complete"
            exit 0
            ;;
        -h|--help)
            echo "Usage: bash $0 [--stable] [--keep-cache] [--tag TAG]"
            echo ""
            echo "  NOTE: This script requires bash, not sh. Run with: bash $0"
            echo ""
            echo "  DEFAULT BEHAVIOR (dev/unstable build):"
            echo "    - Builds ${IMAGE_NAME}:dev"
            echo "    - Always pulls latest code from git"
            echo "    - Always builds with --no-cache"
            echo ""
            echo "  OPTIONS:"
            echo "    --stable          Build stable/latest image (${IMAGE_NAME}:latest)"
            echo "                      - Does NOT pull from git (uses current local code)"
            echo "                      - Builds with --no-cache"
            echo "                      - Archives previous 'latest' to versioned image"
            echo "    --keep-cache      Use Docker build cache (default: no-cache)"
            echo "    --no-optimize     Disable production optimizations"
            echo "    --security-scan   Enable container security scanning"
            echo "    --no-buildkit     Disable Docker BuildKit (use legacy builder)"
            echo "    --tag TAG         Override default tag (disables auto-versioning)"
            echo "    --no-version      Disable automatic version incrementing"
            echo "    --version-type    Type of version increment: major, minor, patch (default: patch)"
            echo "    --sync-version    Sync version with package.json (resets to app version)"
            echo "    --branch BRANCH   Specify git branch to pull (auto-detects current branch if not specified)"
            echo "    --cleanup         Remove all dangling images and exit"
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
            echo "    bash $0                        # Build optimized dev image with latest git code"
            echo "    bash $0 dev                    # Build dev image with auto-versioning (shorthand)"
            echo "    bash $0 latest                 # Build latest image with auto-versioning"
            echo "    bash $0 --stable               # Build optimized stable release from current code"
            echo "    bash $0 --stable --tag v2.1.0  # Build and tag as specific version"
            echo "    bash $0 --stable --version-type minor  # Increment minor version"
            echo "    bash $0 --stable --version-type major  # Increment major version"
            echo "    bash $0 --sync-version         # Reset to package.json version (v0.7.1)"
            echo "    bash $0 --no-version           # Build without auto-versioning"
            echo "    bash $0 --security-scan        # Build with security vulnerability scanning"
            echo "    bash $0 --branch feature/discord-attendance  # Build from specific feature branch"
            exit 0
            ;;
        *)
            # Check if it's a positional argument (doesn't start with -)
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

# Get the script directory to ensure we're in the right place
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Default to master branch if not specified
if [ -z "$GIT_BRANCH" ]; then
    GIT_BRANCH="master"
fi

# Function to read current version from file
read_version() {
    if [ -f "$VERSION_FILE" ]; then
        . "$VERSION_FILE"
        echo "$VERSION"
    else
        echo "0.1.0"
    fi
}

# Function to sync version from package.json
sync_version_from_package() {
    if [ -f "package.json" ]; then
        local pkg_version=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        if [ -n "$pkg_version" ]; then
            echo "$pkg_version"
        else
            echo "0.1.0"
        fi
    else
        echo "0.1.0"
    fi
}

# Function to increment version
increment_version() {
    local version=$1
    local increment_type=$2
    
    # Split version into parts using POSIX-compatible method
    local major=$(echo "$version" | cut -d'.' -f1)
    local minor=$(echo "$version" | cut -d'.' -f2)
    local patch=$(echo "$version" | cut -d'.' -f3)
    
    # Set defaults if empty
    major=${major:-0}
    minor=${minor:-0}
    patch=${patch:-0}
    
    case $increment_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo "Invalid version increment type: $increment_type" >&2
            return 1
            ;;
    esac
    
    echo "${major}.${minor}.${patch}"
}

# Function to update version file
update_version_file() {
    local new_version=$1
    local new_build_number=$2
    local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    
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

# Function to update package.json files with new version
update_package_json_files() {
    local new_version=$1
    local updated_count=0
    
    # Update each package.json file individually (POSIX-compatible)
    for file in "package.json" "frontend/package.json" "backend/package.json"; do
        if [ -f "$file" ]; then
            # Use sed to update the version field
            if sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/g" "$file"; then
                # Remove backup file
                rm -f "$file.bak"
                updated_count=$((updated_count + 1))
                echo "✅ Updated $file to v$new_version"
            else
                echo "⚠️  Warning: Failed to update $file"
            fi
        else
            echo "⚠️  Warning: $file not found"
        fi
    done
    
    if [ $updated_count -gt 0 ]; then
        echo "📦 Updated $updated_count package.json file(s) to v$new_version"
    fi
}

# Function to get current git commit hash for versioning
get_git_commit() {
    git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

# Function to get current git branch
get_current_branch() {
    git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# Function to get current timestamp for versioning
get_timestamp() {
    date +"%Y%m%d-%H%M%S"
}

# Function to archive existing latest image
archive_latest_image() {
    echo "Checking for existing ${IMAGE_NAME}:latest image..."
    if docker image inspect "${IMAGE_NAME}:latest" >/dev/null 2>&1; then
        local timestamp=$(get_timestamp)
        local commit=$(get_git_commit)
        local archive_tag="stable-${timestamp}-${commit}"
        
        echo "Archiving current latest image as ${IMAGE_NAME}:${archive_tag}"
        docker tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${archive_tag}"
        
        if [ $? -eq 0 ]; then
            echo "✅ Previous latest image archived as: ${IMAGE_NAME}:${archive_tag}"
        else
            echo "⚠️  Warning: Failed to archive previous latest image"
        fi
    else
        echo "No existing ${IMAGE_NAME}:latest image found to archive"
    fi
}

# Handle auto-versioning
if [ "$AUTO_VERSION" = true ]; then
    # Check if we should sync with package.json
    if [ "$SYNC_PACKAGE_VERSION" = true ]; then
        VERSION=$(sync_version_from_package)
        BUILD_NUMBER=0
        echo "📦 Syncing version with package.json: v${VERSION}"
    elif [ -f "$VERSION_FILE" ]; then
        # Read current version and build number from version file
        . "$VERSION_FILE"
    else
        # Default version for new projects
        VERSION="0.1.0"
        BUILD_NUMBER=0
    fi
    
    # Increment version for stable builds, build number for dev builds
    if [ "$BUILD_STABLE" = true ]; then
        NEW_VERSION=$(increment_version "$VERSION" "$VERSION_TYPE")
        NEW_BUILD_NUMBER=$((BUILD_NUMBER + 1))
        VERSION_TAG="v${NEW_VERSION}"
        
        # Update the tag to include version
        if [ "$TAG" = "latest" ]; then
            # We'll tag with both 'latest' and version number
            ADDITIONAL_TAG="${IMAGE_NAME}:${VERSION_TAG}"
        fi
    else
        # For dev builds, just increment build number
        NEW_VERSION="$VERSION"
        NEW_BUILD_NUMBER=$((BUILD_NUMBER + 1))
        VERSION_TAG="v${VERSION}-dev.${NEW_BUILD_NUMBER}"
        TAG="dev"
        ADDITIONAL_TAG="${IMAGE_NAME}:${VERSION_TAG}"
    fi
else
    # No auto-versioning
    NEW_VERSION=""
    NEW_BUILD_NUMBER=""
    VERSION_TAG=""
    ADDITIONAL_TAG=""
fi

echo "===========================================" 
if [ "$BUILD_STABLE" = true ]; then
    echo "🏗️  BUILDING STABLE/LATEST IMAGE"
    echo "Target: ${IMAGE_NAME}:${TAG}"
    if [ -n "$VERSION_TAG" ]; then
        echo "Version: ${VERSION_TAG}"
    fi
    echo "Git pull: DISABLED (using current local code)"
    echo "Cache: $([ "$USE_CACHE" = true ] && echo "ENABLED" || echo "DISABLED")"
else
    echo "🚧 BUILDING DEV/UNSTABLE IMAGE"
    echo "Target: ${IMAGE_NAME}:${TAG}"
    if [ -n "$VERSION_TAG" ]; then
        echo "Version: ${VERSION_TAG}"
    fi
    echo "Git pull: ENABLED (fetching latest code)"
    echo "Cache: DISABLED (always fresh build)"
fi
echo "Working directory: $(pwd)"
echo "==========================================="

# Handle git operations based on build type
if [ "$BUILD_STABLE" = true ]; then
    echo "Building stable image - using current local code (no git pull)"
    echo "Current commit: $(get_git_commit)"
    
    # Archive existing latest image if building latest tag
    if [ "$TAG" = "latest" ]; then
        archive_latest_image
    fi
else
    echo "Building dev image - pulling latest code from GitHub (branch: $GIT_BRANCH)..."
    git pull origin $GIT_BRANCH || {
        echo "⚠️  Warning: Git pull failed. Continuing with current local code."
        echo "Make sure you're in the correct git repository and have proper permissions."
    }
    echo "Updated to commit: $(get_git_commit)"
fi

# Enable Docker BuildKit for better performance and features
if [ "$USE_BUILDKIT" = true ]; then
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    echo "🚀 Using Docker BuildKit for optimized builds"
fi

# Prepare production package files if optimizing
if [ "$OPTIMIZE_BUILD" = true ]; then
    echo "📦 Preparing production-optimized build..."
    
    # Verify production package files exist
    if [ ! -f "frontend/package.prod.json" ]; then
        echo "⚠️  Warning: frontend/package.prod.json not found. Using regular package.json"
    fi
    
    if [ ! -f "backend/package.prod.json" ]; then
        echo "⚠️  Warning: backend/package.prod.json not found. Using regular package.json"
    fi
fi

# Prepare build command
BUILD_CMD="docker build"

# Add cache settings
if [ "$USE_CACHE" = false ]; then
    BUILD_CMD="$BUILD_CMD --no-cache"
    echo "🚫 Building without cache (fresh build)"
else
    echo "♻️  Building with cache enabled"
fi

# Add build arguments for better traceability and optimization
BUILD_CMD="$BUILD_CMD --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
BUILD_CMD="$BUILD_CMD --build-arg GIT_COMMIT=$(get_git_commit)"
BUILD_CMD="$BUILD_CMD --build-arg BUILD_TYPE=$([ "$BUILD_STABLE" = true ] && echo "stable" || echo "dev")"
BUILD_CMD="$BUILD_CMD --build-arg NODE_ENV=production"
BUILD_CMD="$BUILD_CMD --build-arg OPTIMIZE_BUILD=$([ "$OPTIMIZE_BUILD" = true ] && echo "true" || echo "false")"
if [ -n "$VERSION_TAG" ]; then
    BUILD_CMD="$BUILD_CMD --build-arg VERSION=${VERSION_TAG}"
fi

# Add optimization flags
if [ "$OPTIMIZE_BUILD" = true ]; then
    BUILD_CMD="$BUILD_CMD --build-arg NPM_CONFIG_PRODUCTION=true"
    BUILD_CMD="$BUILD_CMD --build-arg NODE_OPTIONS='--max-old-space-size=4096'"
fi

BUILD_CMD="$BUILD_CMD -f docker/Dockerfile.backend -t ${IMAGE_NAME}:${TAG} ."

echo ""
echo "🔧 Build Configuration:"
echo "   Command: $BUILD_CMD"
echo "   Dockerfile: docker/Dockerfile.backend"
echo "   Context: $(pwd)"
echo "   BuildKit: $([ "$USE_BUILDKIT" = true ] && echo "ENABLED" || echo "DISABLED")"
echo "   Optimizations: $([ "$OPTIMIZE_BUILD" = true ] && echo "ENABLED" || echo "DISABLED")"
echo "   Security Scan: $([ "$ENABLE_SECURITY_SCAN" = true ] && echo "ENABLED" || echo "DISABLED")"
echo ""

# Clean up dangling images before build
echo "🧹 Cleaning up any dangling images..."
docker image prune -f 2>/dev/null || true

# Execute the build
echo "🚀 Starting optimized Docker build..."
eval $BUILD_CMD

BUILD_EXIT_CODE=$?

# Run security scan if enabled and build succeeded
if [ $BUILD_EXIT_CODE -eq 0 ] && [ "$ENABLE_SECURITY_SCAN" = true ]; then
    echo ""
    echo "🔍 Running security vulnerability scan..."
    
    # Check if docker scout is available
    if command -v docker-scout >/dev/null 2>&1; then
        docker scout quickview ${IMAGE_NAME}:${TAG} || echo "⚠️  Security scan completed with findings"
    elif command -v trivy >/dev/null 2>&1; then
        trivy image ${IMAGE_NAME}:${TAG} || echo "⚠️  Security scan completed with findings"
    else
        echo "⚠️  No security scanner found. Install 'docker scout' or 'trivy' for vulnerability scanning."
    fi
fi

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    # Tag with additional version tag if auto-versioning is enabled
    if [ -n "$ADDITIONAL_TAG" ]; then
        echo "🏷️  Adding version tag: ${ADDITIONAL_TAG}"
        docker tag "${IMAGE_NAME}:${TAG}" "${ADDITIONAL_TAG}"
        if [ $? -eq 0 ]; then
            echo "✅ Successfully tagged as ${ADDITIONAL_TAG}"
        else
            echo "⚠️  Warning: Failed to add version tag"
        fi
    fi
    
    # Update version file if auto-versioning is enabled
    if [ "$AUTO_VERSION" = true ] && [ -n "$NEW_VERSION" ]; then
        update_version_file "$NEW_VERSION" "$NEW_BUILD_NUMBER"
        # Also update package.json files to keep versions in sync
        update_package_json_files "$NEW_VERSION"

        # Commit and push version changes back to repository
        echo "📤 Committing version updates to repository..."
        git add .docker-version package.json frontend/package.json backend/package.json 2>/dev/null || true
        if git commit -m "build: Auto-increment version to v$NEW_VERSION

🤖 Generated by build_image.sh auto-versioning"; then
            echo "✅ Version changes committed locally"
            # Try to push, but don't fail if credentials aren't set up
            if git push origin $GIT_BRANCH 2>/dev/null; then
                echo "✅ Version changes pushed to remote repository"
            else
                echo "⚠️  Warning: Could not push changes (likely no credentials configured)"
                echo "   Run 'git push origin master' manually or configure git credentials"
            fi
        else
            echo "ℹ️  No version changes to commit"
        fi
    fi
    
    # Verify the image was actually created and tagged
    if docker image inspect "${IMAGE_NAME}:${TAG}" >/dev/null 2>&1; then
        echo ""
        echo "✅ BUILD COMPLETED SUCCESSFULLY!"
        echo "================================"
        echo "Image created: ${IMAGE_NAME}:${TAG}"
        if [ -n "$ADDITIONAL_TAG" ]; then
            echo "Version tagged: ${ADDITIONAL_TAG}"
        fi
        echo "Build type: $([ "$BUILD_STABLE" = true ] && echo "STABLE/PRODUCTION" || echo "DEV/UNSTABLE")"
        if [ -n "$VERSION_TAG" ]; then
            echo "Version: ${VERSION_TAG}"
            echo "Build number: #${NEW_BUILD_NUMBER}"
        fi
        echo "Git commit: $(get_git_commit)"
        echo "Build time: $(date)"
        echo ""
    else
        echo ""
        echo "⚠️ BUILD WARNING: Image built but not properly tagged"
        echo "Attempting to find and tag the latest untagged image..."
        
        # Find the most recent untagged image
        LATEST_UNTAGGED=$(docker images --filter "dangling=true" --format "{{.ID}}" | head -n1)
        
        if [ -n "$LATEST_UNTAGGED" ]; then
            echo "Found untagged image: $LATEST_UNTAGGED"
            docker tag "$LATEST_UNTAGGED" "${IMAGE_NAME}:${TAG}"
            if [ $? -eq 0 ]; then
                echo "✅ Successfully tagged image as ${IMAGE_NAME}:${TAG}"
            else
                echo "❌ Failed to tag image"
                exit 1
            fi
        else
            echo "❌ No untagged images found. Build may have failed."
            exit 1
        fi
    fi
    # Show image size information
    IMAGE_SIZE=$(docker image inspect ${IMAGE_NAME}:${TAG} --format='{{.Size}}' | numfmt --to=iec --suffix=B 2>/dev/null || echo "Unknown")
    echo "📊 IMAGE INFORMATION:"
    echo "   Image size: $IMAGE_SIZE"
    echo "   Layers: $(docker history ${IMAGE_NAME}:${TAG} --quiet 2>/dev/null | wc -l || echo "Unknown")"
    if [ "$OPTIMIZE_BUILD" = true ]; then
        echo "   Optimizations: Production-only dependencies, multi-stage build, Alpine base"
    fi
    echo ""
    echo "📋 USEFUL COMMANDS:"
    echo "   View all images:     docker images ${IMAGE_NAME}"
    echo "   Run test container:  docker run -d -p 8080:80 --name test-pathfinder ${IMAGE_NAME}:${TAG}"
    if [ -n "$ADDITIONAL_TAG" ]; then
        echo "   Run version:         docker run -d -p 8080:80 --name test-pathfinder ${ADDITIONAL_TAG}"
    fi
    echo "   View image details:  docker image inspect ${IMAGE_NAME}:${TAG}"
    echo "   Check image layers:  docker history ${IMAGE_NAME}:${TAG}"
    if [ "$ENABLE_SECURITY_SCAN" = true ]; then
        echo "   Run security scan:   trivy image ${IMAGE_NAME}:${TAG}"
    fi
    echo ""
    
    if [ "$BUILD_STABLE" = true ]; then
        echo "🏷️  STABLE BUILD NOTES:"
        echo "   This image is tagged as: ${IMAGE_NAME}:${TAG}"
        if [ "$TAG" = "latest" ]; then
            echo "   Previous 'latest' has been archived with timestamp"
        fi
        echo "   Production-optimized: Single container with frontend + backend"
        echo "   Security: Non-root users, minimal attack surface"
        echo "   Consider tagging with version: docker tag ${IMAGE_NAME}:${TAG} ${IMAGE_NAME}:v1.x.x"
    else
        echo "🚧 DEV BUILD NOTES:"
        echo "   This is a development build with latest code"
        echo "   Production-optimized but includes latest commits"
        echo "   Build includes latest commits from master branch"
        echo "   Run with: docker run -d -p 8080:80 ${IMAGE_NAME}:${TAG}"
    fi
    
    if [ "$OPTIMIZE_BUILD" = true ]; then
        echo ""
        echo "⚡ OPTIMIZATION FEATURES:"
        echo "   ✅ Multi-stage build (excludes dev dependencies)"
        echo "   ✅ Alpine Linux base (~70% size reduction)"
        echo "   ✅ Production npm dependencies only"
        echo "   ✅ Non-root user execution (security)"
        echo "   ✅ Gzip compression enabled"
        echo "   ✅ Static asset caching (1-year)"
        echo "   ✅ Security headers configured"
        echo "   ✅ Rate limiting enabled (10 req/sec)"
    fi
    echo ""
else
    echo ""
    echo "❌ BUILD FAILED!"
    echo "=============="
    echo "Check the output above for error details"
    echo "Common issues:"
    echo "  - Docker daemon not running"
    echo "  - Insufficient disk space (need ~2GB free)"
    echo "  - Dockerfile syntax errors"
    echo "  - Missing dependencies in Dockerfile"
    echo "  - Network issues downloading base images"
    echo "  - BuildKit not available (try --no-buildkit)"
    exit 1
fi
