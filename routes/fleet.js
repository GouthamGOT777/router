'use strict';

/**
 * routes/fleet.js
 * ───────────────
 * REST endpoints for fleet (router inventory) management.
 *
 * GET    /api/fleet              List all routers
 * GET    /api/fleet/:id          Get single router
 * POST   /api/fleet              Add router (with optional SSH discovery)
 * PUT    /api/fleet/:id          Update router fields
 * DELETE /api/fleet/:id          Remove router
 * POST   /api/fleet/:id/discover Re-run SSH discovery on existing router
 * POST   /api/fleet/:id/connect  Establish / test SSH connection
 * GET    /api/fleet/ssh-status   Connection pool status (all routers)
 * POST   /api/fleet/import       Bulk import from JSON body array
 * GET    /api/fleet/export       Download fleet as JSON file
 */

const express    = require('express');
const { v4: uuid } = require('uuid');
const fleetStore  = require('../services/fleetStore');
const sshManager  = require('../services/sshManager');

const router = express.Router();

// ── GET /api/fleet ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const fleet = await fleetStore.getAll();
    // Enrich with live SSH connection state
    const statuses = sshManager.getAllStatuses();
    const enriched = fleet.map((r) => ({
      ...r,
      sshConnected: statuses[r.id]?.connected || false,
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fleet/ssh-status ─────────────────────────────────────────────────

router.get('/ssh-status', (req, res) => {
  res.json(sshManager.getAllStatuses());
});

// ── GET /api/fleet/export ─────────────────────────────────────────────────────

router.get('/export', async (req, res) => {
  try {
    const fleet = await fleetStore.getAll();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="helix-fleet.json"');
    res.json(fleet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fleet/:id ────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const r = await fleetStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Router not found' });
    res.json({ ...r, sshConnected: sshManager.getStatus(r.id).connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fleet ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.hostname || !body.mgmt) {
      return res.status(400).json({ error: 'hostname and mgmt (IP) are required' });
    }

    // Build base router object
    const id = (body.hostname).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const base = {
      id:        body.id || id,
      hostname:  body.hostname,
      model:     body.model || 'Unknown',
      serial:    body.serial || '—',
      routerId:  body.routerId || body.mgmt,
      asn:       body.asn || '65120',
      mgmt:      body.mgmt,
      sshPort:   body.sshPort || body.port || 22,
      username:  body.username || process.env.SSH_DEFAULT_USER || 'noc-admin',
      password:  body.password || '',
      firmware:  body.firmware || '—',
      uptime:    '—',
      location:  body.location || '—',
      role:      body.role || 'branch',
      team:      body.team || 'Unassigned',
      ports:     body.ports || 12,
      upPorts:   0,
      state:     'ok',
      stateLabel:'just added',
      loadHint:  0.4,
    };

    // Optionally attempt SSH discovery
    if (body.autoDiscover !== false) {
      try {
        await sshManager.connect(base);
        const discovered = await sshManager.discover(base);
        Object.assign(base, {
          model:    discovered.model    || base.model,
          firmware: discovered.firmware || base.firmware,
          uptime:   discovered.uptime   || base.uptime,
          serial:   discovered.serial   || base.serial,
          ports:    discovered.interfaceCount  || base.ports,
          upPorts:  discovered.upInterfaceCount || 0,
          state:     'ok',
          stateLabel:'operational',
        });
      } catch (sshErr) {
        // Discovery failed — still add the router but mark it unreachable
        base.state     = 'err';
        base.stateLabel = `unreachable: ${sshErr.message.slice(0, 60)}`;
      }
    }

    const saved = await fleetStore.create(base);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/fleet/:id ────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const updated = await fleetStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Router not found' });
    // If credentials changed, drop the existing SSH connection so it reconnects fresh
    if (req.body.password || req.body.username || req.body.mgmt || req.body.sshPort) {
      sshManager.disconnect(req.params.id);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/fleet/:id ─────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    sshManager.disconnect(req.params.id);
    const ok = await fleetStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Router not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fleet/:id/discover ──────────────────────────────────────────────

router.post('/:id/discover', async (req, res) => {
  try {
    const r = await fleetStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Router not found' });

    await sshManager.connect({ ...r, ...req.body });
    const discovered = await sshManager.discover({ ...r, ...req.body });

    const updated = await fleetStore.update(r.id, {
      model:     discovered.model    || r.model,
      firmware:  discovered.firmware || r.firmware,
      uptime:    discovered.uptime   || r.uptime,
      serial:    discovered.serial   || r.serial,
      ports:     discovered.interfaceCount  || r.ports,
      upPorts:   discovered.upInterfaceCount || 0,
      state:     'ok',
      stateLabel:'operational',
    });

    res.json({ router: updated, discovered });
  } catch (err) {
    res.status(502).json({ error: `Discovery failed: ${err.message}` });
  }
});

// ── POST /api/fleet/:id/connect ───────────────────────────────────────────────

router.post('/:id/connect', async (req, res) => {
  try {
    const r = await fleetStore.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Router not found' });

    await sshManager.connect({ ...r, ...req.body });
    const status = sshManager.getStatus(r.id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// ── POST /api/fleet/import ────────────────────────────────────────────────────

router.post('/import', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body must be an array of router objects' });

    const created = [];
    const errors  = [];

    for (const row of rows) {
      if (!row.hostname || !row.mgmt) {
        errors.push({ row, error: 'missing hostname or mgmt' });
        continue;
      }
      const id = row.hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const router = {
        id:        row.id   || id,
        hostname:  row.hostname,
        model:     row.model     || 'Helix RT-3100',
        serial:    row.serial    || `HX-IMP-${Date.now()}`,
        routerId:  row.routerId  || row.mgmt,
        asn:       row.asn       || '65120',
        mgmt:      row.mgmt,
        sshPort:   row.port      || row.sshPort || 22,
        username:  row.username  || process.env.SSH_DEFAULT_USER || 'noc-admin',
        password:  row.password  || '',
        firmware:  row.firmware  || 'HelixOS 2.4.1',
        uptime:    row.uptime    || '00d 00:00:00',
        location:  row.location  || '—',
        role:      row.role      || 'branch',
        team:      row.team      || 'Unassigned',
        ports:     12,
        upPorts:   11,
        state:     'ok',
        stateLabel:'just imported',
        loadHint:  0.4,
      };
      try {
        const saved = await fleetStore.create(router);
        created.push(saved);
      } catch (e) {
        errors.push({ row, error: e.message });
      }
    }

    res.status(201).json({ created: created.length, errors: errors.length, errorDetails: errors, routers: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
