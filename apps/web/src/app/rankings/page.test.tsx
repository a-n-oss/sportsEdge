import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import RankingsPage from "./page"
import { STUB_HEADER_NOTE } from "../../lib/league"

const getLeagues = vi.fn()
const getStandings = vi.fn()

vi.mock("@/lib/api", () => ({
  getLeagues: (...args: unknown[]) => getLeagues(...args),
  getStandings: (...args: unknown[]) => getStandings(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("RankingsPage", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getLeagues.mockReset()
    getStandings.mockReset()
    getLeagues.mockResolvedValue([
      { key: "nfl", ready: false },
      { key: "nba", ready: true },
    ])
  })

  it("labels All as ready leagues and skips stub standings", async () => {
    getStandings.mockResolvedValue([
      {
        rank: 1,
        team_id: 9,
        league: "nba",
        name: "Golden State Warriors",
        abbreviation: "GSW",
        elo_rating: 1600,
        trend: 4,
      },
      {
        rank: 2,
        team_id: 13,
        league: "nba",
        name: "Los Angeles Lakers",
        abbreviation: "LAL",
        elo_rating: 1550,
        trend: -2,
      },
      {
        rank: 3,
        team_id: 14,
        league: "nba",
        name: "Miami Heat",
        abbreviation: "MIA",
        elo_rating: 1520,
        trend: 0,
      },
      {
        rank: 4,
        team_id: 2,
        league: "nba",
        name: "Boston Celtics",
        abbreviation: "BOS",
        elo_rating: 1480,
        trend: null,
      },
    ])
    render(await RankingsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Ready leagues")).toBeTruthy()
    expect(screen.getByText("NBA")).toBeTruthy()
    expect(screen.getAllByText("GSW").length).toBeGreaterThan(0)
    expect(getStandings).toHaveBeenCalledWith("nba")
    expect(getStandings).not.toHaveBeenCalledWith("nfl")
    expect(screen.queryByText(STUB_HEADER_NOTE)).toBeNull()
  })

  it("shows the Limited header note for a stub chip", async () => {
    getStandings.mockResolvedValue([])
    render(await RankingsPage({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
    expect(screen.getByText("No rankings for NHL yet.")).toBeTruthy()
  })

  it("shows empty ready-leagues copy when none are ready", async () => {
    getLeagues.mockResolvedValue([{ key: "nhl", ready: false }])
    render(await RankingsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("No rankings for ready leagues yet.")).toBeTruthy()
  })

  it("treats standings fetch failures as an empty table", async () => {
    getStandings.mockRejectedValue(new Error("down"))
    render(await RankingsPage({ searchParams: Promise.resolve({ league: "nba" }) }))
    expect(screen.getByText("No rankings for NBA yet.")).toBeTruthy()
  })
})
