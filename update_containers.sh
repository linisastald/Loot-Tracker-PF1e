#!/bin/bash

# Docker Container Update Script
# Usage: ./update_containers.sh [--production] [--clean-test-data]

set -e

COMPOSE_FILE="/root/docker-compose.yml"

# Default settings
UPDATE_PRODUCTION=false
CLEAN_TEST_DATA=false
SKIP_GIT_PULL=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --production)
            UPDATE_PRODUCTION=true
            shift
            ;;
        --clean-test-data)
            CLEAN_TEST_DATA=true
            shift
            ;;
        --skip-pull)
            SKIP_GIT_PULL=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--production] [--clean-test-data] [--skip-pull]"
            echo "  --production      Update production containers (rotr, sns)"
            echo "  --clean-test-data Remove test database persistent data"
            echo "  --skip-pull       Skip git pull (use current local code)"
            echo "  Default: Updates only test containers and pulls latest code"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Pull latest code from GitHub unless --skip-pull is specified
if [ "$SKIP_GIT_PULL" = false ]; then
    echo "Pulling latest code from GitHub..."
    cd /root
    git pull origin main || {
        echo "Warning: Git pull failed. Continuing with current local code."
        echo "Make sure you're in the correct git repository and have proper permissions."
    }
else
    echo "Skipping git pull, using current local code..."
fi

cd /root

if [ "$UPDATE_PRODUCTION" = true ]; then
    echo "Updating production containers..."
    
    # Stop and remove production services
    echo "Stopping and removing production services..."
    docker-compose stop rotr_app rotr_db sns_app sns_db
    docker-compose rm -f rotr_app rotr_db sns_app sns_db
    # Force remove containers by name in case of conflicts
    docker rm -f rotr_loot_app rotr_loot_db sns_loot_app sns_loot_db 2>/dev/null || true
    
    # Rebuild and start production services
    echo "Rebuilding production containers..."
    docker-compose -f /root/docker-compose.yml build rotr_app sns_app
    
    echo "Starting production services..."
    docker-compose up -d rotr_app rotr_db sns_app sns_db
    
    echo "Production containers updated successfully"
else
    echo "Updating test containers..."
    
    # Stop and remove test services
    echo "Stopping and removing test services..."
    docker-compose stop test_app test_db
    docker-compose rm -f test_app test_db
    
    # Clean test data if requested
    if [ "$CLEAN_TEST_DATA" = true ]; then
        echo "Removing test database persistent data..."
        docker-compose rm -f test_db
        docker rm -f test_loot_db 2>/dev/null || true
        sudo rm -rf /root/pathfinder/test/db/*
    fi
    
    # Rebuild and start test services
    echo "Rebuilding test containers..."
    docker-compose -f /root/docker-compose.yml build test_app
    
    echo "Starting test services..."
    docker-compose up -d test_app test_db
    
    echo "Test containers updated successfully"
    if [ "$CLEAN_TEST_DATA" = true ]; then
        echo "Test database data has been wiped clean"
    fi
fi

echo "Update complete!"
