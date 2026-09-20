import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { STUB_HEADER_NOTE } from "../lib/league"
import { LimitedLeagueNote } from "./LimitedLeagueNote"

describe("LimitedLeagueNote", () => {
  afterEach(() => {
    cleanup()
  })
  it("renders the rankings/teams stub header note", () => {
    render(<LimitedLeagueNote />)
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
  })
})
