'use strict';

/**
 * fleetStore.js
 * ─────────────
 * Lightweight JSON-file-backed store for router fleet data.
 * All reads and writes go through this module so the rest of the app
 * never has to touch the filesystem directly.
 *
 * Storage format: a single JSON array of router objects at FLEET_DATA_PATH.
 * On first boot the file is seeded with the default five demo routers.
 */

const path = require('path');
const fse  = require('fs-extra');

const DATA_PATH = path.resolve(
  process.env.FLEET_DATA_PATH || path.join(__dirname, '..', 'data', 'fleet.json')
);

// ── Seed data (mirrors FLEET_INITIAL in fleet.jsx) ───────────────────────────
const SEED = [
  {
    id: 'edge-01',
    hostname: 'helix-edge-01',
    model: 'Helix RT-9200',
    serial: 'HX9200-A2-887-4421',
    routerId: '10.0.0.1',
    asn: '65120',
    mgmt: '10.0.0.1',
    sshPort: 22,
    username: 'noc-admin',
    firmware: 'HelixOS 2.4.1',
    uptime: '31d 04:52:18',
    location: 'DC-EAST · rack 12U.A',
    role: 'edge',
    team: 'Datacenter East',
    ports: 28,
    upPorts: 26,
    state: 'ok',
    stateLabel: 'operational',
    loadHint: 1.0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'edge-02',
    hostname: 'helix-edge-02',
    model: 'Helix RT-9200',
    serial: 'HX9200-A2-887-4422',
    routerId: '10.0.0.2',
    asn: '65120',
    mgmt: '10.0.0.2',
    sshPort: 22,
    username: 'noc-admin',
    firmware: 'HelixOS 2.4.1',
    uptime: '31d 04:51:02',
    location: 'DC-EAST · rack 12U.B',
    role: 'edge · backup',
    team: 'Datacenter East',
    ports: 28,
    upPorts: 24,
    state: 'ok',
    stateLabel: 'operational',
    loadHint: 0.6,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'core-01',
    hostname: 'helix-core-01',
    model: 'Helix RT-9400',
    serial: 'HX9400-B1-441-0091',
    routerId: '10.0.0.10',
    asn: '65120',
    mgmt: '10.0.0.10',
    sshPort: 22,
    username: 'noc-admin',
    firmware: 'HelixOS 2.4.1',
    uptime: '62d 18:09:44',
    location: 'DC-EAST · rack 14U.A',
    role: 'core',
    team: 'Datacenter East',
    ports: 48,
    upPorts: 47,
    state: 'warn',
    stateLabel: '1 alert',
    loadHint: 1.4,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'branch-ldn',
    hostname: 'helix-branch-ldn',
    model: 'Helix RT-3100',
    serial: 'HX3100-C1-119-2284',
    routerId: '10.4.0.1',
    asn: '65120',
    mgmt: '192.168.40.1',
    sshPort: 22,
    username: 'noc-admin',
    firmware: 'HelixOS 2.3.8',
    uptime: '08d 11:22:14',
    location: 'London · cab-7',
    role: 'branch',
    team: 'EMEA Branches',
    ports: 12,
    upPorts: 11,
    state: 'ok',
    stateLabel: 'operational',
    loadHint: 0.35,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'branch-syd',
    hostname: 'helix-branch-syd',
    model: 'Helix RT-3100',
    serial: 'HX3100-C1-119-2285',
    routerId: '10.5.0.1',
    asn: '65120',
    mgmt: '192.168.50.1',
    sshPort: 22,
    username: 'noc-admin',
    firmware: 'HelixOS 2.3.6',
    uptime: '—',
    location: 'Sydney · cab-2',
    role: 'branch',
    team: 'APAC Branches',
    ports: 12,
    upPorts: 0,
    state: 'err',
    stateLabel: 'unreachable · 42m',
    loadHint: 0,
    createdAt: new Date().toISOString(),
  },
];

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache = null;

async function _load() {
  if (_cache) return _cache;
  await fse.ensureDir(path.dirname(DATA_PATH));
  const exists = await fse.pathExists(DATA_PATH);
  if (!exists) {
    await fse.writeJson(DATA_PATH, SEED, { spaces: 2 });
    _cache = SEED.map((r) => ({ ...r }));
  } else {
    _cache = await fse.readJson(DATA_PATH);
  }
  return _cache;
}

async function _save(fleet) {
  _cache = fleet;
  await fse.writeJson(DATA_PATH, fleet, { spaces: 2 });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getAll() {
  return _load();
}

async function getById(id) {
  const fleet = await _load();
  return fleet.find((r) => r.id === id) || null;
}

async function create(router) {
  const fleet = await _load();
  // Prevent duplicate IDs
  if (fleet.find((r) => r.id === router.id)) {
    router.id = `${router.id}-${Date.now()}`;
  }
  const withMeta = {
    ...router,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await _save([...fleet, withMeta]);
  return withMeta;
}

async function update(id, patch) {
  const fleet = await _load();
  const idx = fleet.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = { ...fleet[idx], ...patch, updatedAt: new Date().toISOString() };
  const next = [...fleet];
  next[idx] = updated;
  await _save(next);
  return updated;
}

async function remove(id) {
  const fleet = await _load();
  const idx = fleet.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = fleet.filter((r) => r.id !== id);
  await _save(next);
  return true;
}

async function replaceAll(fleet) {
  await _save(fleet);
  return fleet;
}

// Bust the in-memory cache (used after external writes)
function invalidate() {
  _cache = null;
}

module.exports = { getAll, getById, create, update, remove, replaceAll, invalidate };
