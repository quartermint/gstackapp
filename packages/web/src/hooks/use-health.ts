import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

interface ServiceStatus {
  name: string;
  status: "up" | "down" | "unknown";
}

export interface SystemHealth {
  overallStatus: "healthy" | "degraded" | "unhealthy";
  cpu: {
    loadAvg1m: number;
    loadAvg5m: number;
    cores: number;
  };
  memory: {
    totalMB: number;
    freeMB: number;
    usedPercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  uptime: number;
  services: ServiceStatus[];
}

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unreachable";

const POLL_INTERVAL_MS = 30_000;

/**
 * Hook to poll /api/health/system every 30 seconds.
 * Returns system health data, loading state, and computed overall status.
 * Maps overallStatus to health dot color: healthy=green, degraded=amber, unhealthy/unreachable=red.
 */
export function useHealth(): {
  health: SystemHealth | null;
  loading: boolean;
  overallStatus: HealthStatus;
} {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [overallStatus, setOverallStatus] = useState<HealthStatus>("unreachable");

  const fetchHealth = useCallback(async () => {
    try {
      const res = await client.api.health.system.$get();
      if (!res.ok) {
        setOverallStatus("unreachable");
        setHealth(null);
        return;
      }
      const data = (await res.json()) as unknown as SystemHealth;
      setHealth(data);
      setOverallStatus(data.overallStatus);
    } catch {
      setOverallStatus("unreachable");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Immediate first poll
    fetchHealth();

    // 30-second interval
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [fetchHealth]);

  return { health, loading, overallStatus };
}
