import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

export type BurnRate = "low" | "moderate" | "hot";

export interface BudgetData {
  opus: number;
  sonnet: number;
  local: number;
  unknown: number;
  burnRate: BurnRate;
  weekStart: string;
}

export interface BudgetSuggestion {
  suggestedTier: string | null;
  reason: string;
  localAvailable: boolean;
}

/**
 * Hook to fetch budget data from GET /api/budget.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-risks.ts).
 */
export function useBudget(): {
  budget: BudgetData | null;
  suggestion: BudgetSuggestion | null;
  loading: boolean;
  refetch: () => void;
} {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [suggestion, setSuggestion] = useState<BudgetSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchBudget() {
      setLoading(true);
      try {
        const res = await client.api.budget.$get();
        if (!res.ok) {
          throw new Error(`Failed to fetch budget: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setBudget(
            (json as unknown as { budget: BudgetData }).budget
          );
          setSuggestion(
            (json as unknown as { suggestion: BudgetSuggestion | null })
              .suggestion
          );
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch budget:", err);
        if (!cancelled) {
          setBudget(null);
          setSuggestion(null);
          setLoading(false);
        }
      }
    }

    fetchBudget();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { budget, suggestion, loading, refetch };
}
