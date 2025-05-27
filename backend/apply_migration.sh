#!/bin/bash
# Apply password reset tokens migration

echo "Applying password reset tokens migration..."

# Read database connection details from .env
source .env

# Run the migration
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f ../database/migrations/001_add_password_reset_tokens.sql

echo "Migration complete!"
