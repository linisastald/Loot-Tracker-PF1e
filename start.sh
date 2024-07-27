#!/bin/sh

# Wait for PostgreSQL
until PGPASSWORD=$DB_PASSWORD psql -h db -U $DB_USER -d $DB_NAME -c '\q'; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

# Initialize the database
psql -U postgres -f /app/database/init.sql

# Run the other SQL scripts
psql -U $DB_USER -d $DB_NAME -f /app/database/item_data.sql
psql -U $DB_USER -d $DB_NAME -f /app/database/mod_data.sql

# Start the backend
cd /app/backend
node index.js &

# Start nginx
nginx -g 'daemon off;'

