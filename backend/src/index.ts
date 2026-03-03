import express from 'express'
import authRouter from './routes/auth'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend', ts: new Date().toISOString() })
})

// Routes
app.use('/auth', authRouter)

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' })
})

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`)
})

export default app
