import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import pg from 'pg';
import dns from 'dns';
import OpenAI from 'openai';

dns.setDefaultResultOrder('ipv4first');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
const isLocal = dbUrl?.includes('localhost') || dbUrl?.includes('127.0.0.1');

const poolConfig = {
  connectionString: dbUrl,
  family: 4,
  connectionTimeoutMillis: 10000,
  max: 10,
  ssl: isLocal ? false : { rejectUnauthorized: false }
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => console.error('❌ PG pool error:', err.message));

async function testDB() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected:', res.rows[0].now);
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
}
await testDB();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_published BOOLEAN DEFAULT FALSE,
        share_id UUID DEFAULT gen_random_uuid(),
        speakers TEXT[] DEFAULT ARRAY['Sarah','David','Elena']
      );
      CREATE TABLE IF NOT EXISTS agendas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        speaker TEXT,
        timestamp TEXT,
        keywords TEXT[],
        summary TEXT,
        refined_speech TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_agendas_session_id ON agendas(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_share_id ON sessions(share_id);
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ DB init failed:', err.message);
  }
}
await initDB();

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: true });
  } catch {
    res.json({ status: 'ok', db: false });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { title } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO sessions (title) VALUES ($1) RETURNING *',
      [title || `Meeting ${new Date().toLocaleString()}`]
    );
    res.json({ success: true, session: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, created_at, is_published, share_id FROM sessions ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ success: true, sessions: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const s = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!s.rows[0]) return res.status(404).json({ success: false, error: 'Session not found' });
    const a = await pool.query(
      'SELECT * FROM agendas WHERE session_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ success: true, session: { ...s.rows[0], agendas: a.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/refine-speech', async (req, res) => {
  try {
    const { rawText, sessionId, speaker } = req.body;
    if (!rawText || !sessionId) {
      return res.status(400).json({ success: false, error: 'rawText and sessionId required' });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Convert raw meeting speech to executive format. Return JSON: {title, summary, refinedSpeech, keywords[]}" },
        { role: "user", content: rawText }
      ],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(completion.choices[0].message.content);
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const { rows } = await pool.query(
      `INSERT INTO agendas (session_id, title, speaker, timestamp, keywords, summary, refined_speech) 
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [sessionId, data.title, speaker || 'Unknown', timestamp, data.keywords || [], data.summary, data.refinedSpeech]
    );
    res.json({ success: true, agenda: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions/:id/publish', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sessions SET is_published = TRUE WHERE id = $1 RETURNING share_id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, shareId: rows[0].share_id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/share/:shareId', async (req, res) => {
  try {
    const s = await pool.query(
      'SELECT * FROM sessions WHERE share_id = $1 AND is_published = TRUE', 
      [req.params.shareId]
    );
    if (!s.rows[0]) return res.status(404).json({ success: false, error: 'Share not found or not published' });
    const a = await pool.query(
      'SELECT * FROM agendas WHERE session_id = $1 ORDER BY created_at ASC',
      [s.rows[0].id]
    );
    res.json({ success: true, session: { ...s.rows[0], agendas: a.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) return ws.close(1008, 'Session ID required');
  console.log(`WS connected: ${sessionId}`);
  ws.on('message', () => {
    if (Math.random() > 0.6) {
      ws.send(JSON.stringify({
        type: 'TRANSCRIPT',
        text: 'Q3 budget allocation needs review by finance team before board meeting.',
        isFinal: true,
        speaker: 'David'
      }));
    }
  });
  ws.on('close', () => console.log(`WS closed: ${sessionId}`));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Aetherist backend running on :${PORT}`);
  console.log(`📊 Database: ${isLocal ? 'Local PG' : 'Custom'}`);
});

process.on('SIGTERM', () => {
  server.close(() => pool.end(() => process.exit(0)));
});
