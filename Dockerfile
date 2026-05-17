# Stage 1: Build the React/Vite app
FROM node:20 AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .



# Build the project
RUN npm run build

# Stage 2: Serve the app using the 'serve' package
FROM node:20-slim
WORKDIR /app

# Install 'serve' globally
RUN npm install -g serve

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# 'serve' automatically respects the PORT environment variable passed by Cloud Run
CMD ["serve", "-s", "dist"]
