import Link from "next/link"
import { format, parseISO } from "date-fns"
import { TeamMonogram } from "@/components/TeamMonogram"
import type { Game } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface GameRowProps {
  game: Game
  className?: string
}

/**
 * Compact matchup row for Up Next (≈340px rail) and More Games.
 * Layout: league+time | away @ home | edge % — no WinProbBar (avoids
 * viewport-breakpoint collisions inside narrow containers).
 */
export function GameRow({ game, className }: GameRowProps) {
  const home = game.home_team
  const away = game.away_team
  const homeAbbr = home?.abbreviation ?? "HOM"
  const awayAbbr = away?.abbreviation ?? "AWY"
  const pred = game.prediction
  const edgePct = pred
    ? Math.round(Math.max(pred.home_win_prob, pred.away_win_prob) * 100)
    : null

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "interactive-row flex min-w-0 items-center gap-2 overflow-hidden border-b border-border/60 px-3 py-3 last:border-0 sm:gap-3",
        className
      )}
    >
      <div className="w-14 shrink-0 sm:w-16">
        <Badge variant="outline" className="px-1.5 text-[10px] uppercase tracking-wider">
          {game.league}
        </Badge>
        <p className="mt-1 font-mono-stat text-[10px] text-muted-foreground">
          {format(parseISO(game.date), "h:mm a")}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <TeamMonogram abbreviation={awayAbbr} size="sm" />
        <span className="shrink-0 font-display text-xs uppercase tracking-wide sm:text-sm">
          {awayAbbr}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground sm:text-xs">@</span>
        <TeamMonogram abbreviation={homeAbbr} size="sm" />
        <span className="shrink-0 font-display text-xs uppercase tracking-wide sm:text-sm">
          {homeAbbr}
        </span>
      </div>

      {edgePct != null ? (
        <span className="w-10 shrink-0 text-right font-mono-stat text-sm tabular-nums text-primary sm:w-11">
          {edgePct}%
        </span>
      ) : (
        <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground sm:w-11">
          —
        </span>
      )}
    </Link>
  )
}
