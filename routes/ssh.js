'use strict';

/**
 * routes/ssh.js
 * ─────────────
 * REST endpoints for one-shot SSH command execution.
 * Interactive terminal sessions use the WebSocket path in server.js.
 *
 * POST /api/ssh/:id/exec           Execute a command
 * POST /api/ssh/:id/exec-bulk      Execute multiple commands in sequence
 * POST /api/ssh/:id/push-config    Push a block of config (enters config mode)
 * GET  /api/ssh/:id/status         Connection pool status for this router
 * POST /api/ssh/:id/disconnect     Drop the SSH connection for this router
 */

const express    = require('express');
const fleetStore = require('../services/fleetStore');
const sshManager = require('../services/sshManager');

const router = express.Router();

// ── Helper: ensure connected ──────────────────────────────────────────────────

async function ensureConnected(id) {
  let router = await fleetStore.getById(id);
  if (!router) throw Object.assign(new Error('Router not found'), { status: 404 });

  const status = sshManager.getStatus(id);
  if (!status.connected) {
    await sshManager.connect(router);
  }
  return router;
}

// ── POST /api/ssh/:id/exec ────────────────────────────────────────────────────

router.post('/:id/exec', async (req, res) => {
  const { command, timeout } = req.body;
  if (!command) return res.status(400).json({ error: '"command" is required' });

  try {
    await ensureConnected(req.params.id);
    const result = await sshManager.exec(req.params.id, command, { timeout });
    res.json({ command, ...result });
  } catch (err) {
    const status = err.status || (err.code === 'NOT_CONNECTED' ? 503 : 502);
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// ── POST /api/ssh/:id/exec-bulk ───────────────────────────────────────────────
// Body: { commands: ["cmd1", "cmd2", ...] }
// Returns array of { command, stdout, stderr, code } in order.

router.post('/:id/exec-bulk', async (req, res) => {
  const { commands } = req.body;
  if (!Array.isArray(commands) || commands.length === 0) {
    return res.status(400).json({ error: '"commands" must be a non-empty array' });
  }
  if (commands.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 commands per bulk request' });
  }

  try {
    await ensureConnected(req.params.id);
    const results = [];
    for (const command of commands) {
      try {
        const r = await sshManager.exec(req.params.id, command, { timeout: 20000 });
        results.push({ command, ...r });
      } catch (err) {
        results.push({ command, stdout: '', stderr: err.message, code: -1, error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    const status = err.status || 502;
    res.status(status).json({ error: err.message });
  }
});

// ── POST /api/ssh/:id/push-config ─────────────────────────────────────────────
// Body: { lines: ["hostname foo", "interface Gi0/1", " description test"] }
// Wraps lines in "configure terminal" / "end" / "write memory" on IOS.

router.post('/:id/push-config', async (req, res) => {
  const { lines, saveConfig = false } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: '"lines" must be a non-empty array of CLI strings' });
  }

  try {
    await ensureConnected(req.params.id);
    const results = [];

    const runAndCapture = async (cmd) => {
      const r = await sshManager.exec(req.params.id, cmd, { timeout: 15000 });
      results.push({ cmd, ...r });
      return r;
    };

    await runAndCapture('configure terminal');
    for (const line of lines) {
      await runAndCapture(line);
    }
    await runAndCapture('end');
    if (saveConfig) {
      await runAndCapture('write memory');
    }

    const hasError = results.some((r) => r.stderr && r.stderr.trim() && !r.stderr.includes('Translating'));
    res.json({ success: !hasError, results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── GET /api/ssh/:id/status ───────────────────────────────────────────────────

router.get('/:id/status', async (req, res) => {
  try {
    const r = await fleetStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Router not found' });
    const status = sshManager.getStatus(req.params.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ssh/:id/disconnect ──────────────────────────────────────────────

router.post('/:id/disconnect', async (req, res) => {
  sshManager.disconnect(req.params.id);
  res.json({ success: true });
});

module.exports = router;
