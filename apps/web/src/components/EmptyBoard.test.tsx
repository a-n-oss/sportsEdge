import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { EmptyBoard } from "./EmptyBoard"

describe("EmptyBoard", () => {
  afterEach(() => {
    cleanup()
  })
  it("shows seeding copy for a stub league with no games", () => {
    render(<EmptyBoard ready={false} />)
    expect(screen.getByText("Limited coverage — ratings still seeding.")).toBeTruthy()
    expect(screen.getByText("Check back after the next sync.")).toBeTruthy()
    expect(screen.queryByText(/Sync data or adjust the league filter/)).toBeNull()
  })

  it("shows board copy for a ready league with no games", () => {
    render(<EmptyBoard ready={true} />)
    expect(screen.getByText("No games on the board right now.")).toBeTruthy()
    expect(screen.getByText("Check back closer to tip-off.")).toBeTruthy()
    expect(screen.queryByText(/Sync data/)).toBeNull()
  })
})
