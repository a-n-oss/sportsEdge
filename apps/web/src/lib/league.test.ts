import { describe, expect, it } from "vitest"

import type { Game } from "./api"
import {
  EMPTY_BOARD_COPY,
  STUB_HEADER_NOTE,
  STUB_TOOLTIP,
  emptyBoardCopy,
  fallbackLeagues,
  formatLeagueLabel,
  isLeagueReady,
  isSelectedLeagueReady,
  leagueChipBasePath,
  leaguesToQuery,
  readyLeagueKeys,
  selectVisibleItems,
} from "./league"

function game(partial: Partial<Game> & Pick<Game, "id" | "league">): Game {
  return {
    date: "2026-09-21T00:00:00Z",
    home_team_id: 1,
    away_team_id: 2,
    home_score: null,
    away_score: null,
    status: "STATUS_SCHEDULED",
    ...partial,
  }
}

describe("isLeagueReady", () => {
  it("treats all-default Elo as a stub", () => {
    expect(isLeagueReady({ ratings: [1500, 1500], upcomingEloPairs: [] })).toBe(false)
  })

  it("is ready when any team Elo is not 1500", () => {
    expect(isLeagueReady({ ratings: [1500, 1512], upcomingEloPairs: [] })).toBe(true)
  })

  it("is ready when an upcoming slate game has a non-zero pre-HFA Elo delta", () => {
    expect(
      isLeagueReady({
        ratings: [1500, 1500],
        upcomingEloPairs: [[1480, 1520]],
      })
    ).toBe(true)
  })

  it("is ready when the server marks the league ready", () => {
    expect(isLeagueReady({ ratings: [1500], upcomingEloPairs: [], serverReady: true })).toBe(true)
  })
})

describe("formatLeagueLabel", () => {
  it("title-cases known league keys as acronyms", () => {
    expect(formatLeagueLabel("nfl")).toBe("NFL")
    expect(formatLeagueLabel("epl")).toBe("EPL")
    expect(formatLeagueLabel("NBA")).toBe("NBA")
  })
})

describe("emptyBoardCopy", () => {
  it("uses seeding copy for stub leagues", () => {
    expect(emptyBoardCopy(false)).toEqual(EMPTY_BOARD_COPY.stub)
  })

  it("uses board copy for ready leagues", () => {
    expect(emptyBoardCopy(true)).toEqual(EMPTY_BOARD_COPY.ready)
  })

  it("never tells the user to sync data or adjust a filter", () => {
    const blobs = [
      emptyBoardCopy(false).title,
      emptyBoardCopy(false).detail,
      emptyBoardCopy(true).title,
      emptyBoardCopy(true).detail,
    ].join(" ")
    expect(blobs.toLowerCase()).not.toContain("sync data")
    expect(blobs.toLowerCase()).not.toContain("league filter")
  })
})

describe("selectVisibleItems / ALL = ready only", () => {
  it("returns only the selected league when a chip is active", () => {
    const games = [game({ id: 1, league: "nfl" }), game({ id: 2, league: "nba" })]
    const visible = selectVisibleItems(games, "nfl", new Set(["nba"]))
    expect(visible.map((g) => g.id)).toEqual([1])
  })

  it("excludes stub leagues from All", () => {
    const games = [game({ id: 1, league: "nfl" }), game({ id: 2, league: "nba" })]
    const visible = selectVisibleItems(games, undefined, new Set(["nba"]))
    expect(visible.map((g) => g.id)).toEqual([2])
  })

  it("lists ready league keys", () => {
    expect(
      readyLeagueKeys([
        { key: "nfl", ready: false },
        { key: "nba", ready: true },
      ])
    ).toEqual(["nba"])
  })

  it("queries only the selected chip, otherwise ready leagues", () => {
    expect(leaguesToQuery("nhl", ["nba"])).toEqual(["nhl"])
    expect(leaguesToQuery(undefined, ["nba", "nfl"])).toEqual(["nba", "nfl"])
  })
})

describe("isSelectedLeagueReady", () => {
  it("treats All as ready-only (empty selection is ready)", () => {
    expect(isSelectedLeagueReady(undefined, new Set(["nba"]))).toBe(true)
  })

  it("is false for a stub chip", () => {
    expect(isSelectedLeagueReady("nhl", new Set(["nba"]))).toBe(false)
  })
})

describe("leagueChipBasePath", () => {
  it("keeps league chips on rankings, teams, history, and accuracy", () => {
    expect(leagueChipBasePath("/rankings")).toBe("/rankings")
    expect(leagueChipBasePath("/teams/2")).toBe("/teams")
    expect(leagueChipBasePath("/history")).toBe("/history")
    expect(leagueChipBasePath("/accuracy")).toBe("/accuracy")
    expect(leagueChipBasePath("/")).toBe("/")
  })
})

describe("fallbackLeagues", () => {
  it("assumes ready when the API is unavailable", () => {
    expect(fallbackLeagues().every((league) => league.ready)).toBe(true)
    expect(fallbackLeagues().map((league) => league.key)).toEqual([
      "nfl",
      "nba",
      "mlb",
      "nhl",
      "epl",
    ])
  })
})

describe("stub copy constants", () => {
  it("uses Limited wording, not Beta", () => {
    expect(STUB_TOOLTIP).toBe("Ratings still seeding — probabilities may look flat.")
    expect(STUB_HEADER_NOTE).toBe("Limited — many clubs still at default Elo (1500).")
    expect(STUB_TOOLTIP.toLowerCase()).not.toContain("beta")
    expect(STUB_HEADER_NOTE.toLowerCase()).not.toContain("beta")
  })
})
