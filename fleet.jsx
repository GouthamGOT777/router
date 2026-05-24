/* global React, I, Pill */

// ============ Fleet of routers ============
// Each router carries its own metrics base so screens get distinct live data
// when you switch. Some are intentionally degraded (warn / err) to show how
// the UI reacts.

const FLEET_INITIAL = [
  {
    id: "edge-01",
    hostname: "helix-edge-01",
    model: "Helix RT-9200",
    serial: "HX9200-A2-887-4421",
    routerId: "10.0.0.1",
    asn: "65120",
    mgmt: "10.0.0.1",
    firmware: "HelixOS 2.4.1",
    uptime: "31d 04:52:18",
    location: "DC-EAST · rack 12U.A",
    role: "edge",
    team: "Datacenter East",
    ports: 28, upPorts: 26,
    state: "ok", stateLabel: "operational",
    loadHint: 1.0,
  },
  {
    id: "edge-02",
    hostname: "helix-edge-02",
    model: "Helix RT-9200",
    serial: "HX9200-A2-887-4422",
    routerId: "10.0.0.2",
    asn: "65120",
    mgmt: "10.0.0.2",
    firmware: "HelixOS 2.4.1",
    uptime: "31d 04:51:02",
    location: "DC-EAST · rack 12U.B",
    role: "edge · backup",
    team: "Datacenter East",
    ports: 28, upPorts: 24,
    state: "ok", stateLabel: "operational",
    loadHint: 0.6,
  },
  {
    id: "core-01",
    hostname: "helix-core-01",
    model: "Helix RT-9400",
    serial: "HX9400-B1-441-0091",
    routerId: "10.0.0.10",
    asn: "65120",
    mgmt: "10.0.0.10",
    firmware: "HelixOS 2.4.1",
    uptime: "62d 18:09:44",
    location: "DC-EAST · rack 14U.A",
    role: "core",
    team: "Datacenter East",
    ports: 48, upPorts: 47,
    state: "warn", stateLabel: "1 alert",
    loadHint: 1.4,
  },
  {
    id: "branch-ldn",
    hostname: "helix-branch-ldn",
    model: "Helix RT-3100",
    serial: "HX3100-C1-119-2284",
    routerId: "10.4.0.1",
    asn: "65120",
    mgmt: "192.168.40.1",
    firmware: "HelixOS 2.3.8",
    uptime: "08d 11:22:14",
    location: "London · cab-7",
    role: "branch",
    team: "EMEA Branches",
    ports: 12, upPorts: 11,
    state: "ok", stateLabel: "operational",
    loadHint: 0.35,
  },
  {
    id: "branch-syd",
    hostname: "helix-branch-syd",
    model: "Helix RT-3100",
    serial: "HX3100-C1-119-2285",
    routerId: "10.5.0.1",
    asn: "65120",
    mgmt: "192.168.50.1",
    firmware: "HelixOS 2.3.6",
    uptime: "—",
    location: "Sydney · cab-2",
    role: "branch",
    team: "APAC Branches",
    ports: 12, upPorts: 0,
    state: "err", stateLabel: "unreachable · 42m",
    loadHint: 0,
  },
];

const TEAM_LIST = ["Datacenter East", "EMEA Branches", "APAC Branches", "Edge / ISP", "Lab & Test"];

// ============ JSON localStorage persistence ============
// All fleet data is stored as JSON in localStorage under the key "helix_fleet".
// This replaces any database dependency — the browser's localStorage acts as
// a lightweight JSON store that persists across page reloads.

const STORAGE_KEY = "helix_fleet";

function loadFleetFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveFleetToStorage(fleet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
  } catch {
    // localStorage unavailable or quota exceeded — silently ignore
  }
}

