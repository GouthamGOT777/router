/* global React, I, Pill, Sparkline, AreaChart, useLiveSeries */

// ============ Routing screen ============
function Routing({ device, openWizard }) {
  const [tab, setTab] = React.useState("ospf");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Routing</h1>
          <div className="sub mono">router-id {device.routerId} · AS {device.asn}</div>
        </div>
        <div className="actions">
          <button className="btn ghost"><I.download size={14}/> Export RIB</button>
          <button className="btn primary" onClick={() => openWizard("ospf")}><I.plus size={14}/> Add protocol</button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid cols-4 mb">
        <SummaryTile icon={I.ospf} name="OSPF" state="ok" lines={[["area","0.0.0.0 (+2)"],["adj","4 / 4 full"],["lsdb","218 LSAs"]]}/>
        <SummaryTile icon={I.bgp} name="BGP" state="ok" lines={[["asn", device.asn],["peers","2 established"],["prefixes","748,201 ipv4"]]}/>
        <SummaryTile icon={I.routing} name="Static" state="ok" lines={[["routes","6 active"],["last edit","2h ago by noc-admin"],["—",""]]}/>
        <SummaryTile icon={I.globe} name="RIB / FIB" state="ok" lines={[["rib","14,802"],["fib","14,795"],["last conv","2.1s"]]}/>
      </div>

      {/* Tabs */}
      <div className="row mb" style={{ borderBottom: "1px solid var(--border)" }}>
        {[
          ["ospf", "OSPF"],
          ["bgp", "BGP"],
          ["static", "Static routes"],
          ["rib", "RIB / FIB"],
        ].map(([id, lbl]) => (
          <div key={id}
               onClick={() => setTab(id)}
               style={{
                 padding: "10px 14px",
                 cursor: "pointer",
                 borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
                 color: tab === id ? "var(--fg)" : "var(--fg-3)",
                 marginBottom: -1,
                 fontWeight: 500,
                 fontSize: 13,
               }}>{lbl}</div>
        ))}
      </div>

      {tab === "ospf" && <OspfPane openWizard={openWizard}/>}
      {tab === "bgp" && <BgpPane/>}
      {tab === "static" && <StaticPane openWizard={openWizard}/>}
      {tab === "rib" && <RibPane/>}
    </div>
  );
}

function SummaryTile({ icon: Ic, name, state, lines }) {
  return (
    <div className="card">
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row">
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "oklch(from var(--accent) l c h / 0.16)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ic size={18}/>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <Pill kind={state} dot>active</Pill>
          </div>
        </div>
        <div className="kv-list">
          {lines.map(([k, v], i) => (<React.Fragment key={i}><div className="k">{k}</div><div className="v">{v}</div></React.Fragment>))}
        </div>
      </div>
    </div>
  );
}

