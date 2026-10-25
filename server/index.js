import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jsPDF } from 'jspdf';
import dotenv from 'dotenv';
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(projectRoot, 'dist');
const serveBuiltApp = process.env.NODE_ENV === 'production' && existsSync(buildDirectory);
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];
const io = new Server(httpServer, {
  cors: { origin: [...new Set(allowedOrigins)], methods: ['GET', 'POST'] },
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
if (serveBuiltApp) app.use(express.static(buildDirectory, { index: false }));

const liveTopics = {
  Overview: [],
  Technical: [],
  Minutes: [],
};

const defaultSpeakerSettings = [
  { id: 'sarah', name: 'Sarah', gain: 80, suppression: 90 },
  { id: 'david', name: 'David', gain: 100, suppression: 83 },
  { id: 'elena', name: 'Elena', gain: 100, suppression: 120 },
];
let speakerSettings = defaultSpeakerSettings.map((speaker) => ({ ...speaker }));

const meetingHistoryLog = [
  { id: 'hist-001', date: 'Sept 10, 2026', title: 'Q3 Strategy Planning Sprint', duration: '42 mins', summary: 'Finalized production deployment maps and closed budget allocation approvals.', highlights: ['Sarah: Approved cloud hosting tier', 'David: Scaled streaming cluster targets'] },
  { id: 'hist-002', date: 'Sept 04, 2026', title: 'Microservice Core Optimization', duration: '18 mins', summary: 'Fixed web socket memory leaks under Android simulation layers.', highlights: ['Elena: Cleared active pipeline blocks', 'David: Re-routed socket tunnels'] },
];

const deepgram = process.env.DEEPGRAM_API_KEY ? createClient(process.env.DEEPGRAM_API_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const normalizeText = (value) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
);

function fallbackSummary(rawText) {
  const text = normalizeText(rawText);
  if (!text) return { title: 'No transcript available', keywords: [], summary: 'No meeting content was captured.', refinedSpeech: '' };
  const keywords = [...new Set(text.split(' ').filter((word) => word.length > 5).slice(0, 6))].map((word) => word.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
  return { title: text.slice(0, 52) || 'Meeting Summary', keywords: keywords.length ? keywords : ['meeting', 'discussion', 'summary'], summary: text.length > 240 ? `${text.slice(0, 240)}...` : text, refinedSpeech: text };
}

async function refineSpeech(rawText) {
  const text = normalizeText(rawText);
  if (!text || !openai) return fallbackSummary(text);
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a professional meeting secretary. Return only JSON with keys title, keywords, summary, refinedSpeech.' },
        { role: 'user', content: text },
      ],
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
    return { title: parsed.title || 'Meeting Notes', keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [], summary: parsed.summary || text.slice(0, 220), refinedSpeech: parsed.refinedSpeech || text };
  } catch (error) {
    console.error('Speech refinement failed:', error.message);
    return fallbackSummary(text);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, providers: { deepgram: Boolean(deepgram), openai: Boolean(openai) } }));
app.get('/api/session', (_req, res) => res.json({ topics: liveTopics, speakers: speakerSettings }));
app.get('/api/history', (_req, res) => res.json({ history: meetingHistoryLog }));
app.get('/api/speakers', (_req, res) => res.json({ speakers: speakerSettings }));

app.post('/api/speakers', (req, res) => {
  const submittedSpeakers = req.body?.speakers;
  if (!Array.isArray(submittedSpeakers) || submittedSpeakers.length !== defaultSpeakerSettings.length) {
    return res.status(400).json({ success: false, error: 'speakers must contain Sarah, David, and Elena.' });
  }

  const settingsById = new Map();
  for (const item of submittedSpeakers) {
    const preset = defaultSpeakerSettings.find((speaker) => speaker.id === item?.id);
    const gain = Number(item?.gain);
    const suppression = Number(item?.suppression);
    if (
      !preset ||
      settingsById.has(preset.id) ||
      !Number.isInteger(gain) ||
      gain < 0 ||
      gain > 100 ||
      !Number.isInteger(suppression) ||
      suppression < 0 ||
      suppression > 120
    ) {
      return res.status(400).json({
        success: false,
        error: 'Each speaker needs a valid ID, gain from 0 to 100, and suppression from 0 to 120.',
      });
    }
    settingsById.set(preset.id, { ...preset, gain, suppression });
  }

  if (settingsById.size !== defaultSpeakerSettings.length) {
    return res.status(400).json({ success: false, error: 'All three speaker profiles are required.' });
  }

  speakerSettings = defaultSpeakerSettings.map((speaker) => settingsById.get(speaker.id));
  io.emit('speaker-settings-update', { speakers: speakerSettings });
  return res.json({ success: true, speakers: speakerSettings });
});

function addLiveTranscript(tab, text, speaker = 'System') {
  const topic = liveTopics[tab] ? tab : 'Overview';
  const cleanText = normalizeText(text);
  if (!cleanText) return null;
  const cleanSpeaker = typeof speaker === 'string' ? normalizeText(speaker).slice(0, 100) : '';
  const item = {
    speaker: cleanSpeaker || 'Unknown speaker',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: cleanText.slice(0, 5000),
  };
  liveTopics[topic].push(item);
  if (liveTopics[topic].length > 500) liveTopics[topic].splice(0, liveTopics[topic].length - 500);
  io.emit('live-transcript-update', { topics: liveTopics });
  return item;
}

io.on('connection', (socket) => {
  socket.emit('live-transcript-update', { topics: liveTopics });
  socket.emit('speaker-settings-update', { speakers: speakerSettings });
  socket.on('transcript', (data = {}) => addLiveTranscript(data.topic, data.text, data.speaker));
});

