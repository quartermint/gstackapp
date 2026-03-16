import type { SessionHistoryItem } from "../../hooks/use-session-history.js";

interface TimelineBarProps {
  session: SessionHistoryItem;
  dayStartHour: number;
  dayEndHour: number;
}

/**
 * Individual session bar in the timeline.
 * Position and width are computed as percentages of the day window.
 * Color-coded: claude-code = blue, aider = warm/amber.
 */
export function TimelineBar({
  session,
  dayStartHour,
  dayEndHour,
}: TimelineBarProps) {
  const start = new Date(session.startedAt);
  const startMinutes =
    (start.getHours() - dayStartHour) * 60 + start.getMinutes();

  let endMinutes: number;
  if (session.endedAt) {
    const end = new Date(session.endedAt);
    endMinutes = (end.getHours() - dayStartHour) * 60 + end.getMinutes();
  } else {
    // Active session: bar extends to current time
    const now = new Date();
    endMinutes = (now.getHours() - dayStartHour) * 60 + now.getMinutes();
  }

  const totalMinutes = (dayEndHour - dayStartHour) * 60;

  // Compute position and width as percentages
  const left = Math.max(0, (startMinutes / totalMinutes) * 100);
  const width = Math.max(2, ((endMinutes - startMinutes) / totalMinutes) * 100);

  // Color by source
  const barColor =
    session.source === "claude-code"
      ? "bg-blue-500/70"
      : "bg-amber-warm/70";

  const tooltip = `Session ${session.id.slice(0, 8)} \u2014 ${session.model ?? session.source} \u2014 ${session.status}`;

  const isActive = session.status === "active";

  return (
    <div
      className={`absolute top-1 h-3 rounded-sm ${barColor}`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
      }}
      title={tooltip}
    >
      {/* Active session pulse indicator on right edge */}
      {isActive && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
    </div>
  );
}
