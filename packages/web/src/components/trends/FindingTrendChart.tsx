import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { FindingTrendPoint } from '@gstackapp/shared'
import { EmptyState } from '../shared/EmptyState'
import { CHART_THEME } from './chartTheme'

interface FindingTrendChartProps {
  data: FindingTrendPoint[]
  isEmpty: boolean
}

/**
 * Finding frequency stacked area chart (D-10).
 * Critical (red) / notable (amber) / minor (gray) stacked areas.
 */
export function FindingTrendChart({ data, isEmpty }: FindingTrendChartProps) {
  if (isEmpty) {
    return (
      <EmptyState
        title="Not enough data"
        description="Need at least 2 reviews to show finding trends"
      />
    )
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            dataKey="critical"
            stackId="1"
            stroke="#FF5A67"
            fill="rgba(255, 90, 103, 0.2)"
          />
          <Area
            type="monotone"
            dataKey="notable"
            stackId="1"
            stroke="#FFB020"
            fill="rgba(255, 176, 32, 0.2)"
          />
          <Area
            type="monotone"
            dataKey="minor"
            stackId="1"
            stroke="#6F7C90"
            fill="rgba(111, 124, 144, 0.2)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
