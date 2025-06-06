#!/bin/bash

# Docker Container Update Script
# Usage: ./update_containers.sh [--production] [--clean-test-data]

set -e

COMPOSE_FILE="/root/docker-compose.yml"

# Default settings
UPDATE_PRODUCTION=false
CLEAN_TEST_DATA=false

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
        -h|--help)
            echo "Usage: $0 [--production] [--clean-test-data]"
            echo "  --production      Update production containers (rotr, sns)"
            echo "  --clean-test-data Remove test database persistent data"
            echo "  Default: Updates only test containers"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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
