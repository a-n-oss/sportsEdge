import type { Game } from "@/lib/api"

/** Soonest upcoming game with a prediction; otherwise soonest upcoming. */
export function pickFeaturedGame(games: Game[]): Game | null {
  if (games.length === 0) return null
  const withPred = games.filter((g) => g.prediction)
  const pool = withPred.length > 0 ? withPred : games
  return [...pool].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
}

/**
 * ESPN occasionally lists both orientations of the same slate (A@B and B@A).
 * Keep the first occurrence after sort so the board does not look cross-labeled.
 */
export function dedupeMirrorMatchups(games: Game[]): Game[] {
  const seen = new Set<string>()
  const out: Game[] = []

  for (const game of games) {
    const low = Math.min(game.home_team_id, game.away_team_id)
    const high = Math.max(game.home_team_id, game.away_team_id)
    const day = game.date.slice(0, 10)
    const key = `${game.league}:${day}:${low}:${high}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(game)
  }

  return out
}

export function sortUpcoming(games: Game[]): Game[] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return dedupeMirrorMatchups(
    games
      .filter((g) => new Date(g.date) >= startOfToday && g.status !== "completed")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  )
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
