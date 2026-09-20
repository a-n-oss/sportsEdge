import { describe, expect, it } from "vitest"

import type { Game } from "./api"
import {
  COMPLETED_STATUS_QUERY,
  dedupeMirrorMatchups,
  isCompletedStatus,
  predictionCloseness,
  sortCompleted,
} from "./games"

function game(partial: Partial<Game> & Pick<Game, "id" | "home_team_id" | "away_team_id">): Game {
  return {
    league: "nhl",
    date: "2026-09-19T23:00:00Z",
    home_score: null,
    away_score: null,
    status: "STATUS_SCHEDULED",
    ...partial,
  }
}

describe("dedupeMirrorMatchups", () => {
  it("keeps one game when ESPN lists both orientations", () => {
    const games = [
      game({ id: 1, home_team_id: 21, away_team_id: 10 }),
      game({ id: 2, home_team_id: 10, away_team_id: 21 }),
    ]

    const result = dedupeMirrorMatchups(games)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it("does not collapse different matchups on the same day", () => {
    const games = [
      game({ id: 1, home_team_id: 21, away_team_id: 10 }),
      game({ id: 2, home_team_id: 4, away_team_id: 30 }),
    ]

    expect(dedupeMirrorMatchups(games)).toHaveLength(2)
  })

  it("keeps same-orientation doubleheaders", () => {
    const games = [
      game({ id: 1, home_team_id: 21, away_team_id: 10, date: "2026-09-19T17:00:00Z" }),
      game({ id: 2, home_team_id: 21, away_team_id: 10, date: "2026-09-19T23:00:00Z" }),
    ]

    expect(dedupeMirrorMatchups(games)).toHaveLength(2)
  })
})

describe("isCompletedStatus / sortCompleted", () => {
  it("treats ESPN STATUS_FINAL as completed", () => {
    expect(isCompletedStatus("STATUS_FINAL")).toBe(true)
    expect(isCompletedStatus("completed")).toBe(true)
    expect(isCompletedStatus("STATUS_SCHEDULED")).toBe(false)
  })

  it("treats ESPN soccer STATUS_FULL_TIME as completed", () => {
    expect(isCompletedStatus("STATUS_FULL_TIME")).toBe(true)
    expect(isCompletedStatus("STATUS_FT")).toBe(true)
  })

  it("includes STATUS_FINAL games with predictions", () => {
    const games = [
      game({
        id: 1,
        home_team_id: 21,
        away_team_id: 10,
        status: "STATUS_FINAL",
        home_score: 3,
        away_score: 1,
        prediction: {
          game_id: 1,
          home_win_prob: 0.6,
          away_win_prob: 0.4,
          draw_prob: null,
        },
      }),
    ]

    expect(sortCompleted(games)).toHaveLength(1)
  })

  it("exposes a multi-status query for completed games", () => {
    expect(COMPLETED_STATUS_QUERY).toBe("STATUS_FINAL,completed")
  })
})

describe("predictionCloseness", () => {
  it("uses the pre-game win% of the eventual winner", () => {
    const result = predictionCloseness(
      game({
        id: 1,
        home_team_id: 21,
        away_team_id: 10,
        status: "STATUS_FINAL",
        home_score: 3,
        away_score: 1,
        prediction: {
          game_id: 1,
          home_win_prob: 0.62,
          away_win_prob: 0.38,
          draw_prob: null,
        },
      })
    )

    expect(result).toEqual({
      winnerProb: 0.62,
      missBy: 0.38,
      outcome: "home",
      favoriteHit: true,
      modelFavorite: "home",
    })
  })

  it("marks favorite miss when the underdog wins", () => {
    const result = predictionCloseness(
      game({
        id: 2,
        home_team_id: 21,
        away_team_id: 10,
        status: "completed",
        home_score: 1,
        away_score: 4,
        prediction: {
          game_id: 2,
          home_win_prob: 0.7,
          away_win_prob: 0.3,
          draw_prob: null,
        },
      })
    )

    expect(result?.outcome).toBe("away")
    expect(result?.winnerProb).toBe(0.3)
    expect(result?.missBy).toBeCloseTo(0.7)
    expect(result?.favoriteHit).toBe(false)
  })

  it("uses draw probability for tied finals", () => {
    const result = predictionCloseness(
      game({
        id: 3,
        home_team_id: 21,
        away_team_id: 10,
        league: "epl",
        status: "STATUS_FINAL",
        home_score: 1,
        away_score: 1,
        prediction: {
          game_id: 3,
          home_win_prob: 0.4,
          away_win_prob: 0.35,
          draw_prob: 0.25,
        },
      })
    )

    expect(result?.outcome).toBe("draw")
    expect(result?.winnerProb).toBe(0.25)
    expect(result?.favoriteHit).toBe(false)
  })

  it("returns null without a stored prediction", () => {
    expect(
      predictionCloseness(
        game({
          id: 4,
          home_team_id: 21,
          away_team_id: 10,
          status: "STATUS_FINAL",
          home_score: 2,
          away_score: 1,
        })
      )
    ).toBeNull()
  })
})
