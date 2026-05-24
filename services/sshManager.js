'use strict';

/**
 * sshManager.js
 * ─────────────
 * SSH connection pool + execution engine.
 *
 * Features:
 *  - Persistent connection pool keyed by router ID
 *  - exec()   — run a single command, capture stdout/stderr
 *  - shell()  — attach an interactive PTY to a WebSocket
 *  - discover() — quick probe: connect, gather version/model, disconnect
 *  - Auto-timeout idle connections
 *  - Host-key verification bypass option (for lab/test environments)
 *
 * Protocol for WebSocket terminal (shell mode):
 *   Client → Server  { type:"input",  data:"<base64 bytes>" }
 *                    { type:"resize", rows:24, cols:80 }
 *   Server → Client  { type:"output", data:"<base64 bytes>" }
 *                    { type:"exit",   code:<number>        }
 *                    { type:"error",  message:"..."        }
 */

const { Client }   = require('ssh2');
const fs           = require('fs');
const path         = require('path');
const EventEmitter = require('events');

const CONNECT_TIMEOUT = parseInt(process.env.SSH_CONNECT_TIMEOUT  || '10000', 10);
const EXEC_TIMEOUT    = parseInt(process.env.SSH_EXEC_TIMEOUT     || '30000', 10);
const IDLE_TIMEOUT    = parseInt(process.env.SSH_IDLE_TIMEOUT     || '1800000', 10);
const LOG_CMDS        = process.env.LOG_SSH_COMMANDS === 'true';

const DEFAULT_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH
  ? path.resolve(process.env.SSH_PRIVATE_KEY_PATH.replace('~', require('os').homedir()))
  : null;

// ── Connection entry ──────────────────────────────────────────────────────────

class Connection extends EventEmitter {
  constructor(router, client) {
    super();
    this.router   = router;
    this.client   = client;
    this.state    = 'ready'; // ready | busy | error | closed
    this.lastUsed = Date.now();
    this._idleTimer = null;
    this._resetIdle();

    client.on('error', (err) => {
      this.state = 'error';
      this.emit('error', err);
    });
    client.on('close', () => {
      this.state = 'closed';
      clearTimeout(this._idleTimer);
      this.emit('close');
    });
    client.on('end', () => {
      this.state = 'closed';
      clearTimeout(this._idleTimer);
    });
  }

  _resetIdle() {
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.state === 'ready') {
        this.client.end();
      }
    }, IDLE_TIMEOUT);
    this._idleTimer.unref?.();
  }

  touch() {
    this.lastUsed = Date.now();
    this._resetIdle();
  }
}

// ── SSH Manager singleton ─────────────────────────────────────────────────────

class SSHManager {
  constructor() {
    this._pool = new Map(); // routerId → Connection
  }

  // ── Internal: build ssh2 connect config from router object ──────────────────

  _buildConnectConfig(router) {
    const cfg = {
      host:          router.mgmt,
      port:          router.sshPort || parseInt(process.env.SSH_DEFAULT_PORT || '22', 10),
      username:      router.username || process.env.SSH_DEFAULT_USER || 'noc-admin',
      readyTimeout:  CONNECT_TIMEOUT,
      keepaliveInterval: 30000,
      keepaliveCountMax: 5,
      // Skip strict host-key checking in lab/demo environments
      hostVerifier: () => true,
    };

    if (router.privateKey) {
      cfg.privateKey = router.privateKey;
    } else if (router.privateKeyPath) {
      try { cfg.privateKey = fs.readFileSync(path.resolve(router.privateKeyPath)); } catch {}
    } else if (DEFAULT_KEY_PATH) {
      try { cfg.privateKey = fs.readFileSync(DEFAULT_KEY_PATH); } catch {}
    }

    // Password auth (used when no key is available)
    if (!cfg.privateKey && router.password) {
      cfg.password = router.password;
    } else if (!cfg.privateKey) {
      // Last resort: try common defaults (lab / demo use-case)
      cfg.password = router.password || process.env.SSH_DEFAULT_PASS || '';
    }

    return cfg;
  }

  // ── connect ─────────────────────────────────────────────────────────────────

