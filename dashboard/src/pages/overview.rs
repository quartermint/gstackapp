use axum::extract::State;
use maud::{html, Markup};

use crate::AppState;
use crate::components::health_badge::health_badge;
use crate::components::layout::page;
use crate::components::node_card::node_card;

pub async fn overview(State(state): State<AppState>) -> Markup {
    let health = state.hub.health_deep().await.ok();
    let nodes_resp = state.hub.nodes().await.ok();
    let nodes = nodes_resp.as_ref().map(|r| &r.data.nodes);
    let zeroclaw_status = state.zeroclaw.health().await;

    // Compute fleet summary
    let fleet_online = nodes
        .map(|n| n.iter().filter(|node| node.status == "online").count())
        .unwrap_or(0);
    let fleet_total = nodes.map(|n| n.len()).unwrap_or(0);
    let task_used: u32 = nodes
        .map(|n| n.iter().map(|node| node.current_tasks).sum())
        .unwrap_or(0);
    let task_capacity: u32 = nodes
        .map(|n| n.iter().map(|node| node.max_concurrent_tasks).sum())
        .unwrap_or(0);

    page(
        "Mission Control",
        html! {
            // System Health strip
            div class="section" {
                h2 { "System Health" }
                div class="stats-row" {
                    div class="stat-card" {
                        div class="label" { "Hub Status" }
                        div class="value" id="hub-status" {
                            @if let Some(ref h) = health {
                                (health_badge(&h.status))
                            } @else {
                                (health_badge("unreachable"))
                            }
                        }
                    }
                    div class="stat-card" {
                        div class="label" { "Hub Memory" }
                        div class="value" id="hub-memory" {
                            @if let Some(ref h) = health {
                                (format!("{:.1}%", h.checks.memory.usage_percent))
                            } @else {
                                "—"
                            }
                        }
                    }
                    div class="stat-card" {
                        div class="label" { "Convex Latency" }
                        div class="value" id="convex-latency" {
                            @if let Some(ref h) = health {
                                (format!("{:.0}ms", h.checks.convex.latency_ms))
                            } @else {
                                "—"
                            }
                        }
                    }
                    div class="stat-card" {
                        div class="label" { "Uptime" }
                        div class="value" id="hub-uptime" {
                            @if let Some(ref h) = health {
                                @let hours = (h.uptime / 3600.0).floor() as u64;
                                @let mins = ((h.uptime % 3600.0) / 60.0).floor() as u64;
                                (hours) "h " (mins) "m"
                            } @else {
                                "—"
                            }
                        }
                    }
                    div class="stat-card" {
                        div class="label" { "Fleet" }
                        div class="value" id="fleet-online" {
                            (fleet_online) "/" (fleet_total) " online"
                        }
                    }
                    div class="stat-card" {
                        div class="label" { "Tasks" }
                        div class="value" id="fleet-tasks" {
                            (task_used) "/" (task_capacity) " capacity"
                        }
                    }
                }
            }

            // Fleet grid
            div class="section" {
                h2 { "Fleet" }
                @if let Some(nodes) = nodes {
                    div class="grid" {
                        @for n in nodes {
                            (node_card(n, &zeroclaw_status))
                        }
                    }
                } @else {
                    div class="info-box" {
                        p { "Unable to reach Hub API" }
                    }
                }
            }
        },
    )
}
