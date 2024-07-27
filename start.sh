#!/bin/sh

# Start PostgreSQL
/usr/local/bin/docker-entrypoint.sh postgres &

# Wait for PostgreSQL to start
until pg_isready -h localhost -p 5432 -U $DB_USER
do
  echo "Waiting for postgres..."
  sleep 2
done

# Initialize the database
psql -U $DB_USER -d $DB_NAME -a -f /app/database/init.sql
psql -U $DB_USER -d $DB_NAME -a -f /app/database/item_data.sql
psql -U $DB_USER -d $DB_NAME -a -f /app/database/mod_data.sql

# Start the backend
cd /app/backend
node index.js &

# Start nginx
nginx -g 'daemon off;'