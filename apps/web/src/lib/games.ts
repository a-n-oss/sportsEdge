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
 * Drop only the reversed mirror; keep same-orientation rematches (e.g. doubleheaders).
 */
export function dedupeMirrorMatchups(games: Game[]): Game[] {
  const keptByPair = new Map<string, Array<{ home: number; away: number }>>()
  const out: Game[] = []

  for (const game of games) {
    const low = Math.min(game.home_team_id, game.away_team_id)
    const high = Math.max(game.home_team_id, game.away_team_id)
    const day = game.date.slice(0, 10)
    const key = `${game.league}:${day}:${low}:${high}`
    const kept = keptByPair.get(key) ?? []
    const isMirror = kept.some(
      (prior) =>
        prior.home === game.away_team_id && prior.away === game.home_team_id
    )
    if (isMirror) continue
    kept.push({ home: game.home_team_id, away: game.away_team_id })
    keptByPair.set(key, kept)
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
