#!/bin/sh

# Wait for PostgreSQL
i=1
while [ $i -le 30 ]; do
  if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; then
    echo "PostgreSQL is up - executing command"
    break
  fi
  echo "Waiting for PostgreSQL... $i"
  sleep 1
  i=$((i + 1))
done

# Start the Node.js backend
cd /app/backend && exec npm start &
BACKEND_PID=$!

# Function to handle shutdown
shutdown() {
    echo "Shutting down services..."
    kill -TERM $BACKEND_PID 2>/dev/null
    nginx -s quit
    wait $BACKEND_PID
    exit 0
}

trap 'shutdown' SIGTERM SIGINT

# Start nginx in foreground
nginx -g 'daemon off;' &
NGINX_PID=$!

# Wait for any process to exit
wait