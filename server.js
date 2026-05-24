'use strict';

require('dotenv').config();

const http       = require('http');
const path       = require('path');
const url        = require('url');
const express    = require('express');
const cors       = require('cors');
const { WebSocketServer } = require('ws');

const fleetStore  = require('./services/fleetStore');
const sshManager  = require('./services/sshManager');
const collector   = require('./services/metricsCollector');

const fleetRoutes   = require('./routes/fleet');
const sshRoutes     = require('./routes/ssh');
const metricsRoutes = require('./routes/metrics');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// CORS
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : true; // Allow all in dev

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/fleet',   fleetRoutes);
app.use('/api/ssh',     sshRoutes);
app.use('/api/metrics', metricsRoutes);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status:      'ok',
    uptime:      process.uptime(),
    ts:          new Date().toISOString(),
    connections: sshManager.connectedIds().length,
  });
});

// ── Static files (serves index.html and all frontend assets) ─────────────────

app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html'],
}));

// Fallback → SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocketServer({ noServer: true });

// Upgrade handler — parse the path and dispatch to the right handler
server.on('upgrade', async (req, socket, head) => {
  const { pathname } = url.parse(req.url);

  // /ws/terminal/:id
  let m = pathname.match(/^\/ws\/terminal\/([^/]+)$/);
  if (m) {
    const routerId = decodeURIComponent(m[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleTerminalWs(ws, routerId);
    });
    return;
  }

  // /ws/metrics/:id
  m = pathname.match(/^\/ws\/metrics\/([^/]+)$/);
  if (m) {
    const routerId = decodeURIComponent(m[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleMetricsWs(ws, routerId);
    });
    return;
  }

  // Unknown WebSocket path
  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

// ── WebSocket: SSH terminal ───────────────────────────────────────────────────

async function handleTerminalWs(ws, routerId) {
  const send = (obj) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  try {
    const router = await fleetStore.getById(routerId);
    if (!router) {
      send({ type: 'error', message: 'Router not found' });
      ws.close(1008, 'Router not found');
      return;
    }

    const status = sshManager.getStatus(routerId);
    if (!status.connected) {
      await sshManager.connect(router);
    }

    // Determine initial terminal size from query string (e.g. ?rows=40&cols=120)
    const qs     = url.parse(ws._socket?.parser?.incoming?.url || '', true).query || {};
    const rows   = parseInt(qs.rows, 10) || 24;
    const cols   = parseInt(qs.cols,  10) || 80;

    await sshManager.shell(routerId, ws, { rows, cols });
  } catch (err) {
    send({ type: 'error', message: err.message });
    ws.close(1011, err.message);
  }
}

// ── WebSocket: metrics stream ─────────────────────────────────────────────────

async function handleMetricsWs(ws, routerId) {
  const send = (obj) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  try {
    const router = await fleetStore.getById(routerId);
    if (!router) {
      send({ type: 'error', message: 'Router not found' });
      ws.close(1008, 'Router not found');
      return;
    }

    // Ensure SSH connection before subscribing
    const status = sshManager.getStatus(routerId);
    if (!status.connected) {
      try {
        await sshManager.connect(router);
      } catch (err) {
        send({ type: 'metrics_error', routerId, message: `Cannot connect: ${err.message}` });
        // Still subscribe — collector will retry when connection recovers
      }
    }

    collector.subscribe(routerId, ws);

    ws.on('close', () => {
      collector.unsubscribe(routerId, ws);
    });

    ws.on('message', async (msg) => {
      try {
        const pkt = JSON.parse(msg.toString());
        if (pkt.type === 'poll') {
          // Client requests immediate refresh
          const snap = await collector.pollNow(router);
          if (!snap) send({ type: 'metrics_error', routerId, message: 'Poll failed' });
        }
      } catch {}
    });
  } catch (err) {
    send({ type: 'error', message: err.message });
    ws.close(1011, err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`Helix Web Console listening on http://${HOST}:${PORT}`);
  console.log(`  API:      http://localhost:${PORT}/api`);
  console.log(`  Terminal: ws://localhost:${PORT}/ws/terminal/:id`);
  console.log(`  Metrics:  ws://localhost:${PORT}/ws/metrics/:id`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(sig) {
  console.log(`\n${sig} received — shutting down…`);
  // Close all SSH connections
  for (const id of sshManager.connectedIds()) {
    sshManager.disconnect(id);
  }
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force-exit after 5 s
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
