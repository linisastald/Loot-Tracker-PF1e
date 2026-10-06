#!/bin/bash
# Prints random values for the secrets the application reads (see docker/.env.docker.example).
# Nothing is written to disk; copy the output into your (gitignored) .env.docker or your
# deployment definition.

echo "Generating secure secrets..."
echo ""
echo "Application secrets (64 hex characters each):"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "CSRF_SECRET=$(openssl rand -hex 32)"
echo "DISCORD_BROKER_SECRET=$(openssl rand -hex 32)   # same value on the backend and the broker"
echo ""
echo "Database passwords (alphanumeric):"
echo "DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/')"
echo "DB_APP_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/')"
echo ""
echo "Copy these values to your .env.docker file or deployment definition."
echo "NEVER commit real secrets to version control!"
