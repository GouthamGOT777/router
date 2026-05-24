/* global React, I, Pill */

// ============ SSH-style terminal panel ============
// Bottom drawer with a working fake-shell. Accepts commands, shows scrollback,
// supports up/down history, tab-completion stubs, and "configure terminal" mode
// where each entered line is also committed to the generated-CLI stream.
function Terminal({ open, onClose, onCommitLines, device }) {
  const host = device?.hostname || "helix-edge-01";
  const mgmt = device?.mgmt || "10.0.0.1";
  const [history, setHistory] = React.useState([
    { kind: "sys", text: `Connecting to ${mgmt} (${host}) on port 22 ...` },
    { kind: "sys", text: `Last login: Fri May 24 14:18:11 2026 from 10.0.0.99 (web-console)` },
    { kind: "sys", text: `HelixOS 2.4.1 · type 'help' for command summary, 'exit' to close` },
  ]);
  const [input, setInput] = React.useState("");
  const [cmdHistory, setCmdHistory] = React.useState([]);
  const [histIdx, setHistIdx] = React.useState(-1);
  const [mode, setMode] = React.useState("exec"); // exec | enable | config | config-if
  const [contextIf, setContextIf] = React.useState(null);
  const [height, setHeight] = React.useState(320);
  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, open]);

  const prompt = () => {
    if (mode === "exec")     return `${host}>`;
    if (mode === "enable")   return `${host}#`;
    if (mode === "config")   return `${host}(config)#`;
    if (mode === "config-if")return `${host}(config-if-${contextIf})#`;
    return `${host}>`;
  };

  const push = (lines) => {
    const arr = Array.isArray(lines) ? lines : [lines];
    setHistory((h) => [...h, ...arr]);
  };

  const submit = () => {
    const raw = input.trim();
    push({ kind: "cmd", text: `${prompt()} ${input}` });
    if (raw) setCmdHistory((c) => [raw, ...c].slice(0, 50));
    setInput("");
    setHistIdx(-1);
    if (raw) handle(raw);
  };

  function handle(cmd) {
    const parts = cmd.split(/\s+/);
    const c = parts[0];

    // exit context
    if (c === "exit" || c === "end") {
      if (mode === "config-if") { setMode("config"); return; }
      if (mode === "config")    { setMode("enable"); return; }
      if (mode === "enable")    { setMode("exec");   return; }
      push({ kind: "sys", text: "session closed (use the panel × to fully disconnect)" });
      return;
    }

    if (c === "help" || c === "?") {
      push([
        { kind: "out", text: "available commands (subset, demo):" },
        { kind: "out", text: "  show version                 device & firmware info" },
        { kind: "out", text: "  show ip route                routing table" },
        { kind: "out", text: "  show ip ospf neighbor        OSPF adjacencies" },
        { kind: "out", text: "  show ip bgp summary          BGP peers" },
        { kind: "out", text: "  show interfaces [name]       per-interface state" },
        { kind: "out", text: "  show running-config          full config" },
        { kind: "out", text: "  enable                       enter privileged mode" },
        { kind: "out", text: "  configure terminal           enter global config" },
        { kind: "out", text: "  interface <name>             enter interface config" },
        { kind: "out", text: "  ping <ip> | traceroute <ip>  reachability tests" },
        { kind: "out", text: "  write memory                 save running → startup" },
        { kind: "out", text: "  clear                        clear scrollback" },
        { kind: "out", text: "  exit | end                   leave current mode" },
      ]);
      return;
    }
    if (c === "clear") { setHistory([]); return; }
    if (c === "enable") {
      if (mode === "exec") setMode("enable");
      else push({ kind: "out", text: "% already in privileged mode" });
      return;
    }
    if (cmd.startsWith("configure")) {
      if (mode === "exec") return push({ kind: "err", text: "% Authorization failed — enter 'enable' first" });
      setMode("config");
      push({ kind: "sys", text: "Enter configuration commands, one per line. End with CNTL/Z or 'end'." });
      return;
    }
    if (c === "interface") {
      if (mode !== "config") return push({ kind: "err", text: "% Invalid in current mode — 'configure terminal' first" });
      const name = parts.slice(1).join(" ") || "";
      if (!name) return push({ kind: "err", text: "% Missing interface name (e.g. 'interface Gi0/1')" });
      setMode("config-if");
      setContextIf(name);
      return;
    }

    // config-time commands forward to commit stream
    if (mode === "config-if") {
      if (c === "shutdown" || c === "no") {
        onCommitLines && onCommitLines([`interface ${contextIf}`, `+ ${cmd}`, `exit`]);
        push({ kind: "sys", text: `[applied to ${contextIf}] ${cmd}` });
        return;
      }
      if (c === "speed" || c === "duplex" || c === "mtu" || c === "description" || c === "ip") {
        onCommitLines && onCommitLines([`interface ${contextIf}`, `+ ${cmd}`, `exit`]);
        push({ kind: "sys", text: `[applied to ${contextIf}] ${cmd}` });
        return;
      }
    }
    if (mode === "config" && (c === "hostname" || c === "router" || c === "vlan" || c === "ip" || c === "access-list")) {
      onCommitLines && onCommitLines([`+ ${cmd}`]);
      push({ kind: "sys", text: `[queued for commit] ${cmd}` });
      return;
    }

    // show commands
    if (c === "show") {
      const what = parts.slice(1).join(" ");
      const out = SHOWS[what];
      if (out) return push(out.map((t) => ({ kind: "out", text: t })));
      // try fuzzy
      const key = Object.keys(SHOWS).find((k) => k.startsWith(what));
      if (key) return push(SHOWS[key].map((t) => ({ kind: "out", text: t })));
      return push({ kind: "err", text: `% Unknown show subcommand: ${what}` });
    }
    if (c === "ping") {
      const ip = parts[1] || "10.0.0.1";
      push({ kind: "out", text: `PING ${ip}: 56 data bytes` });
      for (let i = 0; i < 5; i++) {
        push({ kind: "out", text: `64 bytes from ${ip}: icmp_seq=${i} ttl=64 time=${(0.4 + Math.random() * 1.2).toFixed(2)} ms` });
      }
      push({ kind: "out", text: `--- ${ip} ping statistics ---` });
      push({ kind: "out", text: `5 packets transmitted, 5 received, 0% packet loss` });
      return;
    }
    if (c === "traceroute") {
      const ip = parts[1] || "8.8.8.8";
      push({ kind: "out", text: `traceroute to ${ip}, 30 hops max` });
      const hops = [
        ["10.0.0.21",   "core-sw-01.corp"],
        ["198.51.100.1", "ge-1-1-0.isp-a.net"],
        ["198.51.100.17","border-1.isp-a.net"],
        ["100.64.0.5",  "agg-1.isp-a.net"],
        ["192.0.2.10",  ip],
      ];
      hops.forEach((h, i) => {
        push({ kind: "out", text: ` ${i + 1}  ${h[1]} (${h[0]})  ${(0.4 + i * 3 + Math.random()).toFixed(2)} ms  ${(0.5 + i * 3 + Math.random()).toFixed(2)} ms  ${(0.5 + i * 3 + Math.random()).toFixed(2)} ms` });
      });
      return;
    }
    if (c === "write" && parts[1] === "memory") {
      push({ kind: "sys", text: "Building configuration..." });
      setTimeout(() => push({ kind: "ok", text: "[OK] running-config saved to startup-config (4821 lines, 218 KB)" }), 350);
      return;
    }
    if (cmd === "") return;
    push({ kind: "err", text: `% Unknown command: ${cmd}  — type 'help' or '?' for a list` });
  }

  function onKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, cmdHistory.length - 1);
      if (next >= 0) { setInput(cmdHistory[next]); setHistIdx(next); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) { setInput(""); setHistIdx(-1); }
      else { setInput(cmdHistory[next]); setHistIdx(next); }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const stub = ["show running-config", "show ip route", "show ip ospf neighbor", "show ip bgp summary", "show interfaces", "show version", "configure terminal", "interface ", "ping ", "traceroute ", "write memory", "enable", "clear", "help"];
      const match = stub.find((s) => s.startsWith(input));
      if (match) setInput(match);
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      push({ kind: "sys", text: `${prompt()} ${input}^C` });
      setInput("");
      return;
    }
  }

  // resize handle
  const onDragStart = (e) => {
    const sy = e.clientY;
    const sh = height;
    const move = (ev) => setHeight(Math.max(140, Math.min(window.innerHeight - 120, sh + (sy - ev.clientY))));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!open) return null;
  return (
    <div className="ssh-panel" style={{ height }}>
      <div className="ssh-resize" onMouseDown={onDragStart}/>
      <div className="ssh-head">
        <span className="dot ok pulse"/>
        <span style={{ fontWeight: 600, fontSize: 13 }}>SSH session</span>
        <span className="mono text-xs fg-3">noc-admin@{mgmt}:22 · {mode}</span>
        <span className="spacer"/>
        <Pill kind={mode === "exec" ? "" : mode === "enable" ? "info" : "warn"}>
          {mode === "exec" ? "user" : mode === "enable" ? "privileged" : mode === "config" ? "config" : "iface-cfg"}
        </Pill>
        <button className="icon-btn" data-tip="Copy session" onClick={() => navigator.clipboard?.writeText(history.map((h) => h.text).join("\n"))}><I.copy/></button>
        <button className="icon-btn" onClick={onClose} data-tip="Disconnect"><I.x/></button>
      </div>
      <div className="ssh-body" ref={scrollRef} onClick={() => inputRef.current?.focus()}>
        {history.map((h, i) => (
          <div key={i} className={`ssh-line ${h.kind}`}>{h.text}</div>
        ))}
        <div className="ssh-inputline">
          <span className="ssh-prompt">{prompt()}</span>
          <input ref={inputRef}
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={onKeyDown}
                 spellCheck={false}
                 autoComplete="off"
                 className="ssh-input"/>
          <span className="ssh-caret"/>
        </div>
      </div>
    </div>
  );
}

