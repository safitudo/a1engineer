import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { migrate } from './db';
import authRouter from './routes/auth';
import agentsRouter from './routes/agents';
import teamsRouter from './routes/teams';
import tasksRouter from './routes/tasks';
import channelsRouter from './routes/channels';
import pluginsRouter from './routes/plugins';

const app = express();
app.use(express.json());

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend', ts: new Date().toISOString() });
});

// Routes
app.use('/auth', authRouter);
app.use('/agents', agentsRouter);
app.use('/teams', teamsRouter);
app.use('/tasks', tasksRouter);
app.use('/channels', channelsRouter);
app.use('/plugins', pluginsRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);

// WebSocket — agent status events + console streams
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] client connected');
  ws.on('close', () => console.log('[ws] client disconnected'));
});

// Export broadcast helper for other modules to use
export function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

async function main() {
  await migrate();
  console.log('[db] migrations applied');

  server.listen(PORT, () => {
    console.log(`[backend] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('[startup] fatal:', err);
  process.exit(1);
});