  connect(router) {
    const existing = this._pool.get(router.id);
    if (existing && existing.state === 'ready') {
      existing.touch();
      return Promise.resolve(existing);
    }
    // Remove stale entry
    if (existing) this._pool.delete(router.id);

    return new Promise((resolve, reject) => {
      const client = new Client();
      const cfg    = this._buildConnectConfig(router);

      client.once('ready', () => {
        const conn = new Connection(router, client);
        conn.on('close', () => this._pool.delete(router.id));
        conn.on('error', () => this._pool.delete(router.id));
        this._pool.set(router.id, conn);
        resolve(conn);
      });

      client.once('error', (err) => reject(err));

      client.connect(cfg);
    });
  }

  // ── exec — run a command, return { stdout, stderr, code } ──────────────────

  async exec(routerId, command, opts = {}) {
    const conn = this._pool.get(routerId);
    if (!conn || conn.state !== 'ready') {
      throw Object.assign(new Error(`Router ${routerId} is not connected`), { code: 'NOT_CONNECTED' });
    }
    conn.touch();
    if (LOG_CMDS) console.log(`[SSH exec] ${conn.router.hostname} $ ${command}`);

    const timeout = opts.timeout || EXEC_TIMEOUT;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('Command timed out'), { code: 'TIMEOUT' })), timeout);

      conn.client.exec(command, { pty: false }, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err); }

        let stdout = '';
        let stderr = '';

        stream.on('data',        (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });

        stream.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });
  }

  // ── shell — attach an interactive PTY to a WebSocket ───────────────────────

  async shell(routerId, ws, initialSize = { rows: 24, cols: 80 }) {
    const conn = this._pool.get(routerId);
    if (!conn || conn.state !== 'ready') {
      throw Object.assign(new Error(`Router ${routerId} is not connected`), { code: 'NOT_CONNECTED' });
    }
    conn.touch();

    return new Promise((resolve, reject) => {
      const ptyOpts = {
        term:  'xterm-256color',
        rows:  initialSize.rows,
        cols:  initialSize.cols,
      };

      conn.client.shell(ptyOpts, (err, stream) => {
        if (err) return reject(err);

        const send = (obj) => {
          if (ws.readyState === ws.constructor.OPEN) {
            try { ws.send(JSON.stringify(obj)); } catch {}
          }
        };

        // Router → WebSocket
        stream.on('data', (data) => {
          send({ type: 'output', data: Buffer.from(data).toString('base64') });
        });
        stream.stderr.on('data', (data) => {
          send({ type: 'output', data: Buffer.from(data).toString('base64') });
        });
        stream.on('close', (code) => {
          send({ type: 'exit', code: code || 0 });
          ws.close();
        });

        // WebSocket → Router
        const onMessage = (msg) => {
          try {
            const pkt = JSON.parse(msg.toString());
            if (pkt.type === 'input') {
              stream.write(Buffer.from(pkt.data, 'base64'));
            } else if (pkt.type === 'resize') {
              stream.setWindow(pkt.rows || 24, pkt.cols || 80, 0, 0);
              conn.touch();
            }
          } catch {
            // Treat raw text as direct input (for simple test clients)
            stream.write(msg);
          }
        };

        const onClose = () => {
          stream.end();
          ws.off('message', onMessage);
          ws.off('close',   onClose);
        };

        ws.on('message', onMessage);
        ws.on('close',   onClose);

        resolve(stream);
      });
    });
  }

  // ── discover — lightweight SSH probe used when adding a router ──────────────
  // Returns { model, firmware, hostname, interfaces, routingProtocols } or throws.

  async discover(router) {
    let conn;
    try {
      conn = await this.connect(router);
    } catch (err) {
      throw Object.assign(new Error(`SSH connect failed: ${err.message}`), { code: 'CONNECT_FAILED' });
    }

    const run = (cmd) => this.exec(router.id, cmd, { timeout: 12000 }).catch(() => ({ stdout: '' }));

    // Run version + brief interface probe in parallel
    const [ver, ifaces] = await Promise.all([
      run('show version'),
      run('show interfaces brief | head 40'),
    ]);

    const parsed = _parseVersion(ver.stdout);
    const ifCount = _countInterfaces(ifaces.stdout);

    // Update router state in pool router object
    conn.router = { ...conn.router, ...parsed };

    return {
      ...parsed,
      interfaceCount: ifCount.total,
      upInterfaceCount: ifCount.up,
    };
  }

  // ── disconnect ──────────────────────────────────────────────────────────────

  disconnect(routerId) {
    const conn = this._pool.get(routerId);
    if (conn) {
      try { conn.client.end(); } catch {}
      this._pool.delete(routerId);
    }
  }

  // ── getStatus ───────────────────────────────────────────────────────────────

  getStatus(routerId) {
    const conn = this._pool.get(routerId);
    if (!conn) return { connected: false, state: 'disconnected' };
    return {
      connected:  conn.state === 'ready',
      state:      conn.state,
      lastUsed:   new Date(conn.lastUsed).toISOString(),
      host:       conn.router.mgmt,
      port:       conn.router.sshPort || 22,
    };
  }

  // ── getRouterInfo — returns full cached router object including osType ───────

  getRouterInfo(routerId) {
    const conn = this._pool.get(routerId);
    return conn ? conn.router : null;
  }

  // ── getAllStatuses ───────────────────────────────────────────────────────────

  getAllStatuses() {
    const out = {};
    for (const [id, conn] of this._pool) {
      out[id] = {
        connected: conn.state === 'ready',
        state:     conn.state,
        lastUsed:  new Date(conn.lastUsed).toISOString(),
      };
    }
    return out;
  }

  // ── connectedIds ────────────────────────────────────────────────────────────

  connectedIds() {
    return [...this._pool.entries()]
      .filter(([, c]) => c.state === 'ready')
      .map(([id]) => id);
  }
}

