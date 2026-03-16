import { useState, useEffect, useCallback } from "react";

export interface PortConflict {
  type: "unregistered" | "down" | "duplicate";
  port: number;
  protocol: string;
  machineId: string;
  machineHostname: string;
  details: string;
}

export function usePortConflicts(pollInterval = 60_000) {
  const [conflicts, setConflicts] = useState<PortConflict[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ports/conflicts");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setConflicts(data.conflicts);
    } catch {
      // Silently retry on next poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const timer = setInterval(fetch_, pollInterval);
    return () => clearInterval(timer);
  }, [fetch_, pollInterval]);

  return { conflicts, loading, refetch: fetch_ };
}
