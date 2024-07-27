#!/bin/sh

# Wait for PostgreSQL
for i in {1..30}; do
  if PGPASSWORD=$DB_PASSWORD psql -h db -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; then
    echo "PostgreSQL is up - executing command"
    break
  fi
  echo "Waiting for PostgreSQL... $i"
  sleep 1
done

# Start the Node.js backend
cd /app/backend && npm start &

# Start nginx
nginx -g 'daemon off;'