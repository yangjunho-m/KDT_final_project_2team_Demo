#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/backend"

if [ ! -f .env ]; then
  echo "ERROR: $HOME/backend/.env does not exist."
  echo "Create .env on the server before running deployment."
  exit 1
fi

sudo docker compose build backend
sudo docker compose up -d postgres minio backend
sudo docker compose ps

echo "Waiting for backend health check..."
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/system/health; then
    echo
    echo "Backend deployment completed."
    exit 0
  fi

  echo "Backend is not ready yet (${attempt}/20). Retrying in 3 seconds..."
  sleep 3
done

echo "ERROR: Backend health check failed after 60 seconds."
sudo docker compose logs backend --tail=100
exit 1
