#!/bin/bash

# Discord Broker Deployment Script for TrueNAS with Docker
# This script helps deploy the Discord broker container on TrueNAS

set -e

# Configuration
COMPOSE_FILE="docker-compose.discord-broker.yml"
ENV_FILE=".env.discord-broker"
DATA_PATH="/mnt/pool/appdata/discord-broker"  # Update this to your TrueNAS dataset path

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Discord Broker Deployment Script${NC}"
echo "=================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Warning: docker-compose not found, trying docker compose${NC}"
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Environment file not found. Creating from template...${NC}"
    if [ -f ".env.discord-broker.example" ]; then
        cp .env.discord-broker.example "$ENV_FILE"
        echo -e "${YELLOW}Please edit $ENV_FILE and add your Discord credentials:${NC}"
        echo "  - DISCORD_BOT_TOKEN"
        echo "  - DISCORD_CLIENT_ID"
        echo "  - DISCORD_GUILD_ID"
        echo ""
        echo -e "${RED}After editing, run this script again.${NC}"
        exit 1
    else
        echo -e "${RED}Error: No environment template found${NC}"
        exit 1
    fi
fi

# Check if required environment variables are set
source "$ENV_FILE"
if [ -z "$DISCORD_BOT_TOKEN" ] || [ "$DISCORD_BOT_TOKEN" = "your_bot_token_here" ]; then
    echo -e "${RED}Error: DISCORD_BOT_TOKEN not configured in $ENV_FILE${NC}"
    exit 1
fi

if [ -z "$DISCORD_CLIENT_ID" ] || [ "$DISCORD_CLIENT_ID" = "your_client_id_here" ]; then
    echo -e "${RED}Error: DISCORD_CLIENT_ID not configured in $ENV_FILE${NC}"
    exit 1
fi

if [ -z "$DISCORD_GUILD_ID" ] || [ "$DISCORD_GUILD_ID" = "your_guild_id_here" ]; then
    echo -e "${RED}Error: DISCORD_GUILD_ID not configured in $ENV_FILE${NC}"
    exit 1
fi

# Create data directory if it doesn't exist
echo "Creating data directory at $DATA_PATH..."
mkdir -p "$DATA_PATH"
chmod 755 "$DATA_PATH"

# Check if the image exists
if ! docker images | grep -q "discord-broker.*dev"; then
    echo -e "${YELLOW}Discord broker image not found.${NC}"
    echo "Please build it first with:"
    echo "  bash build_image.sh --discord-broker --branch feature/discord-session-attendance"
    exit 1
fi

# Deploy or update the container
echo "Deploying Discord Broker..."
$COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Check if container started successfully
sleep 5
if docker ps | grep -q "discord-broker"; then
    echo -e "${GREEN}✅ Discord Broker deployed successfully!${NC}"
    echo ""
    echo "Container Status:"
    docker ps --filter "name=discord-broker" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "To view logs:"
    echo "  docker logs -f discord-broker"
    echo ""
    echo "To stop the service:"
    echo "  $COMPOSE_CMD -f $COMPOSE_FILE down"
    echo ""
    echo "Health check endpoint:"
    echo "  http://$(hostname -I | awk '{print $1}'):3000/health"
else
    echo -e "${RED}❌ Failed to start Discord Broker${NC}"
    echo "Check logs with: docker logs discord-broker"
    exit 1
fi