import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jsPDF } from 'jspdf';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Current active session tracking window objects
let liveTopics = {
  Overview: [
    { speaker: 'Sarah Jenkins', time: '10:00 AM', text: 'Welcome everyone to the project overview alignment.' }
  ],
  Technical: [],
  Minutes: []
};

// 🏛️ The History Database: Pre-populating saved archives matching your design card expectations
let meetingHistoryLog = [
  {
    id: "hist-001",
    date: "Sept 10, 2026",
    title: "Q3 Strategy Planning Sprint",
    duration: "42 mins",
    summary: "Finalized production deployment maps and closed budget allocation approvals.",
    highlights: ["Sarah: Approved cloud hosting tier", "David: Scaled streaming cluster targets"]
  },
  {
    id: "hist-002",
    date: "Sept 04, 2026",
    title: "Microservice Core Optimization",
    duration: "18 mins",
    summary: "Fixed web socket memory leaks under Android simulation layers.",
    highlights: ["Elena: Cleared active pipeline blocks", "David: Re-routed socket tunnels"]
  }
];

// Endpoint providing initial loading metrics
app.get('/api/session', (req, res) => {
  res.json({ topics: liveTopics });
});

// 🚀 NEW ENDPOINT: Feeds the history service cards database arrays to the phone screen
app.get('/api/history', (req, res) => {
  res.json({ history: meetingHistoryLog });
});

io.on('connection', (socket) => {
  console.log('📱 Phone client linked successfully:', socket.id);
  socket.on('audio-stream-chunk', (data) => {
    console.log(`Processing mic streaming chunks for: ${data.speaker}`);
  });
});

setInterval(() => {
  const speakers = ['Sarah Jenkins', 'David Chen', 'Elena Rosto'];
  const logs = [
    { tab: 'Overview', text: 'We are expanding the multi-speaker transcript framework models.' },
    { tab: 'Technical', text: 'Low-latency packet buffer delivery scales smoothly.' },
    { tab: 'Minutes', text: 'Action Item: Confirm deployment configurations match production ports.' }
  ];

  const randomLog = logs[Math.floor(Math.random() * logs.length)];
  const randomSpeaker = speakers[Math.floor(Math.random() * speakers.length)];
  
  const payloadItem = {
    speaker: randomSpeaker,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: randomLog.text
  };

  liveTopics[randomLog.tab].push(payloadItem);
  io.emit('live-transcript-update', { topics: liveTopics });
}, 15000);

app.post('/api/export-pdf', (req, res) => {
  try {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("AETHERIST AI - COMPRESSED LOG MINUTES", 14, 20);
    doc.line(14, 26, 196, 26);
    let y = 36;
    
    Object.keys(liveTopics).forEach((title) => {
      doc.setFont("helvetica", "bold");
      doc.text(`Topic: ${title}`, 14, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      liveTopics[title].forEach((item) => {
        const line = `${item.speaker} (${item.time}): ${item.text}`;
        doc.text(doc.splitTextToSize(line, 175), 14, y);
        y += 8;
      });
      y += 4;
    });

    res.json({ success: true, pdfData: doc.output('datauristring') });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

httpServer.listen(5000, () => {
  console.log('✨ Real-time Audio Stream Server active on Port 5000');
});
