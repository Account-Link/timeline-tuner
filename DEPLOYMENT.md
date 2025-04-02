# Deployment Guide for Timeline Tuner

This guide outlines how to deploy the Timeline Tuner application to various platforms.

## Prerequisites

- Node.js (v16 or higher)
- pnpm package manager
- Git

## Environment Variables

Ensure these environment variables are set in your deployment environment:

```
HYPERBOLIC_API_KEY=your_api_key
SESSION_SECRET=your_session_secret
```

## Option 1: Basic Server Deployment

### Server Requirements

- Linux server (Ubuntu/Debian recommended)
- Node.js v16+
- pnpm
- Recommended: Nginx as reverse proxy

### Steps

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd timeline-tuner
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the application:
   ```bash
   pnpm run build
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. Start with PM2 (for production):
   ```bash
   npm install -g pm2
   pm2 start server.js --name timeline-tuner
   pm2 save
   pm2 startup
   ```

6. Configure Nginx (recommended):
   ```nginx
   server {
     listen 80;
     server_name your-domain.com;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

7. Enable SSL with Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Option 2: Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t timeline-tuner .
   ```

2. Run the container:
   ```bash
   docker run -d -p 3000:3000 --name timeline-tuner \
     -e HYPERBOLIC_API_KEY=your_api_key \
     -e SESSION_SECRET=your_session_secret \
     timeline-tuner
   ```

## Option 3: Cloud Platform Deployment

### Render

1. Create a new Web Service
2. Connect your Git repository
3. Select "Node" as runtime
4. Set build command: `pnpm install && pnpm run build`
5. Set start command: `node server.js`
6. Add environment variables
7. Deploy

### Railway

1. Create a new project
2. Connect to your GitHub repository
3. Configure environment variables
4. Deploy

### Heroku

1. Install Heroku CLI:
   ```bash
   npm install -g heroku
   ```

2. Login to Heroku:
   ```bash
   heroku login
   ```

3. Create a new Heroku app:
   ```bash
   heroku create timeline-tuner
   ```

4. Add a Procfile:
   ```
   web: node server.js
   ```

5. Set environment variables:
   ```bash
   heroku config:set HYPERBOLIC_API_KEY=your_api_key
   heroku config:set SESSION_SECRET=your_session_secret
   ```

6. Deploy:
   ```bash
   git push heroku main
   ```

## Maintenance and Updates

1. Pull latest changes:
   ```bash
   git pull origin main
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Rebuild:
   ```bash
   pnpm run build
   ```

4. Restart service:
   ```bash
   pm2 restart timeline-tuner
   ```

## Monitoring

Consider setting up monitoring with:
- PM2 monitoring
- Datadog
- New Relic
- Grafana/Prometheus

## Troubleshooting

- Check application logs: `pm2 logs timeline-tuner`
- Verify environment variables are set correctly
- Check server resources (RAM, CPU)
- Verify database connectivity if applicable 