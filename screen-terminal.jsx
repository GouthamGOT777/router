/* global React, I, Pill */

// ============ SSH Terminal panel ============
// Attempts a real WebSocket SSH connection to the backend (ws://<host>/ws/terminal/:id).
// Falls back to the built-in simulation mode if the backend is unreachable.

function Terminal({ open, onClose, onCommitLines, device }) {
  const host    = device?.hostname || "helix-edge-01";
  const mgmt    = device?.mgmt     || "10.0.0.1";
  const routerId = device?.id      || host;

  // ── state ──────────────────────────────────────────────────────────────────
  const [history, setHistory]     = React.useState([]);
  const [input, setInput]         = React.useState("");
  const [cmdHistory, setCmdHist]  = React.useState([]);
  const [histIdx, setHistIdx]     = React.useState(-1);
  const [mode, setMode]           = React.useState("exec");
  const [contextIf, setContextIf] = React.useState(null);
  const [height, setHeight]       = React.useState(320);
  // real-WS mode
  const [wsReady, setWsReady]     = React.useState(false); // true = live SSH
  const [wsConnecting, setWsConn] = React.useState(false);
  const wsRef                     = React.useRef(null);

  const scrollRef = React.useRef(null);
  const inputRef  = React.useRef(null);

  // ── scroll + focus ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, open]);

  // ── init on open ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    setHistory([
      { kind: "sys", text: `Connecting to ${mgmt} (${host}) on port 22 …` },
    ]);
    setMode("exec");
    setInput("");
    setWsReady(false);
    setWsConn(true);

    // Try real WebSocket backend
    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal/${encodeURIComponent(routerId)}`;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
    } catch {
      fallbackToSim();
      return;
    }

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        fallbackToSim();
      }
    }, 4000);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      setWsConn(false);
      setWsReady(true);
      push({ kind: "sys", text: `Connected · live SSH session · type normally` });
    };

    ws.onmessage = (ev) => {
      try {
        const pkt = JSON.parse(ev.data);
        if (pkt.type === "output") {
          const text = atob(pkt.data);
          // Strip ANSI escape codes for simple text display
          const clean = text.replace(/\x1b\[[0-9;]*[mGKHJA-Z]/g, "").replace(/\r/g, "");
          const lines = clean.split("\n");
          setHistory((h) => [
            ...h,
            ...lines.filter((l) => l.length > 0).map((l) => ({ kind: "out", text: l })),
          ]);
        } else if (pkt.type === "exit") {
          push({ kind: "sys", text: `Session ended (exit code ${pkt.code})` });
          setWsReady(false);
        } else if (pkt.type === "error") {
          push({ kind: "err", text: `Error: ${pkt.message}` });
          setWsReady(false);
        }
      } catch {}
    };

    ws.onerror = () => {
      clearTimeout(connectTimeout);
      fallbackToSim();
    };

    ws.onclose = (ev) => {
      clearTimeout(connectTimeout);
      if (wsRef.current === ws) {
        setWsReady(false);
        if (ev.code !== 1000 && ev.code !== 1001) {
          push({ kind: "sys", text: `Connection closed (${ev.code})` });
        }
      }
    };

    return () => {
      clearTimeout(connectTimeout);
      wsRef.current = null;
      ws.close(1001, "panel closed");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function fallbackToSim() {
    setWsConn(false);
    setWsReady(false);
    setHistory([
      { kind: "sys", text: `Connecting to ${mgmt} (${host}) on port 22 …` },
      { kind: "sys", text: `Last login: Fri May 24 14:18:11 2026 from 10.0.0.99 (web-console)` },
      { kind: "sys", text: `HelixOS 2.4.1 · simulation mode · backend not reachable` },
      { kind: "sys", text: `type 'help' for command summary, 'exit' to close` },
    ]);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  const push = (lines) => {
    const arr = Array.isArray(lines) ? lines : [lines];
    setHistory((h) => [...h, ...arr]);
  };

  const prompt = () => {
    if (mode === "exec")      return `${host}>`;
    if (mode === "enable")    return `${host}#`;
    if (mode === "config")    return `${host}(config)#`;
    if (mode === "config-if") return `${host}(config-if-${contextIf})#`;
    return `${host}>`;
  };

  // ── submit input ───────────────────────────────────────────────────────────
  const submit = () => {
    const raw = input.trim();
    if (wsReady && wsRef.current?.readyState === WebSocket.OPEN) {
      // Live mode: send raw keystrokes + Enter to the remote shell
      const ws = wsRef.current;
      ws.send(JSON.stringify({ type: "input", data: btoa(input + "\n") }));
      setCmdHist((c) => raw ? [raw, ...c].slice(0, 50) : c);
      setInput("");
      setHistIdx(-1);
      return;
    }

    // Simulation mode
    push({ kind: "cmd", text: `${prompt()} ${input}` });
    if (raw) setCmdHist((c) => [raw, ...c].slice(0, 50));
    setInput("");
    setHistIdx(-1);
    if (raw) handleSim(raw);
  };

  // ── keyboard ───────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }

    if (wsReady && wsRef.current?.readyState === WebSocket.OPEN) {
      // In live mode, pass special keys directly
      const ws = wsRef.current;
      const specials = {
        ArrowUp:    "\x1b[A",
        ArrowDown:  "\x1b[B",
        ArrowRight: "\x1b[C",
        ArrowLeft:  "\x1b[D",
        Backspace:  "\x7f",
        Tab:        "\t",
        Escape:     "\x1b",
      };
      if (specials[e.key]) {
        e.preventDefault();
        ws.send(JSON.stringify({ type: "input", data: btoa(specials[e.key]) }));
        if (e.key === "Backspace") setInput((v) => v.slice(0, -1));
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        ws.send(JSON.stringify({ type: "input", data: btoa("\x03") }));
        setInput("");
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        ws.send(JSON.stringify({ type: "input", data: btoa("\x04") }));
        return;
      }
      // Let the onChange on the input field handle printable chars
      return;
    }

    // Simulation key handling
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
      const stubs = ["show running-config","show ip route","show ip ospf neighbor","show ip bgp summary","show interfaces","show version","configure terminal","interface ","ping ","traceroute ","write memory","enable","clear","help"];
      const match = stubs.find((s) => s.startsWith(input));
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

  // ── simulation command handler ─────────────────────────────────────────────
  function handleSim(cmd) {
    const parts = cmd.split(/\s+/);
    const c = parts[0];

    if (c === "exit" || c === "end") {
      if (mode === "config-if") { setMode("config"); return; }
      if (mode === "config")    { setMode("enable"); return; }
      if (mode === "enable")    { setMode("exec");   return; }
      push({ kind: "sys", text: "session closed (use the panel × to fully disconnect)" });
      return;
    }
    if (c === "help" || c === "?") {
      push([
        { kind: "out", text: "available commands (simulation):" },
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
    if (mode === "config-if" && ["shutdown","no","speed","duplex","mtu","description","ip"].includes(c)) {
      onCommitLines?.([`interface ${contextIf}`, `+ ${cmd}`, `exit`]);
      push({ kind: "sys", text: `[applied to ${contextIf}] ${cmd}` });
      return;
    }
    if (mode === "config" && ["hostname","router","vlan","ip","access-list"].includes(c)) {
      onCommitLines?.([`+ ${cmd}`]);
      push({ kind: "sys", text: `[queued for commit] ${cmd}` });
      return;
    }
    if (c === "show") {
      const what = parts.slice(1).join(" ");
      const out  = SHOWS[what] || SHOWS[Object.keys(SHOWS).find((k) => k.startsWith(what)) || ""];
      if (out) return push(out.map((t) => ({ kind: "out", text: t })));
      return push({ kind: "err", text: `% Unknown show subcommand: ${what}` });
    }
    if (c === "ping") {
      const ip = parts[1] || "10.0.0.1";
      push({ kind: "out", text: `PING ${ip}: 56 data bytes` });
      for (let i = 0; i < 5; i++)
        push({ kind: "out", text: `64 bytes from ${ip}: icmp_seq=${i} ttl=64 time=${(0.4+Math.random()*1.2).toFixed(2)} ms` });
      push({ kind: "out", text: `--- ${ip} ping statistics --- 5 packets, 0% loss` });
      return;
    }
    if (c === "traceroute") {
      const ip = parts[1] || "8.8.8.8";
      push({ kind: "out", text: `traceroute to ${ip}, 30 hops max` });
      [["10.0.0.21","core-sw-01"],["198.51.100.1","border-isp-a"],["192.0.2.10",ip]].forEach((h,i) =>
        push({ kind: "out", text: ` ${i+1}  ${h[1]} (${h[0]})  ${(0.4+i*3+Math.random()).toFixed(2)} ms` })
      );
      return;
    }
    if (c === "write" && parts[1] === "memory") {
      push({ kind: "sys", text: "Building configuration..." });
      setTimeout(() => push({ kind: "ok", text: "[OK] running-config saved to startup-config" }), 350);
      return;
    }
    if (cmd === "") return;
    push({ kind: "err", text: `% Unknown command: ${cmd}  — type 'help' or '?'` });
  }

  // ── resize handle ─────────────────────────────────────────────────────────
  const onDragStart = (e) => {
    const sy = e.clientY, sh = height;
    const move = (ev) => setHeight(Math.max(140, Math.min(window.innerHeight-120, sh+(sy-ev.clientY))));
    const up = () => { window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!open) return null;

  const modeLabel = wsReady ? "live" : wsConnecting ? "connecting…" : "simulation";
  const modeKind  = wsReady ? "ok" : wsConnecting ? "info" : "warn";

  return (
    <div className="ssh-panel" style={{ height }}>
      <div className="ssh-resize" onMouseDown={onDragStart}/>
      <div className="ssh-head">
        <span className={`dot ${wsReady ? "ok pulse" : wsConnecting ? "info" : "warn"}`}/>
        <span style={{ fontWeight: 600, fontSize: 13 }}>SSH session</span>
        <span className="mono text-xs fg-3">noc-admin@{mgmt}:22</span>
        <span className="spacer"/>
        <Pill kind={modeKind}>{modeLabel}</Pill>
        {!wsReady && !wsConnecting && (
          <Pill kind="">{mode === "exec" ? "user" : mode === "enable" ? "privileged" : mode.includes("if") ? "iface-cfg" : "config"}</Pill>
        )}
        <button className="icon-btn" data-tip="Copy session"
          onClick={() => navigator.clipboard?.writeText(history.map((h) => h.text).join("\n"))}>
          <I.copy/>
        </button>
        <button className="icon-btn" onClick={onClose} data-tip="Disconnect"><I.x/></button>
      </div>
      <div className="ssh-body" ref={scrollRef} onClick={() => inputRef.current?.focus()}>
        {history.map((h, i) => (
          <div key={i} className={`ssh-line ${h.kind}`}>{h.text}</div>
        ))}
        <div className="ssh-inputline">
          {!wsReady && <span className="ssh-prompt">{prompt()}</span>}
          <input ref={inputRef}
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={onKeyDown}
                 spellCheck={false}
                 autoComplete="off"
                 className="ssh-input"
                 placeholder={wsConnecting ? "connecting…" : ""}
                 disabled={wsConnecting}/>
          <span className="ssh-caret"/>
        </div>
      </div>
    </div>
  );
}

// ── Simulation show-command data ───────────────────────────────────────────────

const SHOWS = {
  "version": [
    "HelixOS Software, Version 2.4.1 (build 8821-rel)",
    "Copyright (c) 2026 Helix Networks. All rights reserved.",
    "",
    "helix-edge-01 uptime is 31 days, 4 hours, 52 minutes",
    "System image file is \"bootflash:helix-2.4.1-8821.bin\"",
    "",
    "Helix RT-9200 (HX9200-A2) processor with 8 GB DDR4",
    "Processor board ID HX9200-A2-887-4421",
    "24 1GE-T + 4 10GE SFP+ interfaces",
  ],
  "ip route": [
    "S*    0.0.0.0/0 [1/0] via 198.51.100.1, Gi0/1",
    "C     10.0.0.0/24 is directly connected, Loopback0",
    "O E2  10.10.0.0/16 [110/20] via 10.0.0.21, 6d, TenGigE1/0",
    "B     192.0.2.0/24 [20/0] via 198.51.100.2, 14d",
    "C     198.51.100.0/30 is directly connected, GigabitEthernet0/1",
    "",
    "14,802 routes (14,795 in FIB)",
  ],
  "ip ospf neighbor": [
    "Neighbor ID     Pri   State          Dead Time   Address         Interface",
    "10.0.0.21         1   FULL/DR        00:00:38    10.0.0.22       TenGigE1/0",
    "10.0.0.22         1   FULL/BDR       00:00:33    10.0.0.26       TenGigE1/1",
    "10.0.0.41         1   FULL/-         00:00:39    10.0.1.2        GigabitEthernet0/3",
  ],
  "ip bgp summary": [
    "BGP router identifier 10.0.0.1, local AS number 65120",
    "BGP table version is 748201",
    "",
    "Neighbor        V    AS    MsgRcvd    MsgSent   Up/Down  State/PfxRcd",
    "198.51.100.2    4 64500   1842018    1721308   14d02h   412308",
    "203.0.113.6     4 64600   1551209    1721308   06d18h   335893",
  ],
  "interfaces": [
    "Te1/0  is up, line protocol is up    ip: 10.0.0.21/30   rx 36.4G  tx 32.1G",
    "Te1/1  is up, line protocol is up    ip: 10.0.0.25/30   rx  2.1G  tx  1.8G",
    "Te1/2  is administratively down",
    "Gi0/1  is up, line protocol is up    ip: 198.51.100.2/30",
    "Gi0/2  is up, line protocol is up    ip: 203.0.113.6/30",
    "Gi0/8  is down, line protocol is down  errors 142",
  ],
  "running-config": [
    "Building configuration...",
    "!",
    "hostname helix-edge-01",
    "ip domain-name corp.example.net",
    "!",
    "interface TenGigE1/0",
    " description \"core-sw-01 · 40GE\"",
    " ip address 10.0.0.21 255.255.255.252",
    " ip ospf 1 area 0.0.0.0",
    "!",
    "router ospf 1",
    " router-id 10.0.0.1",
    " network 10.0.0.0 0.0.0.3 area 0.0.0.0",
    "!",
    "router bgp 65120",
    " bgp router-id 10.0.0.1",
    " neighbor 198.51.100.2 remote-as 64500",
    "!",
    "end",
  ],
};

window.Terminal = Terminal;
