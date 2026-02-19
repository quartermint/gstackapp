use maud::{html, Markup};

use crate::api::hub_client::NodeInfo;
use crate::api::zeroclaw_client::ZeroClawStatus;
use crate::components::health_badge::health_badge;

pub fn node_card(node: &NodeInfo, zeroclaw: &ZeroClawStatus) -> Markup {
    let is_agent = node.capabilities.tags.iter().any(|t| t == "zeroclaw");
    let load_pct = (node.load * 100.0).round();
    let mem_gb = node.capabilities.memory_mb as f64 / 1024.0;

    let zc_health = match zeroclaw {
        ZeroClawStatus::Online(h) => Some(h),
        _ => None,
    };

    html! {
        div class={"card" @if is_agent { " card-agent" }} id={"node-" (node.hostname)} {
            div class="card-header" {
                h3 { (node.hostname) }
                div class="card-header-badges" {
                    @if is_agent {
                        span class="role-badge" { "AGENT" }
                    }
                    span id={"node-status-" (node.hostname)} {
                        (health_badge(&node.status))
                    }
                }
            }
            div class="card-body" {
                // Agent card: show component health rows
                @if is_agent {
                    @if let Some(health) = zc_health {
                        @if let Some(ref runtime) = health.runtime {
                            div class="component-health" {
                                @for (name, comp) in &runtime.components {
                                    div class="component-row" {
                                        span class="component-name" { (name) }
                                        span class={"component-dot " (component_dot_class(&comp.status))}
                                              id={"zc-" (name)}
                                              title=(comp.status) {}
                                    }
                                }
                            }
                        }
                    }
                }

                div class="metric-row" {
                    span class="metric-label" { "Platform" }
                    span class="metric-value" { (node.capabilities.platform) "/" (node.capabilities.arch) }
                }
                @if !is_agent {
                    div class="metric-row" {
                        span class="metric-label" { "CPU" }
                        span class="metric-value" id={"node-load-" (node.hostname)} {
                            (node.capabilities.cpu_cores) " cores @ " (load_pct) "%"
                        }
                    }
                }
                div class="metric-row" {
                    span class="metric-label" { "Memory" }
                    span class="metric-value" { (format!("{:.1}", mem_gb)) " GB" }
                }
                @if !is_agent {
                    div class="metric-row" {
                        span class="metric-label" { "Tasks" }
                        span class="metric-value" id={"node-tasks-" (node.hostname)} {
                            (node.current_tasks) " / " (node.max_concurrent_tasks)
                        }
                    }
                }
                @if is_agent {
                    @if let Some(health) = zc_health {
                        @if let Some(uptime) = health.uptime {
                            div class="metric-row" {
                                span class="metric-label" { "Uptime" }
                                span class="metric-value" {
                                    @let hours = (uptime / 3600.0).floor() as u64;
                                    @let mins = ((uptime % 3600.0) / 60.0).floor() as u64;
                                    (hours) "h " (mins) "m"
                                }
                            }
                        }
                    }
                }

                @if !node.capabilities.tags.is_empty() {
                    div class="metric-row" {
                        span class="metric-label" { "Tags" }
                        span class="metric-value" {
                            @for tag in &node.capabilities.tags {
                                span class="tag" { (tag) }
                            }
                        }
                    }
                }

                // Expandable details for all cards
                details class="card-details" {
                    summary { "Details" }
                    dl class="detail-grid" {
                        dt { "ID" }
                        dd { code { (node.id) } }
                        dt { "URL" }
                        dd { code { (node.url) } }
                        dt { "Platform" }
                        dd { (node.capabilities.platform) " / " (node.capabilities.arch) }
                        dt { "CPU Cores" }
                        dd { (node.capabilities.cpu_cores) }
                        dt { "Memory" }
                        dd { (node.capabilities.memory_mb) " MB (" (format!("{:.1}", mem_gb)) " GB)" }
                        dt { "Load" }
                        dd { (format!("{:.1}%", node.load * 100.0)) }
                        dt { "Tasks" }
                        dd { (node.current_tasks) " / " (node.max_concurrent_tasks) }
                        dt { "Sandbox" }
                        dd {
                            @if node.capabilities.sandbox_enabled { "Enabled" } @else { "Disabled" }
                        }
                        dt { "Last Heartbeat" }
                        dd { (node.last_heartbeat) }
                    }
                    // Agent-specific details
                    @if is_agent {
                        @if let Some(health) = zc_health {
                            @if let Some(ref runtime) = health.runtime {
                                h4 class="detail-section-title" { "Component Details" }
                                @for (name, comp) in &runtime.components {
                                    div class="component-detail" {
                                        strong { (name) }
                                        " — " (comp.status)
                                        @if comp.restart_count > 0 {
                                            " · " (comp.restart_count) " restarts"
                                        }
                                        @if let Some(ref err) = comp.last_error {
                                            div class="component-error" { code { (err) } }
                                        }
                                    }
                                }
                            }
                            @if let Some(ref mem) = health.memory {
                                h4 class="detail-section-title" { "ZeroClaw Memory" }
                                dl class="detail-grid" {
                                    @if let Some(size) = mem.sqlite_size_mb {
                                        dt { "SQLite" }
                                        dd { (format!("{:.1} MB", size)) }
                                    }
                                    @if let Some(count) = mem.chunk_count {
                                        dt { "Chunks" }
                                        dd { (count) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn component_dot_class(status: &str) -> &'static str {
    match status {
        "online" | "ok" | "healthy" => "dot-ok",
        "warning" | "degraded" => "dot-warn",
        "offline" | "critical" | "unhealthy" => "dot-crit",
        _ => "dot-unknown",
    }
}
