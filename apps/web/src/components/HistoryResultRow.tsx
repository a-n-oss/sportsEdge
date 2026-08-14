import Link from "next/link"
import { format, parseISO } from "date-fns"
import { TeamMonogram } from "@/components/TeamMonogram"
import { Badge } from "@/components/ui/badge"
import type { Game } from "@/lib/api"
import { formatProb } from "@/lib/format"
import { predictionCloseness, type OutcomeSide } from "@/lib/games"
import { cn } from "@/lib/utils"

interface HistoryResultRowProps {
  game: Game
  className?: string
}

function sideLabel(side: OutcomeSide, homeAbbr: string, awayAbbr: string): string {
  switch (side) {
    case "home":
      return homeAbbr
    case "away":
      return awayAbbr
    case "draw":
      return "Draw"
    default: {
      const _exhaustive: never = side
      return _exhaustive
    }
  }
}

/**
 * Completed game with a stored pre-game prediction: score, probs, favorite hit, closeness.
 * Mobile-first wrap — avoids the Up Next overlap class of bugs.
 */
export function HistoryResultRow({ game, className }: HistoryResultRowProps) {
  const pred = game.prediction
  const close = predictionCloseness(game)
  if (!pred || !close) return null

  const homeAbbr = game.home_team?.abbreviation ?? "HOM"
  const awayAbbr = game.away_team?.abbreviation ?? "AWY"
  const favoriteLabel = sideLabel(close.modelFavorite, homeAbbr, awayAbbr)
  const outcomeLabel = sideLabel(close.outcome, homeAbbr, awayAbbr)

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "interactive-row flex min-w-0 flex-col gap-2 border-b border-border/60 px-3 py-3 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0 px-1.5 text-[10px] uppercase tracking-wider">
          {game.league}
        </Badge>
        <span className="font-mono-stat text-[10px] text-muted-foreground">
          {format(parseISO(game.date), "MMM d")}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamMonogram abbreviation={awayAbbr} size="sm" />
        <span className="font-mono-stat text-sm tabular-nums">
          {awayAbbr} {game.away_score} – {game.home_score} {homeAbbr}
        </span>
        <TeamMonogram abbreviation={homeAbbr} size="sm" />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
        <span className="font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
          Pred {formatProb(pred.home_win_prob)} {homeAbbr}
          {" / "}
          {formatProb(pred.away_win_prob)} {awayAbbr}
          {pred.draw_prob != null ? ` / ${formatProb(pred.draw_prob)} Draw` : null}
        </span>
        <span className="font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
          Fav {favoriteLabel}
        </span>
        <Badge
          variant={close.favoriteHit ? "default" : "destructive"}
          className="text-[10px]"
        >
          {close.favoriteHit ? "Hit" : "Miss"}
        </Badge>
        <span
          className="font-mono-stat text-xs tabular-nums text-primary"
          title={`Pre-game probability for ${outcomeLabel}; miss-by ${formatProb(close.missBy)} from a perfect call`}
        >
          Close {formatProb(close.winnerProb)}
        </span>
      </div>
    </Link>
  )
}
