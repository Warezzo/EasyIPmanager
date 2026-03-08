FROM node:20-alpine

# Install nmap and build tools
RUN apk add --no-cache nmap nmap-scripts python3 make g++

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Install frontend deps and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy backend source
COPY backend/ ./backend/

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "backend/server.js"]
