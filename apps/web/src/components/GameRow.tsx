import Link from "next/link"
import { format, parseISO } from "date-fns"
import { TeamMonogram } from "@/components/TeamMonogram"
import { WinProbBar } from "@/components/WinProbBar"
import type { Game } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface GameRowProps {
  game: Game
  className?: string
}

export function GameRow({ game, className }: GameRowProps) {
  const home = game.home_team
  const away = game.away_team
  const homeAbbr = home?.abbreviation ?? "HOM"
  const awayAbbr = away?.abbreviation ?? "AWY"
  const pred = game.prediction

  return (
    <Link
      href={`/games/${game.id}`}
      className={cn(
        "interactive-row flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-0",
        className
      )}
    >
      <div className="w-16 shrink-0">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-1.5">
          {game.league}
        </Badge>
        <p className="text-[10px] text-muted-foreground font-mono-stat mt-1">
          {format(parseISO(game.date), "h:mm a")}
        </p>
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <TeamMonogram abbreviation={awayAbbr} size="sm" />
        <span className="font-display text-sm uppercase tracking-wide truncate">{awayAbbr}</span>
        <span className="text-muted-foreground text-xs">@</span>
        <TeamMonogram abbreviation={homeAbbr} size="sm" />
        <span className="font-display text-sm uppercase tracking-wide truncate">{homeAbbr}</span>
      </div>
      <div className="w-28 shrink-0 hidden sm:block">
        {pred ? (
          <WinProbBar
            homeProb={pred.home_win_prob}
            awayProb={pred.away_win_prob}
            drawProb={pred.draw_prob}
            size="sm"
            animate={false}
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">Pending</span>
        )}
      </div>
      {pred && (
        <span className="font-mono-stat text-sm text-primary w-10 text-right shrink-0">
          {Math.round(Math.max(pred.home_win_prob, pred.away_win_prob) * 100)}%
        </span>
      )}
    </Link>
  )
}
