import { getGames, getStandings } from "@/lib/api"
import { FeaturedMatchup } from "@/components/FeaturedMatchup"
import { UpNextRail } from "@/components/UpNextRail"
import { GameRow } from "@/components/GameRow"
import { PageHeader } from "@/components/layout/PageHeader"
import { pickFeaturedGame, sortUpcoming, sortCompleted } from "@/lib/games"
import { TeamMonogram } from "@/components/TeamMonogram"
import { formatProb } from "@/lib/format"
import { format, parseISO } from "date-fns"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

interface DashboardProps {
  searchParams: Promise<{ league?: string }>
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams
  const league = params.league?.toLowerCase()

  const games = await getGames({
    league,
    limit: 100,
  }).catch(() => [])

  const upcoming = sortUpcoming(games)
  const featured = pickFeaturedGame(upcoming)
  const upNext = upcoming.filter((g) => g.id !== featured?.id).slice(0, 6)
  const rest = upcoming.filter((g) => g.id !== featured?.id).slice(6, 20)
  const recentResults = sortCompleted(games).slice(0, 5)

  let homeElo: number | null = null
  let awayElo: number | null = null
  if (featured) {
    try {
      const standings = await getStandings(featured.league)
      homeElo = standings.find((s) => s.team_id === featured.home_team_id)?.elo_rating ?? null
      awayElo = standings.find((s) => s.team_id === featured.away_team_id)?.elo_rating ?? null
    } catch {
      // standings optional for featured panel
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Broadcast Board"
        title="SportsEdge Predictions"
        description="Elo-powered win probabilities for tonight's slate. Abbreviations and custom monograms only — not affiliated with any league."
      />

      {featured ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <FeaturedMatchup game={featured} homeElo={homeElo} awayElo={awayElo} />
          <UpNextRail games={upNext} />
        </div>
      ) : (
        <div className="panel p-12 text-center border-dashed">
          <p className="text-muted-foreground text-lg">No upcoming games found.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Sync data or adjust the league filter.
          </p>
        </div>
      )}

      {rest.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">More Games</h2>
          </div>
          {rest.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </section>
      )}

      {recentResults.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">
              Picks vs Outcomes
            </h2>
            <Link
              href="/accuracy"
              className="text-[10px] font-display uppercase tracking-wider text-primary hover:underline"
            >
              Model accuracy →
            </Link>
          </div>
          {recentResults.map((game) => {
            const homeWon =
              game.home_score != null &&
              game.away_score != null &&
              game.home_score > game.away_score
            const awayWon =
              game.home_score != null &&
              game.away_score != null &&
              game.away_score > game.home_score
            const pred = game.prediction!
            const modelFavoredHome = pred.home_win_prob >= pred.away_win_prob
            const correct =
              (modelFavoredHome && homeWon) || (!modelFavoredHome && awayWon)
            const homeAbbr = game.home_team?.abbreviation ?? "HOM"
            const awayAbbr = game.away_team?.abbreviation ?? "AWY"

            return (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="interactive-row flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0"
              >
                <TeamMonogram abbreviation={awayAbbr} size="sm" />
                <span className="font-mono-stat text-sm">
                  {awayAbbr} {game.away_score} – {game.home_score} {homeAbbr}
                </span>
                <TeamMonogram abbreviation={homeAbbr} size="sm" />
                <span className="text-[10px] text-muted-foreground font-mono-stat ml-auto">
                  {format(parseISO(game.date), "MMM d")}
                </span>
                <span className="font-mono-stat text-xs text-muted-foreground">
                  Model {formatProb(Math.max(pred.home_win_prob, pred.away_win_prob))}
                </span>
                <Badge variant={correct ? "default" : "destructive"} className="text-[10px]">
                  {correct ? "Hit" : "Miss"}
                </Badge>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
