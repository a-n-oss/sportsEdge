import type { Game, Prediction } from "@/lib/api"

export type GameStatusKind =
  | "scheduled"
  | "pregame"
  | "live"
  | "halftime"
  | "final"
  | "postponed"
  | "canceled"
  | "delayed"
  | "tbd"

export interface GameStatusDisplay {
  kind: GameStatusKind
  label: string
  period: string | null
  updating?: boolean
}

export type ScoreDisplay =
  | { mode: "hidden" }
  | { mode: "score"; away: number; home: number }
  | { mode: "unavailable" }

export type FormResult = "W" | "D" | "L"

const KIND_LABEL: Record<GameStatusKind, string> = {
  scheduled: "Scheduled",
  pregame: "Pregame",
  live: "Live",
  halftime: "Halftime",
  final: "Final",
  postponed: "Postponed",
  canceled: "Canceled",
  delayed: "Delayed",
  tbd: "TBD",
}

const KIND_BY_TOKEN: Record<string, GameStatusKind> = {
  scheduled: "scheduled",
  status_scheduled: "scheduled",
  pregame: "pregame",
  pre_game: "pregame",
  status_pregame: "pregame",
  status_pre_game: "pregame",
  warmup: "pregame",
  status_warmup: "pregame",
  in_progress: "live",
  status_in_progress: "live",
  first_half: "live",
  status_first_half: "live",
  second_half: "live",
  status_second_half: "live",
  first_quarter: "live",
  status_first_quarter: "live",
  second_quarter: "live",
  status_second_quarter: "live",
  third_quarter: "live",
  status_third_quarter: "live",
  fourth_quarter: "live",
  status_fourth_quarter: "live",
  end_period: "live",
  status_end_period: "live",
  begin_period: "live",
  status_begin_period: "live",
  overtime: "live",
  status_overtime: "live",
  halftime: "halftime",
  half_time: "halftime",
  status_halftime: "halftime",
  status_half_time: "halftime",
  ht: "halftime",
  final: "final",
  completed: "final",
  status_final: "final",
  full_time: "final",
  status_full_time: "final",
  ft: "final",
  status_ft: "final",
  status_final_ot: "final",
  status_final_aet: "final",
  status_final_pen: "final",
  postponed: "postponed",
  status_postponed: "postponed",
  canceled: "canceled",
  cancelled: "canceled",
  status_canceled: "canceled",
  status_cancelled: "canceled",
  delayed: "delayed",
  status_delayed: "delayed",
  rain_delay: "delayed",
  status_rain_delay: "delayed",
}

function statusToken(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function periodFromToken(token: string): string | null {
  if (token.includes("first_half")) return "1H"
  if (token.includes("second_half")) return "2H"
  if (token.includes("first_quarter")) return "Q1"
  if (token.includes("second_quarter")) return "Q2"
  if (token.includes("third_quarter")) return "Q3"
  if (token.includes("fourth_quarter")) return "Q4"
  if (token.includes("overtime") || /(?:^|_)ot(?:_|$)/.test(token)) return "OT"
  const quarter = token.match(/(?:^|_)q([1-4])(?:_|$)/)
  if (quarter) return `Q${quarter[1]}`
  const period = token.match(/(?:^|_)(?:p|period_?)([1-9])(?:_|$)/)
  if (period) return `P${period[1]}`
  return null
}

function inferKind(token: string): GameStatusKind {
  const mapped = KIND_BY_TOKEN[token]
  if (mapped) return mapped
  if (
    periodFromToken(token) ||
    token.includes("in_progress") ||
    token.includes("end_period") ||
    token.includes("begin_period")
  ) {
    return "live"
  }
  if (token.includes("full_time") || token.includes("completed") || token.includes("final")) {
    return "final"
  }
  if (token.includes("postpone")) return "postponed"
  if (token.includes("cancel")) return "canceled"
  if (token.includes("delay")) return "delayed"
  if (token.includes("pregame") || token.includes("warmup")) return "pregame"
  if (token.includes("halftime") || token.includes("half_time")) return "halftime"
  if (token.includes("schedul")) return "scheduled"
  return "tbd"
}

export function formatGameStatus(status: string): GameStatusDisplay {
  const token = statusToken(status)
  const kind = inferKind(token)
  const period = kind === "live" ? periodFromToken(token) : null
  return { kind, label: KIND_LABEL[kind], period }
}

export function statusPillText(display: GameStatusDisplay): string {
  if (display.updating) return "Final (updating…)"
  if (display.period) return `${display.label} · ${display.period}`
  return display.label
}

export function gameStatusDisplay(
  game: Pick<Game, "status" | "home_score" | "away_score">
): GameStatusDisplay {
  const mapped = formatGameStatus(game.status)
  const hasNonZeroScore =
    game.home_score != null &&
    game.away_score != null &&
    (game.home_score !== 0 || game.away_score !== 0)
  if (
    hasNonZeroScore &&
    mapped.kind !== "final" &&
    mapped.kind !== "live" &&
    mapped.kind !== "halftime"
  ) {
    return { kind: "final", label: "Final", period: null, updating: true }
  }
  return mapped
}

function scoreVisible(kind: GameStatusKind): boolean {
  switch (kind) {
    case "live":
    case "halftime":
    case "final":
      return true
    case "scheduled":
    case "pregame":
    case "postponed":
    case "canceled":
    case "delayed":
    case "tbd":
      return false
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function gameScoreDisplay(
  game: Pick<Game, "status" | "home_score" | "away_score">
): ScoreDisplay {
  const shown = gameStatusDisplay(game)
  if (!scoreVisible(shown.kind)) return { mode: "hidden" }
  if (game.home_score == null || game.away_score == null) return { mode: "unavailable" }
  return { mode: "score", away: game.away_score, home: game.home_score }
}

export function recentForm(games: Game[], teamId: number, limit = 5): FormResult[] {
  return games
    .filter(
      (g) =>
        (g.home_team_id === teamId || g.away_team_id === teamId) &&
        isCompletedStatus(g.status) &&
        g.home_score != null &&
        g.away_score != null
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
    .map((g) => {
      const isHome = g.home_team_id === teamId
      const myScore = isHome ? g.home_score : g.away_score
      const oppScore = isHome ? g.away_score : g.home_score
      if (myScore == null || oppScore == null) return "D"
      if (myScore > oppScore) return "W"
      if (myScore < oppScore) return "L"
      return "D"
    })
}

export function hasEloTrend(
  home: Array<{ date: string }>,
  away: Array<{ date: string }>
): boolean {
  return home.length >= 2 || away.length >= 2
}

export function predictionEmptyCopy(kind: GameStatusKind): string | null {
  switch (kind) {
    case "scheduled":
    case "pregame":
      return "Edge available closer to tip-off."
    case "final":
      return "No pre-game pick stored for this match."
    case "live":
    case "halftime":
    case "postponed":
    case "canceled":
    case "delayed":
    case "tbd":
      return null
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/** ESPN scoreboards use STATUS_*; seed/tests may use short labels. */
export function isCompletedStatus(status: string): boolean {
  return formatGameStatus(status).kind === "final"
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
