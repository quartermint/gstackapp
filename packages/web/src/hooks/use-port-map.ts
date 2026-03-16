import { useState, useEffect, useCallback } from "react";

export interface PortMapEntry {
  port: number;
  protocol: string;
  machineId: string;
  machineHostname: string;
  allocationId: string | null;
  serviceName: string | null;
  projectSlug: string | null;
  allocationStatus: string | null;
  processName: string | null;
  pid: number | null;
  lastScanAt: string | null;
  liveStatus: "green" | "yellow" | "red";
}

export function usePortMap(pollInterval = 60_000) {
  const [portMap, setPortMap] = useState<PortMapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ports/map");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setPortMap(data.portMap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const timer = setInterval(fetch_, pollInterval);
    return () => clearInterval(timer);
  }, [fetch_, pollInterval]);

  return { portMap, loading, error, refetch: fetch_ };
}
