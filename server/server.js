{
  "name": "aetherist-server",
  "type": "module",
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "ws": "^8.18.0",
    "dotenv": "^16.4.5",
    "pg": "^8.12.0",
    "openai": "^4.67.3",
    "@deepgram/sdk": "^3.7.0",
    "groq-sdk": "^0.5.0",
    "elevenlabs": "^1.0.0"
  }
}
