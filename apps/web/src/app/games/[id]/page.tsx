import {
  getGame,
  getGames,
  getStandings,
  getTeamRatingHistory,
} from "@/lib/api"
import { TeamMonogram } from "@/components/TeamMonogram"
import { WinProbBar } from "@/components/WinProbBar"
import { RatingChart } from "@/components/RatingChart"
import { Badge } from "@/components/ui/badge"
import { formatElo, formatProb } from "@/lib/format"
import { format, parseISO } from "date-fns"
import Link from "next/link"
import { notFound } from "next/navigation"
import { monogramColors } from "@/lib/monogram"

export const dynamic = "force-dynamic"

/** Sport-agnostic HFA used by the Elo engine (points). */
const DEFAULT_HFA = 55

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const gameId = parseInt(id, 10)
  if (Number.isNaN(gameId)) notFound()

  const game = await getGame(gameId).catch(() => null)
  if (!game) notFound()

  const home = game.home_team
  const away = game.away_team
  const homeAbbr = home?.abbreviation ?? "HOM"
  const awayAbbr = away?.abbreviation ?? "AWY"
  const pred = game.prediction

  const [standings, homeHistory, awayHistory, leagueGames] = await Promise.all([
    getStandings(game.league).catch(() => []),
    home ? getTeamRatingHistory(home.id).catch(() => []) : Promise.resolve([]),
    away ? getTeamRatingHistory(away.id).catch(() => []) : Promise.resolve([]),
    getGames({ league: game.league, limit: 100 }).catch(() => []),
  ])

  const homeElo =
    standings.find((s) => s.team_id === game.home_team_id)?.elo_rating ??
    (homeHistory.length ? homeHistory[homeHistory.length - 1].elo_rating : null)
  const awayElo =
    standings.find((s) => s.team_id === game.away_team_id)?.elo_rating ??
    (awayHistory.length ? awayHistory[awayHistory.length - 1].elo_rating : null)

  const eloDiff =
    homeElo != null && awayElo != null ? homeElo - awayElo : null

  const formFor = (teamId: number) => {
    return leagueGames
      .filter(
        (g) =>
          (g.home_team_id === teamId || g.away_team_id === teamId) &&
          g.status === "completed" &&
          g.home_score != null &&
          g.away_score != null
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
      .map((g) => {
        const isHome = g.home_team_id === teamId
        const my = isHome ? g.home_score! : g.away_score!
        const opp = isHome ? g.away_score! : g.home_score!
        if (my > opp) return "W"
        if (my < opp) return "L"
        return "D"
      })
  }

  const homeForm = formFor(game.home_team_id)
  const awayForm = formFor(game.away_team_id)
  const awayColors = monogramColors(awayAbbr)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          ← Back to board
        </Link>
        <Badge variant="outline" className="uppercase tracking-wider">
          {game.league}
        </Badge>
      </div>

      <section className="panel animate-featured-in overflow-hidden p-4 sm:p-6 md:p-10">
        <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mb-8 sm:gap-4 md:gap-10">
          <Link
            href={away ? `/teams/${away.id}` : "#"}
            className="group flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3"
          >
            <TeamMonogram
              abbreviation={awayAbbr}
              size="lg"
              className="h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl"
            />
            <div className="min-w-0 w-full">
              <p className="font-display text-xl uppercase tracking-wide transition-colors group-hover:text-primary sm:text-2xl">
                {awayAbbr}
              </p>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{away?.name}</p>
              {awayElo != null && (
                <p className="mt-2 font-mono-stat text-base tabular-nums sm:text-lg">
                  {formatElo(awayElo)}
                </p>
              )}
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elo</p>
            </div>
          </Link>

          <div className="shrink-0 px-1 text-center sm:px-2">
            <p className="font-display text-lg text-muted-foreground sm:text-xl">VS</p>
            <p className="mt-2 font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
              {format(parseISO(game.date), "MMM d, yyyy")}
            </p>
            <p className="font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
              {format(parseISO(game.date), "h:mm a")}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              {game.status}
            </p>
            {game.home_score != null && game.away_score != null && (
              <p className="mt-3 font-mono-stat text-xl tabular-nums text-primary sm:text-2xl">
                {game.away_score} – {game.home_score}
              </p>
            )}
          </div>

          <Link
            href={home ? `/teams/${home.id}` : "#"}
            className="group flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3"
          >
            <TeamMonogram
              abbreviation={homeAbbr}
              size="lg"
              className="h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl"
            />
            <div className="min-w-0 w-full">
              <p className="font-display text-xl uppercase tracking-wide text-primary group-hover:underline sm:text-2xl">
                {homeAbbr}
              </p>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">{home?.name}</p>
              {homeElo != null && (
                <p className="mt-2 font-mono-stat text-base tabular-nums text-primary sm:text-lg">
                  {formatElo(homeElo)}
                </p>
              )}
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elo</p>
            </div>
          </Link>
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
          <p className="text-center text-muted-foreground">Predictions pending…</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-sm uppercase tracking-[0.15em] text-primary">
            Why This Edge
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="border-b border-border/60 pb-3">
              <span className="text-foreground font-medium">Home-field advantage</span>
              <p className="mt-1 font-mono-stat text-xs">
                +{DEFAULT_HFA} Elo applied to {homeAbbr} (league default)
              </p>
            </li>
            {eloDiff != null && (
              <li className="border-b border-border/60 pb-3">
                <span className="text-foreground font-medium">Elo differential</span>
                <p className="mt-1 font-mono-stat text-xs">
                  {homeAbbr} {eloDiff >= 0 ? "+" : ""}
                  {formatElo(eloDiff)} vs {awayAbbr} (raw, pre-HFA)
                </p>
              </li>
            )}
            {pred && (
              <li>
                <span className="text-foreground font-medium">Model takeaway</span>
                <p className="mt-1 text-xs leading-relaxed">
                  {pred.home_win_prob >= pred.away_win_prob
                    ? `${homeAbbr} is favored at ${formatProb(pred.home_win_prob)} win probability.`
                    : `${awayAbbr} is favored at ${formatProb(pred.away_win_prob)} win probability.`}
                </p>
              </li>
            )}
          </ul>
        </section>

        <section className="panel p-5 space-y-4">
          <h2 className="font-display text-sm uppercase tracking-[0.15em]">Recent Form</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TeamMonogram abbreviation={awayAbbr} size="sm" />
                <span className="font-display text-xs uppercase">{awayAbbr}</span>
                <span className="font-mono-stat text-xs text-muted-foreground ml-auto">
                  {awayForm.filter((r) => r === "W").length}-{awayForm.filter((r) => r === "L").length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {awayForm.length === 0 && (
                  <span className="text-xs text-muted-foreground">No recent results</span>
                )}
                {awayForm.map((r, i) => (
                  <span
                    key={i}
                    className={`w-6 h-6 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                      r === "W"
                        ? "bg-primary text-primary-foreground"
                        : r === "L"
                          ? "bg-destructive/80 text-white"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TeamMonogram abbreviation={homeAbbr} size="sm" />
                <span className="font-display text-xs uppercase">{homeAbbr}</span>
                <span className="font-mono-stat text-xs text-muted-foreground ml-auto">
                  {homeForm.filter((r) => r === "W").length}-{homeForm.filter((r) => r === "L").length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {homeForm.length === 0 && (
                  <span className="text-xs text-muted-foreground">No recent results</span>
                )}
                {homeForm.map((r, i) => (
                  <span
                    key={i}
                    className={`w-6 h-6 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                      r === "W"
                        ? "bg-primary text-primary-foreground"
                        : r === "L"
                          ? "bg-destructive/80 text-white"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-5 lg:col-span-1 space-y-2">
          <h2 className="font-display text-sm uppercase tracking-[0.15em]">Elo Trend</h2>
          {homeHistory.length > 0 || awayHistory.length > 0 ? (
            <RatingChart
              series={[
                {
                  key: "away",
                  label: awayAbbr,
                  color: awayColors.fg,
                  data: awayHistory,
                },
                {
                  key: "home",
                  label: homeAbbr,
                  color: "#c9a227",
                  data: homeHistory,
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No history yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
