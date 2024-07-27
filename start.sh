#!/bin/sh

# Start PostgreSQL
/usr/local/bin/docker-entrypoint.sh postgres &

# Wait for PostgreSQL to start
until pg_isready -h localhost -p 5432 -U postgres
do
  echo "Waiting for postgres..."
  sleep 2
done

# Initialize the database
psql -U postgres -f /app/database/init.sql

# Run the other SQL scripts
psql -U your_db_user -d your_db_name -f /app/database/item_data.sql
psql -U your_db_user -d your_db_name -f /app/database/mod_data.sql

# Start the backend
cd /app/backend
node index.js &

# Start nginx
nginx -g 'daemon off;'