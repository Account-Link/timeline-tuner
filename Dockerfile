FROM --platform=linux/amd64 node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install -g pnpm
RUN pnpm install --ignore-scripts

# Copy the rest of the application
COPY . .

# Generate Prisma client
RUN npx prisma generate
RUN pnpm build

# Expose the port the app runs on
EXPOSE 8000

# Start the application
CMD ["pnpm", "dev"]