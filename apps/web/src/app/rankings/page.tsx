import { getLeagues, getStandings } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { TeamMonogram } from "@/components/TeamMonogram"
import { formatElo } from "@/lib/format"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface RankingsPageProps {
  searchParams: Promise<{ league?: string }>
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = await searchParams
  const leagues = await getLeagues().catch(() => ["nba", "nfl", "mlb", "nhl", "epl"])
  const league = (params.league ?? leagues[0] ?? "nba").toLowerCase()

  const standings = await getStandings(league).catch(() => [])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={league.toUpperCase()}
        title="Power Rankings"
        description="Elo rankings for the league. Custom monograms only — abbreviations identify teams."
      />

      <section className="panel overflow-hidden">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] gap-2 border-b border-border px-3 py-3 font-display text-[10px] uppercase tracking-wider text-muted-foreground sm:px-4 md:grid-cols-[3rem_minmax(0,1fr)_6rem_5rem]">
          <span>#</span>
          <span>Team</span>
          <span className="text-right">Elo</span>
          <span className="hidden text-right md:block">Trend</span>
        </div>
        {standings.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">
            No rankings for {league.toUpperCase()} yet.
          </p>
        ) : (
          standings.map((row) => (
            <Link
              key={row.team_id}
              href={`/teams/${row.team_id}`}
              className="interactive-row grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 border-b border-border/50 px-3 py-3 last:border-0 sm:px-4 md:grid-cols-[3rem_minmax(0,1fr)_6rem_5rem]"
            >
              <span className="font-mono-stat text-sm text-muted-foreground">{row.rank}</span>
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <TeamMonogram abbreviation={row.abbreviation} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm uppercase tracking-wide">
                    {row.abbreviation}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{row.name}</p>
                </div>
              </div>
              <span className="text-right font-mono-stat text-sm tabular-nums text-primary">
                {formatElo(row.elo_rating)}
              </span>
              <span className="hidden text-right font-mono-stat text-xs text-muted-foreground md:block">
                {row.trend == null
                  ? "—"
                  : row.trend > 0
                    ? `↑ ${row.trend}`
                    : row.trend < 0
                      ? `↓ ${Math.abs(row.trend)}`
                      : "—"}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
