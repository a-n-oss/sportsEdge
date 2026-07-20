import { getAccuracy } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const dynamic = 'force-dynamic'

export default async function AccuracyPage() {
  const accuracy = await getAccuracy().catch(() => null)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
          Model Accuracy
        </h1>
        <p className="text-xl text-muted-foreground">
          Evaluation of the SportsEdge predictive model using Brier scores and calibration metrics.
        </p>
      </div>

      {!accuracy ? (
        <div className="text-center p-12 glass rounded-xl border border-dashed border-muted-foreground/30">
          <p className="text-muted-foreground text-lg">No accuracy metrics available yet.</p>
          <p className="text-sm text-muted-foreground mt-2">Predictions need to be resolved against completed games first.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass">
            <CardHeader>
              <CardTitle>Brier Score</CardTitle>
              <CardDescription>Mean squared error of predictions</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-12">
              <div className="text-7xl font-black text-primary mb-4">
                {accuracy.brier_score.toFixed(3)}
              </div>
              <Badge variant={accuracy.brier_score < 0.2 ? "default" : "secondary"}>
                {accuracy.brier_score < 0.2 ? "Excellent" : accuracy.brier_score < 0.25 ? "Good" : "Needs Improvement"}
              </Badge>
              <p className="text-sm text-muted-foreground text-center mt-6">
                A lower Brier score indicates better calibrated predictions. A score of 0 is perfect accuracy, while 0.25 indicates random guessing for a 2-way event.
              </p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Calibration Curve</CardTitle>
              <CardDescription>Predicted vs Actual Win Probability</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {accuracy.calibration.map((bin, i) => (
                  <div key={i} className="flex flex-col space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-muted-foreground">
                        Predicted: {(bin.predicted * 100).toFixed(0)}%
                      </span>
                      <span className="font-bold text-foreground">
                        Actual: {(bin.actual * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="relative h-2 w-full bg-secondary rounded-full overflow-hidden">
                      {/* Actual value bar */}
                      <div 
                        className="absolute h-full bg-primary" 
                        style={{ width: `${bin.actual * 100}%` }} 
                      />
                      {/* Expected value marker */}
                      <div 
                        className="absolute h-full w-1 bg-accent/80 top-0 bottom-0 z-10" 
                        style={{ left: `${bin.predicted * 100}%`, transform: 'translateX(-50%)' }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-6">
                <span className="inline-block w-2 h-2 bg-primary rounded-full mr-1"></span> Actual Win Rate
                <span className="inline-block w-1 h-3 bg-accent rounded-full mx-1 ml-4 align-middle"></span> Predicted Probability Bin
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
