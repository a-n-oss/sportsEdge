import type { Game, Prediction } from "@/lib/api"

/** ESPN scoreboards use STATUS_*; seed/tests may use short labels. */
export function isCompletedStatus(status: string): boolean {
  return status === "STATUS_FINAL" || status === "completed"
}

export type OutcomeSide = "home" | "away" | "draw"

export interface PredictionCloseness {
  /** Pre-game probability assigned to the eventual outcome (winner or draw). */
  winnerProb: number
  /** Absolute gap from a perfect call on that side: 1 − winnerProb. Lower = closer. */
  missBy: number
  outcome: OutcomeSide
  favoriteHit: boolean
  modelFavorite: OutcomeSide
}

/**
 * How close we predicted: the pre-game win% (or draw%) for what actually happened.
 * Higher winnerProb / lower missBy means the model put more weight on the real result.
 */
export function predictionCloseness(game: Game): PredictionCloseness | null {
  const pred = game.prediction
  if (
    !pred ||
    game.home_score == null ||
    game.away_score == null ||
    !isCompletedStatus(game.status)
  ) {
    return null
  }

  const outcome: OutcomeSide =
    game.home_score > game.away_score
      ? "home"
      : game.away_score > game.home_score
        ? "away"
        : "draw"

  const modelFavorite = modelFavoriteSide(pred)
  const winnerProb = outcomeProbability(pred, outcome)
  const favoriteHit =
    outcome === "draw"
      ? modelFavorite === "draw"
      : modelFavorite === outcome

  return {
    winnerProb,
    missBy: 1 - winnerProb,
    outcome,
    favoriteHit,
    modelFavorite,
  }
}

function modelFavoriteSide(pred: Prediction): OutcomeSide {
  const draw = pred.draw_prob ?? 0
  if (draw >= pred.home_win_prob && draw >= pred.away_win_prob) {
    return "draw"
  }
  return pred.home_win_prob >= pred.away_win_prob ? "home" : "away"
}

function outcomeProbability(pred: Prediction, outcome: OutcomeSide): number {
  switch (outcome) {
    case "home":
      return pred.home_win_prob
    case "away":
      return pred.away_win_prob
    case "draw":
      return pred.draw_prob ?? 0
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

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
      .filter((g) => new Date(g.date) >= startOfToday && !isCompletedStatus(g.status))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  )
}

export function sortCompleted(games: Game[]): Game[] {
  return games
    .filter(
      (g) =>
        isCompletedStatus(g.status) &&
        g.home_score !== null &&
        g.away_score !== null &&
        g.prediction
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/** Status query value that matches ESPN finals and seed/test completed rows. */
export const COMPLETED_STATUS_QUERY = "STATUS_FINAL,completed" as const
