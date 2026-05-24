'use strict';

/**
 * routes/metrics.js
 * ─────────────────
 * On-demand metric collection endpoints.
 * Real-time streaming uses the WebSocket path /ws/metrics/:id in server.js.
 *
 * GET /api/metrics/:id/all          Full snapshot (system + interfaces + routing + logs)
 * GET /api/metrics/:id/system       CPU, memory, temperature, uptime
 * GET /api/metrics/:id/interfaces   Interface list with counters
 * GET /api/metrics/:id/ospf         OSPF neighbour table
 * GET /api/metrics/:id/bgp          BGP peer summary
 * GET /api/metrics/:id/routing      Route summary (counts per protocol)
 * GET /api/metrics/:id/rib          Routing table (full, paginated)
 * GET /api/metrics/:id/logs         Recent syslog entries
 */

const express    = require('express');
const fleetStore = require('../services/fleetStore');
const sshManager = require('../services/sshManager');
const collector  = require('../services/metricsCollector');

const router = express.Router();

// ── Helper: connect + exec + parse ───────────────────────────────────────────

async function runShow(routerId, command, timeout = 20000) {
  const r = await fleetStore.getById(routerId);
  if (!r) throw Object.assign(new Error('Router not found'), { status: 404 });

  const status = sshManager.getStatus(routerId);
  if (!status.connected) {
    await sshManager.connect(r);
  }

  const result = await sshManager.exec(routerId, command, { timeout });
  return { raw: result.stdout, router: r };
}

// ── GET /api/metrics/:id/all ─────────────────────────────────────────────────

router.get('/:id/all', async (req, res) => {
  try {
    // Return cached snapshot if fresh, otherwise poll now
    let snap = collector.getSnapshot(req.params.id);
    const r  = await fleetStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Router not found' });

    if (!snap) {
      const status = sshManager.getStatus(req.params.id);
      if (!status.connected) await sshManager.connect(r);
      snap = await collector.pollNow(r);
    }

    if (!snap) return res.status(503).json({ error: 'Metrics unavailable — router may be unreachable' });
    res.json(snap);
  } catch (err) {
    const s = err.status || 502;
    res.status(s).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/system ──────────────────────────────────────────────

router.get('/:id/system', async (req, res) => {
  try {
    const [ver, cpu, mem] = await Promise.all([
      runShow(req.params.id, 'show version'),
      runShow(req.params.id, 'show processes cpu sorted | head 5'),
      runShow(req.params.id, 'show processes memory sorted | head 5'),
    ]);
    const parsed = collector.parseSystem(ver.raw, cpu.raw, mem.raw);
    res.json(parsed);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/interfaces ──────────────────────────────────────────

router.get('/:id/interfaces', async (req, res) => {
  try {
    const { raw } = await runShow(req.params.id, 'show interfaces');
    res.json(collector.parseInterfaces(raw));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/ospf ─────────────────────────────────────────────────

router.get('/:id/ospf', async (req, res) => {
  try {
    const [nbr, detail] = await Promise.all([
      runShow(req.params.id, 'show ip ospf neighbor'),
      runShow(req.params.id, 'show ip ospf'),
    ]);
    const neighbors = collector.parseOspfNeighbors(nbr.raw);
    res.json({ neighbors, rawDetail: detail.raw });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/bgp ──────────────────────────────────────────────────

router.get('/:id/bgp', async (req, res) => {
  try {
    const { raw } = await runShow(req.params.id, 'show ip bgp summary');
    res.json(collector.parseBgpSummary(raw));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/routing ─────────────────────────────────────────────

router.get('/:id/routing', async (req, res) => {
  try {
    const { raw } = await runShow(req.params.id, 'show ip route summary');
    res.json(collector.parseRouteSummary(raw));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/rib ──────────────────────────────────────────────────

router.get('/:id/rib', async (req, res) => {
  const { filter = '' } = req.query;
  try {
    const cmd = filter
      ? `show ip route ${filter}`
      : 'show ip route | head 50';
    const { raw } = await runShow(req.params.id, cmd, 30000);
    res.json({ raw, lines: raw.split('\n').filter(Boolean) });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// ── GET /api/metrics/:id/logs ─────────────────────────────────────────────────

router.get('/:id/logs', async (req, res) => {
  try {
    const { raw } = await runShow(req.params.id, 'show logging | tail 50', 15000);
    res.json(collector.parseLogs(raw));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

module.exports = router;
