import { getAccuracy, getGamesForLeagues, getLeagues } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { HistoryResultRow } from "@/components/HistoryResultRow"
import { LimitedLeagueNote } from "@/components/LimitedLeagueNote"
import { COMPLETED_STATUS_QUERY, sortCompleted } from "@/lib/games"
import {
  fallbackLeagues,
  isSelectedLeagueReady,
  leaguesToQuery,
  readyLeagueKeys,
} from "@/lib/league"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface AccuracyPageProps {
  searchParams: Promise<{ league?: string }>
}

export default async function AccuracyPage({ searchParams }: AccuracyPageProps) {
  const params = await searchParams
  const league = params.league?.toLowerCase()

  const leagues = await getLeagues().catch(() => fallbackLeagues())
  const readyKeys = readyLeagueKeys(leagues)
  const queryLeagues = leaguesToQuery(league, readyKeys)
  const stubSelected = !isSelectedLeagueReady(league, new Set(readyKeys))

  const [accuracy, games] = await Promise.all([
    (league ? getAccuracy({ league }) : getAccuracy()).catch(() => null),
    getGamesForLeagues(queryLeagues, {
      status: COMPLETED_STATUS_QUERY,
      limit: 100,
      hasPrediction: true,
    }),
  ])

  const results = sortCompleted(games).slice(0, 20)
  const sampleSize = accuracy?.sample_size ?? 0
  const hasData = accuracy && sampleSize > 0

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          eyebrow="Model Trust"
          title="Model Accuracy"
          description="Brier scores and calibration from completed games with stored pre-game predictions."
        />
        {stubSelected && <LimitedLeagueNote />}
      </div>

      {!hasData ? (
        <div className="panel border-dashed p-10 text-center sm:p-12">
          <p className="text-lg text-muted-foreground">No accuracy metrics available yet.</p>
          <p className="mt-2 max-w-lg mx-auto text-sm text-muted-foreground">
            We only score games that had a pre-game prediction stored while scheduled, then later
            finalized. Games first synced already final never get a retrospective pick — so
            sample size stays 0 until that scheduled→final cycle happens in production.
          </p>
          {accuracy && (
            <p className="mt-4 font-mono-stat text-xs text-muted-foreground">
              Sample size: {sampleSize}
            </p>
          )}
          <Link
            href="/history"
            className="mt-6 inline-block font-display text-xs uppercase tracking-wider text-primary hover:underline"
          >
            Prediction history →
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="panel p-6">
            <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-1">Brier Score</h2>
            <p className="text-xs text-muted-foreground mb-8">Mean squared error of predictions</p>
            <div className="flex flex-col items-center justify-center py-6">
              <div className="mb-4 font-mono-stat text-5xl tabular-nums text-primary sm:text-7xl">
                {accuracy.brier_score.toFixed(3)}
              </div>
              <Badge variant={accuracy.brier_score < 0.2 ? "default" : "secondary"}>
                {accuracy.brier_score < 0.2
                  ? "Excellent"
                  : accuracy.brier_score < 0.25
                    ? "Good"
                    : "Needs Improvement"}
              </Badge>
              <p className="text-sm text-muted-foreground text-center mt-6 max-w-sm">
                Lower is better. 0 is perfect; ~0.25 is coin-flip for a two-way market.
              </p>
              <p className="font-mono-stat text-xs text-muted-foreground mt-4">
                n = {sampleSize} games
              </p>
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-1">
              Calibration
            </h2>
            <p className="text-xs text-muted-foreground mb-6">Predicted vs actual home win rate</p>
            <div className="space-y-4">
              {accuracy.calibration.map((bin, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-mono-stat text-muted-foreground">
                      Pred {(bin.predicted * 100).toFixed(0)}%
                    </span>
                    <span className="font-mono-stat text-foreground">
                      Actual {(bin.actual * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="relative h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-primary animate-prob-fill"
                      style={{ width: `${bin.actual * 100}%` }}
                    />
                    <div
                      className="absolute h-full w-0.5 bg-foreground top-0 bottom-0 z-10"
                      style={{
                        left: `${bin.predicted * 100}%`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  </div>
                </div>
              ))}
              {accuracy.calibration.length === 0 && (
                <p className="text-sm text-muted-foreground">Not enough bins yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {results.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">
              Picks vs Outcomes
            </h2>
            <Link
              href="/history"
              className="font-display text-[10px] uppercase tracking-wider text-primary hover:underline"
            >
              Full history →
            </Link>
          </div>
          {results.map((game) => (
            <HistoryResultRow key={game.id} game={game} />
          ))}
        </section>
      )}
    </div>
  )
}
