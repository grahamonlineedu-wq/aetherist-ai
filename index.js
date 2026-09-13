import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// WebSocket Connection for Live Audio Relay
wss.on('connection', (ws) => {
  console.log('Client connected to audio stream');

  // Initialize Deepgram Live Transcription Stream
  const deepgramLive = deepgram.listen.live({
    model: 'nova-3',
    smart_format: true,
    diarize: true, // Speaker identification
    interim_results: true,
    encoding: 'linear16',
    sample_rate: 16000,
  });

  deepgramLive.on('open', () => {
    console.log('Deepgram connection established');
  });

  // Relay transcripts back to the frontend client
  deepgramLive.on('Results', (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (transcript) {
      ws.send(JSON.stringify({
        type: 'TRANSCRIPT',
        speaker: data.channel.alternatives[0]?.words[0]?.speaker || 0,
        text: transcript,
        isFinal: data.is_final
      }));
    }
  });

  ws.on('message', (chunk) => {
    if (deepgramLive.getReadyState() === 1) {
      deepgramLive.send(chunk);
    }
  });

  ws.on('close', () => {
    deepgramLive.finish();
    console.log('Client disconnected');
  });
});

// REST Endpoint: Refine Raw Transcripts into Executive Agendas
app.post('/api/refine-speech', async (req, res) => {
  const { rawText } = req.body;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: `You are Aetheris AI, an executive meeting secretary. Analyze raw speech transcript and return JSON with:
          {
            "title": "Subtopic Title",
            "keywords": ["Key1", "Key2"],
            "summary": "Concise summary",
            "refinedSpeech": "Polished professional grammar transcript"
          }`
        },
        { role: 'user', content: rawText }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Aetheris AI Server running on port ${PORT}`);
});

