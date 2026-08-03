import { cn } from "@/lib/utils"
import { formatProb } from "@/lib/format"

interface WinProbBarProps {
  homeProb: number
  awayProb: number
  drawProb?: number | null
  homeLabel?: string
  awayLabel?: string
  size?: "sm" | "lg"
  className?: string
  animate?: boolean
}

export function WinProbBar({
  homeProb,
  awayProb,
  drawProb,
  homeLabel = "Home",
  awayLabel = "Away",
  size = "lg",
  className,
  animate = true,
}: WinProbBarProps) {
  const draw = drawProb ?? 0
  const homePct = homeProb * 100
  const awayPct = awayProb * 100
  const drawPct = draw * 100
  const barH = size === "lg" ? "h-2.5" : "h-1.5"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-between items-baseline gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={cn("font-mono-stat font-semibold text-primary", size === "lg" ? "text-2xl" : "text-sm")}>
            {formatProb(homeProb)}
          </span>
          {size === "lg" && (
            <span className="text-xs text-muted-foreground uppercase tracking-wider truncate">{homeLabel}</span>
          )}
        </div>
        {draw > 0 && (
          <span className="font-mono-stat text-xs text-muted-foreground">
            Draw {formatProb(draw)}
          </span>
        )}
        <div className="flex items-baseline gap-2 min-w-0 justify-end">
          {size === "lg" && (
            <span className="text-xs text-muted-foreground uppercase tracking-wider truncate">{awayLabel}</span>
          )}
          <span className={cn("font-mono-stat font-semibold text-foreground", size === "lg" ? "text-2xl" : "text-sm")}>
            {formatProb(awayProb)}
          </span>
        </div>
      </div>
      <div
        className={cn("w-full rounded-full overflow-hidden flex bg-secondary", barH)}
        role="meter"
        aria-label={`Win probability ${homeLabel} ${formatProb(homeProb)}, ${awayLabel} ${formatProb(awayProb)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(homePct)}
      >
        <div
          className={cn("h-full bg-primary", animate && "animate-prob-fill")}
          style={{ width: `${homePct}%` }}
        />
        {drawPct > 0 && (
          <div
            className={cn("h-full bg-muted-foreground/50", animate && "animate-prob-fill")}
            style={{ width: `${drawPct}%` }}
          />
        )}
        <div
          className={cn("h-full bg-foreground/25", animate && "animate-prob-fill")}
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  )
}
