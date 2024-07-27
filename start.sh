#!/bin/sh

# Wait for PostgreSQL
until PGPASSWORD=$DB_PASSWORD psql -h db -U $DB_USER -d $DB_NAME -c '\q'; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - executing command"

# Start the Node.js backend
cd /app/backend && npm start &

# Start nginx
nginx -g 'daemon off;'