import { getStandings, getTeams, getLeagues, type Team } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { TeamMonogram } from "@/components/TeamMonogram"
import { Badge } from "@/components/ui/badge"
import { LimitedLeagueNote } from "@/components/LimitedLeagueNote"
import { formatElo } from "@/lib/format"
import {
  fallbackLeagues,
  formatLeagueLabel,
  isSelectedLeagueReady,
  readyLeagueKeys,
  selectVisibleItems,
} from "@/lib/league"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface TeamsPageProps {
  searchParams: Promise<{ league?: string }>
}

export default async function TeamsDirectory({ searchParams }: TeamsPageProps) {
  const params = await searchParams
  const leagueFilter = params.league?.toLowerCase()

  const [teams, leagues] = await Promise.all([
    getTeams(leagueFilter).catch(() => []),
    getLeagues().catch(() => fallbackLeagues()),
  ])

  const readyKeys = new Set(readyLeagueKeys(leagues))
  const visibleTeams = selectVisibleItems(teams, leagueFilter, readyKeys)
  const stubSelected = !isSelectedLeagueReady(leagueFilter, readyKeys)

  const eloByTeam = new Map<number, number>()
  const leaguesToLoad = leagueFilter
    ? [leagueFilter]
    : readyKeys.size > 0
      ? [...readyKeys]
      : [...new Set(visibleTeams.map((t) => t.league))]

  await Promise.all(
    leaguesToLoad.map(async (lg) => {
      const standings = await getStandings(lg).catch(() => [])
      for (const row of standings) {
        eloByTeam.set(row.team_id, row.elo_rating)
      }
    })
  )

  const grouped = visibleTeams.reduce<Record<string, Team[]>>((acc, team) => {
    if (!acc[team.league]) acc[team.league] = []
    acc[team.league].push(team)
    return acc
  }, {})

  return (
    <div className="space-y-12">
      <div>
        <PageHeader
          eyebrow="Directory"
          title="Teams"
          description="Browse teams across active leagues. Elo shown when ratings exist."
        />
        {stubSelected && <LimitedLeagueNote />}
      </div>

      {Object.entries(grouped).map(([league, leagueTeams]) => (
        <section key={league} className="space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h2 className="font-display text-xl uppercase tracking-wide">
              {formatLeagueLabel(league)}
            </h2>
            <Badge variant="secondary" className="rounded-md">
              {leagueTeams.length} teams
            </Badge>
            <Link
              href={`/rankings?league=${league}`}
              className="ml-auto text-[10px] font-display uppercase tracking-wider text-primary hover:underline"
            >
              Rankings →
            </Link>
          </div>

          <div className="panel divide-y divide-border/60">
            {leagueTeams.map((team) => {
              const elo = eloByTeam.get(team.id)
              return (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="interactive-row flex min-w-0 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4"
                >
                  <TeamMonogram abbreviation={team.abbreviation} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display uppercase tracking-wide">{team.name}</p>
                    <p className="font-mono-stat text-xs text-muted-foreground">
                      {team.abbreviation}
                      <span className="mx-1.5 text-border">·</span>
                      <span className="uppercase tracking-wider">
                        {formatLeagueLabel(team.league)}
                      </span>
                    </p>
                  </div>
                  {elo != null && (
                    <div className="shrink-0 text-right">
                      <p className="font-mono-stat text-base tabular-nums text-primary sm:text-lg">
                        {formatElo(elo)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Elo
                      </p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {visibleTeams.length === 0 && (
        <div className="panel p-12 text-center border-dashed">
          <p className="text-muted-foreground text-lg">No teams found.</p>
        </div>
      )}
    </div>
  )
}