function parseAudioPayload(audio, mimeType) {
  if (typeof audio !== 'string' || !audio.trim()) {
    return { error: 'audio data is required' };
  }

  let rawAudio = audio.trim();
  if (rawAudio.startsWith('data:')) {
    const commaIndex = rawAudio.indexOf(',');
    const header = commaIndex >= 0 ? rawAudio.slice(0, commaIndex) : '';
    if (!header.startsWith('data:audio/') || !header.endsWith(';base64')) {
      return { error: 'Audio must be provided as a base64 audio data URI.' };
    }
    rawAudio = rawAudio.slice(commaIndex + 1);
  }

  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!rawAudio || !base64Pattern.test(rawAudio)) {
    return { error: 'Invalid base64 audio data.' };
  }

  const normalizedMimeType = typeof mimeType === 'string'
    ? mimeType.split(';', 1)[0].trim().toLowerCase()
    : 'audio/webm';
  if (!/^audio\/[a-z0-9.+-]+$/.test(normalizedMimeType)) {
    return { error: 'A valid audio MIME type is required.' };
  }

  const buffer = Buffer.from(rawAudio, 'base64');
  if (!buffer.length) return { error: 'Audio data is empty.' };
  return { buffer, mimeType: normalizedMimeType };
}

async function transcribeWithDeepgram(buffer, mimeType) {
  try {
    const response = await deepgram.listen.prerecorded.transcribeFile(buffer, { model: process.env.DEEPGRAM_MODEL || 'nova-3', smart_format: true, diarize: true, punctuate: true, utterances: true, language: 'en-US', mimeType });
    const result = response?.result || response;
    const alternative = result?.results?.channels?.[0]?.alternatives?.[0] || {};
    const utterances = result?.results?.utterances || [];
    return { success: true, provider: 'deepgram', text: alternative.transcript || '', utterances };
  } catch (error) {
    console.error('Deepgram transcription failed:', error.message);
    return { success: false, provider: 'deepgram', error: error.message || 'Deepgram transcription failed.' };
  }
}

app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType = 'audio/webm', topic = 'Overview', speaker = 'Unknown speaker' } = req.body || {};
  const parsedAudio = parseAudioPayload(audio, mimeType);
  if (parsedAudio.error) return res.status(400).json({ success: false, error: parsedAudio.error });
  if (!liveTopics[topic]) return res.status(400).json({ success: false, error: 'topic is not supported' });
  if (!deepgram) {
    return res.status(503).json({
      success: false,
      provider: 'deepgram',
      error: 'DEEPGRAM_API_KEY is not configured.',
    });
  }
  const result = await transcribeWithDeepgram(parsedAudio.buffer, parsedAudio.mimeType);
  if (result.success && result.text) addLiveTranscript(topic, result.text, speaker);
  res.status(result.success ? 200 : 502).json(result);
});

app.post('/api/refine-speech', async (req, res) => {
  const text = normalizeText(req.body?.rawText);
  if (!text) return res.status(400).json({ success: false, error: 'rawText is required' });
  if (text.length > 25000) {
    return res.status(413).json({ success: false, error: 'rawText must be 25,000 characters or fewer.' });
  }
  const topic = req.body?.topic || 'Overview';
  if (!liveTopics[topic]) return res.status(400).json({ success: false, error: 'topic is not supported' });

  try {
    const data = await refineSpeech(text);
    const note = normalizeText(`${data.title}: ${data.summary}`).slice(0, 1000);
    const summaryEntry = addLiveTranscript(topic, note, 'Aetherist AI');
    return res.json({ success: true, data, topic, summaryEntry });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Speech refinement failed.' });
  }
});

function writeTopicsToPdf(doc, topics) {
  let y = 42;
  const pageBreak = (height = 8) => { if (y + height > 280) { doc.addPage(); y = 20; } };
  for (const [title, rawItems] of Object.entries(topics)) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    pageBreak(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`Topic: ${String(title)}`, 14, y); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    for (const item of items) {
      const lines = doc.splitTextToSize(`${item?.speaker || 'Unknown speaker'} (${item?.time || ''}): ${item?.text || ''}`, 180);
      pageBreak(lines.length * 5 + 3); doc.text(lines, 14, y); y += lines.length * 5 + 3;
    }
    y += 4;
  }
}

app.post('/api/export-pdf', (req, res) => {
  try {
    const requestedTopics = req.body?.topics;
    if (
      requestedTopics !== undefined &&
      (!requestedTopics || typeof requestedTopics !== 'object' || Array.isArray(requestedTopics))
    ) {
      return res.status(400).json({ success: false, error: 'topics must be an object of topic names and note arrays.' });
    }
    const topics = requestedTopics || liveTopics;
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(req.body?.title || 'AETHERIST AI - MEETING MINUTES', 14, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28); doc.line(14, 32, 196, 32);
    writeTopicsToPdf(doc, topics);
    res.json({ success: true, pdfData: doc.output('datauristring') });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

if (serveBuiltApp) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(buildDirectory, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'API route not found.' });
});

app.use((error, _req, res, _next) => {
  const status = error.status === 413 ? 413 : error.status || 500;
  const message = status === 413
    ? 'Request body is too large.'
    : status === 400
      ? 'Request body must contain valid JSON.'
      : 'Unexpected server error.';
  res.status(status).json({ success: false, error: message });
});

function startServer(port = process.env.PORT || 5000) {
  return httpServer.listen(port, () => console.log(`Aetherist Backend Core live on http://localhost:${port}`));
}

export { app, httpServer, io, liveTopics, addLiveTranscript, startServer, refineSpeech };
