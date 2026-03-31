import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { VerdictRatePoint } from '@gstackapp/shared'
import type { Stage } from '@gstackapp/shared'
import { EmptyState } from '../shared/EmptyState'
import { CHART_THEME } from './chartTheme'
import { STAGE_COLORS, STAGE_LABELS } from '../../lib/constants'

interface VerdictRateChartProps {
  data: VerdictRatePoint[]
  stage: Stage
  isEmpty: boolean
}

/**
 * Per-stage verdict rate stacked area chart (D-09).
 * Uses stackOffset="expand" to normalize to 100%.
 * Pass/flag/block areas with verdict colors. Stage spectral accent on heading.
 */
export function VerdictRateChart({ data, stage, isEmpty }: VerdictRateChartProps) {
  if (isEmpty) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: STAGE_COLORS[stage] }}
          />
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
            {STAGE_LABELS[stage]}
          </span>
        </div>
        <EmptyState
          title="Not enough data"
          description="Need at least 2 reviews to show verdict trends"
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: STAGE_COLORS[stage] }}
        />
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          {STAGE_LABELS[stage]}
        </span>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            stackOffset="expand"
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke={CHART_THEME.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke={CHART_THEME.axis}
              fontSize={CHART_THEME.fontSize}
              fontFamily={CHART_THEME.fontFamily}
              tickLine={false}
            />
            <YAxis
              stroke={CHART_THEME.axis}
              fontSize={CHART_THEME.fontSize}
              fontFamily={CHART_THEME.fontFamily}
              axisLine={false}
              width={32}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltip.bg,
                border: `1px solid ${CHART_THEME.tooltip.border}`,
                borderRadius: 8,
                color: CHART_THEME.tooltip.text,
                fontSize: 13,
                fontFamily: CHART_THEME.fontFamily,
              }}
            />
            <Area
              type="monotone"
              dataKey="pass"
              stackId="1"
              stroke="#2EDB87"
              fill="rgba(46, 219, 135, 0.3)"
            />
            <Area
              type="monotone"
              dataKey="flag"
              stackId="1"
              stroke="#FFB020"
              fill="rgba(255, 176, 32, 0.3)"
            />
            <Area
              type="monotone"
              dataKey="block"
              stackId="1"
              stroke="#FF5A67"
              fill="rgba(255, 90, 103, 0.3)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
