use maud::{html, Markup, DOCTYPE};

pub fn page(title: &str, content: Markup) -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                title { "Mission Control — " (title) }
                style { (CSS) }
            }
            body {
                nav class="topbar" {
                    a href="/" class="logo" { "Mission Control" }
                    div class="live-label" {
                        div id="live-indicator" class="live-dot" title="SSE connected" {}
                        span class="live-text" { "Live" }
                    }
                }
                main { (content) }
                (sse_script())
            }
        }
    }
}

fn sse_script() -> Markup {
    html! {
        script {
            (maud::PreEscaped(r#"
(function() {
    const dot = document.getElementById('live-indicator');
    let es;

    function connect() {
        es = new EventSource('/api/events');
        es.onopen = () => { dot.classList.add('connected'); };
        es.onerror = () => {
            dot.classList.remove('connected');
            es.close();
            setTimeout(connect, 5000);
        };
        es.addEventListener('health', (e) => {
            try {
                const d = JSON.parse(e.data);

                // Hub stats
                if (d.hub) {
                    const el = document.getElementById('hub-status');
                    if (el) el.textContent = d.hub.status;

                    const mem = document.getElementById('hub-memory');
                    if (mem && d.hub.checks && d.hub.checks.memory)
                        mem.textContent = d.hub.checks.memory.usagePercent.toFixed(1) + '%';

                    const nodes = document.getElementById('nodes-online');
                    if (nodes && d.hub.checks && d.hub.checks.nodes)
                        nodes.textContent = d.hub.checks.nodes.online + ' / ' + d.hub.checks.nodes.total;

                    const convex = document.getElementById('convex-latency');
                    if (convex && d.hub.checks && d.hub.checks.convex)
                        convex.textContent = d.hub.checks.convex.latencyMs.toFixed(0) + 'ms';

                    const uptime = document.getElementById('hub-uptime');
                    if (uptime && d.hub.uptime != null) {
                        const h = Math.floor(d.hub.uptime / 3600);
                        const m = Math.floor((d.hub.uptime % 3600) / 60);
                        uptime.textContent = h + 'h ' + m + 'm';
                    }
                }

                // Fleet summary
                if (d.nodes) {
                    const online = d.nodes.filter(n => n.status === 'online').length;
                    const total = d.nodes.length;
                    const fleetEl = document.getElementById('fleet-online');
                    if (fleetEl) fleetEl.textContent = online + '/' + total + ' online';

                    let usedTasks = 0, totalTasks = 0;
                    d.nodes.forEach(n => {
                        usedTasks += n.currentTasks || 0;
                        totalTasks += n.maxConcurrentTasks || 0;
                    });
                    const tasksEl = document.getElementById('fleet-tasks');
                    if (tasksEl) tasksEl.textContent = usedTasks + '/' + totalTasks + ' capacity';

                    // Per-node updates
                    d.nodes.forEach(n => {
                        const statusEl = document.getElementById('node-status-' + n.hostname);
                        if (statusEl) {
                            const cls = n.status === 'online' ? 'badge-ok'
                                      : n.status === 'busy' ? 'badge-busy'
                                      : 'badge-crit';
                            statusEl.innerHTML = '<span class="badge ' + cls + '">' + n.status + '</span>';
                        }

                        const loadEl = document.getElementById('node-load-' + n.hostname);
                        if (loadEl && n.capabilities) {
                            loadEl.textContent = n.capabilities.cpuCores + ' cores @ ' + Math.round(n.load * 100) + '%';
                        }

                        const taskEl = document.getElementById('node-tasks-' + n.hostname);
                        if (taskEl) {
                            taskEl.textContent = (n.currentTasks || 0) + ' / ' + (n.maxConcurrentTasks || 0);
                        }
                    });
                }

                // ZeroClaw components
                if (d.zeroclaw && d.zeroclaw.components) {
                    Object.entries(d.zeroclaw.components).forEach(([name, comp]) => {
                        const dot = document.getElementById('zc-' + name);
                        if (dot) {
                            const s = comp.status;
                            const cls = (s === 'online' || s === 'ok' || s === 'healthy') ? 'dot-ok'
                                      : (s === 'warning' || s === 'degraded') ? 'dot-warn'
                                      : (s === 'offline' || s === 'critical' || s === 'unhealthy') ? 'dot-crit'
                                      : 'dot-unknown';
                            dot.className = 'component-dot ' + cls;
                            dot.title = s;
                        }
                    });
                }
            } catch (_) {}
        });
    }
    connect();
})();
"#))
        }
    }
}

const CSS: &str = r#"
:root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --ok: #3fb950;
    --warn: #d29922;
    --crit: #f85149;
    --plan: #8b949e;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
}

.topbar {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
}

.logo {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--accent);
    text-decoration: none;
}

.live-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
}

.live-text {
    font-size: 0.75rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.live-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--crit);
    transition: background 0.3s;
}
.live-dot.connected { background: var(--ok); }

main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }

h1 { font-size: 1.5rem; margin-bottom: 1rem; }
h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: var(--text-dim); }
h3 { font-size: 1rem; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }

.stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
}
.stat-card .label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }

.card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
}
.card-agent {
    border-color: var(--accent);
    border-width: 2px;
}
.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
}
.card-header h3 { color: var(--text); }
.card-header a { color: var(--text); text-decoration: none; }
.card-header a:hover { color: var(--accent); }
.card-header-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.card-body { padding: 0.75rem 1rem; }

.role-badge {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    background: rgba(88, 166, 255, 0.15);
    color: var(--accent);
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.component-health {
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
}
.component-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0;
    font-size: 0.85rem;
}
.component-name { color: var(--text-dim); }
.component-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}
.dot-ok { background: var(--ok); }
.dot-warn { background: var(--warn); }
.dot-crit { background: var(--crit); }
.dot-unknown { background: var(--plan); }

.metric-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.875rem;
}
.metric-label { color: var(--text-dim); }
.metric-value { font-weight: 500; }

.badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}
.badge-ok { background: rgba(63, 185, 80, 0.15); color: var(--ok); }
.badge-warn { background: rgba(210, 153, 34, 0.15); color: var(--warn); }
.badge-crit { background: rgba(248, 81, 73, 0.15); color: var(--crit); }
.badge-plan { background: rgba(139, 148, 158, 0.15); color: var(--plan); }
.badge-busy { background: rgba(88, 166, 255, 0.15); color: var(--accent); }
.badge-unknown { background: rgba(139, 148, 158, 0.15); color: var(--plan); }

.tag {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    margin: 0 0.15rem;
    background: var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
}

.section { margin-bottom: 2rem; }

.card-details {
    margin-top: 0.5rem;
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
}
.card-details summary {
    cursor: pointer;
    color: var(--text-dim);
    font-size: 0.85rem;
    user-select: none;
}
.card-details summary:hover { color: var(--accent); }
.card-details[open] summary { margin-bottom: 0.5rem; }

.detail-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 0.5rem;
    font-size: 0.9rem;
}
.detail-grid dt { color: var(--text-dim); }
.detail-grid dd { font-weight: 500; }

.detail-section-title {
    font-size: 0.85rem;
    color: var(--text-dim);
    margin-top: 0.75rem;
    margin-bottom: 0.25rem;
}

.component-detail {
    font-size: 0.85rem;
    padding: 0.15rem 0;
}
.component-error {
    font-size: 0.75rem;
    color: var(--crit);
    margin-top: 0.15rem;
}

.info-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    color: var(--text-dim);
}
.info-box p { margin: 0.5rem 0; }
"#;
