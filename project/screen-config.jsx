/* global React, I, Pill, useLiveSeries */

// ============ Configuration view ============
function Config({ openWizard, generatedCli }) {
  const [open, setOpen] = React.useState({ system: true, interfaces: false, ospf: true, bgp: false, vlans: false, acl: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Configuration</h1>
          <div className="sub mono">running-config · last commit 14:28 by noc-admin</div>
        </div>
        <div className="actions">
          <Pill kind="info" dot>1 uncommitted change</Pill>
          <button className="btn ghost"><I.download size={14}/> Export</button>
          <button className="btn"><I.copy size={14}/> Diff vs startup</button>
          <button className="btn primary" onClick={() => openWizard("ospf")}><I.plus size={14}/> Add configuration</button>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="col-8">
          {/* System */}
          <ConfigBlock id="system" title="system" badge="global" open={open.system} onToggle={() => toggle("system")}>
            <div className="kv-list">
              <div className="k">hostname</div><div className="v">helix-edge-01</div>
              <div className="k">domain-name</div><div className="v">corp.example.net</div>
              <div className="k">timezone</div><div className="v">UTC</div>
              <div className="k">ntp servers</div><div className="v">time1.corp.example.net, time2.corp.example.net</div>
              <div className="k">dns</div><div className="v">10.0.0.53, 10.0.0.54</div>
              <div className="k">aaa</div><div className="v">tacacs+ (10.0.0.10, 10.0.0.11)</div>
              <div className="k">snmp</div><div className="v">v3 · view ALL · group READONLY</div>
            </div>
          </ConfigBlock>

          {/* Interfaces */}
          <ConfigBlock id="interfaces" title="interfaces" badge="28 configured" open={open.interfaces} onToggle={() => toggle("interfaces")}>
            {[
              { n: "Lo0", desc: "router-id", ip: "10.0.0.1/32" },
              { n: "Te1/0", desc: "core-sw-01 · 40GE", ip: "10.0.0.21/30", trunk: "all" },
              { n: "Te1/1", desc: "dr-site backup", ip: "10.0.0.25/30", trunk: "all" },
              { n: "Gi0/1", desc: "uplink-isp-a", ip: "198.51.100.2/30", mtu: 1500 },
              { n: "Gi0/2", desc: "uplink-isp-b", ip: "203.0.113.6/30", mtu: 1500 },
            ].map((i) => (
              <div className="config-block" key={i.n} style={{ marginBottom: 6 }}>
                <div className="config-block-head" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  <span className="name mono">interface {i.n}</span>
                  <span className="badge">{i.desc}</span>
                  <span className="spacer"/>
                  <button className="icon-btn" data-tip="Edit"><I.edit size={14}/></button>
                </div>
                <div className="config-block-body">
                  <div className="kv-list">
                    <div className="k">description</div><div className="v">"{i.desc}"</div>
                    <div className="k">ip address</div><div className="v">{i.ip}</div>
                    {i.trunk && <><div className="k">switchport mode</div><div className="v">trunk · allowed {i.trunk}</div></>}
                    {i.mtu && <><div className="k">mtu</div><div className="v">{i.mtu}</div></>}
                  </div>
                </div>
              </div>
            ))}
          </ConfigBlock>

          {/* OSPF */}
          <ConfigBlock id="ospf" title="router ospf 1" badge="proto · just modified" open={open.ospf} onToggle={() => toggle("ospf")} dirty>
            <div className="kv-list">
              <div className="k">router-id</div><div className="v">10.0.0.1</div>
              <div className="k">reference-bw</div><div className="v">100000</div>
              <div className="k">log-adj-changes</div><div className="v">detail</div>
            </div>
            <div className="divider"/>
            <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>networks · areas</div>
            {[
              ["network 10.0.0.0/30", "area 0.0.0.0", "Te1/0, Te1/1"],
              ["network 10.0.1.0/30", "area 0.0.0.1", "Gi0/3, Gi0/4"],
              ["network 10.0.2.0/30", "area 0.0.0.2 stub", "Gi0/5"],
            ].map((r) => (
              <div className="row mono text-sm" key={r[0]} style={{ padding: "5px 0", borderBottom: "1px dashed var(--border)" }}>
                <span>{r[0]}</span>
                <span className="fg-3">→</span>
                <span style={{ color: "var(--accent)" }}>{r[1]}</span>
                <span className="spacer"/>
                <span className="fg-3 text-xs">on {r[2]}</span>
              </div>
            ))}
          </ConfigBlock>

          {/* BGP */}
          <ConfigBlock id="bgp" title="router bgp 65120" badge="proto" open={open.bgp} onToggle={() => toggle("bgp")}>
            <div className="kv-list">
              <div className="k">router-id</div><div className="v">10.0.0.1</div>
              <div className="k">log-neighbor-changes</div><div className="v">yes</div>
              <div className="k">graceful-restart</div><div className="v">enabled · 120s</div>
            </div>
            <div className="divider"/>
            <div className="text-xs fg-3 mono mb" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>neighbors</div>
            <div className="kv-list">
              <div className="k">198.51.100.2</div><div className="v">remote-as 64500 · pwd ****** · max-pfx 500k</div>
              <div className="k">203.0.113.6</div><div className="v">remote-as 64600 · pwd ****** · max-pfx 500k</div>
            </div>
          </ConfigBlock>

          {/* VLANs */}
          <ConfigBlock id="vlans" title="vlans" badge="6" open={open.vlans} onToggle={() => toggle("vlans")}>
            <table className="data" style={{ marginTop: -14, marginLeft: -14, marginRight: -14, width: "calc(100% + 28px)" }}>
              <thead><tr><th>ID</th><th>Name</th><th>Mode</th><th>Members</th></tr></thead>
              <tbody>
                {[
                  ["10","svc-mgmt","access","Gi0/1-8"],
                  ["20","corp-users","access","Gi0/9-16"],
                  ["30","guest","access","Gi0/17-23"],
                  ["40","voice","tag","trunk all"],
                  ["100","transit-core","trunk","Te1/0-3"],
                  ["999","native","—","trunks"],
                ].map((r) => (
                  <tr key={r[0]}><td className="mono">{r[0]}</td><td>{r[1]}</td><td className="mono">{r[2]}</td><td className="mono fg-2">{r[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </ConfigBlock>

          {/* ACL */}
          <ConfigBlock id="acl" title="access-lists" badge="4" open={open.acl} onToggle={() => toggle("acl")}>
            <div className="text-xs fg-2 mono">→ MGMT-IN, INTERNET-IN, BGP-IN-ISP-A, BGP-OUT-ISP-A</div>
          </ConfigBlock>
        </div>

        <div className="col-4">
          <div className="card" style={{ position: "sticky", top: 20 }}>
            <div className="card-head">
              <div className="title">CLI preview</div>
              <div className="sub mono">live render</div>
              <div className="actions"><button className="icon-btn" data-tip="Copy"><I.copy/></button></div>
            </div>
            <div style={{ background: "oklch(0.1 0.005 240)", color: "oklch(0.85 0.01 240)", padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55, maxHeight: 560, overflow: "auto" }}>
              {generatedCli.length > 0 ? generatedCli.map((l, i) => (
                <div key={i} style={{ color: l.startsWith("!") ? "oklch(0.6 0.04 240)" : l.startsWith("+") ? "oklch(0.78 0.16 155)" : "" }}>{l}</div>
              )) : (
                <>
                  <div style={{ color: "oklch(0.6 0.04 240)" }}>! running-config snapshot</div>
                  <div>hostname helix-edge-01</div>
                  <div>!</div>
                  <div>interface Loopback0</div>
                  <div> description router-id</div>
                  <div> ip address 10.0.0.1 255.255.255.255</div>
                  <div>!</div>
                  <div>interface TenGigE1/0</div>
                  <div> description "core-sw-01 · 40GE"</div>
                  <div> ip address 10.0.0.21 255.255.255.252</div>
                  <div> mtu 9214</div>
                  <div>!</div>
                  <div>router ospf 1</div>
                  <div> router-id 10.0.0.1</div>
                  <div> auto-cost reference-bandwidth 100000</div>
                  <div> log-adjacency-changes detail</div>
                  <div> network 10.0.0.0 0.0.0.3 area 0.0.0.0</div>
                  <div> network 10.0.1.0 0.0.0.3 area 0.0.0.1</div>
                  <div> network 10.0.2.0 0.0.0.3 area 0.0.0.2</div>
                  <div> area 0.0.0.2 stub</div>
                  <div>!</div>
                  <div>router bgp 65120</div>
                  <div> bgp router-id 10.0.0.1</div>
                  <div> neighbor 198.51.100.2 remote-as 64500</div>
                  <div> neighbor 198.51.100.2 password 7 ******</div>
                  <div> neighbor 198.51.100.2 maximum-prefix 500000</div>
                  <div>!</div>
                  <div style={{ color: "oklch(0.6 0.04 240)" }}>! end</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigBlock({ title, badge, children, open, onToggle, dirty }) {
  return (
    <div className="config-block">
      <div className="config-block-head" onClick={onToggle}>
        <I.chevron size={14} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms", color: "var(--fg-3)" }}/>
        <span className="name mono">{title}</span>
        <span className="badge">[{badge}]</span>
        <span className="spacer"/>
        {dirty && <Pill kind="info">modified</Pill>}
        <button className="icon-btn" data-tip="Edit" onClick={(e) => e.stopPropagation()}><I.edit size={14}/></button>
      </div>
      {open && <div className="config-block-body">{children}</div>}
    </div>
  );
}

window.Config = Config;