function exportFleetJson(fleet) {
  const blob = new Blob([JSON.stringify(fleet, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "helix-fleet.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ CSV helpers (export / parse) ============
const CSV_HEADERS = ["hostname", "mgmt", "port", "role", "team", "location", "username"];
const CSV_TEMPLATE = [
  CSV_HEADERS.join(","),
  "helix-branch-tok,192.168.60.1,22,branch,APAC Branches,Tokyo · cab-1,noc-admin",
  "helix-edge-par,10.0.3.1,22,edge,EMEA Branches,Paris · cab-3,noc-admin",
  "helix-lab-01,10.99.0.1,22,branch,Lab & Test,Lab rack-3,noc-admin",
].join("\n");

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "helix-routers-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
}

function parseCsvLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function rowToRouter(row, idx) {
  if (!row.hostname || !row.mgmt) return null;
  const id = (row.hostname || `imported-${idx}`).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id,
    hostname: row.hostname,
    model: "Helix RT-3100",
    serial: `HX-IMP-${1000 + idx}`,
    routerId: row.mgmt,
    asn: "65120",
    mgmt: row.mgmt,
    firmware: "HelixOS 2.4.1",
    uptime: "00d 00:00:18",
    location: row.location || "—",
    role: row.role || "branch",
    team: row.team || "Lab & Test",
    ports: 12, upPorts: 11,
    state: "ok", stateLabel: "just imported",
    loadHint: 0.4,
  };
}

// ============ Device picker (in sidebar) ============
function DevicePicker({ devices, currentId, onSelect, onAdd, dense }) {
  const [open, setOpen] = React.useState(false);
  const current = devices.find((d) => d.id === currentId) || devices[0];

  if (dense) {
    return (
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div data-tip={current.hostname}
             style={{ width: 40, height: 40, borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", margin: "0 auto" }}>
          <span className={`dot ${current.state} pulse`}/>
        </div>
      </div>
    );
  }

  return (
    <div className="device-picker">
      <div className="device-picker-current" onClick={() => setOpen(!open)}>
        <span className={`dot ${current.state} pulse`}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current.hostname}</div>
          <div className="text-xs fg-3 mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current.model} · {current.mgmt}</div>
        </div>
        <I.chevronDown size={14} style={{ color: "var(--fg-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }}/>
      </div>
      {open && (
        <div className="device-list">
          <div className="device-list-head">
            <span className="text-xs fg-3 mono" style={{ textTransform: "uppercase", letterSpacing: "0.07em" }}>fleet · {devices.length}</span>
            <span className="spacer"/>
            <button className="btn ghost text-xs" onClick={() => { setOpen(false); onAdd(); }}>
              <I.plus size={12}/> Add
            </button>
          </div>
          {devices.map((d) => (
            <div key={d.id}
                 className={`device-list-item ${d.id === currentId ? "active" : ""}`}
                 onClick={() => { onSelect(d.id); setOpen(false); }}>
              <span className={`dot ${d.state} ${d.state === "ok" ? "pulse" : ""}`}/>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="text-sm" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.hostname}</div>
                <div className="text-xs fg-3 mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.role} · {d.mgmt}</div>
              </div>
              {d.id === currentId && <I.check size={14} style={{ color: "var(--accent)" }}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Add-router modal ============
function AddRouterModal({ onClose, onAdd, onAddMany, initialTab = "single" }) {
  const [tab, setTab] = React.useState(initialTab); // single | bulk
  const [form, setForm] = React.useState({
    hostname: "helix-new-01",
    mgmt: "10.0.0.",
    port: 22,
    username: "noc-admin",
    password: "",
    role: "branch",
    team: TEAM_LIST[0],
    location: "",
    autoDiscover: true,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [phase, setPhase] = React.useState("form"); // form | discovering | done
  const [log, setLog] = React.useState([]);

  const startDiscover = () => {
    setPhase("discovering");
    setLog([]);
    const steps = [
      ["info", `> attempting tcp connect to ${form.mgmt}:${form.port}`, 400],
      ["ok",   `< tcp handshake established`, 380],
      ["info", `> ssh kex · curve25519-sha256 · ed25519 host key`, 360],
      ["ok",   `< host key fingerprint SHA256:${Math.random().toString(36).slice(2, 14)}...`, 300],
      ["info", `> authenticating as ${form.username}`, 320],
      ["ok",   `< authenticated (publickey)`, 280],
      ["info", `> netconf <get> · /system/identification`, 360],
      ["ok",   `< model: Helix RT-3100 · firmware: HelixOS 2.4.1`, 300],
      ["info", `> probing interfaces, routing protocols, hardware modules`, 420],
      ["ok",   `< 12 interfaces, 1 OSPF process, 0 BGP peers, 1 FPC`, 300],
      ["ok",   `< discovery complete — device added to fleet`, 300],
    ];
    let i = 0;
    const tick = () => {
      if (i >= steps.length) {
        setPhase("done");
        return;
      }
      const [sev, msg, delay] = steps[i++];
      setLog((l) => [...l, { sev, msg }]);
      setTimeout(tick, delay);
    };
    setTimeout(tick, 300);
  };

  const commit = () => {
    const newDev = {
      id: form.hostname.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      hostname: form.hostname,
      model: "Helix RT-3100",
      serial: `HX3100-NEW-${Math.floor(Math.random() * 9000 + 1000)}`,
      routerId: form.mgmt,
      asn: "65120",
      mgmt: form.mgmt,
      firmware: "HelixOS 2.4.1",
      uptime: "00d 00:00:18",
      location: form.location || "—",
      role: form.role,
      team: form.team,
      ports: 12, upPorts: 11,
      state: "ok", stateLabel: "just added",
      loadHint: 0.4,
    };
    onAdd(newDev);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 720 }}>
        <div className="modal-head">
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "oklch(from var(--accent) l c h / 0.16)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <I.plus/>
          </div>
          <div>
            <div className="title">Add router(s) to fleet</div>
            <div className="text-xs fg-3 mono">discover & onboard one device or import many</div>
          </div>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose}><I.x/></button>
        </div>

        {phase === "form" && (
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
            <TabBtn id="single" tab={tab} setTab={setTab} label="Single device"/>
            <TabBtn id="bulk" tab={tab} setTab={setTab} label="Bulk import · CSV/XLSX"/>
          </div>
        )}

        <div className="modal-body">
          {phase === "form" && tab === "single" && (
            <>
              <div className="grid cols-2">
                <div className="field">
                  <label>Hostname</label>
                  <input type="text" value={form.hostname} onChange={(e) => set("hostname", e.target.value)}/>
                </div>
                <div className="field">
                  <label>Management IP</label>
                  <input type="text" value={form.mgmt} onChange={(e) => set("mgmt", e.target.value)} placeholder="10.0.0.5"/>
                </div>
                <div className="field">
                  <label>SSH port</label>
                  <input type="number" value={form.port} onChange={(e) => set("port", +e.target.value)}/>
                </div>
                <div className="field">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => set("role", e.target.value)}>
                    <option value="edge">edge</option>
                    <option value="core">core</option>
                    <option value="branch">branch</option>
                    <option value="aggregation">aggregation</option>
                  </select>
                </div>
                <div className="field">
                  <label>Team</label>
                  <select value={form.team} onChange={(e) => set("team", e.target.value)}>
                    {TEAM_LIST.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Location (optional)</label>
                  <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Paris · cab-3"/>
                </div>
                <div className="field">
                  <label>Username</label>
                  <input type="text" value={form.username} onChange={(e) => set("username", e.target.value)}/>
                </div>
                <div className="field">
                  <label>Password / key</label>
                  <input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••"/>
                </div>
              </div>
              <div className="row" style={{ gap: 6, fontSize: 12 }}>
                <input id="autodisc" type="checkbox" checked={form.autoDiscover} onChange={(e) => set("autoDiscover", e.target.checked)} style={{ width: "auto" }}/>
                <label htmlFor="autodisc" style={{ cursor: "pointer" }}>Auto-discover model, interfaces & routing protocols after connect</label>
              </div>
            </>
          )}
          {phase === "form" && tab === "bulk" && (
            <BulkImport onAddMany={(rows) => { onAddMany && onAddMany(rows); onClose(); }}/>
          )}
          {(phase === "discovering" || phase === "done") && (
            <div style={{ background: "oklch(0.1 0.005 240)", borderRadius: "var(--radius)", padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6, minHeight: 280, maxHeight: 380, overflow: "auto" }}>
              <div style={{ color: "oklch(0.65 0.04 240)", marginBottom: 6 }}>! discovering {form.hostname} at {form.mgmt}:{form.port}</div>
              {log.map((l, i) => (
                <div key={i} style={{
                  color: l.sev === "ok" ? "oklch(0.82 0.16 145)" : l.sev === "err" ? "oklch(0.78 0.18 25)" : "oklch(0.85 0.01 240)"
                }}>{l.msg}</div>
              ))}
              {phase === "discovering" && <div style={{ color: "var(--accent)" }}>▌</div>}
              {phase === "done" && (
                <div style={{ marginTop: 12, color: "oklch(0.82 0.16 145)", display: "flex", alignItems: "center", gap: 6 }}>
                  <I.check size={14}/> ready to add to fleet
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {phase === "form" && tab === "single" && <button className="btn ghost" onClick={onClose}>Cancel</button>}
          <div className="right">
            {phase === "form" && tab === "single" && <button className="btn primary" onClick={startDiscover}><I.refresh size={14}/> Connect & discover</button>}
            {phase === "discovering" && <button className="btn" disabled>Discovering...</button>}
            {phase === "done" && <button className="btn primary" onClick={commit}><I.plus size={14}/> Add to fleet</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ id, tab, setTab, label }) {
  const active = tab === id;
  return (
    <div onClick={() => setTab(id)}
         style={{
           padding: "10px 14px",
           cursor: "pointer",
           borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
           color: active ? "var(--fg)" : "var(--fg-3)",
           marginBottom: -1,
           fontWeight: 500,
           fontSize: 13,
         }}>{label}</div>
  );
}

// ============ Bulk import (CSV / XLSX) ============
function BulkImport({ onAddMany }) {
  const [rows, setRows] = React.useState([]);
  const [error, setError] = React.useState("");
  const [filename, setFilename] = React.useState("");
  const fileRef = React.useRef(null);

  const onFile = async (e) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    try {
      let text;
      if (/\.csv$/i.test(file.name)) {
        text = await file.text();
        const parsed = parseCsv(text);
        setRows(parsed);
      } else if (/\.xlsx?$/i.test(file.name)) {
        if (typeof window.XLSX === "undefined") {
          setError("XLSX support is loading… try again in a second, or use CSV.");
          return;
        }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = window.XLSX.utils.sheet_to_csv(ws);
        setRows(parseCsv(csv));
      } else {
        setError("Unsupported file type. Use .csv, .xls or .xlsx.");
      }
    } catch (err) {
      setError(`Parse failed: ${err.message}`);
    }
  };

  const valid = rows.filter((r) => r.hostname && r.mgmt);
  const invalid = rows.length - valid.length;

  const commit = () => {
    const built = valid.map((r, i) => rowToRouter(r, i)).filter(Boolean);
    onAddMany(built);
  };

  return (
    <div>
      <div className="row mb" style={{ gap: 8 }}>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <I.upload size={14}/> Choose CSV or XLSX file
        </button>
        <button className="btn ghost" onClick={downloadCsvTemplate}>
          <I.download size={14}/> Download template
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" onChange={onFile} style={{ display: "none" }}/>
        {filename && <span className="mono text-xs fg-3" style={{ marginLeft: 8 }}>{filename}</span>}
      </div>

      <div className="card mb" style={{ background: "var(--bg-2)" }}>
        <div className="card-body" style={{ padding: "10px 14px" }}>
          <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Expected columns</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {["hostname", "mgmt", "port", "role", "team", "location", "username"].map((c) => (
              <span key={c} className="mono text-xs" style={{ background: "var(--bg-3)", padding: "2px 8px", borderRadius: 4 }}>{c}</span>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Required: <strong>hostname</strong>, <strong>mgmt</strong>. Others are optional. First row must contain headers.
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--err)", background: "oklch(from var(--err) l c h / 0.1)", border: "1px solid oklch(from var(--err) l c h / 0.3)", padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="row mb" style={{ gap: 8 }}>
            <Pill kind="ok">{valid.length} valid</Pill>
            {invalid > 0 && <Pill kind="warn">{invalid} skipped (missing hostname/mgmt)</Pill>}
            <Pill kind="info">{new Set(valid.map((r) => r.team || "—")).size} teams</Pill>
          </div>
          <div className="card" style={{ maxHeight: 280, overflow: "auto" }}>
            <table className="data">
              <thead><tr><th>Hostname</th><th>Mgmt IP</th><th>Role</th><th>Team</th><th>Location</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const ok = r.hostname && r.mgmt;
                  return (
                    <tr key={i} style={{ opacity: ok ? 1 : 0.5 }}>
                      <td className="mono">{r.hostname || "—"}</td>
                      <td className="mono">{r.mgmt || "—"}</td>
                      <td className="mono">{r.role || "branch"}</td>
                      <td className="mono">{r.team || "—"}</td>
                      <td className="fg-2">{r.location || "—"}</td>
                      <td>{ok ? <Pill kind="ok" dot>ok</Pill> : <Pill kind="warn">skip</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 14, justifyContent: "flex-end", gap: 8 }}>
            <button className="btn ghost" onClick={() => { setRows([]); setFilename(""); }}>Reset</button>
            <button className="btn primary" onClick={commit} disabled={valid.length === 0}>
              <I.plus size={14}/> Import {valid.length} routers
            </button>
          </div>
        </>
      )}
    </div>
  );
}

window.FLEET_INITIAL = FLEET_INITIAL;
window.TEAM_LIST = TEAM_LIST;
window.DevicePicker = DevicePicker;
window.AddRouterModal = AddRouterModal;
window.downloadCsvTemplate = downloadCsvTemplate;
window.parseCsv = parseCsv;
window.rowToRouter = rowToRouter;
window.loadFleetFromStorage = loadFleetFromStorage;
window.saveFleetToStorage = saveFleetToStorage;
window.exportFleetJson = exportFleetJson;
