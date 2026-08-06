import { describe, expect, it } from "vitest"

import type { Game } from "./api"
import { dedupeMirrorMatchups } from "./games"

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
