FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install && cd server && npm install
COPY . .
RUN npm run build
ENV PORT=7860
EXPOSE 7860
CMD ["npm", "run", "start"]
