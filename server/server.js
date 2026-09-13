import express from 'express';
import cors from 'cors';
import { jsPDF } from 'jspdf';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Fake database structure matching our frontend dashboard state
let meetingData = {
  sessionActive: false,
  speakers: [
    { id: 1, name: 'Alice Jenkins', profile: 'Studio Clear', micGain: 'Medium' },
    { id: 2, name: 'Bob Carter', profile: 'Noise Reduction High', micGain: 'High' }
  ],
  topics: [
    {
      id: 't1',
      title: 'Project Roadmap & Goals',
      items: [
        { speaker: 'Alice Jenkins', text: 'Welcome team. Today we are mapping our AI engine capabilities.' },
        { speaker: 'Bob Carter', text: 'Great. The primary feature target is speech-to-text transcript segmentation.' }
      ]
    },
    {
      id: 't2',
      title: 'PDF Feature & Interface Review',
      items: [
        { speaker: 'Alice Jenkins', text: 'We need the download PDF module functional by the weekend sprint.' }
      ]
    }
  ]
};

// Route to fetch runtime environment data
app.get('/api/session', (req, res) => {
  res.json(meetingData);
});

// Route to update profile settings dynamically
app.post('/api/speakers', (req, res) => {
  meetingData.speakers = req.body.speakers;
  res.json({ success: true, message: 'Speaker profiles updated.' });
});

// Route to handle server-side summary compile & download triggers
app.post('/api/export-pdf', (req, res) => {
  const { title, topics } = req.body;
  
  try {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("AETHERIS AI - MEETING MINUTES", 14, 20);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    doc.line(14, 32, 196, 32);
    
    let yPosition = 42;
    
    topics.forEach((topic) => {
      if (yPosition > 260) { doc.addPage(); yPosition = 20; }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Topic: ${topic.title}`, 14, yPosition);
      yPosition += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      
      topic.items.forEach((item) => {
        if (yPosition > 270) { doc.addPage(); yPosition = 20; }
        const lineText = `${item.speaker}: ${item.text}`;
        const splitText = doc.splitTextToSize(lineText, 180);
        doc.text(splitText, 14, yPosition);
        yPosition += (splitText.length * 6);
      });
      yPosition += 6;
    });

    // Instead of local filesystem write, we return base64 string directly back to client
    const pdfBase64 = doc.output('datauristring');
    res.json({ success: true, pdfData: pdfBase64 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Aetheris Backend Core live on http://localhost:${PORT}`);
});
