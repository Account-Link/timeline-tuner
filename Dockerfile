FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package*.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

RUN pnpm build

# Expose the port the app runs on
EXPOSE 8000

# Start the application
CMD ["node", "server.js"]