function OspfPane({ openWizard }) {
  return (
    <div className="grid cols-12">
      <div className="card col-7">
        <div className="card-head">
          <div className="title">Neighbors</div>
          <div className="sub mono">4 adjacencies</div>
        </div>
        <div className="card-body tight">
          <table className="data">
            <thead><tr><th>Neighbor ID</th><th>Interface</th><th>Area</th><th>State</th><th>Priority</th><th>Dead time</th></tr></thead>
            <tbody>
              {[
                ["10.0.0.21", "Te1/0", "0.0.0.0", "Full / DR", "1", "00:00:38"],
                ["10.0.0.22", "Te1/1", "0.0.0.0", "Full / BDR", "1", "00:00:33"],
                ["10.0.0.41", "Gi0/3", "0.0.0.1", "Full / —", "1", "00:00:39"],
                ["10.0.0.42", "Gi0/4", "0.0.0.1", "Full / DR", "1", "00:00:35"],
              ].map(([id, ifc, area, st, pri, dt]) => (
                <tr key={id}>
                  <td className="mono">{id}</td>
                  <td className="mono">{ifc}</td>
                  <td className="mono">{area}</td>
                  <td><Pill kind="ok" dot>{st}</Pill></td>
                  <td className="mono">{pri}</td>
                  <td className="mono">{dt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card col-5">
        <div className="card-head">
          <div className="title">Areas & interfaces</div>
          <div className="actions"><button className="btn primary" onClick={() => openWizard("ospf")}><I.plus size={14}/> Add network</button></div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { area: "0.0.0.0", type: "backbone", ifaces: ["Te1/0","Te1/1","Lo0"], cost: "auto" },
            { area: "0.0.0.1", type: "regular",  ifaces: ["Gi0/3","Gi0/4"], cost: "10" },
            { area: "0.0.0.2", type: "stub",     ifaces: ["Gi0/5"], cost: "20" },
          ].map((a) => (
            <div className="config-block" key={a.area}>
              <div className="config-block-head">
                <span className="name mono">area {a.area}</span>
                <span className="badge">[{a.type}]</span>
                <span className="spacer"/>
                <Pill>{a.ifaces.length} iface</Pill>
              </div>
              <div className="config-block-body">
                <div className="kv-list">
                  <div className="k">interfaces</div><div className="v">{a.ifaces.join(", ")}</div>
                  <div className="k">cost</div><div className="v">{a.cost}</div>
                  <div className="k">hello</div><div className="v">10s · dead 40s</div>
                  <div className="k">auth</div><div className="v">md5 (key 1)</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BgpPane() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="title">BGP peers</div>
        <div className="sub mono">2 sessions</div>
        <div className="actions"><button className="btn primary"><I.plus size={14}/> Add peer</button></div>
      </div>
      <div className="card-body tight">
        <table className="data">
          <thead><tr><th>Peer</th><th>Remote AS</th><th>State</th><th>Uptime</th><th>Pfx received</th><th>Pfx sent</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["198.51.100.2", "64500", "Established", "14d 02:11", "412,308", "186,022", "isp-a · primary transit"],
              ["203.0.113.6",  "64600", "Established", "06d 18:42", "335,893", "186,022", "isp-b · backup transit"],
              ["10.0.0.22",    "65120", "Established", "31d 04:55", "12",      "8",       "ibgp · core-router-02"],
            ].map((r) => (
              <tr key={r[0]}>
                <td className="mono">{r[0]}</td>
                <td className="mono">{r[1]}</td>
                <td><Pill kind="ok" dot>{r[2]}</Pill></td>
                <td className="mono">{r[3]}</td>
                <td className="mono">{r[4]}</td>
                <td className="mono">{r[5]}</td>
                <td className="fg-2">{r[6]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaticPane({ openWizard }) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="title">Static routes</div>
        <div className="actions"><button className="btn primary" onClick={() => openWizard("static")}><I.plus size={14}/> Add route</button></div>
      </div>
      <div className="card-body tight">
        <table className="data">
          <thead><tr><th>Destination</th><th>Next-hop</th><th>Interface</th><th>Metric</th><th>State</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["0.0.0.0/0","198.51.100.1","Gi0/1","10","ok","default · isp-a"],
              ["0.0.0.0/0","203.0.113.5","Gi0/2","20","ok","default · isp-b backup"],
              ["10.10.0.0/16","10.0.0.21","Te1/0","5","ok","corp datacenter"],
              ["172.16.0.0/12","10.0.0.42","Gi0/4","5","ok","branch network"],
              ["192.168.99.0/24","10.0.0.5","Gi0/12","100","warn","mgmt-oob (preempted)"],
              ["100.64.0.0/10","null0","—","254","ok","blackhole · cgnat"],
            ].map((r) => (
              <tr key={r[0]+r[1]}>
                <td className="mono">{r[0]}</td><td className="mono">{r[1]}</td><td className="mono">{r[2]}</td>
                <td className="mono">{r[3]}</td><td><Pill kind={r[4]} dot>{r[4] === "ok" ? "active" : "shadow"}</Pill></td>
                <td className="fg-2">{r[5]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RibPane() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="title">Routing table (RIB)</div>
        <div className="sub mono">14,802 entries · showing first 10</div>
        <div className="actions">
          <input type="text" placeholder="filter prefix (e.g. 10.0.0.0/8)" style={{ width: 280 }}/>
          <button className="btn"><I.search size={14}/> Search</button>
        </div>
      </div>
      <div className="card-body tight">
        <table className="data">
          <thead><tr><th>Prefix</th><th>Proto</th><th>Next-hop</th><th>Out int</th><th>Metric</th><th>AD</th><th>Age</th></tr></thead>
          <tbody>
            {[
              ["0.0.0.0/0","S","198.51.100.1","Gi0/1","10","1","14d"],
              ["10.0.0.0/24","C","direct","Lo0","0","0","31d"],
              ["10.0.0.20/30","C","direct","Te1/0","0","0","31d"],
              ["10.10.0.0/16","O E2","10.0.0.21","Te1/0","20","110","6d"],
              ["10.20.0.0/16","O IA","10.0.0.41","Gi0/3","30","110","2d"],
              ["172.16.0.0/12","S","10.0.0.42","Gi0/4","5","1","11d"],
              ["192.0.2.0/24","B","198.51.100.2","Gi0/1","0","20","14d"],
              ["198.51.100.0/30","C","direct","Gi0/1","0","0","31d"],
              ["203.0.113.4/30","C","direct","Gi0/2","0","0","31d"],
              ["100.64.0.0/10","S","null0","—","254","1","31d"],
            ].map((r, i) => (
              <tr key={i}>
                <td className="mono">{r[0]}</td>
                <td className="mono"><span style={{ background: "var(--bg-3)", padding: "1px 6px", borderRadius: 3 }}>{r[1]}</span></td>
                <td className="mono">{r[2]}</td><td className="mono">{r[3]}</td>
                <td className="mono">{r[4]}</td><td className="mono">{r[5]}</td><td className="mono">{r[6]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.Routing = Routing;
