import type { Game } from "@/lib/api"

/** Soonest upcoming game with a prediction; otherwise soonest upcoming. */
export function pickFeaturedGame(games: Game[]): Game | null {
  if (games.length === 0) return null
  const withPred = games.filter((g) => g.prediction)
  const pool = withPred.length > 0 ? withPred : games
  return [...pool].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
}

export function sortUpcoming(games: Game[]): Game[] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return games
    .filter((g) => new Date(g.date) >= startOfToday && g.status !== "completed")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function sortCompleted(games: Game[]): Game[] {
  return games
    .filter(
      (g) =>
        g.status === "completed" &&
        g.home_score !== null &&
        g.away_score !== null &&
        g.prediction
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
