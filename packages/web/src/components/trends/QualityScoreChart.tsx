import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { QualityScorePoint } from '@gstackapp/shared'
import { EmptyState } from '../shared/EmptyState'
import { CHART_THEME } from './chartTheme'

interface QualityScoreChartProps {
  data: QualityScorePoint[]
  isEmpty: boolean
}

/**
 * Quality score line chart (D-08): electric lime line, 0-100 Y axis.
 * Parent div has explicit h-[240px] to prevent ResponsiveContainer height collapse.
 */
export function QualityScoreChart({ data, isEmpty }: QualityScoreChartProps) {
  if (isEmpty) {
    return (
      <EmptyState
        title="Not enough data"
        description="Need at least 2 reviews to show quality score trends"
      />
    )
  }

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            domain={[0, 100]}
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
          <Line
            type="monotone"
            dataKey="score"
            stroke={CHART_THEME.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_THEME.accent }}
            activeDot={{ r: 5, fill: CHART_THEME.accent }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
