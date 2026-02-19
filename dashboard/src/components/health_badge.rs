use maud::{html, Markup};

pub fn health_badge(status: &str) -> Markup {
    let (class, label) = match status {
        "ok" | "healthy" | "online" => ("badge-ok", status),
        "warning" | "degraded" => ("badge-warn", status),
        "critical" | "unhealthy" | "offline" => ("badge-crit", status),
        "planned" => ("badge-plan", "planned"),
        "busy" => ("badge-busy", "busy"),
        _ => ("badge-unknown", status),
    };
    html! { span class={"badge " (class)} { (label) } }
}