const SHOWS = {
  "version": [
    "HelixOS Software, Version 2.4.1 (build 8821-rel)",
    "Copyright (c) 2026 Helix Networks. All rights reserved.",
    "",
    "ROM: Bootstrap 1.2.4",
    "helix-edge-01 uptime is 31 days, 4 hours, 52 minutes",
    "System returned to ROM by power-on",
    "System image file is \"bootflash:helix-2.4.1-8821.bin\"",
    "",
    "Helix RT-9200 (HX9200-A2) processor with 8 GB DDR4",
    "Processor board ID HX9200-A2-887-4421",
    "2 Routing Engines, 1 Forwarding card",
    "24 1GE-T + 4 10GE SFP+ interfaces",
    "256 MB Flash, 4 GB Bootflash",
    "",
    "Configuration register is 0x2102",
  ],
  "ip route": [
    "Codes: C - connected, S - static, O - OSPF, B - BGP, IA - inter-area, E2 - external 2",
    "Gateway of last resort is 198.51.100.1 to network 0.0.0.0",
    "",
    "S*    0.0.0.0/0 [1/0] via 198.51.100.1, Gi0/1",
    "C     10.0.0.0/24 is directly connected, Loopback0",
    "C     10.0.0.20/30 is directly connected, TenGigE1/0",
    "O E2  10.10.0.0/16 [110/20] via 10.0.0.21, 6d, TenGigE1/0",
    "O IA  10.20.0.0/16 [110/30] via 10.0.0.41, 2d, GigabitEthernet0/3",
    "S     172.16.0.0/12 [1/0] via 10.0.0.42, GigabitEthernet0/4",
    "B     192.0.2.0/24 [20/0] via 198.51.100.2, 14d",
    "C     198.51.100.0/30 is directly connected, GigabitEthernet0/1",
    "C     203.0.113.4/30 is directly connected, GigabitEthernet0/2",
    "S     100.64.0.0/10 is a summary, null0",
    "",
    "14,802 routes (14,795 in FIB) · last conv 2.1s",
  ],
  "ip ospf neighbor": [
    "Neighbor ID     Pri   State          Dead Time   Address         Interface",
    "10.0.0.21         1   FULL/DR        00:00:38    10.0.0.22       TenGigE1/0",
    "10.0.0.22         1   FULL/BDR       00:00:33    10.0.0.26       TenGigE1/1",
    "10.0.0.41         1   FULL/-         00:00:39    10.0.1.2        GigabitEthernet0/3",
    "10.0.0.42         1   FULL/DR        00:00:35    10.0.1.6        GigabitEthernet0/4",
  ],
  "ip bgp summary": [
    "BGP router identifier 10.0.0.1, local AS number 65120",
    "BGP table version is 748201, main routing table version 748201",
    "",
    "Neighbor        V    AS    MsgRcvd    MsgSent   TblVer   InQ OutQ  Up/Down State/PfxRcd",
    "198.51.100.2    4 64500   1842018    1721308   748201    0    0    14d02h     412308",
    "203.0.113.6     4 64600   1551209    1721308   748201    0    0    06d18h     335893",
    "10.0.0.22       4 65120     94821      94833   748201    0    0    31d04h         12",
  ],
  "interfaces": [
    "Te1/0  is up, line protocol is up    desc: core-sw-01 · 40GE        ip: 10.0.0.21/30   rx 36.4G  tx 32.1G",
    "Te1/1  is up, line protocol is up    desc: dr-site backup           ip: 10.0.0.25/30   rx  2.1G  tx  1.8G",
    "Te1/2  is administratively down                                                        rx     0  tx     0",
    "Te1/3  is up, line protocol is up    desc: peering-isp-c            ip: —              rx  4.8G  tx  3.9G",
    "Gi0/1  is up, line protocol is up    desc: uplink-isp-a             ip: 198.51.100.2/30",
    "Gi0/2  is up, line protocol is up    desc: uplink-isp-b             ip: 203.0.113.6/30",
    "Gi0/8  is down, line protocol is down (LOS, fiber)                                     errors 142",
    "... 21 more — use 'show interfaces <name>' for detail",
  ],
  "running-config": [
    "Building configuration...",
    "",
    "Current configuration : 218 KB",
    "!",
    "hostname helix-edge-01",
    "ip domain-name corp.example.net",
    "!",
    "interface Loopback0",
    " description router-id",
    " ip address 10.0.0.1 255.255.255.255",
    "!",
    "interface TenGigE1/0",
    " description \"core-sw-01 · 40GE\"",
    " ip address 10.0.0.21 255.255.255.252",
    " mtu 9214",
    " ip ospf 1 area 0.0.0.0",
    "!",
    "router ospf 1",
    " router-id 10.0.0.1",
    " auto-cost reference-bandwidth 100000",
    " log-adjacency-changes detail",
    " network 10.0.0.0 0.0.0.3 area 0.0.0.0",
    "!",
    "router bgp 65120",
    " bgp router-id 10.0.0.1",
    " neighbor 198.51.100.2 remote-as 64500",
    " neighbor 198.51.100.2 maximum-prefix 500000",
    "!",
    "end",
  ],
};

window.Terminal = Terminal;
