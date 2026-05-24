'use strict';

/**
 * metricsCollector.js
 * ───────────────────
 * Polls connected routers via SSH, parses show-command output into structured
 * metrics, caches them, and fans them out to subscribed WebSocket clients.
 *
 * Metric categories:
 *   • system       — CPU, memory, temperature, uptime, PSU
 *   • interfaces   — state, speed, rx/tx counters, errors, utilisation
 *   • routing      — OSPF neighbours, BGP peers, RIB size, static routes
 *   • logs         — recent syslog entries
 *
 * Usage:
 *   metricsCollector.subscribe(routerId, wsClient)
 *   metricsCollector.unsubscribe(routerId, wsClient)
 *   metricsCollector.getSnapshot(routerId)    → cached JSON or null
 *   metricsCollector.pollNow(router)          → force refresh
 */

const sshManager = require('./sshManager');

const POLL_INTERVAL = parseInt(process.env.METRICS_POLL_INTERVAL || '15000', 10);
const CACHE_TTL     = parseInt(process.env.METRICS_CACHE_TTL     || '30000', 10);

// ── State ─────────────────────────────────────────────────────────────────────

// routerId → { snapshot, fetchedAt, polling:bool }
const _cache       = new Map();
// routerId → Set<WebSocket>
const _subscribers = new Map();
// routerId → NodeJS.Timeout
const _timers      = new Map();

// ── Subscribe / unsubscribe ───────────────────────────────────────────────────

function subscribe(routerId, ws) {
  if (!_subscribers.has(routerId)) _subscribers.set(routerId, new Set());
  _subscribers.get(routerId).add(ws);

  // Send cached snapshot immediately if fresh enough
  const cached = _cache.get(routerId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    _send(ws, { type: 'metrics', routerId, ...cached.snapshot });
  }

  // Start background polling for this router if not already running
  _ensurePolling(routerId);
}

function unsubscribe(routerId, ws) {
  const subs = _subscribers.get(routerId);
  if (!subs) return;
  subs.delete(ws);
  if (subs.size === 0) {
    _subscribers.delete(routerId);
    _stopPolling(routerId);
  }
}

// ── Public: force-refresh snapshot ───────────────────────────────────────────

async function pollNow(router) {
  try {
    const snap = await _collectAll(router);
    _cache.set(router.id, { snapshot: snap, fetchedAt: Date.now() });
    _broadcast(router.id, { type: 'metrics', routerId: router.id, ...snap });
    return snap;
  } catch (err) {
    _broadcast(router.id, { type: 'metrics_error', routerId: router.id, message: err.message });
    return null;
  }
}

function getSnapshot(routerId) {
  const cached = _cache.get(routerId);
  return cached ? cached.snapshot : null;
}

// ── Internal: polling timer management ───────────────────────────────────────

function _ensurePolling(routerId) {
  if (_timers.has(routerId)) return;
  const timer = setInterval(async () => {
    const subs = _subscribers.get(routerId);
    if (!subs || subs.size === 0) { _stopPolling(routerId); return; }
    // We need the router object — try to get it from sshManager or cache
    const status = sshManager.getStatus(routerId);
    if (!status.connected) return; // Skip if not connected
    // Reconstruct minimal router object from pool status
    const router = { id: routerId, mgmt: status.host, sshPort: status.port };
    try {
      const snap = await _collectAll(router);
      _cache.set(routerId, { snapshot: snap, fetchedAt: Date.now() });
      _broadcast(routerId, { type: 'metrics', routerId, ...snap });
    } catch (err) {
      _broadcast(routerId, { type: 'metrics_error', routerId, message: err.message });
    }
  }, POLL_INTERVAL);
  timer.unref?.();
  _timers.set(routerId, timer);
}

function _stopPolling(routerId) {
  const t = _timers.get(routerId);
  if (t) { clearInterval(t); _timers.delete(routerId); }
}

// ── Internal: collect all metrics for one router ─────────────────────────────

