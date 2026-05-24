/* global React, I, Pill, Sparkline, AreaChart, useLiveSeries, formatBps, TOP_LINKS */

// ============ Interfaces list ============
function Interfaces({ device }) {
  const [filter, setFilter] = React.useState("all");
  const [selected, setSelected] = React.useState("Te1/0");
  const interfaces = React.useMemo(() => buildIfaces(), []);
  const trends = React.useMemo(() => interfaces.map((i) => {
    const arr = []; let v = i.utilRaw * 1e6;
    for (let k = 0; k < 30; k++) { v = Math.max(0, v + (Math.random() - 0.5) * 1e7); arr.push(v); }
    return arr;
  }), [interfaces]);
  const filtered = interfaces.filter((it) => {
    if (filter === "up") return it.state === "ok";
    if (filter === "down") return it.state !== "ok";
    if (filter === "sfp") return it.media === "SFP+";
    return true;
  });
  const sel = interfaces.find((i) => i.name === selected) || interfaces[0];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Interfaces</h1>
          <div className="sub mono">{interfaces.length} ports · {interfaces.filter(i => i.state === "ok").length} up · {interfaces.filter(i => i.state !== "ok").length} down</div>
        </div>
        <div className="actions">
          <div className="row" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 2 }}>
            {[["all","All"],["up","Up"],["down","Down"],["sfp","SFP+"]].map(([id, lbl]) => (
              <button key={id} className={`btn ${filter === id ? "" : "ghost"} text-sm`}
                      style={{ border: "none", padding: "4px 10px" }}
                      onClick={() => setFilter(id)}>{lbl}</button>
            ))}
          </div>
          <button className="btn"><I.filter size={14}/> Filters</button>
          <button className="btn primary"><I.plus size={14}/> Add sub-interface</button>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="card col-7">
          <div className="card-head">
            <div className="title">All interfaces</div>
            <div className="sub mono">live</div>
          </div>
          <div className="card-body tight" style={{ maxHeight: 580, overflow: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th><th>Media</th><th>Description</th><th>State</th>
                  <th>RX / TX</th><th>Util</th><th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => (
                  <tr key={it.name}
                      onClick={() => setSelected(it.name)}
                      style={{ cursor: "pointer", background: selected === it.name ? "oklch(from var(--accent) l c h / 0.08)" : "" }}>
                    <td className="mono" style={{ fontWeight: 500 }}>{it.name}</td>
                    <td className="fg-2 text-xs">{it.media}</td>
                    <td className="fg-2">{it.desc}</td>
                    <td><Pill kind={it.state} dot>{it.stateLabel}</Pill></td>
                    <td className="mono text-xs">
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                        <span>↓ {it.rx}</span>
                        <span className="fg-3">↑ {it.tx}</span>
                      </div>
                    </td>
                    <td style={{ width: 80 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="mono text-xs">{it.util}%</span>
                      </div>
                    </td>
                    <td style={{ width: 110 }}>
                      <Sparkline data={trends[interfaces.indexOf(it)]} color={it.util > 80 ? "var(--err)" : it.util > 60 ? "var(--warn)" : "var(--chart-1)"} height={24}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card col-5" style={{ alignSelf: "flex-start", position: "sticky", top: 20 }}>
          <div className="card-head">
            <div className="title mono">{sel.name}</div>
            <div className="sub">{sel.desc}</div>
            <div className="actions">
              <button className="icon-btn" data-tip="Reset counters"><I.refresh/></button>
              <button className="icon-btn" data-tip="Shutdown"><I.power/></button>
              <button className="icon-btn" data-tip="Edit"><I.edit/></button>
            </div>
          </div>
          <div className="card-body">
            <IfaceDetail iface={sel}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function IfaceDetail({ iface }) {
  const rx = useLiveSeries((iface.utilRaw || 1) * 1e8, 60, 0.07, 1e6);
  const tx = useLiveSeries((iface.utilRaw || 1) * 0.7e8, 60, 0.08, 1e6);
  const errs = useLiveSeries(2, 60, 0.5, 0);
  const [editing, setEditing] = React.useState(false);

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KV label="STATE" value={<Pill kind={iface.state} dot>{iface.stateLabel}</Pill>}/>
        <KV label="SPEED" value={iface.speed}/>
        <KV label="VLAN" value={iface.vlan}/>
        <KV label="IP" value={iface.ip || "—"}/>
        <KV label="MAC" value={iface.mac}/>
        <KV label="MTU" value={iface.mtu}/>
      </div>

      <button className={`btn ${editing ? "primary" : ""}`} style={{ width: "100%", justifyContent: "center", marginBottom: 14 }} onClick={() => setEditing(!editing)}>
        <I.edit size={14}/> {editing ? "Close editor" : "Edit settings"}
      </button>
      {editing && <IfaceEditor iface={iface} onClose={() => setEditing(false)}/>}

      <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Throughput · 60m</div>
      <AreaChart series={[
        { name: "rx", data: rx, color: "var(--chart-1)" },
        { name: "tx", data: tx, color: "var(--chart-2)" },
      ]} height={140} yUnit="bps"/>

      <div className="text-xs fg-3 mono mb mt" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Errors · 60m</div>
      <AreaChart series={[
        { name: "errors", data: errs, color: "var(--chart-4)" },
      ]} height={80} yUnit="" showLegend={false}/>

      <div className="divider"/>

      <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Counters</div>
      <div className="kv-list">
        <div className="k">rx packets</div><div className="v">2,481,902</div>
        <div className="k">tx packets</div><div className="v">2,114,308</div>
        <div className="k">rx bytes</div><div className="v">8.42 TB</div>
        <div className="k">tx bytes</div><div className="v">6.91 TB</div>
        <div className="k">rx errors</div><div className="v">0</div>
        <div className="k">rx drops</div><div className="v">14</div>
        <div className="k">collisions</div><div className="v">0</div>
        <div className="k">last cleared</div><div className="v">never</div>
      </div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <div className="text-xs fg-3 mono" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

// ============ Iface editor (inline) ============
function IfaceEditor({ iface, onClose }) {
  // Determine available speed options by media
  const isSfp = iface.media === "SFP+";
  const speedOpts = isSfp
    ? [
        { v: "auto",        l: "auto-negotiate" },
        { v: "1000-full",   l: "1 Gb/s · full" },
        { v: "10000-full",  l: "10 Gb/s · full (default)" },
      ]
    : [
        { v: "auto",        l: "auto-negotiate (default)" },
        { v: "10-half",     l: "10 Mb/s · half" },
        { v: "10-full",     l: "10 Mb/s · full" },
        { v: "100-half",    l: "100 Mb/s · half" },
        { v: "100-full",    l: "100 Mb/s · full" },
        { v: "1000-full",   l: "1 Gb/s · full" },
      ];

  const initial = React.useMemo(() => ({
    description: iface.desc || "",
    adminUp: iface.state !== "warn",
    speed: "auto",
    mtu: iface.mtu || "1500",
    flowControl: "off",
    autoNegotiate: true,
  }), [iface.name]);

  const [form, setForm] = React.useState(initial);
  React.useEffect(() => setForm(initial), [initial]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // diff vs initial
  const dirty = Object.keys(form).some((k) => form[k] !== initial[k]);

  // generated CLI
  const cli = React.useMemo(() => {
    const lines = [`interface ${iface.name}`];
    if (form.description !== initial.description) lines.push(`+ description "${form.description}"`);
    if (form.adminUp !== initial.adminUp) lines.push(form.adminUp ? `+ no shutdown` : `+ shutdown`);
    if (form.speed !== initial.speed) {
      if (form.speed === "auto") {
        lines.push(`+ speed auto`);
        lines.push(`+ duplex auto`);
      } else {
        const [sp, dx] = form.speed.split("-");
        lines.push(`+ speed ${sp}`);
        lines.push(`+ duplex ${dx}`);
      }
    }
    if (form.mtu !== initial.mtu) lines.push(`+ mtu ${form.mtu}`);
    if (form.flowControl !== initial.flowControl) {
      lines.push(`+ flowcontrol receive ${form.flowControl}`);
      lines.push(`+ flowcontrol send ${form.flowControl}`);
    }
    if (form.autoNegotiate !== initial.autoNegotiate && !isSfp) {
      lines.push(form.autoNegotiate ? `+ no negotiation auto` : `+ negotiation auto`);
    }
    lines.push(`exit`);
    if (lines.length <= 2) return [];
    lines.push(`commit comment "edit ${iface.name}"`);
    return lines;
  }, [form, initial, iface.name, isSfp]);

  return (
    <div className="card" style={{ background: "var(--bg-2)", marginBottom: 14, borderColor: "var(--accent)" }}>
      <div className="card-body">
        <div className="field">
          <label>Description</label>
          <input type="text" value={form.description} onChange={(e) => set("description", e.target.value)}/>
        </div>

        <div className="field">
          <label>Speed &amp; duplex</label>
          <select value={form.speed} onChange={(e) => set("speed", e.target.value)}>
            {speedOpts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <div className="hint">{isSfp ? "SFP+ — speed is locked by the inserted optic. Selecting non-default forces speed mismatch detection." : "Force-set if the link partner can't auto-negotiate. Mismatch causes duplex errors."}</div>
        </div>

        <div className="grid cols-2">
          <div className="field">
            <label>MTU (bytes)</label>
            <input type="number" value={form.mtu} onChange={(e) => set("mtu", e.target.value)} min="64" max="9216"/>
          </div>
          <div className="field">
            <label>Flow control</label>
            <select value={form.flowControl} onChange={(e) => set("flowControl", e.target.value)}>
              <option value="off">off</option>
              <option value="on">on (rx + tx)</option>
              <option value="desired">desired (negotiated)</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ gap: 16, marginTop: 4, marginBottom: 12 }}>
          <label className="row" style={{ gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={form.adminUp} onChange={(e) => set("adminUp", e.target.checked)}/>
            <span>Admin up (no shutdown)</span>
          </label>
          {!isSfp && (
            <label className="row" style={{ gap: 6, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={form.autoNegotiate} onChange={(e) => set("autoNegotiate", e.target.checked)}/>
              <span>Auto-negotiate</span>
            </label>
          )}
        </div>

        {/* CLI preview */}
        <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
          <I.terminal size={12}/> generated CLI {dirty && <Pill kind="info">{cli.length} lines</Pill>}
        </div>
        <div style={{ background: "oklch(0.1 0.005 240)", color: "oklch(0.85 0.01 240)", padding: 10, borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.55, minHeight: 64 }}>
          {cli.length === 0 ? (
            <div style={{ color: "oklch(0.55 0.04 240)" }}>! no changes — modify a field above</div>
          ) : (
            cli.map((l, i) => (
              <div key={i} style={{
                color: l.startsWith("+") ? "oklch(0.78 0.16 155)" :
                       l.startsWith("!") ? "oklch(0.55 0.04 240)" : "oklch(0.85 0.01 240)"
              }}>{l}</div>
            ))
          )}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={() => setForm(initial)} disabled={!dirty}>Reset</button>
          <span className="spacer"/>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!dirty}><I.save size={14}/> Apply</button>
        </div>
      </div>
    </div>
  );
}

function buildIfaces() {
  const list = [];
  // SFP+
  ["Te1/0","Te1/1","Te1/2","Te1/3"].forEach((n, i) => {
    list.push({
      name: n, media: "SFP+", desc: ["core-sw-01 · 40GE","dr-site backup","peering-isp-c","reserved"][i],
      state: i === 2 ? "warn" : "ok", stateLabel: i === 2 ? "admin-down" : "up",
      speed: i === 2 ? "—" : "10 Gb/s", vlan: "trunk all", ip: i === 0 ? "10.0.0.1/30" : "—",
      mac: `00:1c:ab:42:fe:${i.toString(16).padStart(2,"0")}`, mtu: "9214",
      rx: i === 2 ? "0" : ["36.4 G","2.1 G","4.8 G","0"][i], tx: i === 2 ? "0" : ["32.1 G","1.8 G","3.9 G","0"][i],
      util: i === 2 ? 0 : [91, 24, 48, 0][i], utilRaw: i === 2 ? 0 : [9.1, 2.4, 4.8, 0][i],
    });
  });
  // 1GE
  for (let i = 1; i <= 24; i++) {
    const isUplink = i <= 2;
    const broken = i === 9;
    list.push({
      name: `Gi0/${i}`, media: "1GE-T",
      desc: isUplink ? `uplink-isp-${i === 1 ? "a" : "b"}` : i === 12 ? "mgmt-oob" : `access-vlan-${i < 17 ? "corp" : "guest"}`,
      state: broken ? "err" : "ok",
      stateLabel: broken ? "down · LOS" : "up",
      speed: broken ? "—" : "1 Gb/s", vlan: i < 9 ? "10" : i < 17 ? "20" : i === 24 ? "trunk" : "30",
      ip: isUplink ? `203.0.113.${i}/30` : "—",
      mac: `00:1c:ab:42:${(i+16).toString(16).padStart(2,"0")}:01`, mtu: "1500",
      rx: broken ? "0" : `${(Math.random() * 800).toFixed(0)} M`,
      tx: broken ? "0" : `${(Math.random() * 600).toFixed(0)} M`,
      util: broken ? 0 : Math.floor(Math.random() * 70 + 5),
      utilRaw: broken ? 0 : Math.random() * 6,
    });
  }
  return list;
}

window.Interfaces = Interfaces;
