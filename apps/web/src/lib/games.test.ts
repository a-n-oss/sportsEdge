import { describe, expect, it } from "vitest"

import type { Game } from "./api"
import {
  COMPLETED_STATUS_QUERY,
  dedupeMirrorMatchups,
  formatGameStatus,
  gameScoreDisplay,
  gameStatusDisplay,
  hasEloTrend,
  isCompletedStatus,
  predictionCloseness,
  predictionEmptyCopy,
  recentForm,
  sortCompleted,
  sortUpcoming,
  statusPillText,
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

describe("sortUpcoming", () => {
  it("keeps a seed-style future STATUS_SCHEDULED game on the board", () => {
    const seeded = game({
      id: 102,
      home_team_id: 9,
      away_team_id: 13,
      status: "STATUS_SCHEDULED",
      date: "2099-01-02T00:00:00Z",
    })

    expect(sortUpcoming([seeded]).map((g) => g.id)).toEqual([102])
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

describe("formatGameStatus", () => {
  it("maps ESPN and seed labels to human copy, never raw enums", () => {
    expect(formatGameStatus("STATUS_SCHEDULED").label).toBe("Scheduled")
    expect(formatGameStatus("scheduled").label).toBe("Scheduled")
    expect(formatGameStatus("STATUS_PREGAME").label).toBe("Pregame")
    expect(formatGameStatus("warmup").label).toBe("Pregame")
    expect(formatGameStatus("STATUS_IN_PROGRESS").label).toBe("Live")
    expect(formatGameStatus("STATUS_HALFTIME").label).toBe("Halftime")
    expect(formatGameStatus("STATUS_FINAL").label).toBe("Final")
    expect(formatGameStatus("completed").label).toBe("Final")
    expect(formatGameStatus("STATUS_FULL_TIME").label).toBe("Final")
    expect(formatGameStatus("FULL_TIME").label).toBe("Final")
    expect(formatGameStatus("STATUS_POSTPONED").label).toBe("Postponed")
    expect(formatGameStatus("STATUS_CANCELED").label).toBe("Canceled")
    expect(formatGameStatus("cancelled").label).toBe("Canceled")
    expect(formatGameStatus("STATUS_DELAYED").label).toBe("Delayed")
    expect(formatGameStatus("STATUS_WHO_KNOWS").label).toBe("TBD")
  })

  it("adds live period chips for soccer halves and numbered periods", () => {
    expect(statusPillText(formatGameStatus("STATUS_FIRST_HALF"))).toBe("Live · 1H")
    expect(statusPillText(formatGameStatus("STATUS_SECOND_HALF"))).toBe("Live · 2H")
    expect(statusPillText(formatGameStatus("STATUS_FIRST_QUARTER"))).toBe("Live · Q1")
    expect(statusPillText(formatGameStatus("STATUS_END_PERIOD"))).toBe("Live")
    expect(statusPillText(formatGameStatus("STATUS_OVERTIME"))).toBe("Live · OT")
    expect(statusPillText(formatGameStatus("Q2"))).toBe("Live · Q2")
    expect(statusPillText(formatGameStatus("STATUS_PERIOD_2"))).toBe("Live · P2")
  })

  it("never returns a STATUS_ token as the visible label", () => {
    for (const raw of [
      "STATUS_SCHEDULED",
      "STATUS_FINAL",
      "STATUS_FULL_TIME",
      "STATUS_FIRST_HALF",
      "STATUS_SECOND_HALF",
    ]) {
      const display = formatGameStatus(raw)
      expect(display.label.startsWith("STATUS_")).toBe(false)
      expect(statusPillText(display)).not.toMatch(/STATUS_/)
    }
  })
})

describe("gameScoreDisplay", () => {
  it("hides 0-0 and any score for scheduled, pregame, postponed, canceled, delayed, TBD", () => {
    const hiddenStatuses = [
      "STATUS_SCHEDULED",
      "STATUS_PREGAME",
      "STATUS_POSTPONED",
      "STATUS_CANCELED",
      "STATUS_DELAYED",
      "STATUS_WHO_KNOWS",
    ]
    for (const status of hiddenStatuses) {
      expect(
        gameScoreDisplay(
          game({
            id: 10,
            home_team_id: 1,
            away_team_id: 2,
            status,
            home_score: 0,
            away_score: 0,
          })
        )
      ).toEqual({ mode: "hidden" })
    }
  })

  it("shows live and final scores, including a real 0-0 final", () => {
    expect(
      gameScoreDisplay(
        game({
          id: 11,
          home_team_id: 1,
          away_team_id: 2,
          status: "STATUS_SECOND_HALF",
          home_score: 1,
          away_score: 0,
        })
      )
    ).toEqual({ mode: "score", away: 0, home: 1 })

    expect(
      gameScoreDisplay(
        game({
          id: 12,
          home_team_id: 1,
          away_team_id: 2,
          status: "STATUS_FINAL",
          home_score: 0,
          away_score: 0,
        })
      )
    ).toEqual({ mode: "score", away: 0, home: 0 })
  })

  it("shows Score unavailable when live or final is missing scores", () => {
    expect(
      gameScoreDisplay(
        game({
          id: 13,
          home_team_id: 1,
          away_team_id: 2,
          status: "STATUS_FINAL",
          home_score: null,
          away_score: null,
        })
      )
    ).toEqual({ mode: "unavailable" })
  })

  it("keeps History finals in sync: non-zero scores on a stale scheduled row show Final (updating…)", () => {
    const stale = game({
      id: 14,
      home_team_id: 1,
      away_team_id: 2,
      status: "STATUS_SCHEDULED",
      home_score: 110,
      away_score: 105,
    })
    expect(statusPillText(gameStatusDisplay(stale))).toBe("Final (updating…)")
    expect(gameScoreDisplay(stale)).toEqual({ mode: "score", away: 105, home: 110 })
  })
})

describe("recentForm", () => {
  it("builds a last-5 W/D/L strip from completed games and ignores scheduled 0-0 noise", () => {
    const games = [
      game({
        id: 1,
        home_team_id: 21,
        away_team_id: 10,
        status: "STATUS_SCHEDULED",
        home_score: 0,
        away_score: 0,
        date: "2026-09-20T00:00:00Z",
      }),
      game({
        id: 2,
        home_team_id: 21,
        away_team_id: 10,
        status: "STATUS_FINAL",
        home_score: 3,
        away_score: 1,
        date: "2026-09-18T00:00:00Z",
      }),
      game({
        id: 3,
        home_team_id: 10,
        away_team_id: 21,
        status: "STATUS_FULL_TIME",
        home_score: 2,
        away_score: 2,
        date: "2026-09-17T00:00:00Z",
      }),
    ]

    expect(recentForm(games, 21)).toEqual(["W", "D"])
  })

  it("returns an empty strip when there are no real results", () => {
    expect(
      recentForm(
        [
          game({
            id: 1,
            home_team_id: 21,
            away_team_id: 10,
            status: "STATUS_SCHEDULED",
            home_score: 0,
            away_score: 0,
          }),
        ],
        21
      )
    ).toEqual([])
  })
})

describe("hasEloTrend", () => {
  it("hides the chart when fewer than two history points exist", () => {
    expect(hasEloTrend([{ date: "2026-09-18" }], [])).toBe(false)
    expect(hasEloTrend([], [])).toBe(false)
  })

  it("shows the chart when a team has a real series", () => {
    expect(
      hasEloTrend(
        [
          { date: "2026-09-10" },
          { date: "2026-09-18" },
        ],
        []
      )
    ).toBe(true)
  })
})

describe("predictionEmptyCopy", () => {
  it("uses honest copy for missing probs instead of Predictions pending", () => {
    expect(predictionEmptyCopy("scheduled")).toBe("Edge available closer to tip-off.")
    expect(predictionEmptyCopy("final")).toBe("No pre-game pick stored for this match.")
    expect(predictionEmptyCopy("live")).toBeNull()
  })
})
