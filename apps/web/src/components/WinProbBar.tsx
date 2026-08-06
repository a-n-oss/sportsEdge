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
  const isCompact = size === "sm"

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {!isCompact && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-mono-stat text-xl font-semibold tabular-nums text-primary sm:text-2xl">
              {formatProb(homeProb)}
            </span>
            <span className="truncate text-xs uppercase tracking-wider text-muted-foreground">
              {homeLabel}
            </span>
          </div>
          {draw > 0 && (
            <span className="order-last w-full text-center font-mono-stat text-xs text-draw sm:order-none sm:w-auto">
              Draw {formatProb(draw)}
            </span>
          )}
          <div className="flex min-w-0 items-baseline justify-end gap-2">
            <span className="truncate text-xs uppercase tracking-wider text-muted-foreground">
              {awayLabel}
            </span>
            <span className="font-mono-stat text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
              {formatProb(awayProb)}
            </span>
          </div>
        </div>
      )}

      {isCompact && (
        <div className="flex items-center justify-between gap-2 font-mono-stat text-[11px] tabular-nums text-muted-foreground">
          <span className="text-primary">{formatProb(homeProb)}</span>
          {draw > 0 ? (
            <span className="truncate text-draw">Draw {formatProb(draw)}</span>
          ) : (
            <span aria-hidden />
          )}
          <span>{formatProb(awayProb)}</span>
        </div>
      )}

      <div
        className={cn("flex w-full overflow-hidden rounded-full bg-secondary", barH)}
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
            className={cn("h-full bg-draw", animate && "animate-prob-fill")}
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
