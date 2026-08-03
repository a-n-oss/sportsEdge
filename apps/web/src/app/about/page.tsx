import { PageHeader } from "@/components/layout/PageHeader"

export default function AboutPage() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Methodology"
        title="About SportsEdge"
        description="The math behind the predictions."
      />

      <div className="space-y-6">
        <section className="panel p-6 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wide">The Elo Rating System</h2>
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            Zero-sum competitive tracking
          </p>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              SportsEdge uses a modified Elo rating system to track team strength across different
              leagues. Originally invented by Arpad Elo for chess, the system is zero-sum: after
              every game, the winning team takes points from the losing team.
            </p>
            <p>
              The number of points exchanged depends on the difference in ratings between the two
              teams. If a highly-rated team beats a lower-rated team, only a few points change
              hands. However, if an underdog pulls off an upset, a significant number of points are
              transferred.
            </p>
            <div className="p-4 bg-secondary/50 rounded-lg border border-border">
              <code className="text-sm text-foreground font-mono-stat">
                Expected Score = 1 / (1 + 10 ^ ((Opponent Rating - Team Rating) / 400))
              </code>
            </div>
          </div>
        </section>

        <section className="panel p-6 space-y-6">
          <h2 className="font-display text-xl uppercase tracking-wide">
            Key Variables & Modifications
          </h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed">
            <div>
              <h3 className="text-base font-display uppercase tracking-wide text-foreground mb-2">
                K-Factor
              </h3>
              <p>
                The K-factor determines how reactive the system is to recent results. SportsEdge
                uses a dynamic K-factor of <strong className="text-foreground">20.0</strong> for
                standard games (24.0 for EPL).
              </p>
            </div>

            <div>
              <h3 className="text-base font-display uppercase tracking-wide text-foreground mb-2">
                Home Field Advantage (HFA)
              </h3>
              <p>
                Playing at home provides a statistical advantage across all sports. We inflate the
                home team&apos;s rating by{" "}
                <strong className="text-foreground">55 Elo points</strong> when calculating win
                probabilities.
              </p>
            </div>

            <div>
              <h3 className="text-base font-display uppercase tracking-wide text-foreground mb-2">
                Margin of Victory (MOV) Multiplier
              </h3>
              <p>
                Not all wins are equal. A blowout transfers more rating points than a one-point
                finish, adjusted for the fact that a stronger team is already expected to win by a
                larger margin.
              </p>
            </div>

            <div>
              <h3 className="text-base font-display uppercase tracking-wide text-foreground mb-2">
                Season Regression
              </h3>
              <p>
                Between seasons, ratings regress by{" "}
                <strong className="text-foreground">30%</strong> toward the mean (1500) to account
                for roster turnover.
              </p>
            </div>
          </div>
        </section>

        <section className="panel p-6 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wide">
            Soccer 3-Way Probabilities
          </h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Unlike most American sports, soccer matches frequently end in a draw. The standard
              Elo system is designed for binary outcomes (Win/Loss).
            </p>
            <p>
              For the English Premier League (EPL), we model draw probability as a function of the
              rating gap. Evenly matched teams have the highest draw chance (~25–30%); as the skill
              gap widens, draw probability falls and remaining mass is split between home and away.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
