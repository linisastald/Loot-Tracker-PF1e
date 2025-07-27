#!/bin/bash
# Script to generate secure random secrets for JWT and passwords

echo "Generating secure secrets..."
echo ""
echo "JWT Secrets (64 characters each):"
echo "ROTR_JWT_SECRET=$(openssl rand -hex 32)"
echo "SNS_JWT_SECRET=$(openssl rand -hex 32)"
echo "TEST_JWT_SECRET=$(openssl rand -hex 32)"
echo ""
echo "Database Passwords (32 characters each):"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=')"
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 24 | tr -d '=')"
echo "NPM_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=')"
echo ""
echo "Copy these values to your .env.docker file"
echo "NEVER commit the .env.docker file to version control!"