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
      className="panel animate-featured-in block p-6 md:p-8 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-display uppercase tracking-[0.2em] text-primary mb-1">
            Tonight&apos;s Edge
          </p>
          <h2 className="font-display text-2xl md:text-3xl uppercase tracking-tight">
            Featured Matchup
          </h2>
        </div>
        <Badge variant="outline" className="uppercase tracking-wider">
          {game.league}
        </Badge>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-8 mb-8">
        <div className="flex flex-col items-center text-center gap-3">
          <TeamMonogram abbreviation={awayAbbr} size="lg" />
          <div>
            <p className="font-display text-xl md:text-2xl uppercase tracking-wide">{awayAbbr}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[10rem]">
              {away?.name ?? "Away"}
            </p>
            {awayElo != null && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Elo{" "}
                <span className="font-mono-stat text-foreground text-sm">{formatElo(awayElo)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="font-display text-lg text-muted-foreground">VS</p>
          <p className="text-[11px] font-mono-stat text-muted-foreground mt-2">
            {format(parseISO(game.date), "MMM d · h:mm a")}
          </p>
        </div>

        <div className="flex flex-col items-center text-center gap-3">
          <TeamMonogram abbreviation={homeAbbr} size="lg" />
          <div>
            <p className="font-display text-xl md:text-2xl uppercase tracking-wide text-primary">
              {homeAbbr}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-[10rem]">
              {home?.name ?? "Home"}
            </p>
            {homeElo != null && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Elo{" "}
                <span className="font-mono-stat text-primary text-sm">{formatElo(homeElo)}</span>
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
