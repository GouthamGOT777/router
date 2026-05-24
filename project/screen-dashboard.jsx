/* global React, I, Pill, Sparkline, AreaChart, useLiveSeries, formatNum, formatBps */

// ============ Dashboard ============
function Dashboard({ device, setRoute }) {
  const inSeries = useLiveSeries(7.5e8, 60, 0.06, 1e8);
  const outSeries = useLiveSeries(5.2e8, 60, 0.07, 8e7);
  const cpu = useLiveSeries(22, 60, 0.18, 8);
  const mem = useLiveSeries(48, 60, 0.04, 30);
  const pps = useLiveSeries(180000, 60, 0.1, 50000);
  const sessSeries = useLiveSeries(48000, 60, 0.02, 30000);
  const linkTrends = React.useMemo(() => TOP_LINKS.map((l) => {
    const arr = []; let v = l.seed;
    for (let i = 0; i < 40; i++) { v = Math.max(0, v + (Math.random() - 0.5) * 20); arr.push(v); }
    return arr;
  }), []);

  const stats = [
    { label: "Throughput in", value: formatBps(inSeries[inSeries.length - 1]), delta: "+4.2%", up: true, data: inSeries, color: "var(--chart-1)" },
    { label: "Throughput out", value: formatBps(outSeries[outSeries.length - 1]), delta: "-1.1%", up: false, data: outSeries, color: "var(--chart-2)" },
    { label: "Packets / sec", value: formatNum(pps[pps.length - 1]), delta: "+8.7%", up: true, data: pps, color: "var(--chart-3)" },
    { label: "Active sessions", value: "48,392", delta: "+212", up: true, data: sessSeries, color: "var(--chart-4)" },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub mono">{device.hostname} · {device.model} · firmware {device.firmware}</div>
        </div>
        <div className="actions">
          <button className="btn ghost"><I.download size={14}/> Export</button>
          <button className="btn"><I.refresh size={14}/> 30s auto</button>
          <button className="btn primary" onClick={() => setRoute("config")}><I.plus size={14}/> New Config</button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid cols-4 mb">
        {stats.map((s, i) => (
          <div className="card" key={i}>
            <div className="stat">
              <div className="label">{s.label}</div>
              <div className="value">{s.value}</div>
              <div className="meta">
                <span className={`delta ${s.up ? "up" : "down"}`}>{s.up ? "▲" : "▼"} {s.delta}</span>
                <span className="fg-3">· last 60m</span>
              </div>
            </div>
            <div style={{ padding: "0 8px 8px" }}>
              <Sparkline data={s.data} color={s.color} height={42} />
            </div>
          </div>
        ))}
      </div>

      {/* Traffic chart */}
      <div className="grid cols-12 mb">
        <div className="card col-8">
          <div className="card-head">
            <div className="title">Aggregate traffic</div>
            <div className="sub">last 60 minutes · 1s resolution</div>
            <div className="actions">
              <button className="btn ghost text-sm">1H</button>
              <button className="btn text-sm">6H</button>
              <button className="btn ghost text-sm">24H</button>
              <button className="btn ghost text-sm">7D</button>
            </div>
          </div>
          <div className="card-body">
            <AreaChart
              series={[
                { name: "ingress", data: inSeries, color: "var(--chart-1)" },
                { name: "egress", data: outSeries, color: "var(--chart-2)" },
              ]}
              height={240}
              yUnit="bps"
            />
          </div>
        </div>
        <div className="card col-4">
          <div className="card-head">
            <div className="title">Health</div>
            <div className="sub">live</div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <HealthBar label="CPU" value={Math.round(cpu[cpu.length - 1])} unit="%" icon={I.cpu} />
            <HealthBar label="Memory" value={Math.round(mem[mem.length - 1])} unit="%" icon={I.cpu} />
            <HealthBar label="Temperature" value={42} unit="°C" icon={I.thermo} max={80} warn={65} err={75} />
            <HealthBar label="Fan tray" value={78} unit="%" icon={I.fan} max={100} warn={90} />
            <div className="divider" />
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span className="fg-2">PSU-A</span>
              <Pill kind="ok" dot>240W · 53.1V</Pill>
            </div>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span className="fg-2">PSU-B</span>
              <Pill kind="ok" dot>238W · 53.0V</Pill>
            </div>
          </div>
        </div>
      </div>

      {/* Links row */}
      <div className="grid cols-12 mb">
        <div className="card col-7">
          <div className="card-head">
            <div className="title">Top links by utilization</div>
            <div className="sub">{(device.upPorts)} of {device.ports} active</div>
            <div className="actions"><button className="btn ghost" onClick={() => setRoute("interfaces")}>View all <I.chevron size={12}/></button></div>
          </div>
          <div className="card-body tight">
            <table className="data">
              <thead>
                <tr><th>Interface</th><th>Description</th><th>Util</th><th>Rate</th><th>Trend</th><th>State</th></tr>
              </thead>
              <tbody>
                {TOP_LINKS.map((l, i) => (
                  <tr key={l.name}>
                    <td className="mono">{l.name}</td>
                    <td className="fg-2">{l.desc}</td>
                    <td><UtilBar pct={l.util}/></td>
                    <td className="mono">{l.rate}</td>
                    <td style={{ width: 120 }}><Sparkline data={linkTrends[i]} color={l.util > 80 ? "var(--err)" : l.util > 60 ? "var(--warn)" : "var(--chart-2)"} height={28} /></td>
                    <td><Pill kind={l.state} dot>{l.stateLabel}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card col-5">
          <div className="card-head">
            <div className="title">Routing protocols</div>
            <div className="actions"><button className="btn ghost" onClick={() => setRoute("routing")}>Manage <I.chevron size={12}/></button></div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ProtoRow icon={I.ospf} name="OSPF" sub="area 0 · 4 neighbors" right={<Pill kind="ok" dot>full · adj 4/4</Pill>}/>
            <ProtoRow icon={I.bgp} name="BGP" sub="AS 65120 · 2 peers" right={<Pill kind="ok" dot>established</Pill>}/>
            <ProtoRow icon={I.routing} name="Static" sub="6 routes" right={<Pill>—</Pill>}/>
            <div className="divider" />
            <div className="kv-list">
              <div className="k">RIB entries</div><div className="v">14,802</div>
              <div className="k">FIB entries</div><div className="v">14,795</div>
              <div className="k">last conv.</div><div className="v">2.1s</div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="grid cols-12">
        <div className="card col-12">
          <div className="card-head">
            <div className="title">Recent events</div>
            <div className="sub">live · last 50</div>
            <div className="actions"><button className="btn ghost" onClick={() => setRoute("logs")}>Open Logs <I.chevron size={12}/></button></div>
          </div>
          <div className="card-body tight">
            {RECENT_EVENTS.slice(0, 6).map((e, i) => (
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
    </div>
  );
}

function HealthBar({ label, value, unit, icon: Ic, max = 100, warn = 70, err = 85 }) {
  const pct = (value / max) * 100;
  const kind = value >= err ? "err" : value >= warn ? "warn" : "ok";
  const color = `var(--${kind === "ok" ? "ok" : kind})`;
  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <Ic size={14} />
        <span className="fg-2 text-sm">{label}</span>
        <span className="spacer" />
        <span className="mono text-sm" style={{ fontWeight: 500 }}>{value}{unit}</span>
      </div>
      <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 600ms ease, background 200ms" }} />
      </div>
    </div>
  );
}

function UtilBar({ pct }) {
  const kind = pct > 80 ? "err" : pct > 60 ? "warn" : "ok";
  const color = `var(--${kind === "ok" ? "ok" : kind})`;
  return (
    <div className="row" style={{ gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span className="mono text-xs" style={{ width: 32, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function ProtoRow({ icon: Ic, name, sub, right }) {
  return (
    <div className="row" style={{ padding: "6px 0" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
        <Ic size={16}/>
      </div>
      <div>
        <div style={{ fontWeight: 500 }}>{name}</div>
        <div className="fg-3 text-xs mono">{sub}</div>
      </div>
      <div style={{ marginLeft: "auto" }}>{right}</div>
    </div>
  );
}

const TOP_LINKS = [
  { name: "Gi0/1", desc: "uplink-isp-a · 10GE", util: 78, rate: "7.8 Gbps", state: "ok", stateLabel: "up", seed: 60 },
  { name: "Gi0/2", desc: "uplink-isp-b · 10GE", util: 42, rate: "4.2 Gbps", state: "ok", stateLabel: "up", seed: 35 },
  { name: "Te1/0", desc: "core-sw-01 · 40GE", util: 91, rate: "36.4 Gbps", state: "warn", stateLabel: "up · hi-util", seed: 88 },
  { name: "Gi0/5", desc: "branch-vpn-tun01", util: 24, rate: "240 Mbps", state: "ok", stateLabel: "up", seed: 25 },
  { name: "Gi0/12", desc: "mgmt-oob", util: 3, rate: "3 Mbps", state: "ok", stateLabel: "up", seed: 8 },
  { name: "Te1/2", desc: "dr-site · 40GE backup", util: 0, rate: "0 bps", state: "warn", stateLabel: "admin-down", seed: 4 },
];

const RECENT_EVENTS = [
  { ts: "14:32:18.024", sev: "ok",   src: "ospf",      msg: "neighbor 10.0.0.21 transitioned to FULL on Gi0/1 area 0.0.0.0" },
  { ts: "14:31:55.901", sev: "info", src: "interface", msg: "Te1/0 utilization crossed 90% threshold (36.4 Gbps)" },
  { ts: "14:31:02.488", sev: "warn", src: "bgp",       msg: "peer 198.51.100.2 prefix limit approaching: 142318/150000" },
  { ts: "14:30:11.220", sev: "info", src: "auth",      msg: "user noc-admin authenticated via web (2FA)" },
  { ts: "14:28:42.110", sev: "ok",   src: "system",    msg: "config commit #4821 by noc-admin · 12 changes" },
  { ts: "14:25:09.005", sev: "err",  src: "interface", msg: "Gi0/8 line-protocol changed to down (LOS, fiber)" },
  { ts: "14:24:51.330", sev: "info", src: "dhcp",      msg: "lease assigned 192.168.20.142 to 8c:8c:aa:11:42:09" },
  { ts: "14:22:00.001", sev: "info", src: "system",    msg: "scheduled health-check completed: 0 anomalies" },
];

window.Dashboard = Dashboard;
window.RECENT_EVENTS = RECENT_EVENTS;
window.TOP_LINKS = TOP_LINKS;
