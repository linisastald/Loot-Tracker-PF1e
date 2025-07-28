#!/bin/bash

# Optimized Docker Image Build Script
# Builds production-optimized single container with frontend + backend
# Usage: ./build_image.sh [--stable] [--keep-cache] [--optimize]

set -e

# Default settings (builds unstable/dev image)
BUILD_STABLE=false
USE_CACHE=false  # Default: no-cache for dev builds
OPTIMIZE_BUILD=true  # Always optimize by default
IMAGE_NAME="pathfinder-loot"
TAG="dev"  # Default to dev/unstable tag

# Production optimization settings
USE_BUILDKIT=true
ENABLE_SECURITY_SCAN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
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
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--stable] [--keep-cache] [--tag TAG]"
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
            echo "    --tag TAG         Override default tag"
            echo ""
            echo "  EXAMPLES:"
            echo "    $0                        # Build optimized dev image with latest git code"
            echo "    $0 --stable               # Build optimized stable release from current code"
            echo "    $0 --stable --tag v2.1.0  # Build and tag as specific version"
            echo "    $0 --security-scan        # Build with security vulnerability scanning"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Get the script directory to ensure we're in the right place
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to get current git commit hash for versioning
get_git_commit() {
    git rev-parse --short HEAD 2>/dev/null || echo "unknown"
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

echo "===========================================" 
if [ "$BUILD_STABLE" = true ]; then
    echo "🏗️  BUILDING STABLE/LATEST IMAGE"
    echo "Target: ${IMAGE_NAME}:${TAG}"
    echo "Git pull: DISABLED (using current local code)"
    echo "Cache: $([ "$USE_CACHE" = true ] && echo "ENABLED" || echo "DISABLED")"
else
    echo "🚧 BUILDING DEV/UNSTABLE IMAGE"
    echo "Target: ${IMAGE_NAME}:${TAG}"
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
    echo "Building dev image - pulling latest code from GitHub..."
    git pull origin master || {
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

# Add optimization flags
if [ "$OPTIMIZE_BUILD" = true ]; then
    BUILD_CMD="$BUILD_CMD --build-arg NPM_CONFIG_PRODUCTION=true"
    BUILD_CMD="$BUILD_CMD --build-arg NODE_OPTIONS='--max-old-space-size=4096'"
fi

BUILD_CMD="$BUILD_CMD -f docker/Dockerfile.full -t ${IMAGE_NAME}:${TAG} ."

echo ""
echo "🔧 Build Configuration:"
echo "   Command: $BUILD_CMD"
echo "   Dockerfile: docker/Dockerfile.full"
echo "   Context: $(pwd)"
echo "   BuildKit: $([ "$USE_BUILDKIT" = true ] && echo "ENABLED" || echo "DISABLED")"
echo "   Optimizations: $([ "$OPTIMIZE_BUILD" = true ] && echo "ENABLED" || echo "DISABLED")"
echo "   Security Scan: $([ "$ENABLE_SECURITY_SCAN" = true ] && echo "ENABLED" || echo "DISABLED")"
echo ""

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
    echo ""
    echo "✅ BUILD COMPLETED SUCCESSFULLY!"
    echo "================================"
    echo "Image created: ${IMAGE_NAME}:${TAG}"
    echo "Build type: $([ "$BUILD_STABLE" = true ] && echo "STABLE/PRODUCTION" || echo "DEV/UNSTABLE")"
    echo "Git commit: $(get_git_commit)"
    echo "Build time: $(date)"
    echo ""
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
