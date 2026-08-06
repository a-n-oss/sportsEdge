import Link from "next/link"
import { format, parseISO } from "date-fns"
import { TeamMonogram } from "@/components/TeamMonogram"
import { WinProbBar } from "@/components/WinProbBar"
import { Badge } from "@/components/ui/badge"
import type { Game } from "@/lib/api"
import { formatElo } from "@/lib/format"

interface FeaturedMatchupProps {
  game: Game
  homeElo?: number | null
  awayElo?: number | null
}

export function FeaturedMatchup({ game, homeElo, awayElo }: FeaturedMatchupProps) {
  const home = game.home_team
  const away = game.away_team
  const homeAbbr = home?.abbreviation ?? "HOM"
  const awayAbbr = away?.abbreviation ?? "AWY"
  const pred = game.prediction

  return (
    <Link
      href={`/games/${game.id}`}
      className="panel animate-featured-in block overflow-hidden p-4 hover:border-primary/40 transition-colors sm:p-6 md:p-8"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-display uppercase tracking-[0.2em] text-primary">
            Tonight&apos;s Edge
          </p>
          <h2 className="font-display text-xl uppercase tracking-tight sm:text-2xl md:text-3xl">
            Featured Matchup
          </h2>
        </div>
        <Badge variant="outline" className="shrink-0 uppercase tracking-wider">
          {game.league}
        </Badge>
      </div>

      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mb-8 sm:gap-4 md:gap-8">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3">
          <TeamMonogram abbreviation={awayAbbr} size="lg" className="h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl" />
          <div className="min-w-0 w-full">
            <p className="font-display text-lg uppercase tracking-wide sm:text-xl md:text-2xl">
              {awayAbbr}
            </p>
            <p className="mx-auto max-w-full truncate text-xs text-muted-foreground">
              {away?.name ?? "Away"}
            </p>
            {awayElo != null && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Elo{" "}
                <span className="font-mono-stat text-sm text-foreground">{formatElo(awayElo)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-1 text-center">
          <p className="font-display text-base text-muted-foreground sm:text-lg">VS</p>
          <p className="mt-2 font-mono-stat text-[10px] text-muted-foreground sm:text-[11px]">
            {format(parseISO(game.date), "MMM d · h:mm a")}
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3">
          <TeamMonogram abbreviation={homeAbbr} size="lg" className="h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl" />
          <div className="min-w-0 w-full">
            <p className="font-display text-lg uppercase tracking-wide text-primary sm:text-xl md:text-2xl">
              {homeAbbr}
            </p>
            <p className="mx-auto max-w-full truncate text-xs text-muted-foreground">
              {home?.name ?? "Home"}
            </p>
            {homeElo != null && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Elo{" "}
                <span className="font-mono-stat text-sm text-primary">{formatElo(homeElo)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {pred ? (
        <WinProbBar
          homeProb={pred.home_win_prob}
          awayProb={pred.away_win_prob}
          drawProb={pred.draw_prob}
          homeLabel={homeAbbr}
          awayLabel={awayAbbr}
        />
      ) : (
        <p className="text-sm text-muted-foreground text-center">Predictions pending…</p>
      )}

      {homeElo != null && awayElo != null && (
        <p className="mt-4 text-center text-xs text-muted-foreground font-mono-stat">
          Elo differential: {formatElo(Math.abs(homeElo - awayElo))} pts
          {homeElo >= awayElo ? ` · ${homeAbbr} favored` : ` · ${awayAbbr} favored`}
        </p>
      )}
    </Link>
  )
}
