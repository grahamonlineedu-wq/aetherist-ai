---
title: Aetherist AI
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Aetherist AI

Real-time AI voice assistant with OpenAI, Deepgram, Groq, and ElevenLabs.

## Features
- Real-time voice chat with WebSocket streaming
- Multiple AI models: OpenAI GPT-4o, Groq Llama
- Speech-to-text via Deepgram
- Text-to-speech via ElevenLabs
- PostgreSQL backend for chat history
- React + Vite frontend

## Stack
Frontend: React, Vite, TypeScript
Backend: Node.js, Express, WebSocket
Database: PostgreSQL
AI: OpenAI, Deepgram, Groq, ElevenLabs

## Run locally
```bash
npm install
npm run dev:all