async function _collectAll(router) {
  const run = (cmd, timeout = 15000) =>
    sshManager.exec(router.id, cmd, { timeout }).then((r) => r.stdout).catch(() => '');

  const [versionOut, ifacesOut, cpuOut, memOut, ospfOut, bgpOut, routeOut, logsOut] =
    await Promise.all([
      run('show version'),
      run('show interfaces'),
      run('show processes cpu sorted | head 5'),
      run('show processes memory sorted | head 5'),
      run('show ip ospf neighbor'),
      run('show ip bgp summary'),
      run('show ip route summary'),
      run('show logging | tail 30'),
    ]);

  return {
    collectedAt:  new Date().toISOString(),
    system:       parseSystem(versionOut, cpuOut, memOut),
    interfaces:   parseInterfaces(ifacesOut),
    ospf:         parseOspfNeighbors(ospfOut),
    bgp:          parseBgpSummary(bgpOut),
    routing:      parseRouteSummary(routeOut),
    logs:         parseLogs(logsOut),
  };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseSystem(versionText, cpuText, memText) {
  const sys = {};

  // Uptime
  let m = versionText.match(/uptime is (.+)/i);
  if (m) sys.uptime = m[1].trim();

  // Model / image
  m = versionText.match(/(?:Cisco|Juniper|Helix)\s+([\w-]+(?:\s+[\w-]+)?)\s+(?:router|switch)/i);
  if (m) sys.model = m[1].trim();

  m = versionText.match(/System image file is "(.+)"/i);
  if (m) sys.image = m[1];

  // CPU utilization (Cisco IOS format)
  m = cpuText.match(/CPU utilization.*?five seconds:\s*(\d+)%.*?one minute:\s*(\d+)%.*?five minutes:\s*(\d+)%/i);
  if (m) {
    sys.cpu5s  = parseInt(m[1], 10);
    sys.cpu1m  = parseInt(m[2], 10);
    sys.cpu5m  = parseInt(m[3], 10);
  }

  // Memory (Cisco IOS: Processor Pool Total/Used)
  m = memText.match(/Processor\s+(\d+)\s+(\d+)\s+(\d+)/i);
  if (m) {
    const total = parseInt(m[1], 10);
    const used  = parseInt(m[2], 10);
    sys.memTotal   = total;
    sys.memUsed    = used;
    sys.memFreePct = Math.round(((total - used) / total) * 100);
  }

  return sys;
}

function parseInterfaces(text) {
  if (!text) return [];
  const ifaces = [];
  const blocks = text.split(/(?=^\S)/m);

  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0];
    if (!header.trim()) continue;

    // Match "GigabitEthernet0/1 is up, line protocol is up"
    let m = header.match(/^(\S+)\s+is\s+(up|down|administratively down).*?line protocol is\s+(up|down)/i);
    if (!m) continue;

    const iface = {
      name:         m[1],
      adminState:   m[2].toLowerCase(),
      lineProtocol: m[3].toLowerCase(),
      state:        m[3].toLowerCase() === 'up' ? 'ok' : m[2].toLowerCase().includes('admin') ? 'warn' : 'err',
    };

    // Description
    let dm = block.match(/Description:\s*(.+)/i);
    if (dm) iface.description = dm[1].trim();

    // IP address
    dm = block.match(/Internet (?:address|Address) is\s*([\d\.\/]+)/i);
    if (dm) iface.ip = dm[1];

    // MAC
    dm = block.match(/address is\s*([\da-f:\.]{11,17})/i);
    if (dm) iface.mac = dm[1];

    // MTU
    dm = block.match(/MTU\s+(\d+)/i);
    if (dm) iface.mtu = parseInt(dm[1], 10);

    // Bandwidth
    dm = block.match(/BW\s+(\d+)\s+Kbit/i);
    if (dm) iface.bandwidthKbps = parseInt(dm[1], 10);

    // 5-minute rates
    dm = block.match(/5 minute input rate\s+(\d+)\s+bits.*?(\d+)\s+packets/i);
    if (dm) { iface.rxBps = parseInt(dm[1], 10); iface.rxPps = parseInt(dm[2], 10); }
    dm = block.match(/5 minute output rate\s+(\d+)\s+bits.*?(\d+)\s+packets/i);
    if (dm) { iface.txBps = parseInt(dm[1], 10); iface.txPps = parseInt(dm[2], 10); }

    // Counters
    dm = block.match(/(\d+) input errors/i);
    if (dm) iface.inputErrors = parseInt(dm[1], 10);
    dm = block.match(/(\d+) output errors/i);
    if (dm) iface.outputErrors = parseInt(dm[1], 10);
    dm = block.match(/(\d+) CRC/i);
    if (dm) iface.crcErrors = parseInt(dm[1], 10);

    // Utilisation estimate (against bandwidth)
    if (iface.bandwidthKbps && iface.rxBps) {
      iface.rxUtilPct = Math.round((iface.rxBps / (iface.bandwidthKbps * 1000)) * 100);
    }

    ifaces.push(iface);
  }

  return ifaces;
}

