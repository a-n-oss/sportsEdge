import { describe, expect, it } from "vitest"

import { buildGamesSearchParams } from "./api"
import { COMPLETED_STATUS_QUERY } from "./games"

describe("buildGamesSearchParams", () => {
  it("includes has_prediction so history/accuracy skip unpredicted finals", () => {
    const params = buildGamesSearchParams({
      status: COMPLETED_STATUS_QUERY,
      limit: 200,
      hasPrediction: true,
    })

    expect(params.get("has_prediction")).toBe("true")
    expect(params.get("status")).toBe(COMPLETED_STATUS_QUERY)
    expect(params.get("limit")).toBe("200")
  })

  it("omits has_prediction unless requested", () => {
    const params = buildGamesSearchParams({ league: "nba", limit: 100 })
    expect(params.has("has_prediction")).toBe(false)
    expect(params.get("league")).toBe("nba")
  })
})
