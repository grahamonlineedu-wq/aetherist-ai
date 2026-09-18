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
app.use(express.json());

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

app.get('/api/session', (_req, res) => {
  res.json({ topics: liveTopics });
});

app.get('/api/history', (_req, res) => {
  res.json({ history: meetingHistoryLog });
});

io.on('connection', (socket) => {
  socket.on('audio-stream-chunk', (data = {}) => {
    io.emit('audio-stream-received', {
      speaker: data.speaker || 'Unknown speaker',
      receivedAt: new Date().toISOString(),
    });
  });
});

function addLiveTranscript(tab, text, speaker = 'System') {
  if (!Object.hasOwn(liveTopics, tab)) {
    throw new Error(`Unknown transcript tab: ${tab}`);
  }

  const item = {
    speaker,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text,
  };
  liveTopics[tab].push(item);
  io.emit('live-transcript-update', { topics: liveTopics });
  return item;
}

app.post('/api/export-pdf', (req, res) => {
  try {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('AETHERIST AI - COMPRESSED LOG MINUTES', 14, 20);
    doc.line(14, 26, 196, 26);
    let y = 36;

    Object.entries(liveTopics).forEach(([title, items]) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`Topic: ${title}`, 14, y);
      y += 10;
      doc.setFont('helvetica', 'normal');
      items.forEach((item) => {
        const lines = doc.splitTextToSize(`${item.speaker} (${item.time}): ${item.text}`, 175);
        if (y + lines.length * 8 > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(lines, 14, y);
        y += lines.length * 8;
      });
      y += 4;
    });

    res.json({ success: true, pdfData: doc.output('datauristring') });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function startServer(port = process.env.PORT || 5000) {
  return httpServer.listen(port, () => {
    console.log(`Aetherist Backend Core live on http://localhost:${port}`);
  });
}

export { app, httpServer, io, liveTopics, addLiveTranscript, startServer };
