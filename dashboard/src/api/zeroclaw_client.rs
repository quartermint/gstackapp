use std::collections::HashMap;

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ZeroClawClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ZeroClawHealth {
    pub status: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub uptime: Option<f64>,
    #[serde(default)]
    pub memory: Option<ZeroClawMemory>,
    #[serde(default)]
    pub channels: Option<Vec<String>>,
    #[serde(default)]
    pub runtime: Option<ZeroClawRuntime>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ZeroClawMemory {
    #[serde(default)]
    pub sqlite_size_mb: Option<f64>,
    #[serde(default)]
    pub chunk_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ZeroClawRuntime {
    #[serde(default)]
    pub components: HashMap<String, ZeroClawComponent>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ZeroClawComponent {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub restart_count: u32,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ZeroClawStatus {
    Online(ZeroClawHealth),
    Planned,
    Unreachable(String),
}

impl ZeroClawClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .expect("Failed to create HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn health(&self) -> ZeroClawStatus {
        match self.client.get(format!("{}/health", self.base_url)).send().await {
            Ok(resp) => match resp.json::<ZeroClawHealth>().await {
                Ok(health) => ZeroClawStatus::Online(health),
                Err(e) => ZeroClawStatus::Unreachable(format!("Parse error: {e}")),
            },
            Err(e) => {
                if e.is_connect() || e.is_timeout() {
                    ZeroClawStatus::Planned
                } else {
                    ZeroClawStatus::Unreachable(format!("{e}"))
                }
            }
        }
    }
}
