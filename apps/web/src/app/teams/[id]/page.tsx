import { getTeam, getTeamRatingHistory, getGames } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RatingChart } from "@/components/RatingChart"
import { format, parseISO } from "date-fns"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function TeamDetail({ params }: { params: { id: string } }) {
  const teamId = parseInt(params.id, 10)
  const [team, history, allGames] = await Promise.all([
    getTeam(teamId),
    getTeamRatingHistory(teamId).catch(() => []),
    getGames()
  ])

  const latestRating = history.length > 0 ? history[history.length - 1].elo_rating : null

  // Find recent and upcoming games for this team
  const teamGames = allGames.filter(g => g.home_team_id === teamId || g.away_team_id === teamId)
  const now = new Date()
  
  const upcomingGames = teamGames
    .filter(g => new Date(g.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  const pastGames = teamGames
    .filter(g => new Date(g.date) < now && (g.home_score !== null && g.away_score !== null))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Badge variant="outline" className="uppercase tracking-widest">{team.league}</Badge>
            <span className="text-muted-foreground font-mono">{team.abbreviation}</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
            {team.name}
          </h1>
        </div>
        {latestRating !== null && (
          <div className="glass px-6 py-4 rounded-xl border border-primary/20 text-center">
            <div className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Current Elo</div>
            <div className="text-4xl font-bold text-primary">{Math.round(latestRating)}</div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 glass">
          <CardHeader>
            <CardTitle>Elo Rating History</CardTitle>
            <CardDescription>Performance tracking over time</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <RatingChart data={history} />
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground border border-dashed rounded-lg mt-4">
                No rating history available.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle>Upcoming Games</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingGames.length > 0 ? (
                <ul className="space-y-4">
                  {upcomingGames.map(g => {
                    const isHome = g.home_team_id === teamId
                    const opponent = isHome ? (g.away_team?.name || 'Unknown') : (g.home_team?.name || 'Unknown')
                    return (
                      <li key={g.id} className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                        <div>
                          <div className="text-sm font-medium">
                            <span className="text-muted-foreground mr-1">{isHome ? 'vs' : '@'}</span> {opponent}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(parseISO(g.date), "MMM d, h:mm a")}
                          </div>
                        </div>
                        {g.prediction && (
                          <Badge variant="secondary">
                            {isHome 
                              ? `${(g.prediction.home_win_prob * 100).toFixed(0)}% win` 
                              : `${(g.prediction.away_win_prob * 100).toFixed(0)}% win`}
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No upcoming games scheduled.</div>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Recent Form</CardTitle>
            </CardHeader>
            <CardContent>
              {pastGames.length > 0 ? (
                <ul className="space-y-4">
                  {pastGames.map(g => {
                    const isHome = g.home_team_id === teamId
                    const opponent = isHome ? (g.away_team?.name || 'Unknown') : (g.home_team?.name || 'Unknown')
                    const myScore = isHome ? g.home_score : g.away_score
                    const oppScore = isHome ? g.away_score : g.home_score
                    
                    let result = 'D'
                    let variant: "default" | "destructive" | "secondary" = 'secondary'
                    if (myScore! > oppScore!) { result = 'W'; variant = 'default' }
                    else if (myScore! < oppScore!) { result = 'L'; variant = 'destructive' }

                    return (
                      <li key={g.id} className="flex justify-between items-center border-b border-border/50 pb-3 last:border-0 last:pb-0">
                        <div>
                          <div className="text-sm font-medium">
                            <span className="text-muted-foreground mr-1">{isHome ? 'vs' : '@'}</span> {opponent}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(parseISO(g.date), "MMM d")}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono">{myScore} - {oppScore}</span>
                          <Badge variant={variant} className="w-6 h-6 p-0 flex items-center justify-center">{result}</Badge>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No recent games.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <div className="mt-8">
        <Link href="/teams" className="text-primary hover:underline text-sm font-medium">
          &larr; Back to Teams
        </Link>
      </div>
    </div>
  )
}
