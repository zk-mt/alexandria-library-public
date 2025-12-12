#!/bin/bash
set -e

# Initialize the database schema
python3 <<'EOF'
from app import init_db
try:
    init_db()
    print("Database schema initialized successfully")
except Exception as e:
    print(f"Database initialization failed: {e}")
    exit(1)
EOF

# Start gunicorn
exec gunicorn -w 4 -b 0.0.0.0:5000 app:app
