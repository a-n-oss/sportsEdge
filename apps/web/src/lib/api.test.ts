import { afterEach, describe, expect, it, vi } from "vitest"

import { buildGamesSearchParams, getAccuracy, getGames } from "./api"
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

describe("getGames", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("fetches /games with has_prediction so history is not clogged by unpredicted finals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal("fetch", fetchMock)

    await getGames({
      status: COMPLETED_STATUS_QUERY,
      limit: 200,
      hasPrediction: true,
    })

    expect(fetchMock).toHaveBeenCalled()
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain("has_prediction=true")
    expect(url).toContain("limit=200")
    expect(url).toContain(`status=${encodeURIComponent(COMPLETED_STATUS_QUERY)}`)
  })
})

describe("getAccuracy", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("omits league unless requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ brier_score: 0.2, calibration: [], sample_size: 0 }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await getAccuracy()

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain("/accuracy")
    expect(url).not.toContain("league=")
  })

  it("passes league so Accuracy chips filter the Brier sample", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ brier_score: 0.16, calibration: [], sample_size: 1 }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await getAccuracy({ league: "nba" })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain("/accuracy")
    expect(url).toContain("league=nba")
  })
})
