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
        <div className="grid grid-cols-[3rem_1fr_6rem_5rem] md:grid-cols-[3rem_1fr_8rem_6rem] gap-2 px-4 py-3 border-b border-border text-[10px] font-display uppercase tracking-wider text-muted-foreground">
          <span>#</span>
          <span>Team</span>
          <span className="text-right">Elo</span>
          <span className="text-right hidden md:block">Trend</span>
          <span className="text-right md:hidden"> </span>
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
              className="interactive-row grid grid-cols-[3rem_1fr_6rem_5rem] md:grid-cols-[3rem_1fr_8rem_6rem] gap-2 items-center px-4 py-3 border-b border-border/50 last:border-0"
            >
              <span className="font-mono-stat text-sm text-muted-foreground">{row.rank}</span>
              <div className="flex items-center gap-3 min-w-0">
                <TeamMonogram abbreviation={row.abbreviation} size="sm" />
                <div className="min-w-0">
                  <p className="font-display text-sm uppercase tracking-wide truncate">
                    {row.abbreviation}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{row.name}</p>
                </div>
              </div>
              <span className="font-mono-stat text-sm text-primary text-right">
                {formatElo(row.elo_rating)}
              </span>
              <span className="font-mono-stat text-xs text-muted-foreground text-right">
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
