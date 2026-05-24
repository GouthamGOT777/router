/* global React, I, Pill, Sparkline, AreaChart, useLiveSeries, formatBps */

// ============ Chassis view ============
// Generates a 24-port + 4-SFP card layout with hardware details
function Chassis({ device, setRoute }) {
  const [selectedPort, setSelected] = React.useState(null);
  const ports = React.useMemo(() => buildPorts(), []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Chassis</h1>
          <div className="sub mono">{device.model} · S/N {device.serial} · rack 12U.A</div>
        </div>
        <div className="actions">
          <button className="btn ghost"><I.power size={14}/> Reload</button>
          <button className="btn"><I.refresh size={14}/> Diagnostics</button>
        </div>
      </div>

      {/* Chassis face */}
      <div className="card mb">
        <div className="card-head">
          <div className="title">Front panel</div>
          <div className="sub">click any port for live detail</div>
          <div className="actions">
            <div className="row" style={{ gap: 10, fontSize: 11, color: "var(--fg-3)" }}>
              <span className="row"><span className="dot ok"/> link/up</span>
              <span className="row"><span className="dot warn"/> warn/admin-down</span>
              <span className="row"><span className="dot err"/> err</span>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="chassis">
            <div className="chassis-head">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>HELIX · RT-9200</div>
                <div className="model">24×1GE / 4×10GE SFP+ · ROUTING ENGINE 2.4</div>
              </div>
              <div className="chassis-leds">
                <div className="row" style={{ gap: 12 }}>
                  {[
                    ["SYS", true], ["RPS", true], ["TEMP", true], ["FAN", true], ["BOOT", false],
                  ].map(([t, on]) => (
                    <div className="chassis-led" key={t}>
                      <div className={`l ${on ? "" : "off"}`}></div>
                      <div className="t">{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 24x1GE — two rows of 12 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="port-grid">
                {ports.copper.slice(0, 12).map((p) => (
                  <Port key={p.name} p={p} selected={selectedPort === p.name} onClick={() => setSelected(p.name)} />
                ))}
              </div>
              <div className="port-grid">
                {ports.copper.slice(12).map((p) => (
                  <Port key={p.name} p={p} selected={selectedPort === p.name} onClick={() => setSelected(p.name)} />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
              <div style={{ flex: "0 0 auto", fontSize: 10, color: "oklch(0.7 0.01 240)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
                10GE SFP+
              </div>
              <div className="port-grid sfp" style={{ flex: 1, maxWidth: 360 }}>
                {ports.sfp.map((p) => (
                  <Port key={p.name} p={p} sfp selected={selectedPort === p.name} onClick={() => setSelected(p.name)} />
                ))}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 24, height: 24, border: "1px solid oklch(0.4 0.01 240)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(0.8 0.01 240)" }}>
                  <I.terminal size={12}/>
                </div>
                <div style={{ fontSize: 9, color: "oklch(0.7 0.01 240)", fontFamily: "var(--font-mono)" }}>CONSOLE<br/>RJ-45</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel + hardware */}
      <div className="grid cols-12">
        <div className="card col-7">
          <div className="card-head">
            <div className="title">{selectedPort ? `Port ${selectedPort}` : "Select a port"}</div>
            {selectedPort && <div className="sub">live interface metrics</div>}
            {selectedPort && (
              <div className="actions">
                <button className="btn ghost" onClick={() => setRoute("interfaces")}>Open interface <I.chevron size={12}/></button>
                <button className="btn"><I.edit size={14}/> Edit</button>
              </div>
            )}
          </div>
          <div className="card-body">
            {selectedPort ? <PortDetail port={[...ports.copper, ...ports.sfp].find((p) => p.name === selectedPort)} /> : <PortHint />}
          </div>
        </div>

        <div className="card col-5">
          <div className="card-head">
            <div className="title">Hardware modules</div>
            <div className="sub">slots & inventory</div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {HARDWARE.map((h) => (
              <div key={h.slot} className="config-block">
                <div className="config-block-head">
                  <span style={{ width: 30, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>{h.slot}</span>
                  <span className="name">{h.name}</span>
                  <span className="spacer" />
                  <Pill kind={h.state} dot>{h.stateLabel}</Pill>
                </div>
                <div className="config-block-body">
                  <div className="kv-list">
                    <div className="k">part-no</div><div className="v">{h.part}</div>
                    <div className="k">serial</div><div className="v">{h.serial}</div>
                    <div className="k">rev</div><div className="v">{h.rev}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Port({ p, selected, onClick, sfp }) {
  return (
    <div className={`port ${sfp ? "sfp" : ""} ${selected ? "selected" : ""}`}
         onClick={onClick}
         data-tip={`${p.name} · ${p.state}`}>
      <div className={`led ${p.state}`} />
      <div className="jack" />
      <div className="num">{p.num}</div>
    </div>
  );
}

function PortHint() {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--fg-3)" }}>
      <I.ports size={40} />
      <div style={{ marginTop: 12 }}>Click any port on the front panel to see live PHY, optic and counter data.</div>
    </div>
  );
}

function PortDetail({ port }) {
  const rx = useLiveSeries(port.util > 50 ? 8e8 : 1e8, 60, 0.08, 1e5);
  const tx = useLiveSeries(port.util > 50 ? 6e8 : 8e7, 60, 0.09, 1e5);
  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <KV label="STATE" value={<Pill kind={port.state} dot>{port.state}</Pill>}/>
        <KV label="SPEED" value={port.speed}/>
        <KV label="DUPLEX" value={port.duplex}/>
        <KV label="MAC" value={port.mac}/>
        <KV label="MTU" value="1500"/>
        <KV label="VLAN" value={port.vlan}/>
      </div>
      <div className="grid cols-2">
        <div>
          <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Throughput</div>
          <AreaChart
            series={[
              { name: "rx", data: rx, color: "var(--chart-1)" },
              { name: "tx", data: tx, color: "var(--chart-2)" },
            ]}
            height={140}
            yUnit="bps"
          />
        </div>
        <div>
          <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Counters</div>
          <div className="kv-list">
            <div className="k">rx packets</div><div className="v">2,481,902</div>
            <div className="k">tx packets</div><div className="v">2,114,308</div>
            <div className="k">rx errors</div><div className="v" style={{ color: port.errs ? "var(--err)" : "" }}>{port.errs || 0}</div>
            <div className="k">crc errors</div><div className="v">0</div>
            <div className="k">collisions</div><div className="v">0</div>
            <div className="k">last flap</div><div className="v">3d 14h ago</div>
          </div>
          {port.optic && (
            <>
              <div className="divider"/>
              <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Optic (DOM)</div>
              <div className="kv-list">
                <div className="k">model</div><div className="v">{port.optic.model}</div>
                <div className="k">wavelength</div><div className="v">{port.optic.wave}</div>
                <div className="k">tx power</div><div className="v">{port.optic.tx}</div>
                <div className="k">rx power</div><div className="v">{port.optic.rx}</div>
                <div className="k">temp</div><div className="v">{port.optic.temp}</div>
              </div>
            </>
          )}
        </div>
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

function buildPorts() {
  const states = ["ok","ok","ok","ok","ok","ok","warn","ok","err","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok","ok"];
  const copper = states.map((s, i) => ({
    name: `Gi0/${i + 1}`, num: i + 1, state: s,
    speed: s === "err" ? "—" : "1000 Mb/s",
    duplex: s === "err" ? "—" : "full",
    mac: `00:1c:ab:42:${(i + 16).toString(16).padStart(2, "0")}:01`,
    vlan: i < 8 ? "10 (svc)" : i < 16 ? "20 (corp)" : "trunk (10,20,30)",
    util: s === "ok" ? Math.floor(Math.random() * 70 + 5) : s === "warn" ? 92 : 0,
    errs: s === "err" ? 142 : 0,
  }));
  const sfpStates = ["ok","ok","warn","ok"];
  const sfp = sfpStates.map((s, i) => ({
    name: `Te1/${i}`, num: `Te1/${i}`, state: s,
    speed: s === "warn" ? "admin-down" : "10 Gb/s",
    duplex: "full",
    mac: `00:1c:ab:42:fe:${i.toString(16).padStart(2, "0")}`,
    vlan: "trunk (all)",
    util: s === "ok" ? 78 - i * 12 : 0,
    optic: { model: "10GBASE-LR SFP+", wave: "1310 nm", tx: "-2.4 dBm", rx: "-4.1 dBm", temp: "42.3 °C" },
  }));
  return { copper, sfp };
}

const HARDWARE = [
  { slot: "RE-0", name: "Routing Engine v2.4", state: "ok", stateLabel: "active", part: "HX-RE-2400", serial: "RE2400-1A4B7C", rev: "B2" },
  { slot: "RE-1", name: "Routing Engine v2.4", state: "ok", stateLabel: "standby", part: "HX-RE-2400", serial: "RE2400-1A4B7D", rev: "B2" },
  { slot: "FPC-0", name: "24-port 1GE + 4×10GE SFP+", state: "ok", stateLabel: "online", part: "HX-FPC-24G4X", serial: "FPC-9921-882A", rev: "A1" },
  { slot: "PSU-A", name: "AC Power 750W", state: "ok", stateLabel: "240W draw", part: "HX-PWR-750AC", serial: "PWR-A-3318", rev: "C1" },
  { slot: "PSU-B", name: "AC Power 750W", state: "ok", stateLabel: "238W draw", part: "HX-PWR-750AC", serial: "PWR-B-3319", rev: "C1" },
  { slot: "FAN-0", name: "Fan tray (4×40mm)", state: "ok", stateLabel: "78% / 5200rpm", part: "HX-FAN-4X40", serial: "FAN-77-2241", rev: "A2" },
];

window.Chassis = Chassis;
