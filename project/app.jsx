/* global React, ReactDOM, I, Pill,
   Sidebar, Topbar,
   Dashboard, Chassis, Interfaces, Routing, Config, Logs, System,
   Wizard, Terminal, AddRouterModal, FLEET_INITIAL, FleetHome, HelpModal, RouterSearch,
   useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakToggle, TweakColor */

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "noc",
  "density": "comfortable",
  "cliReveal": "on-demand",
  "accent": "cyan",
  "showSidebar": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(DEFAULTS);
  const [route, setRoute] = React.useState("fleet");
  const [cliOpen, setCliOpen] = React.useState(false);
  const [sshOpen, setSshOpen] = React.useState(false);
  const [wizard, setWizard] = React.useState(null);
  const [addRouterOpen, setAddRouterOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Cmd/Ctrl+K opens search globally
  React.useEffect(() => {
    const onOpen = () => setSearchOpen(true);
    window.addEventListener("__open_search", onOpen);
    return () => window.removeEventListener("__open_search", onOpen);
  }, []);
  const [generatedCli, setGeneratedCli] = React.useState([]);
  const [fleet, setFleet] = React.useState(FLEET_INITIAL);
  const [currentId, setCurrentId] = React.useState(FLEET_INITIAL[0].id);
  const device = fleet.find((d) => d.id === currentId) || fleet[0];

  // Dark/light toggle — remembers the last theme of each family
  const isDark = t.theme === "noc" || t.theme === "neon";
  const lastDarkRef = React.useRef(isDark ? t.theme : "noc");
  const lastLightRef = React.useRef(isDark ? "light" : t.theme);
  React.useEffect(() => {
    if (isDark) lastDarkRef.current = t.theme;
    else lastLightRef.current = t.theme;
  }, [t.theme, isDark]);
  const toggleDark = () => setTweak("theme", isDark ? lastLightRef.current : lastDarkRef.current);

  // Apply theme class to document
  React.useEffect(() => {
    const root = document.documentElement;
    const themes = ["theme-noc", "theme-light", "theme-neon", "theme-glass"];
    themes.forEach((c) => root.classList.remove(c));
    root.classList.add(`theme-${t.theme}`);
  }, [t.theme]);

  // Accent override
  React.useEffect(() => {
    const root = document.documentElement;
    const map = {
      cyan:  { l: 0.78, c: 0.14, h: 200 },
      blue:  { l: 0.62, c: 0.18, h: 250 },
      green: { l: 0.78, c: 0.16, h: 145 },
      amber: { l: 0.82, c: 0.16, h: 70  },
      magenta: { l: 0.78, c: 0.22, h: 325 },
    };
    const v = map[t.accent] || map.cyan;
    if (t.theme !== "neon") {
      root.style.setProperty("--accent", `oklch(${v.l} ${v.c} ${v.h})`);
      root.style.setProperty("--accent-2", `oklch(${v.l - 0.1} ${v.c + 0.02} ${v.h})`);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
    }
  }, [t.accent, t.theme]);

  const openWizard = (kind) => setWizard(kind);

  // Pin CLI drawer open when tweak is "always"
  React.useEffect(() => {
    if (t.cliReveal === "always") setCliOpen(true);
  }, [t.cliReveal]);

  const onCommitWizard = (cli) => {
    setGeneratedCli(cli);
    setCliOpen(true);
    // bounce to config
    setRoute("config");
  };

  return (
    <>
      <div className={`app ${t.density === "dense" ? "dense" : ""} ${route === "fleet" ? "no-sidebar" : ""}`}>
        {route !== "fleet" && (
          <Sidebar route={route} setRoute={setRoute} dense={t.density === "dense"} device={device}
                   devices={fleet} currentId={currentId}
                   onSelectDevice={(id) => { setCurrentId(id); }}
                   onAddDevice={() => setAddRouterOpen(true)}/>
        )}
        <Topbar route={route} onToggleCli={() => setCliOpen(!cliOpen)} cliOpen={cliOpen}
                onToggleSsh={() => setSshOpen(!sshOpen)} sshOpen={sshOpen}
                onToggleDark={toggleDark} isDark={isDark}
                onOpenHelp={() => setHelpOpen(true)}
                onOpenSearch={() => setSearchOpen(true)}
                device={device}/>
        <main className="main" key={currentId + route}>
          {route === "fleet"      && <FleetHome devices={fleet} currentId={currentId}
                                                onSelect={(id) => { setCurrentId(id); setRoute("dashboard"); }}
                                                onAdd={() => setAddRouterOpen(true)}
                                                onImport={() => setAddRouterOpen("bulk")}/>}
          {route === "dashboard"  && <Dashboard device={device} setRoute={setRoute}/>}
          {route === "chassis"    && <Chassis device={device} setRoute={setRoute}/>}
          {route === "interfaces" && <Interfaces device={device}/>}
          {route === "routing"    && <Routing device={device} openWizard={openWizard}/>}
          {route === "config"     && <Config openWizard={openWizard} generatedCli={generatedCli}/>}
          {route === "logs"       && <Logs/>}
          {route === "system"     && <System device={device}/>}
        </main>
      </div>

      {/* CLI Drawer */}
      <CliDrawer open={cliOpen} onClose={() => setCliOpen(false)} generatedCli={generatedCli}/>

      {/* SSH Terminal */}
      <Terminal open={sshOpen} onClose={() => setSshOpen(false)}
                device={device}
                onCommitLines={(lines) => setGeneratedCli((prev) => [...prev, ...lines])}/>

      {/* Wizard */}
      {wizard && <Wizard kind={wizard} onClose={() => setWizard(null)} onCommit={onCommitWizard}/>}

      {/* Add router modal */}
      {addRouterOpen && (
        <AddRouterModal
          initialTab={addRouterOpen === "bulk" ? "bulk" : "single"}
          onClose={() => setAddRouterOpen(false)}
          onAdd={(dev) => { setFleet((f) => [...f, dev]); setCurrentId(dev.id); }}
          onAddMany={(devs) => { setFleet((f) => [...f, ...devs]); }}/>
      )}

      {/* Help & contact modal */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)}/>}

      {/* Router search palette */}
      <RouterSearch open={searchOpen} onClose={() => setSearchOpen(false)}
                    devices={fleet}
                    onSelect={(id) => { setCurrentId(id); setRoute("dashboard"); }}/>

      {/* Tweaks Panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <TweakSelect label="Visual theme" value={t.theme}
            options={[
              { value: "noc",   label: "NOC dark (default)" },
              { value: "light", label: "Light enterprise" },
              { value: "neon",  label: "Neon cyber" },
              { value: "glass", label: "Glassmorphism soft" },
            ]}
            onChange={(v) => setTweak("theme", v)}/>
          <TweakColor label="Accent" value={t.accent}
            options={["cyan", "blue", "green", "amber", "magenta"].map((id) => ({
              cyan: "#5ec5dd", blue: "#5b88e6", green: "#5ec98a", amber: "#e6c266", magenta: "#dd6fc6",
            }[id]))}
            onChange={(hex) => {
              const map = { "#5ec5dd": "cyan", "#5b88e6": "blue", "#5ec98a": "green", "#e6c266": "amber", "#dd6fc6": "magenta" };
              setTweak("accent", map[hex.toLowerCase()] || "cyan");
            }}/>
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio label="Sidebar" value={t.density}
            options={[
              { value: "comfortable", label: "Wide" },
              { value: "dense",       label: "Icons" },
            ]}
            onChange={(v) => setTweak("density", v)}/>
        </TweakSection>
        <TweakSection label="CLI">
          <TweakRadio label="Reveal" value={t.cliReveal}
            options={[
              { value: "on-demand", label: "On demand" },
              { value: "always",    label: "Pinned" },
            ]}
            onChange={(v) => setTweak("cliReveal", v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function CliDrawer({ open, onClose, generatedCli }) {
  return (
    <div className={`cli-drawer ${open ? "open" : ""}`}>
      <div className="cli-drawer-head">
        <I.terminal size={14}/>
        <div style={{ fontWeight: 600 }}>CLI preview</div>
        <span className="pill mono">live</span>
        <span className="spacer"/>
        <button className="icon-btn" data-tip="Copy"><I.copy/></button>
        <button className="icon-btn" onClick={onClose}><I.x/></button>
      </div>
      <div className="cli-body">
        {generatedCli.length > 0 ? (
          <>
            <div className="line com">! last generated by wizard · {new Date().toLocaleTimeString()}</div>
            {generatedCli.map((l, i) => (
              <div key={i} className={`line ${l.startsWith("!") ? "com" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : ""}`}>{l}</div>
            ))}
            <div className="line com">! ----- ----- ----- ----- -----</div>
          </>
        ) : null}
        <div className="line com">! running-config (live)</div>
        <div className="line">hostname helix-edge-01</div>
        <div className="line">!</div>
        <div className="line">interface Loopback0</div>
        <div className="line"> description router-id</div>
        <div className="line"> ip address 10.0.0.1 255.255.255.255</div>
        <div className="line">!</div>
        <div className="line">interface TenGigE1/0</div>
        <div className="line"> description "core-sw-01 · 40GE"</div>
        <div className="line"> ip address 10.0.0.21 255.255.255.252</div>
        <div className="line"> mtu 9214</div>
        <div className="line"> ip ospf 1 area 0.0.0.0</div>
        <div className="line">!</div>
        <div className="line">router ospf 1</div>
        <div className="line"> router-id 10.0.0.1</div>
        <div className="line"> auto-cost reference-bandwidth 100000</div>
        <div className="line"> log-adjacency-changes detail</div>
        <div className="line"> network 10.0.0.0 0.0.0.3 area 0.0.0.0</div>
        <div className="line">!</div>
        <div className="line">router bgp 65120</div>
        <div className="line"> bgp router-id 10.0.0.1</div>
        <div className="line"> neighbor 198.51.100.2 remote-as 64500</div>
        <div className="line">!</div>
        <div className="line com">! end</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
