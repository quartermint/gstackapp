mod api;
mod components;
mod pages;

use std::collections::HashMap;
use std::convert::Infallible;
use std::time::Duration;

use axum::{
    Router,
    extract::State,
    response::sse::{Event, Sse},
    routing::get,
};
use serde::Serialize;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

use api::hub_client::{HubClient, HubHealth, NodeInfo};
use api::zeroclaw_client::{ZeroClawClient, ZeroClawStatus};

#[derive(Clone)]
pub struct AppState {
    pub hub: HubClient,
    pub zeroclaw: ZeroClawClient,
}

#[derive(Serialize)]
struct SsePayload {
    hub: Option<HubHealth>,
    nodes: Vec<NodeInfo>,
    zeroclaw: SseZeroClaw,
}

#[derive(Serialize)]
struct SseZeroClaw {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    components: Option<HashMap<String, SseComponent>>,
}

#[derive(Serialize)]
struct SseComponent {
    status: String,
}

async fn sse_events(
    State(state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream = tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(
        Duration::from_secs(5),
    ))
    .then(move |_| {
        let hub = state.hub.clone();
        let zc = state.zeroclaw.clone();
        async move {
            let (hub_result, nodes_result, zc_status) = tokio::join!(
                hub.health_deep(),
                hub.nodes(),
                zc.health()
            );

            let hub_health = hub_result.ok();
            let nodes = nodes_result
                .ok()
                .map(|r| r.data.nodes)
                .unwrap_or_default();

            let zeroclaw = match &zc_status {
                ZeroClawStatus::Online(h) => SseZeroClaw {
                    status: "online".into(),
                    components: h.runtime.as_ref().map(|r| {
                        r.components
                            .iter()
                            .map(|(k, v)| {
                                (k.clone(), SseComponent { status: v.status.clone() })
                            })
                            .collect()
                    }),
                },
                ZeroClawStatus::Planned => SseZeroClaw {
                    status: "planned".into(),
                    components: None,
                },
                ZeroClawStatus::Unreachable(_) => SseZeroClaw {
                    status: "unreachable".into(),
                    components: None,
                },
            };

            let payload = SsePayload {
                hub: hub_health,
                nodes,
                zeroclaw,
            };
            let json = serde_json::to_string(&payload).unwrap_or_default();
            Ok(Event::default().event("health").data(json))
        }
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let hub_url =
        std::env::var("HUB_URL").unwrap_or_else(|_| "http://100.x.x.x:3000".into());
    let zeroclaw_url =
        std::env::var("ZEROCLAW_URL").unwrap_or_else(|_| "http://100.x.x.x:4000".into());
    let port: u16 = std::env::var("DASHBOARD_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let state = AppState {
        hub: HubClient::new(&hub_url),
        zeroclaw: ZeroClawClient::new(&zeroclaw_url),
    };

    let app = Router::new()
        .route("/", get(pages::overview::overview))
        .route("/api/events", get(sse_events))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind");

    tracing::info!("Dashboard listening on http://0.0.0.0:{port}");
    tracing::info!("Hub: {hub_url}");
    tracing::info!("ZeroClaw: {zeroclaw_url}");

    axum::serve(listener, app).await.expect("Server failed");
}
