FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"] 