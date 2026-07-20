import { getTeams } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function TeamsDirectory() {
  const teams = await getTeams()

  // Group teams by league
  const grouped = teams.reduce((acc, team) => {
    if (!acc[team.league]) acc[team.league] = []
    acc[team.league].push(team)
    return acc
  }, {} as Record<string, typeof teams>)

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
          Teams Directory
        </h1>
        <p className="text-xl text-muted-foreground">
          Browse teams across all active leagues and view their historical Elo ratings.
        </p>
      </div>

      {Object.entries(grouped).map(([league, leagueTeams]) => (
        <section key={league} className="space-y-6">
          <div className="flex items-center space-x-4 border-b pb-2 border-border/50">
            <h2 className="text-2xl font-bold tracking-tight uppercase">{league}</h2>
            <Badge variant="secondary" className="px-3 rounded-full">{leagueTeams.length} teams</Badge>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {leagueTeams.map((team) => (
              <Link href={`/teams/${team.id}`} key={team.id} className="group block focus:outline-none">
                <Card className="interactive h-full bg-card/40 group-hover:bg-card group-hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">
                        {team.name}
                      </CardTitle>
                    </div>
                    <CardDescription className="font-mono mt-1">
                      {team.abbreviation}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
      
      {teams.length === 0 && (
        <div className="text-center p-12 glass rounded-xl border border-dashed border-muted-foreground/30">
          <p className="text-muted-foreground text-lg">No teams found in the database.</p>
        </div>
      )}
    </div>
  )
}
