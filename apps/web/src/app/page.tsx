import { getGames } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format, parseISO } from "date-fns"

export const dynamic = 'force-dynamic' // Ensure we fetch latest games

export default async function Dashboard() {
  const games = await getGames()

  // Sort games by date and take the first 50 upcoming ones
  const upcomingGames = games
    .filter(g => new Date(g.date) >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 50)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mb-4">
          SportsEdge Predictions
        </h1>
        <p className="text-xl text-muted-foreground">
          Algorithmic sports analytics and predictive modeling for upcoming matchups.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {upcomingGames.map(game => {
          const homeTeam = game.home_team?.name || `Team ${game.home_team_id}`
          const awayTeam = game.away_team?.name || `Team ${game.away_team_id}`
          const homeProb = game.prediction?.home_win_prob
          const awayProb = game.prediction?.away_win_prob
          const drawProb = game.prediction?.draw_prob

          return (
            <Card key={game.id} className="interactive">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{game.league}</Badge>
                  <span className="text-xs text-muted-foreground font-medium">
                    {format(parseISO(game.date), "MMM d, h:mm a")}
                  </span>
                </div>
                <CardTitle className="text-lg mt-2 leading-tight">
                  {awayTeam} <span className="text-muted-foreground text-sm font-normal mx-1">at</span> {homeTeam}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {game.prediction ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm font-medium">
                        <span>{homeTeam} (Home)</span>
                        <span className="text-accent">{(homeProb! * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${homeProb! * 100}%` }} />
                      </div>
                    </div>

                    {drawProb !== null && drawProb !== undefined && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm font-medium">
                          <span>Draw</span>
                          <span className="text-muted-foreground">{(drawProb * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-muted-foreground" style={{ width: `${drawProb * 100}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm font-medium">
                        <span>{awayTeam} (Away)</span>
                        <span className="text-primary">{(awayProb! * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${awayProb! * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Predictions pending...
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {upcomingGames.length === 0 && (
        <div className="text-center p-12 glass rounded-xl border border-dashed border-muted-foreground/30">
          <p className="text-muted-foreground text-lg">No upcoming games found.</p>
        </div>
      )}
    </div>
  )
}
