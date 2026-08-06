import { getTeam, getTeamRatingHistory, getGames } from "@/lib/api"
import { TeamMonogram } from "@/components/TeamMonogram"
import { Badge } from "@/components/ui/badge"
import { RatingChart } from "@/components/RatingChart"
import { WinProbBar } from "@/components/WinProbBar"
import { formatElo } from "@/lib/format"
import { format, parseISO } from "date-fns"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function TeamDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const teamId = parseInt(resolvedParams.id, 10)
  const [team, history, allGames] = await Promise.all([
    getTeam(teamId),
    getTeamRatingHistory(teamId).catch(() => []),
    getGames({ league: undefined, limit: 100 }),
  ])

  const latestRating = history.length > 0 ? history[history.length - 1].elo_rating : null

  const teamGames = allGames.filter(
    (g) => g.home_team_id === teamId || g.away_team_id === teamId
  )
  const now = new Date()

  const upcomingGames = teamGames
    .filter((g) => new Date(g.date) >= now && g.status !== "completed")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  const pastGames = teamGames
    .filter(
      (g) =>
        new Date(g.date) < now && g.home_score !== null && g.away_score !== null
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <TeamMonogram
            abbreviation={team.abbreviation}
            size="lg"
            className="h-16 w-16 text-lg sm:h-20 sm:w-20 sm:text-xl"
          />
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge variant="outline" className="uppercase tracking-widest">
                {team.league}
              </Badge>
              <span className="font-mono-stat text-muted-foreground">{team.abbreviation}</span>
            </div>
            <h1 className="font-display text-2xl uppercase tracking-tight sm:text-3xl md:text-5xl">
              {team.name}
            </h1>
          </div>
        </div>
        {latestRating !== null && (
          <div className="panel shrink-0 px-5 py-3 text-center sm:px-6 sm:py-4">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Current Elo
            </div>
            <div className="font-mono-stat text-3xl tabular-nums text-primary sm:text-4xl">
              {formatElo(latestRating)}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-1">
            Elo Rating History
          </h2>
          <p className="text-xs text-muted-foreground mb-2">Performance tracking over time</p>
          {history.length > 0 ? (
            <RatingChart data={history} />
          ) : (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg mt-4">
              No rating history available.
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-4">
              Upcoming Games
            </h2>
            {upcomingGames.length > 0 ? (
              <ul className="space-y-4">
                {upcomingGames.map((g) => {
                  const isHome = g.home_team_id === teamId
                  const opponent = isHome
                    ? g.away_team?.abbreviation || "???"
                    : g.home_team?.abbreviation || "???"
                  return (
                    <li key={g.id}>
                      <Link
                        href={`/games/${g.id}`}
                        className="interactive-row block -mx-2 px-2 py-2 rounded-md"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <TeamMonogram abbreviation={opponent} size="sm" />
                            <div>
                              <div className="text-sm font-display uppercase">
                                <span className="text-muted-foreground mr-1">
                                  {isHome ? "vs" : "@"}
                                </span>
                                {opponent}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono-stat">
                                {format(parseISO(g.date), "MMM d, h:mm a")}
                              </div>
                            </div>
                          </div>
                        </div>
                        {g.prediction && (
                          <div className="mt-2">
                            <WinProbBar
                              homeProb={g.prediction.home_win_prob}
                              awayProb={g.prediction.away_win_prob}
                              drawProb={g.prediction.draw_prob}
                              size="sm"
                              animate={false}
                            />
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No upcoming games scheduled.</div>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-4">Recent Form</h2>
            {pastGames.length > 0 ? (
              <ul className="space-y-3">
                {pastGames.map((g) => {
                  const isHome = g.home_team_id === teamId
                  const opponent = isHome
                    ? g.away_team?.abbreviation || "???"
                    : g.home_team?.abbreviation || "???"
                  const myScore = isHome ? g.home_score : g.away_score
                  const oppScore = isHome ? g.away_score : g.home_score

                  let result = "D"
                  let variant: "default" | "destructive" | "secondary" = "secondary"
                  if (myScore! > oppScore!) {
                    result = "W"
                    variant = "default"
                  } else if (myScore! < oppScore!) {
                    result = "L"
                    variant = "destructive"
                  }

                  return (
                    <li key={g.id}>
                      <Link
                        href={`/games/${g.id}`}
                        className="flex justify-between items-center interactive-row -mx-2 px-2 py-2 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <TeamMonogram abbreviation={opponent} size="sm" />
                          <div>
                            <div className="text-sm font-display uppercase">
                              <span className="text-muted-foreground mr-1">
                                {isHome ? "vs" : "@"}
                              </span>
                              {opponent}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono-stat">
                              {format(parseISO(g.date), "MMM d")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono-stat">
                            {myScore} – {oppScore}
                          </span>
                          <Badge
                            variant={variant}
                            className="w-6 h-6 p-0 flex items-center justify-center"
                          >
                            {result}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No recent games.</div>
            )}
          </section>
        </div>
      </div>

      <Link
        href="/teams"
        className="text-primary hover:underline text-xs font-display uppercase tracking-wider"
      >
        ← Back to Teams
      </Link>
    </div>
  )
}
