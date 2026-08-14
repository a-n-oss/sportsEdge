import { getGames } from "@/lib/api"
import { HistoryResultRow } from "@/components/HistoryResultRow"
import { PageHeader } from "@/components/layout/PageHeader"
import { COMPLETED_STATUS_QUERY, sortCompleted } from "@/lib/games"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface HistoryPageProps {
  searchParams: Promise<{ league?: string }>
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams
  const league = params.league?.toLowerCase()

  const games = await getGames({
    league,
    status: COMPLETED_STATUS_QUERY,
    limit: 200,
  }).catch(() => [])

  const results = sortCompleted(games)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Scoreboard Archive"
        title="Prediction History"
        description="Final scores vs our stored pre-game win probabilities. Only games we predicted before tip-off, then saw finalize."
      />

      <p className="max-w-2xl text-sm text-muted-foreground">
        <span className="font-display text-xs uppercase tracking-wider text-primary">
          Closeness
        </span>{" "}
        is the pre-game probability we assigned to the eventual result (winner’s win%, or draw%).
        Higher means we put more weight on what actually happened. Miss-by is{" "}
        <span className="font-mono-stat text-xs">1 − that %</span>. We never invent retrospective
        picks for games synced already final.
      </p>

      {results.length === 0 ? (
        <div className="panel border-dashed p-10 text-center sm:p-12">
          <p className="text-lg text-muted-foreground">No predicted-then-final games yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Accuracy and history grow only after a game is synced while scheduled (so we store a
            prediction), then later updates to final. Games first seen already finished do not
            appear here.
          </p>
          <Link
            href="/accuracy"
            className="mt-6 inline-block font-display text-xs uppercase tracking-wider text-primary hover:underline"
          >
            Model accuracy →
          </Link>
        </div>
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
            <h2 className="font-display text-sm uppercase tracking-[0.15em]">
              Picks vs Outcomes
            </h2>
            <span className="font-mono-stat text-[10px] text-muted-foreground">
              n = {results.length}
            </span>
          </div>
          {results.map((game) => (
            <HistoryResultRow key={game.id} game={game} />
          ))}
        </section>
      )}
    </div>
  )
}
