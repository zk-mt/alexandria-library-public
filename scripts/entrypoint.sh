#!/usr/bin/env bash
set -euo pipefail

# Entrypoint: run DB bootstrap then start the Flask app

echo "Running DB bootstrap..."
python3 /app/scripts/bootstrap_db.py

echo "Starting Flask app"
# Exec the existing CMD (flask run by default in Dockerfile) or user-provided CMD
exec "$@"
