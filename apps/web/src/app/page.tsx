import { getGamesForLeagues, getLeagues, getStandings } from "@/lib/api"
import { FeaturedMatchup } from "@/components/FeaturedMatchup"
import { UpNextRail } from "@/components/UpNextRail"
import { GameRow } from "@/components/GameRow"
import { HistoryResultRow } from "@/components/HistoryResultRow"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmptyBoard } from "@/components/EmptyBoard"
import { pickFeaturedGame, sortUpcoming, sortCompleted } from "@/lib/games"
import {
  fallbackLeagues,
  isSelectedLeagueReady,
  leaguesToQuery,
  readyLeagueKeys,
} from "@/lib/league"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface DashboardProps {
  searchParams: Promise<{ league?: string }>
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params = await searchParams
  const league = params.league?.toLowerCase()

  const leagues = await getLeagues().catch(() => fallbackLeagues())
  const readyKeys = readyLeagueKeys(leagues)
  const queryLeagues = leaguesToQuery(league, readyKeys)
  const games = await getGamesForLeagues(queryLeagues, { limit: 100 })
  const boardReady = isSelectedLeagueReady(league, new Set(readyKeys))

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
          <FeaturedMatchup game={featured} homeElo={homeElo} awayElo={awayElo} />
          <UpNextRail games={upNext} />
        </div>
      ) : (
        <EmptyBoard ready={boardReady} />
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
              href="/history"
              className="text-[10px] font-display uppercase tracking-wider text-primary hover:underline"
            >
              Full history →
            </Link>
          </div>
          {recentResults.map((game) => (
            <HistoryResultRow key={game.id} game={game} />
          ))}
        </section>
      )}
    </div>
  )
}
