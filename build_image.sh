#!/bin/bash

# Docker Image Build Script
# Usage: ./build_image.sh [--skip-pull] [--no-cache]

set -e

# Default settings
SKIP_GIT_PULL=false
NO_CACHE=false
IMAGE_NAME="pathfinder-loot"
TAG="latest"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-pull)
            SKIP_GIT_PULL=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--skip-pull] [--no-cache] [--tag TAG]"
            echo "  --skip-pull   Skip git pull (use current local code)"
            echo "  --no-cache    Build without using Docker cache"
            echo "  --tag TAG     Use custom tag (default: latest)"
            echo ""
            echo "  Default: Pulls latest code and builds ${IMAGE_NAME}:${TAG}"
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

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
echo "Working directory: $(pwd)"

# Pull latest code from GitHub unless --skip-pull is specified
if [ "$SKIP_GIT_PULL" = false ]; then
    echo "Pulling latest code from GitHub..."
    git pull origin master || {
        echo "Warning: Git pull failed. Continuing with current local code."
        echo "Make sure you're in the correct git repository and have proper permissions."
    }
else
    echo "Skipping git pull, using current local code..."
fi

# Prepare build command
BUILD_CMD="docker build"

if [ "$NO_CACHE" = true ]; then
    BUILD_CMD="$BUILD_CMD --no-cache"
    echo "Building without cache..."
fi

BUILD_CMD="$BUILD_CMD -f docker/Dockerfile.full -t ${IMAGE_NAME}:${TAG} ."

echo "Executing: $BUILD_CMD"
echo "Building image..."

# Execute the build
eval $BUILD_CMD

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo "Image created: ${IMAGE_NAME}:${TAG}"
    echo ""
    echo "To view the image:"
    echo "  docker images ${IMAGE_NAME}"
    echo ""
    echo "To run a test container:"
    echo "  docker run -d -p 8080:80 --name test-pathfinder ${IMAGE_NAME}:${TAG}"
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
