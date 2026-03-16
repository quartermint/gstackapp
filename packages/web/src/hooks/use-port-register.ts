import { useState, useCallback } from "react";

interface RegisterPortData {
  port: number;
  machineId: string;
  serviceName: string;
  projectSlug?: string;
  protocol?: "tcp" | "udp";
}

export function usePortRegister(onSuccess?: () => void) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(
    async (data: RegisterPortData) => {
      setIsPending(true);
      setError(null);
      try {
        const res = await fetch("/api/ports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error?.message ?? `Failed: ${res.status}`);
        }
        onSuccess?.();
        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [onSuccess]
  );

  return { register, isPending, error };
}