function parseOspfNeighbors(text) {
  if (!text) return [];
  const neighbors = [];
  const re = /^([\d\.]+)\s+(\d+)\s+(\S+)\s+([\d:]+)\s+([\d\.]+)\s+(\S+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    neighbors.push({
      neighborId:  m[1],
      priority:    parseInt(m[2], 10),
      state:       m[3],
      deadTime:    m[4],
      address:     m[5],
      interface:   m[6],
      ok:          m[3].toLowerCase().startsWith('full'),
    });
  }
  return neighbors;
}

function parseBgpSummary(text) {
  if (!text) return { peers: [] };
  const result = { peers: [] };

  let m = text.match(/BGP router identifier\s+([\d\.]+),\s+local AS number\s+(\d+)/i);
  if (m) { result.routerId = m[1]; result.localAs = parseInt(m[2], 10); }

  m = text.match(/BGP table version is\s+(\d+)/i);
  if (m) result.tableVersion = parseInt(m[1], 10);

  // Peer table rows: "198.51.100.2    4 64500   1842018    1721308 ..."
  const re = /^([\d\.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)/gm;
  let pm;
  while ((pm = re.exec(text)) !== null) {
    const state = pm[10];
    const pfx   = parseInt(pm[10], 10);
    result.peers.push({
      neighbor:     pm[1],
      version:      parseInt(pm[2], 10),
      remoteAs:     parseInt(pm[3], 10),
      msgRcvd:      parseInt(pm[4], 10),
      msgSent:      parseInt(pm[5], 10),
      tableVersion: parseInt(pm[6], 10),
      upDown:       pm[9],
      stateOrPfx:   state,
      prefixes:     isNaN(pfx) ? 0 : pfx,
      established:  !isNaN(pfx),
    });
  }

  return result;
}

function parseRouteSummary(text) {
  if (!text) return {};
  const summary = {};
  const re = /^(\S+)\s+(\d+)\s+(\d+)/gm;
  let total = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const source = m[1];
    const nets   = parseInt(m[2], 10);
    const subs   = parseInt(m[3], 10);
    if (source === 'Total') { total = nets + subs; break; }
    summary[source] = nets + subs;
  }
  summary.total = total;
  return summary;
}

function parseLogs(text) {
  if (!text) return [];
  const lines = text.split('\n').filter(Boolean);
  const events = [];
  const re = /^(?:\*|%|[A-Z][a-z]+)\s+(\w+\s+\d+\s+[\d:]+).*?%([A-Z_]+)-(\d)-([A-Z_]+):\s*(.*)/;
  for (const line of lines.slice(-30)) {
    const m = line.match(re);
    if (m) {
      const severity = parseInt(m[3], 10);
      events.push({
        ts:       m[1].trim(),
        facility: m[2],
        level:    severity,
        mnemonic: m[4],
        msg:      m[5].trim(),
        sev:      severity <= 3 ? 'err' : severity <= 4 ? 'warn' : severity <= 6 ? 'info' : 'ok',
      });
    } else if (line.trim().length > 10) {
      events.push({
        ts:  '',
        msg: line.trim(),
        sev: 'info',
      });
    }
  }
  return events.slice(-20);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _send(ws, obj) {
  if (ws.readyState === ws.constructor.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

function _broadcast(routerId, obj) {
  const subs = _subscribers.get(routerId);
  if (!subs) return;
  const dead = [];
  for (const ws of subs) {
    if (ws.readyState !== ws.constructor.OPEN) { dead.push(ws); continue; }
    _send(ws, obj);
  }
  dead.forEach((ws) => subs.delete(ws));
}

module.exports = {
  subscribe,
  unsubscribe,
  pollNow,
  getSnapshot,
  // Export parsers for testing
  parseSystem,
  parseInterfaces,
  parseOspfNeighbors,
  parseBgpSummary,
  parseRouteSummary,
  parseLogs,
};
