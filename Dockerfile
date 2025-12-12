# Build Stage: Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Build the React app to /frontend/dist
RUN npm run build

# Run Stage: Backend
FROM python:3.11-slim
WORKDIR /app

# Install minimal build tools (no Postgres dependencies needed for SQLite)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Remove the raw frontend source to save space (optional, but clean)
# We only need the build artifacts
RUN rm -rf frontend

# Copy built frontend assets from the previous stage
# We place them in 'static_build' to distinguish from 'static' (user uploads)
# OR we merge them. 'static' currently has 'documents' etc.
# Ideally, we copy them to `static/` but we need to respect existing subfolders.
# Let's copy to `client` and serve from there to avoid conflict with `documents`.
COPY --from=frontend-build /frontend/dist ./client

# Expose port (flask default is 5000)
EXPOSE 5000

# Environment variables that might be needed defaults
ENV FLASK_APP=app.py
ENV FLASK_ENV=production

# Copy and set entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Command to run the application
CMD ["/docker-entrypoint.sh"]
