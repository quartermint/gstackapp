import type { BudgetData, BurnRate } from "../../hooks/use-budget.js";

interface BudgetWidgetProps {
  budget: BudgetData | null;
}

const BURN_COLORS: Record<BurnRate, { bg: string; text: string; dot: string }> =
  {
    low: { bg: "bg-sage/10", text: "text-sage", dot: "bg-sage" },
    moderate: {
      bg: "bg-gold-status/10",
      text: "text-gold-status",
      dot: "bg-gold-status",
    },
    hot: { bg: "bg-rust/10", text: "text-rust", dot: "bg-rust" },
  };

/**
 * Compact budget display showing burn rate indicator and tier session counts.
 * Renders inside the sessions dropdown panel.
 */
export function BudgetWidget({ budget }: BudgetWidgetProps) {
  if (!budget) return null;

  const colors = BURN_COLORS[budget.burnRate] ?? BURN_COLORS.low;
  const total =
    budget.opus + budget.sonnet + budget.local + budget.unknown;

  return (
    <div className="border-t border-black/5 dark:border-white/5 pt-2 mt-1">
      {/* Burn rate row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${colors.dot}`} />
        <span className={`text-[10px] font-medium ${colors.text}`}>
          Burn: {budget.burnRate}
        </span>
        <span className="text-[10px] text-text-muted dark:text-text-muted-dark ml-auto">
          This week: {total} sessions
        </span>
      </div>

      {/* Tier counts */}
      <div className="text-[10px] font-mono text-text-muted dark:text-text-muted-dark">
        O:{budget.opus} S:{budget.sonnet} L:{budget.local}
      </div>
    </div>
  );
}
