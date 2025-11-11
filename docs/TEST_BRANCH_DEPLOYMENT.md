# Test Branch Deployment Guide

This guide explains how to set up a separate testing environment on your server for testing feature branches before merging to production.

## Prerequisites

- SSH access to your TrueNAS/Linux server
- Docker and Docker Compose installed
- Git configured with SSH authentication (see SSH_SETUP_GUIDE.md)
- Separate PostgreSQL database for testing

## Step 1: Create Test Directory Structure

```bash
# Create a separate directory for test deployments
mkdir -p /mnt/your-pool/pathfinder-test
cd /mnt/your-pool/pathfinder-test

# Clone the repository
git clone git@github.com:linisastald/Loot-Tracker-PF1e.git .

# Set up git configuration
git config user.email "your-email@example.com"
git config user.name "Your Name"
```

## Step 2: Create Test Environment Configuration

Create a `.env` file for the test environment:

```bash
# .env for test environment
DB_USER=postgres
DB_HOST=your-postgres-host
DB_NAME=pathfinder_test  # Different from production!
DB_PASSWORD=your-secure-password
DB_PORT=5432

JWT_SECRET=your-test-jwt-secret
OPENAI_API_KEY=your-openai-key

# Use different ports to avoid conflicts
BACKEND_PORT=5001
FRONTEND_PORT=3001

# Discord configuration for testing
DISCORD_WEBHOOK_URL=your-test-discord-webhook
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-guild-id
DISCORD_CHANNEL_ID=your-test-channel-id

ALLOWED_ORIGINS=http://localhost:3001,http://your-server:3001
NODE_ENV=development
```

## Step 3: Create Test Docker Compose Configuration

Create `docker-compose.test.yml`:

```yaml
version: '3.8'

services:
  pathfinder-test:
    container_name: pathfinder-test
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5001:5000"  # Map to different external port
    environment:
      - NODE_ENV=development
      - DB_USER=${DB_USER}
      - DB_HOST=${DB_HOST}
      - DB_NAME=${DB_NAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_PORT=${DB_PORT}
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    volumes:
      - ./backend:/app/backend
      - ./frontend:/app/frontend
      - ./discord-handler:/app/discord-handler
      - test-logs:/app/backend/logs
    networks:
      - pathfinder-test-network
    restart: unless-stopped

  discord-test:
    container_name: discord-handler-test
    build:
      context: .
      dockerfile: Dockerfile.discord
    environment:
      - NODE_ENV=development
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_GUILD_ID=${DISCORD_GUILD_ID}
      - DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
      - DB_HOST=${DB_HOST}
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_PORT=${DB_PORT}
      - API_URL=http://pathfinder-test:5000
    depends_on:
      - pathfinder-test
    networks:
      - pathfinder-test-network
    restart: unless-stopped

volumes:
  test-logs:

networks:
  pathfinder-test-network:
    driver: bridge
```

## Step 4: Database Setup

Create a test database:

```bash
# Connect to PostgreSQL
psql -U postgres -h your-postgres-host

# Create test database
CREATE DATABASE pathfinder_test;

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE pathfinder_test TO postgres;

# Exit psql
\q

# Initialize database schema
psql -U postgres -h your-postgres-host -d pathfinder_test < database/init.sql
```

## Step 5: Branch Switching Script

Create `switch_branch.sh` for easy branch switching:

```bash
#!/bin/bash

# switch_branch.sh - Switch to a different git branch for testing

if [ $# -eq 0 ]; then
    echo "Usage: ./switch_branch.sh <branch-name>"
    echo "Available branches:"
    git branch -a
    exit 1
fi

BRANCH=$1

echo "Stopping test containers..."
docker-compose -f docker-compose.test.yml down

echo "Switching to branch: $BRANCH"
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

echo "Installing dependencies..."
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd discord-handler && npm install && cd ..

echo "Building and starting test containers..."
docker-compose -f docker-compose.test.yml up -d --build

echo "Test environment now running on branch: $BRANCH"
echo "Access at: http://your-server:5001"
```

Make it executable:
```bash
chmod +x switch_branch.sh
```

## Step 6: Usage

### Deploy a Test Branch

```bash
# Navigate to test directory
cd /mnt/your-pool/pathfinder-test

# Switch to feature branch
./switch_branch.sh feature/discord-session-attendance

# View logs
docker-compose -f docker-compose.test.yml logs -f
```

### Monitor Test Environment

```bash
# Check container status
docker ps | grep test

# View logs for specific service
docker logs pathfinder-test -f
docker logs discord-handler-test -f

# Access container shell for debugging
docker exec -it pathfinder-test /bin/sh
```

### Reset Test Database

```bash
# Stop containers
docker-compose -f docker-compose.test.yml down

# Reset database
psql -U postgres -h your-postgres-host -c "DROP DATABASE pathfinder_test;"
psql -U postgres -h your-postgres-host -c "CREATE DATABASE pathfinder_test;"
psql -U postgres -h your-postgres-host -d pathfinder_test < database/init.sql

# Restart containers
docker-compose -f docker-compose.test.yml up -d
```

## Step 7: Nginx Configuration (Optional)

If using Nginx proxy, add test configuration:

```nginx
# /etc/nginx/sites-available/pathfinder-test
server {
    listen 80;
    server_name test.your-domain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/pathfinder-test /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Best Practices

1. **Never use production database** - Always use a separate test database
2. **Use different ports** - Avoid port conflicts with production
3. **Separate Discord channels** - Use test Discord channels to avoid spam
4. **Clean up regularly** - Remove old test branches and containers
5. **Monitor resources** - Test environments can consume significant resources

## Troubleshooting

### Port Already in Use
```bash
# Find what's using the port
lsof -i :5001

# Kill the process or use different port
```

### Database Connection Issues
```bash
# Test database connection
psql -U postgres -h your-postgres-host -d pathfinder_test -c "SELECT 1;"

# Check container network
docker network ls
docker network inspect pathfinder-test-network
```

### Branch Conflicts
```bash
# If branch switch fails
git stash
git checkout -f <branch>
git pull origin <branch>
```

## Cleanup

When done testing:
```bash
# Stop and remove containers
docker-compose -f docker-compose.test.yml down -v

# Remove test database (optional)
psql -U postgres -h your-postgres-host -c "DROP DATABASE pathfinder_test;"

# Remove test directory (if completely done)
cd ..
rm -rf pathfinder-test/
```