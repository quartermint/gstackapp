import { useState, useEffect, useCallback } from "react";

export interface Machine {
  id: string;
  hostname: string;
  tailnetIp: string | null;
  os: string | null;
  arch: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useMachines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/machines");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setMachines(data.machines);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { machines, loading, error, refetch: fetch_ };
}
