import {
  getGame,
  getGames,
  getStandings,
  getTeamRatingHistory,
  type Game,
  type Team,
} from "@/lib/api"
import { TeamMonogram } from "@/components/TeamMonogram"
import { WinProbBar } from "@/components/WinProbBar"
import { RatingChart } from "@/components/RatingChart"
import { Badge } from "@/components/ui/badge"
import { formatElo, formatProb } from "@/lib/format"
import {
  gameScoreDisplay,
  gameStatusDisplay,
  hasEloTrend,
  predictionCloseness,
  predictionEmptyCopy,
  recentForm,
  statusPillText,
  type FormResult,
} from "@/lib/games"
import { formatLeagueLabel } from "@/lib/league"
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
  const status = gameStatusDisplay(game)
  const close = predictionCloseness(game)

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

  const homeForm = recentForm(leagueGames, game.home_team_id)
  const awayForm = recentForm(leagueGames, game.away_team_id)
  const awayColors = monogramColors(awayAbbr)
  const showTrend = hasEloTrend(homeHistory, awayHistory)
  const showPreGameEdgeLabel =
    Boolean(pred) &&
    (status.kind === "live" || status.kind === "halftime" || status.kind === "final")
  const emptyPredCopy = pred ? null : predictionEmptyCopy(status.kind)

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
          {formatLeagueLabel(game.league)}
        </Badge>
      </div>

      <section className="panel animate-featured-in overflow-hidden p-4 sm:p-6 md:p-10">
        <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mb-8 sm:gap-4 md:gap-10">
          <TeamIdentity team={away} abbr={awayAbbr} elo={awayElo} href={away ? `/teams/${away.id}` : "#"} />

          <KickoffAndScore game={game} />

          <TeamIdentity
            team={home}
            abbr={homeAbbr}
            elo={homeElo}
            href={home ? `/teams/${home.id}` : "#"}
            home
          />
        </div>

        {showPreGameEdgeLabel && (
          <p className="mb-2 text-center font-display text-xs uppercase tracking-[0.15em] text-primary">
            Pre-game edge
          </p>
        )}

        {pred ? (
          <WinProbBar
            homeProb={pred.home_win_prob}
            awayProb={pred.away_win_prob}
            drawProb={pred.draw_prob}
            homeLabel={homeAbbr}
            awayLabel={awayAbbr}
          />
        ) : (
          emptyPredCopy && (
            <p className="text-center text-sm text-muted-foreground">{emptyPredCopy}</p>
          )
        )}

        {close && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge variant={close.favoriteHit ? "default" : "destructive"} className="text-[10px]">
              {close.favoriteHit ? "Hit" : "Miss"}
            </Badge>
            <span className="font-mono-stat text-xs tabular-nums text-primary">
              Close {formatProb(close.winnerProb)}
            </span>
          </div>
        )}
      </section>

      <div className={`grid gap-6 ${showTrend ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <section className="panel space-y-4 p-5">
          <h2 className="font-display text-sm uppercase tracking-[0.15em] text-primary">
            Why This Edge
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="border-b border-border/60 pb-3">
              <span className="font-medium text-foreground">Home-field advantage</span>
              <p className="mt-1 font-mono-stat text-xs">
                +{DEFAULT_HFA} Elo applied to {homeAbbr} (league default)
              </p>
            </li>
            {eloDiff != null && (
              <li className="border-b border-border/60 pb-3">
                <span className="font-medium text-foreground">Elo differential</span>
                <p className="mt-1 font-mono-stat text-xs">
                  {homeAbbr} {eloDiff >= 0 ? "+" : ""}
                  {formatElo(eloDiff)} vs {awayAbbr} (raw, pre-HFA)
                </p>
              </li>
            )}
            {pred && (
              <li>
                <span className="font-medium text-foreground">Model takeaway</span>
                <p className="mt-1 text-xs leading-relaxed">
                  {pred.home_win_prob >= pred.away_win_prob
                    ? `${homeAbbr} is favored at ${formatProb(pred.home_win_prob)} win probability.`
                    : `${awayAbbr} is favored at ${formatProb(pred.away_win_prob)} win probability.`}
                </p>
              </li>
            )}
          </ul>
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="font-display text-sm uppercase tracking-[0.15em]">Recent Form</h2>
          <FormRow abbr={awayAbbr} form={awayForm} />
          <FormRow abbr={homeAbbr} form={homeForm} />
        </section>

        {showTrend && (
          <section className="panel space-y-2 p-5 lg:col-span-1">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">Elo Trend</h2>
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
          </section>
        )}
      </div>
    </div>
  )
}

function TeamIdentity({
  team,
  abbr,
  elo,
  href,
  home = false,
}: {
  team: Team | undefined
  abbr: string
  elo: number | null
  href: string
  home?: boolean
}) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3">
      <TeamMonogram
        abbreviation={abbr}
        size="lg"
        className="h-14 w-14 text-base sm:h-20 sm:w-20 sm:text-xl"
      />
      <div className="min-w-0 w-full">
        <p
          className={`truncate font-display text-lg uppercase tracking-wide sm:text-xl ${
            home ? "text-primary group-hover:underline" : "transition-colors group-hover:text-primary"
          }`}
        >
          {team?.name ?? abbr}
        </p>
        <p className="font-mono-stat text-[10px] uppercase tracking-wider text-muted-foreground">
          {abbr}
        </p>
        {elo != null && (
          <p
            className={`mt-2 font-mono-stat text-base tabular-nums sm:text-lg ${
              home ? "text-primary" : ""
            }`}
          >
            {formatElo(elo)}
          </p>
        )}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Elo</p>
      </div>
    </Link>
  )
}

function KickoffAndScore({ game }: { game: Game }) {
  const score = gameScoreDisplay(game)
  const pill = statusPillText(gameStatusDisplay(game))
  const showScoreBesidePill = score.mode === "score"

  return (
    <div className="shrink-0 px-1 text-center sm:px-2">
      <p className="font-display text-lg text-muted-foreground sm:text-xl">VS</p>
      <p className="mt-2 font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
        {format(parseISO(game.date), "MMM d, yyyy")}
      </p>
      <p className="font-mono-stat text-[10px] text-muted-foreground sm:text-xs">
        {format(parseISO(game.date), "h:mm a")}
      </p>
      {showScoreBesidePill ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <p className="font-mono-stat text-xl tabular-nums text-primary sm:text-2xl">
            {score.away} – {score.home}
          </p>
          <Badge variant="outline" className="uppercase tracking-wider">
            {pill}
          </Badge>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {score.mode === "unavailable" && (
            <p className="text-xs text-muted-foreground">Score unavailable</p>
          )}
          <Badge variant="outline" className="uppercase tracking-wider">
            {pill}
          </Badge>
        </div>
      )}
    </div>
  )
}

function FormRow({ abbr, form }: { abbr: string; form: FormResult[] }) {
  const wins = form.filter((result) => result === "W").length
  const losses = form.filter((result) => result === "L").length

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <TeamMonogram abbreviation={abbr} size="sm" />
        <span className="font-display text-xs uppercase">{abbr}</span>
        {form.length > 0 && (
          <span className="ml-auto font-mono-stat text-xs text-muted-foreground">
            {wins}-{losses}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {form.length === 0 && (
          <span className="text-xs text-muted-foreground">No recent results yet.</span>
        )}
        {form.map((result, index) => (
          <span
            key={`${abbr}-${index}-${result}`}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
              result === "W"
                ? "bg-primary text-primary-foreground"
                : result === "L"
                  ? "bg-destructive/80 text-white"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            {result}
          </span>
        ))}
      </div>
    </div>
  )
}
