FROM node:20-slim
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Start the server (Cloud Run will set the PORT environment variable)
CMD ["npm", "start"]
