/* global React, I, Pill, RECENT_EVENTS, useLiveSeries */

// ============ Logs & Events ============
function Logs() {
  const [filter, setFilter] = React.useState("all");
  const [paused, setPaused] = React.useState(false);
  const [events, setEvents] = React.useState(() => buildLogs());
  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setEvents((evs) => [makeLog(), ...evs].slice(0, 200));
    }, 2400);
    return () => clearInterval(t);
  }, [paused]);
  const shown = events.filter((e) => filter === "all" || e.sev === filter);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Logs &amp; Events</h1>
          <div className="sub mono">live stream · syslog + audit + protocol events</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setPaused(!paused)}>
            {paused ? <><I.play size={14}/> Resume</> : <><I.pause size={14}/> Pause</>}
          </button>
          <button className="btn ghost"><I.download size={14}/> Export</button>
        </div>
      </div>

      <div className="grid cols-4 mb">
        {[
          { lbl: "info", c: events.filter(e => e.sev === "info").length, k: "info" },
          { lbl: "ok / notice", c: events.filter(e => e.sev === "ok").length, k: "ok" },
          { lbl: "warn", c: events.filter(e => e.sev === "warn").length, k: "warn" },
          { lbl: "error", c: events.filter(e => e.sev === "err").length, k: "err" },
        ].map((s) => (
          <div className="card" key={s.lbl} onClick={() => setFilter(s.k === filter ? "all" : s.k)} style={{ cursor: "pointer", borderColor: filter === s.k ? `var(--${s.k === "ok" ? "ok" : s.k})` : "" }}>
            <div className="stat">
              <div className="label">{s.lbl}</div>
              <div className="value" style={{ color: `var(--${s.k === "ok" ? "ok" : s.k})` }}>{s.c}</div>
              <div className="meta">last 5m</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="title">Event stream</div>
          <div className="sub mono">{shown.length} of {events.length} {paused && "· paused"}</div>
          <div className="actions">
            <input type="text" placeholder="grep logs..." style={{ width: 280 }}/>
          </div>
        </div>
        <div className="card-body tight" style={{ maxHeight: 540, overflow: "auto" }}>
          {shown.map((e, i) => (
            <div className="log-row" key={i}>
              <span className="ts">{e.ts}</span>
              <span className={`sev ${e.sev}`}>{e.sev.toUpperCase()}</span>
              <span className="src">{e.src}</span>
              <span className="fg-2">{e.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildLogs() {
  return [
    ...RECENT_EVENTS,
    { ts: "14:18:00.011", sev: "info", src: "system",    msg: "boot sequence complete · loaded routing engine v2.4.1 build 8821" },
    { ts: "14:14:32.881", sev: "ok",   src: "bgp",       msg: "peer 10.0.0.22 transitioned to Established · ibgp · backbone" },
    { ts: "14:09:11.402", sev: "warn", src: "interface", msg: "Gi0/12 rx CRC errors crossed threshold (14/min)" },
    { ts: "14:01:50.880", sev: "info", src: "dhcp",      msg: "pool corp-users · 142/254 leased · utilization 56%" },
    { ts: "13:58:14.221", sev: "ok",   src: "auth",      msg: "tacacs+ accounting record sent for noc-admin · cmd 'show ip route'" },
  ];
}

function makeLog() {
  const t = new Date();
  const ts = `${t.getHours().toString().padStart(2,"0")}:${t.getMinutes().toString().padStart(2,"0")}:${t.getSeconds().toString().padStart(2,"0")}.${(t.getMilliseconds()).toString().padStart(3,"0")}`;
  const samples = [
    { sev: "info", src: "interface", msg: `Gi0/${Math.ceil(Math.random()*24)} counter snapshot taken` },
    { sev: "info", src: "ospf",      msg: `LSA flooded to area 0.0.0.0 (type-1, age 0)` },
    { sev: "ok",   src: "bgp",       msg: `keepalive received from 198.51.100.2` },
    { sev: "warn", src: "interface", msg: `Te1/0 utilization 87% over 60s window` },
    { sev: "info", src: "dhcp",      msg: `lease renewed for 192.168.20.${Math.ceil(Math.random()*250)}` },
    { sev: "info", src: "auth",      msg: `web session heartbeat · noc-admin · 10.0.0.99` },
  ];
  return { ts, ...samples[Math.floor(Math.random() * samples.length)] };
}

// ============ System ============
function System({ device }) {
  const cpu = useLiveSeries(22, 60, 0.18, 8);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>System</h1>
          <div className="sub mono">{device.model} · firmware {device.firmware}</div>
        </div>
        <div className="actions">
          <button className="btn ghost"><I.upload size={14}/> Upload firmware</button>
          <button className="btn"><I.power size={14}/> Reload</button>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="card col-6">
          <div className="card-head"><div className="title">Device identity</div></div>
          <div className="card-body">
            <div className="kv-list">
              <div className="k">hostname</div><div className="v">{device.hostname}</div>
              <div className="k">model</div><div className="v">{device.model}</div>
              <div className="k">serial</div><div className="v">{device.serial}</div>
              <div className="k">router-id</div><div className="v">{device.routerId}</div>
              <div className="k">asn</div><div className="v">{device.asn}</div>
              <div className="k">mgmt-ip</div><div className="v">{device.mgmt}</div>
              <div className="k">firmware</div><div className="v">{device.firmware}</div>
              <div className="k">build</div><div className="v">2.4.1-8821-rel</div>
              <div className="k">uptime</div><div className="v">{device.uptime}</div>
              <div className="k">last reload</div><div className="v">2026-04-22 09:14 UTC · scheduled maintenance</div>
            </div>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-head"><div className="title">Users & sessions</div></div>
          <div className="card-body tight">
            <table className="data">
              <thead><tr><th>User</th><th>Role</th><th>From</th><th>Type</th><th>Since</th></tr></thead>
              <tbody>
                {[
                  ["noc-admin", "operator", "10.0.0.99", "web", "00:42"],
                  ["audit-bot", "read-only", "10.0.0.7", "ssh", "12:08"],
                  ["api-collector", "read-only", "10.0.0.11", "netconf", "5d 11h"],
                ].map((r) => (
                  <tr key={r[0]}><td>{r[0]}</td><td><Pill>{r[1]}</Pill></td><td className="mono">{r[2]}</td><td className="mono">{r[3]}</td><td className="mono">{r[4]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-head"><div className="title">Storage</div><div className="sub mono">2 volumes</div></div>
          <div className="card-body">
            <StorageRow label="bootflash:" used={2.4} total={4} fmt="GB"/>
            <div style={{ height: 10 }}/>
            <StorageRow label="usb0:" used={0} total={32} fmt="GB" empty/>
          </div>
        </div>

        <div className="card col-6">
          <div className="card-head"><div className="title">Scheduled tasks</div></div>
          <div className="card-body">
            {[
              ["02:00 daily", "config backup → tftp://10.0.0.50/backups/", "ok"],
              ["sunday 03:00", "firmware integrity check", "ok"],
              ["every 5m", "health telemetry → 10.0.0.60:514", "ok"],
              ["2026-06-01 02:00", "maintenance window · firmware upgrade", "info"],
            ].map((r, i) => (
              <div className="row" key={i} style={{ padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "" }}>
                <span className="mono text-xs fg-3" style={{ width: 140 }}>{r[0]}</span>
                <span className="text-sm">{r[1]}</span>
                <span className="spacer"/>
                <Pill kind={r[2]}>{r[2] === "ok" ? "armed" : "scheduled"}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StorageRow({ label, used, total, fmt, empty }) {
  const pct = (used / total) * 100;
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="mono">{label}</span>
        <span className="spacer"/>
        <span className="mono text-sm fg-2">{used.toFixed(1)} / {total} {fmt}{empty && " · empty"}</span>
      </div>
      <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct > 80 ? "var(--err)" : pct > 60 ? "var(--warn)" : "var(--ok)" }}/>
      </div>
    </div>
  );
}

window.Logs = Logs;
window.System = System;
