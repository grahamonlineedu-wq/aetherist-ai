FROM node:20-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install
RUN cd server && npm install

# Copy source
COPY . .

# Build frontend
RUN npm run build

# HF Spaces runs on port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "run", "start"]
