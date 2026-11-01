express = require('express')
const cors = require('cors') const { Pool } =
require('pg') require('dotenv').config()
# Commit and push
git add server/server.js server/package.jsonconst app =
express() const port = process.env.PORT || 10000 git
commit -m "fix: add health route, CORS, and DB migration
for share_id"
git push origin main// CORS for Netlify + Local dev
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://aetherist-ai.netlify.app'
  ],
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// Auto-create tables on startup - fixes "share_id does not exist"
async function initDB() {
  try {
    const client = await pool.connect()
    console.log('✅ PostgreSQL connected:', new Date().toISOString())

    // Create conversations table with ALL columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(255) DEFAULT 'New Chat',
        messages JSONB DEFAULT '[]',
        share_id VARCHAR(255) UNIQUE,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Add share_id if table existed without it - migration
    await client.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS share_id VARCHAR(255)
    `)
    await client.query(`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false
    `)

    console.log('✅ Database tables ready')
    client.release()
  } catch (err) {
    console.error('❌ DB init failed:', err.message)
  }
}

initDB()

// Health check route - fixes "Cannot GET /" and "Not Found"
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Aetherist API running',
    database: 'connected',
    timestamp: new Date().toISOString()
  })
})

// Root route so you don't see "Cannot GET /"
app.get('/', (req, res) => {
  res.json({
    message: 'Aetherist AI Backend API',
    status: 'running',
    endpoints: ['/health', '/api/chat']
  })
})

// Example chat endpoint - add your OpenAI/Groq logic here
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body
    // Your AI logic here
    res.json({ reply: `You said: ${message}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Aetherist backend running on :${port}`)
  console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Custom' : 'None'}`)
})