// ── Output parsers ────────────────────────────────────────────────────────────

function _parseVersion(text) {
  if (!text) return {};
  const result = {};

  // Cisco IOS XE / IOS
  let m = text.match(/IOS.*?Software.*?Version\s+([\d\w\.\(\)]+)/i);
  if (m) { result.firmware = `IOS ${m[1]}`; result.osType = 'ios'; }

  // JunOS — "Junos: 21.2R3-S3.5" or "JUNOS 21.2R3"
  m = text.match(/Junos:\s*([^\s\[,]+)/i) || text.match(/JUNOS\s+([^\s,\[]+)/i);
  if (m) { result.firmware = `JunOS ${m[1]}`; result.osType = 'junos'; }

  // JunOS Model line: "Model: qfx5120-32c"
  m = text.match(/^Model:\s*(.+)/im);
  if (m) result.model = m[1].trim();

  // JunOS Hostname
  m = text.match(/^Hostname:\s*(.+)/im);
  if (m) result.hostname = m[1].trim();

  // HelixOS
  m = text.match(/HelixOS\s+([\d\.]+)/i);
  if (m) { result.firmware = `HelixOS ${m[1]}`; result.osType = 'helixos'; }

  // Cisco Generic Model
  if (!result.model) {
    m = text.match(/(?:Cisco|Juniper|Helix)\s+([\w-]+(?:\s+[\w-]+)?)\s+(?:router|switch|chassis|processor)/i);
    if (m) result.model = m[1].trim();
  }

  // Uptime — Cisco style
  m = text.match(/uptime is (.+)/i);
  if (m) result.uptime = m[1].trim();

  // JunOS uptime: "System booted: 2024-01-01 00:00:00 UTC (31w6d 04:52 ago)"
  if (!result.uptime) {
    m = text.match(/\((.+ago)\)/i);
    if (m) result.uptime = m[1].trim();
  }

  // Serial
  m = text.match(/(?:Processor board ID|S\/N:|Serial Number:?)\s*([\w-]+)/i);
  if (m) result.serial = m[1].trim();

  return result;
}

function _countInterfaces(text) {
  if (!text) return { total: 0, up: 0 };

  // Juniper terse format: "et-0/0/0   up   up"
  if (/^\S+\s+(up|down)\s+(up|down)/m.test(text)) {
    const skipRe = /^(lsi|pip|vtep|esi|gr-|ip-|mt-|pd-|pe-|pfe-|pfh-|dsc|gre|ipip|tap|lo|irb|esi|bme|jsrv|pime|pimd|rbeb|rcb|vme)/i;
    const lines = text.split('\n').filter((l) => {
      const m = l.match(/^(\S+)\s+(up|down)\s+(up|down)/);
      return m && !m[1].includes('.') && !skipRe.test(m[1]);
    });
    const up = lines.filter((l) => l.match(/^\S+\s+up\s+up/)).length;
    return { total: lines.length, up };
  }

  // Cisco brief format
  const lines = text.split('\n').filter((l) => /^\s*(Gi|Te|Fa|Et|xe-|ge-|fe-)/i.test(l));
  const up    = lines.filter((l) => /\bup\b/i.test(l)).length;
  return { total: lines.length, up };
}

module.exports = new SSHManager();
