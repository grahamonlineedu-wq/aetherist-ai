import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { jsPDF } from 'jspdf'
import { DeepgramClient } from '@deepgram/sdk'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import pg from 'pg'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { 
  cors: { origin: '*', methods: ['GET', 'POST'] } 
})

const deepgram = process.env.DEEPGRAM_API_KEY ? new DeepgramClient(process.env.DEEPGRAM_API_KEY) : null
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

// PostgreSQL - only connect if DATABASE_URL exists
const { Pool } = pg
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}) : null

app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '10mb' }))

const liveTopics = {
  Overview: [],
  Technical: [],
  Minutes: []
}

const meetingHistoryLog = [
  {
    id: 'hist-001',
    date: 'Sept 10, 2026',
    title: 'Q3 Strategy Planning Sprint',
    duration: '42 mins',
    summary: 'Finalized production deployment maps and closed budget',
    highlights: ['Sarah: Approved cloud hosting tier', 'David: Set launch date']
  }
]

// DB init - won't crash if no DATABASE_URL
async function initDB() {
  if (!pool) {
    console.log('⚠️  No DATABASE_URL - running without database')
    return
  }
  try {
    const client = await pool.connect()
    console.log('✅ PostgreSQL connected')
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        share_id VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
    client.release()
    console.log('✅ Database tables ready')
  } catch (err) {
    console.error('❌ Database init failed:', err.message)
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function fallbackSummary(rawText) {
  const text = normalizeText(rawText)
  if (!text) return { title: 'No transcript available', keywords: [], summary: '', refinedSpeech: '' }
  
  const keywords = [...new Set(text.split(' ').filter((word) => word.length > 3)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean))].slice(0, 8)
  
  return {
    title: text.slice(0, 52) || 'Meeting Summary',
    keywords: keywords.length ? keywords : ['meeting', 'discussion'],
    summary: text.length > 240 ? `${text.slice(0, 240)}...` : text,
    refinedSpeech: text
  }
}

async function refineSpeech(rawText) {
  const text = normalizeText(rawText)
  if (!text || !openai) return fallbackSummary(text)
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional meeting assistant. Return JSON with: title, keywords, summary, refinedSpeech' },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    })
    
    const parsed = JSON.parse(response.choices[0].message.content)
    return {
      title: parsed.title || 'Meeting Notes',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      summary: parsed.summary || text.slice(0, 220),
      refinedSpeech: parsed.refinedSpeech || text
    }
  } catch (error) {
    console.error('Speech refinement failed:', error.message)
    return fallbackSummary(text)
  }
}

function addLiveTranscript(tab, text, speaker = 'System') {
  const topic = liveTopics[tab] ? tab : 'Overview'
  const cleanText = normalizeText(text)
  if (!cleanText) return null
  
  const item = {
    speaker: String(speaker || 'Unknown speaker'),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text: cleanText
  }
  
  liveTopics[topic].push(item)
  io.emit('live-transcript-update', { topics: liveTopics })
  return item
}

async function transcribeWithDeepgram(audioData, mimeType = 'audio/webm') {
  if (!deepgram) {
    return { success: false, provider: 'fallback', error: 'DEEPGRAM_API_KEY not set' }
  }
  
  try {
    const rawAudio = String(audioData).replace(/^data:[^;]+;base64,[STRIPPED], '')
    const buffer = Buffer.from(rawAudio, 'base64')
    
    const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: 'nova-3',
      smart_format: true,
      diarize: true,
      language: 'en-US',
      punctuate: true,
      utterances: true,
      mimeType
    })
    
    const result = response?.result || response
    const text = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    return { success: true, provider: 'deepgram', text: text || '' }
  } catch (error) {
    console.error('Deepgram transcription failed:', error.message)
    return { success: false, provider: 'deepgram', error: 'Deepgram failed' }
  }
}

