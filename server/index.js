import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jsPDF } from 'jspdf';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

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

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/session', (_req, res) => res.json({ topics: liveTopics }));
app.get('/api/history', (_req, res) => res.json({ history: meetingHistoryLog }));

function addLiveTranscript(tab, text, speaker = 'System') {
  const topic = liveTopics[tab] ? tab : 'Overview';
  const cleanText = String(text || '').trim();
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

  // Browser speech recognition emits text, not raw PCM audio. This keeps the
  // app working without a Deepgram/WebRTC pipeline in the repo.
  socket.on('transcript', (data = {}) => {
    addLiveTranscript(data.topic, data.text, data.speaker);
  });

  // Kept for compatibility with older clients that still send recorder chunks.
  socket.on('audio-stream-chunk', () => {});
});

app.post('/api/export-pdf', (req, res) => {
  try {
    const topics = req.body?.topics && typeof req.body.topics === 'object'
      ? req.body.topics
      : liveTopics;
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

function startServer(port = process.env.PORT || 5000) {
  return httpServer.listen(port, () => {
    console.log(`Aetherist Backend Core live on http://localhost:${port}`);
  });
}

export { app, httpServer, io, liveTopics, addLiveTranscript, startServer };
