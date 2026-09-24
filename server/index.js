import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jsPDF } from 'jspdf';
import dotenv from 'dotenv';
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const liveTopics = {
  Overview: [
    { speaker: 'Sarah Jenkins', time: '10:00 AM', text: 'Welcome everyone to the project overview alignment.' },
  ],
  Technical: [],
  Minutes: [],
};

const meetingHistoryLog = [
  {
    id: 'hist-001',
    date: 'Sept 10, 2026',
    title: 'Q3 Strategy Planning Sprint',
    duration: '42 mins',
    summary: 'Finalized production deployment maps and closed budget allocation approvals.',
    highlights: ['Sarah: Approved cloud hosting tier', 'David: Scaled streaming cluster targets'],
  },
  {
    id: 'hist-002',
    date: 'Sept 04, 2026',
    title: 'Microservice Core Optimization',
    duration: '18 mins',
    summary: 'Fixed web socket memory leaks under Android simulation layers.',
    highlights: ['Elena: Cleared active pipeline blocks', 'David: Re-routed socket tunnels'],
  },
];

const deepgram = process.env.DEEPGRAM_API_KEY ? createClient(process.env.DEEPGRAM_API_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function normalizeText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function fallbackSummary(rawText) {
  const cleaned = normalizeText(rawText);
  if (!cleaned) {
    return {
      title: 'No transcript available',
      keywords: [],
      summary: 'No meeting content was captured.',
      refinedSpeech: '',
    };
  }

  const words = cleaned.split(' ');
  const keywords = Array.from(new Set(words.filter((word) => word.length > 5).slice(0, 6))).map((word) => word.replace(/[^a-zA-Z0-9]/g, ''));

  return {
    title: cleaned.slice(0, 52) || 'Meeting Summary',
    keywords: keywords.length ? keywords : ['meeting', 'discussion', 'summary'],
    summary: cleaned.length > 240 ? `${cleaned.slice(0, 240)}...` : cleaned,
    refinedSpeech: cleaned,
  };
}

async function refineSpeech(rawText) {
  const cleaned = normalizeText(rawText);
  if (!cleaned) {
    return fallbackSummary(cleaned);
  }

  if (!openai) {
    return fallbackSummary(cleaned);
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are Aetherist AI, a professional meeting secretary. Return ONLY valid JSON with keys: title, keywords, summary, refinedSpeech. Keep the summary concise and keep the refinedSpeech polished.`,
        },
        { role: 'user', content: cleaned },
      ],
    });

    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      title: parsed.title || 'Meeting Notes',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      summary: parsed.summary || cleaned.slice(0, 220),
      refinedSpeech: parsed.refinedSpeech || cleaned,
    };
  } catch (error) {
    console.error('Speech refinement failed:', error);
    return fallbackSummary(cleaned);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/session', (_req, res) => res.json({ topics: liveTopics }));
app.get('/api/history', (_req, res) => res.json({ history: meetingHistoryLog }));

function addLiveTranscript(tab, text, speaker = 'System') {
  const topic = liveTopics[tab] ? tab : 'Overview';
  const cleanText = normalizeText(text);
  if (!cleanText) return null;

  const item = {
    speaker: String(speaker || 'Unknown speaker'),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: cleanText,
  };
  liveTopics[topic].push(item);
  io.emit('live-transcript-update', { topics: liveTopics });
  return item;
}

io.on('connection', (socket) => {
  socket.emit('live-transcript-update', { topics: liveTopics });

  socket.on('transcript', (data = {}) => {
    addLiveTranscript(data.topic, data.text, data.speaker);
  });

  socket.on('audio-stream-chunk', () => {});
});

async function transcribeWithDeepgram(audioData, mimeType = 'audio/wav') {
  if (!deepgram) {
    return {
      success: true,
      provider: 'fallback',
      text: 'Fallback transcript generated because no Deepgram API key is configured.',
    };
  }

  try {
    const rawAudio = audioData.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, '');
    const buffer = Buffer.from(rawAudio, 'base64');
    const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: 'nova-3',
      smart_format: true,
      diarize: true,
      language: 'en-US',
      punctuate: true,
      utterances: true,
      mimeType,
    });

    const transcript = response?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return {
      success: true,
      provider: 'deepgram',
      text: transcript,
    };
  } catch (error) {
    console.error('Deepgram transcription failed:', error);
    return {
      success: true,
      provider: 'fallback',
      text: 'Audio was received but transcription is temporarily unavailable. Please retry or configure a valid transcription key.',
    };
  }
}

app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType = 'audio/wav', topic = 'Overview', speaker = 'Unknown speaker' } = req.body || {};

  if (!audio) {
    return res.status(400).json({ success: false, error: 'audio data is required' });
  }

  const result = await transcribeWithDeepgram(audio, mimeType);
  if (result.text) {
    addLiveTranscript(topic, result.text, speaker);
  }

  res.json(result);
});

app.post('/api/refine-speech', async (req, res) => {
  const rawText = normalizeText(req.body?.rawText || '');
  if (!rawText) {
    return res.status(400).json({ success: false, error: 'rawText is required' });
  }

  try {
    const data = await refineSpeech(rawText);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Speech refinement route failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/export-pdf', (req, res) => {
  try {
    const topics = req.body?.topics && typeof req.body.topics === 'object' ? req.body.topics : liveTopics;
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(req.body?.title || 'AETHERIST AI - MEETING MINUTES', 14, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    doc.line(14, 32, 196, 32);

    let y = 42;
    const addPageIfNeeded = (height = 8) => {
      if (y + height > 280) {
        doc.addPage();
        y = 20;
      }
    };

    for (const [title, rawItems] of Object.entries(topics)) {
      const items = Array.isArray(rawItems) ? rawItems : [];
      addPageIfNeeded(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(`Topic: ${String(title)}`, 14, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      for (const item of items) {
        const line = `${item?.speaker || 'Unknown speaker'} (${item?.time || ''}): ${item?.text || ''}`;
        const lines = doc.splitTextToSize(line, 180);
        addPageIfNeeded(lines.length * 5 + 3);
        doc.text(lines, 14, y);
        y += lines.length * 5 + 3;
      }
      y += 4;
    }

    res.json({ success: true, pdfData: doc.output('datauristring') });
  } catch (error) {
    console.error('PDF export failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/export-speaker-pdf', (req, res) => {
  try {
    const requestedSpeakers = Array.isArray(req.body?.speakers) ? req.body.speakers : [];
    const allTopics = req.body?.topics && typeof req.body.topics === 'object' ? req.body.topics : liveTopics;

    const speakerReports = requestedSpeakers.length ? requestedSpeakers : Object.values(allTopics).flat().map((entry) => entry.speaker);
    const uniqueSpeakers = [...new Set(speakerReports.filter(Boolean))];

    const reports = uniqueSpeakers.map((speaker) => {
      const flatEntries = Object.values(allTopics)
        .flat()
        .filter((entry) => entry?.speaker === speaker);

      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(`${speaker} - Meeting Notes`, 14, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
      let y = 42;

      flatEntries.forEach((entry) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        const lines = doc.splitTextToSize(`${entry.time || ''} - ${entry.text || ''}`, 180);
        doc.text(lines, 14, y);
        y += lines.length * 6 + 4;
      });

      return { speaker, pdfData: doc.output('datauristring') };
    });

    res.json({ success: true, reports });
  } catch (error) {
    console.error('Speaker PDF export failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function startServer(port = process.env.PORT || 5000) {
  return httpServer.listen(port, () => {
    console.log(`Aetherist Backend Core live on http://localhost:${port}`);
  });
}

export { app, httpServer, io, liveTopics, addLiveTranscript, startServer, refineSpeech };












































































































people: 'placeholder' 






























































































































