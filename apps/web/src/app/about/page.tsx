import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function AboutPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 text-primary">
          About SportsEdge
        </h1>
        <p className="text-xl text-muted-foreground">
          The math behind the predictions.
        </p>
      </div>

      <div className="space-y-8">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-2xl">The Elo Rating System</CardTitle>
            <CardDescription>Zero-sum competitive tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              SportsEdge uses a modified Elo rating system to track team strength across different leagues. Originally invented by Arpad Elo for chess, the system is zero-sum: after every game, the winning team takes points from the losing team.
            </p>
            <p>
              The number of points exchanged depends on the difference in ratings between the two teams. If a highly-rated team beats a lower-rated team, only a few points change hands. However, if an underdog pulls off an upset, a significant number of points are transferred.
            </p>
            <div className="p-4 bg-secondary/50 rounded-lg border border-border">
              <code className="text-sm text-foreground">
                Expected Score = 1 / (1 + 10 ^ ((Opponent Rating - Team Rating) / 400))
              </code>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-2xl">Key Variables & Modifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-muted-foreground leading-relaxed">
            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">K-Factor</h3>
              <p>
                The K-factor determines how reactive the system is to recent results. SportsEdge uses a dynamic K-factor of <strong>20.0</strong> for standard games. This ensures ratings are stable but adapt quickly to changing team forms.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">Home Field Advantage (HFA)</h3>
              <p>
                Playing at home provides a statistical advantage across all sports. We artificially inflate the home team&apos;s rating by a specific amount (typically <strong>50 points</strong>, depending on the sport) when calculating win probabilities to account for this edge.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">Margin of Victory (MOV) Multiplier</h3>
              <p>
                Not all wins are equal. A 30-point blowout is far more indicative of team strength than a 1-point buzzer-beater. Our model calculates a MOV multiplier that increases the point exchange for decisive victories, adjusting for the fact that a stronger team is already expected to win by a larger margin.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">Season Regression</h3>
              <p>
                During the off-season, team rosters change. Drafts, free agency, and trades mean a team is rarely exactly the same strength at the start of a new season as they were at the end of the previous one. To account for this, all ratings are regressed by <strong>30%</strong> toward the mean (1500) before the first game of a new season.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-2xl">Soccer 3-Way Probabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Unlike most American sports, soccer matches frequently end in a draw. The standard Elo system is designed for binary outcomes (Win/Loss).
            </p>
            <p>
              To handle the English Premier League (EPL), we use a statistical conversion that models the probability of a draw as a function of the difference in team ratings. When two evenly matched teams play, the draw probability is highest (around 25-30%). As the skill gap widens, the draw probability decreases.
            </p>
            <p>
              The remaining probability is then distributed proportionally between the home and away teams based on their base expected scores.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
