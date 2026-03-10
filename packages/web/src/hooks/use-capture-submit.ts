import { useState, useCallback, useRef, useEffect } from "react";
import { client } from "../api/client.js";

/**
 * Hook for submitting captures via POST /api/captures.
 * Keeps it simple: no optimistic UI or TanStack Query for v1.
 * On error: logs to console, keeps field usable.
 */
export function useCaptureSubmit(onSuccess?: () => void): {
  submit: (rawContent: string) => void;
  isPending: boolean;
} {
  const [isPending, setIsPending] = useState(false);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const submit = useCallback((rawContent: string) => {
    if (!rawContent.trim()) return;

    setIsPending(true);

    client.api.captures
      .$post({ json: { rawContent: rawContent.trim() } })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Capture submission failed: ${res.status}`);
        }
        onSuccessRef.current?.();
      })
      .catch((err) => {
        console.error("Failed to submit capture:", err);
      })
      .finally(() => {
        setIsPending(false);
      });
  }, []);

  return { submit, isPending };
}
