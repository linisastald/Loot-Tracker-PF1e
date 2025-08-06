# Docker Deployment

## Quick Start

1. **Copy the template files:**
   ```bash
   cp docker-compose.template.yml docker-compose.yml
   cp .env.template .env
   ```

2. **Edit the .env file** with your actual values:
   - Set secure passwords for `TEST_DB_PASSWORD`
   - Generate a secure JWT secret for `TEST_JWT_SECRET`
   - Add your OpenAI API key
   - Configure your domain and paths

3. **Build and start the services:**
   ```bash
   docker-compose up -d
   ```

## Permission Fix

This deployment configuration eliminates the Docker permission issues by:

- **Using container-internal storage** for logs and migrations (no external volume mounts)
- **Proper directory ownership** set in the Dockerfile for the backend user
- **Environment variable configuration** instead of hardcoded secrets

## Files

- `docker-compose.template.yml` - Template compose file with environment variables
- `.env.template` - Template environment file
- `Dockerfile.full` - Multi-stage production Dockerfile with permission fixes
- `.gitignore` - Prevents committing secrets and actual compose files

## Security Notes

- Never commit actual `.env` files or `docker-compose.yml` files with real secrets
- Use strong, unique passwords and secrets
- The template files use environment variables to keep secrets out of version control