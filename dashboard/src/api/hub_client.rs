use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct HubClient {
    client: Client,
    base_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HubHealth {
    pub status: String,
    pub timestamp: String,
    pub version: String,
    pub uptime: f64,
    pub checks: HealthChecks,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthChecks {
    pub convex: ConvexCheck,
    pub nodes: NodesCheck,
    pub memory: MemoryCheck,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConvexCheck {
    pub status: String,
    #[serde(rename = "latencyMs")]
    pub latency_ms: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodesCheck {
    pub status: String,
    pub total: u32,
    pub online: u32,
    pub offline: u32,
    pub busy: u32,
    #[serde(rename = "utilizationPercent")]
    pub utilization_percent: f64,
    pub details: Vec<NodeDetail>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeDetail {
    pub id: String,
    pub hostname: String,
    pub status: String,
    pub load: f64,
    #[serde(rename = "lastHeartbeatAgo")]
    pub last_heartbeat_ago: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryCheck {
    pub status: String,
    #[serde(rename = "heapUsedMb")]
    pub heap_used_mb: f64,
    #[serde(rename = "heapTotalMb")]
    pub heap_total_mb: f64,
    #[serde(rename = "rssMb")]
    pub rss_mb: f64,
    #[serde(rename = "usagePercent")]
    pub usage_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodesResponse {
    pub success: bool,
    pub data: NodesData,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodesData {
    pub nodes: Vec<NodeInfo>,
    pub stats: NodeStats,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeInfo {
    pub id: String,
    pub hostname: String,
    pub url: String,
    pub status: String,
    #[serde(rename = "lastHeartbeat")]
    pub last_heartbeat: String,
    #[serde(rename = "currentTasks")]
    pub current_tasks: u32,
    #[serde(rename = "maxConcurrentTasks")]
    pub max_concurrent_tasks: u32,
    pub load: f64,
    pub capabilities: NodeCapabilities,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeCapabilities {
    #[serde(rename = "cpuCores")]
    pub cpu_cores: u32,
    #[serde(rename = "memoryMb")]
    pub memory_mb: u64,
    #[serde(rename = "sandboxEnabled")]
    pub sandbox_enabled: bool,
    pub platform: String,
    pub arch: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeStats {
    pub total: u32,
    pub online: u32,
    pub offline: u32,
    pub busy: u32,
    #[serde(rename = "totalCapacity")]
    pub total_capacity: u32,
    #[serde(rename = "usedCapacity")]
    pub used_capacity: u32,
}

impl HubClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .expect("Failed to create HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn health_deep(&self) -> Result<HubHealth, reqwest::Error> {
        self.client
            .get(format!("{}/health/deep", self.base_url))
            .send()
            .await?
            .json()
            .await
    }

    pub async fn nodes(&self) -> Result<NodesResponse, reqwest::Error> {
        self.client
            .get(format!("{}/api/nodes", self.base_url))
            .send()
            .await?
            .json()
            .await
    }
}
