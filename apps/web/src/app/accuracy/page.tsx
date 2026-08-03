import { getAccuracy, getGames } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { TeamMonogram } from "@/components/TeamMonogram"
import { formatProb } from "@/lib/format"
import { sortCompleted } from "@/lib/games"
import { format, parseISO } from "date-fns"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AccuracyPage() {
  const [accuracy, games] = await Promise.all([
    getAccuracy().catch(() => null),
    getGames({ status: "completed", limit: 100 }).catch(() => []),
  ])

  const results = sortCompleted(games).slice(0, 20)
  const sampleSize = accuracy?.sample_size ?? 0
  const hasData = accuracy && sampleSize > 0

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Model Trust"
        title="Model Accuracy"
        description="Brier scores and calibration from completed games with stored pre-game predictions."
      />

      {!hasData ? (
        <div className="panel p-12 text-center border-dashed">
          <p className="text-muted-foreground text-lg">No accuracy metrics available yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Predictions need to be resolved against completed games first.
          </p>
          {accuracy && (
            <p className="font-mono-stat text-xs text-muted-foreground mt-4">
              Sample size: {sampleSize}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="panel p-6">
            <h2 className="font-display text-sm uppercase tracking-[0.15em] mb-1">Brier Score</h2>
            <p className="text-xs text-muted-foreground mb-8">Mean squared error of predictions</p>
            <div className="flex flex-col items-center justify-center py-6">
              <div className="font-mono-stat text-7xl text-primary mb-4">
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
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">
              Picks vs Outcomes
            </h2>
          </div>
          {results.map((game) => {
            const homeWon = game.home_score! > game.away_score!
            const awayWon = game.away_score! > game.home_score!
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
                className="interactive-row flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0"
              >
                <span className="font-mono-stat text-[10px] text-muted-foreground w-14">
                  {format(parseISO(game.date), "MMM d")}
                </span>
                <TeamMonogram abbreviation={awayAbbr} size="sm" />
                <span className="font-mono-stat text-sm">
                  {awayAbbr} {game.away_score} – {game.home_score} {homeAbbr}
                </span>
                <TeamMonogram abbreviation={homeAbbr} size="sm" />
                <span className="font-mono-stat text-xs text-muted-foreground ml-auto">
                  Pred {formatProb(Math.max(pred.home_win_prob, pred.away_win_prob))}{" "}
                  {modelFavoredHome ? homeAbbr : awayAbbr}
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
