import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jsPDF } from 'jspdf';
import { DeepgramClient } from '@deepgram/sdk';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.get('/', (req, res) => res.send('<h1>Active</h1>'));
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const deepgram = new DeepgramClient(process.env.DEEPGRAM_API_KEY);
let liveTopics = { Overview: [], Technical: [], Minutes: [] };
app.get('/api/session', (req, res) => res.json({ topics: liveTopics }));
io.on('connection', async (socket) => {
  console.log('📱 Phone Client linked to pipeline.');
  let dgLive = deepgram.listen.live({ model: 'nova-2', language: 'en-US', smart_format: true });
  dgLive.on('transcript', (data) => {
    const text = data.channel?.alternatives?.[0]?.transcript;
    if (text && text.trim().length > 0) {
      let tab = text.toLowerCase().includes('technical') ? 'Technical' : text.toLowerCase().includes('action') ? 'Minutes' : 'Overview';
      liveTopics[tab].push({ speaker: 'User', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text });
      io.emit('live-transcript-update', { topics: liveTopics });
    }
  });
  socket.on('audio-stream-chunk', (d) => { if(dgLive) dgLive.send(d.blob); });
  socket.on('disconnect', () => { if(dgLive) dgLive.finish(); });
});
app.post('/api/export-pdf', (req, res) => {
  try {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold'); doc.text('AETHERIST AI REPORT', 14, 20);
    let y = 36;
    Object.keys(liveTopics).forEach(t => {
      doc.text(t, 14, y); y += 10;
      liveTopics[t].forEach(i => { doc.text(`${i.speaker}: ${i.text}`, 14, y); y += 8; });
    });
    res.json({ success: true, pdfData: doc.output('datauristring') });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log('✨ Server Active on Port 5000'));
