import { describe, expect, it } from "vitest"

import { getGamesForLeagues } from "./api"

describe("getGamesForLeagues", () => {
  it("returns an empty list when All has no ready leagues to query", async () => {
    expect(await getGamesForLeagues([])).toEqual([])
  })
})