// PDF exports
function writeTopicsToPdf(doc, topics) {
  let y = 42
  const pageBreak = (height = 8) => {
    if (y + height > 280) {
      doc.addPage()
      y = 20
    }
  }
  
  for (const [title, rawItems] of Object.entries(topics)) {
    const items = Array.isArray(rawItems) ? rawItems : []
    pageBreak(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(`Topic: ${String(title)}`, 14, y)
    y += 8
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    
    for (const item of items) {
      const lines = doc.splitTextToSize(`${item?.speaker || 'Unknown'} [${item?.time || ''}]: ${item?.text || ''}`, 180)
      pageBreak(lines.length * 5 + 3)
      doc.text(lines, 14, y)
      y += lines.length * 5 + 3
    }
    y += 4
  }
}

app.get('/', (req, res) => {
  res.json({ 
    name: 'Aetherist AI Backend API', 
    status: 'running', 
    version: '1.0.0',
    time: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    database: pool ? 'connected' : 'disabled',
    deepgram: deepgram ? 'enabled' : 'disabled',
    openai: openai ? 'enabled' : 'disabled'
  })
})

app.post('/api/transcribe', async (req, res) => {
  const result = await transcribeWithDeepgram(req.body?.audioData, req.body?.mimeType)
  res.status(result.success ? 200 : 503).json(result)
})

app.post('/api/refine-speech', async (req, res) => {
  const text = normalizeText(req.body?.rawText)
  if (!text) return res.status(400).json({ success: false, error: 'rawText required' })
  
  const data = await refineSpeech(text)
  res.json({ success: true, data })
})

app.post('/api/export-pdf', (req, res) => {
  try {
    const topics = req.body?.topics && typeof req.body.topics === 'object' ? req.body.topics : {}
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(req.body?.title || 'AETHERIST AI - MEETING MINUTES', 14, 20)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28)
    doc.line(14, 32, 196, 32)
    writeTopicsToPdf(doc, topics)
    res.json({ success: true, pdfData: doc.output('datauristring') })
  } catch (error) {
    console.error('PDF export failed:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.post('/api/export-speaker-pdf', (req, res) => {
  try {
    const topics = req.body?.topics && typeof req.body.topics === 'object' ? req.body.topics : {}
    const requested = Array.isArray(req.body?.speakers) ? req.body.speakers : []
    const speakers = [...new Set(requested.length ? requested : Object.values(topics).flat().map(i => i.speaker).filter(Boolean))]
    const reports = speakers.map((speaker) => {
      const doc = new jsPDF()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text(`${speaker} - Meeting Notes`, 14, 20)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28)
      writeTopicsToPdf(doc, Object.fromEntries(Object.entries(topics).map(([title, items]) => [
        title,
        (Array.isArray(items) ? items : []).filter((item) => item?.speaker === speaker)
      ])))
      return { speaker, pdfData: doc.output('datauristring') }
    })

    res.json({ success: true, reports })
  } catch (error) {
    console.error('Speaker PDF export failed:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Socket.io Deepgram live
io.on('connection', (socket) => {
  console.log('🔌 Client connected')
  socket.emit('live-transcript-update', { topics: liveTopics })

  if (deepgram) {
    const dgLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true
    })

    dgLive.on('transcript', (data) => {
      const text = data.channel?.alternatives?.[0]?.transcript
      if (text && text.trim().length > 0) {
        const lower = text.toLowerCase()
        const tab = lower.includes('technical') ? 'Technical' : 'Overview'
        addLiveTranscript(tab, text, 'User')
      }
    })

    socket.on('audio-stream-chunk', (payload) => {
      const blob = payload?.blob || payload?.audio || payload
      if (blob) dgLive.send(blob)
    })

    socket.on('disconnect', () => {
      dgLive.finish()
      console.log('🔌 Client disconnected')
    })
  }

  socket.on('transcript', (data = {}) => {
    addLiveTranscript(data.topic || 'Overview', data.text, data.speaker)
  })
})

// THIS IS THE CRITICAL PART FOR RENDER
function startServer(port = process.env.PORT || 5000) {
  return httpServer.listen(port, '0.0.0.0', async () => {
    await initDB()
    console.log(`🚀 Aetherist backend running on :${port}`)
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`✅ Database: ${pool ? 'PostgreSQL' : 'Disabled'}`)
    console.log(`✅ Deepgram: ${deepgram ? 'Enabled' : 'Disabled'}`)
    console.log(`✅ OpenAI: ${openai ? 'Enabled' : 'Disabled'}`)
  })
}

// START THE SERVER - THIS LINE IS REQUIRED
startServer()

export { app, httpServer, io, liveTopics, addLiveTranscript, startServer }
