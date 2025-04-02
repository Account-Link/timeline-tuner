#!/bin/bash
# Simple deployment script for Timeline Tuner

set -e  # Exit on error

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing..."
    npm install -g pm2
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build the application
echo "Building application..."
pnpm run build

# Check if the application is already running in PM2
if pm2 list | grep -q "timeline-tuner"; then
    echo "Restarting application..."
    pm2 restart timeline-tuner
else
    echo "Starting application for the first time..."
    pm2 start server.js --name timeline-tuner
    pm2 save
fi

echo "Deployment completed successfully!"
echo "Application is running at http://localhost:3000"
echo "If using Nginx as a reverse proxy, check your Nginx configuration." 