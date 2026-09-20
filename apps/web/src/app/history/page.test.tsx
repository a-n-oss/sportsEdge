import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import HistoryPage from "./page"
import { STUB_HEADER_NOTE } from "../../lib/league"

const getLeagues = vi.fn()
const getGamesForLeagues = vi.fn()

vi.mock("@/lib/api", () => ({
  getLeagues: (...args: unknown[]) => getLeagues(...args),
  getGamesForLeagues: (...args: unknown[]) => getGamesForLeagues(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("HistoryPage", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getLeagues.mockReset()
    getGamesForLeagues.mockReset()
    getLeagues.mockResolvedValue([
      { key: "nfl", ready: false },
      { key: "nba", ready: true },
    ])
    getGamesForLeagues.mockResolvedValue([])
  })

  it("queries only ready leagues for All", async () => {
    render(await HistoryPage({ searchParams: Promise.resolve({}) }))
    expect(getGamesForLeagues).toHaveBeenCalledWith(["nba"], {
      status: "STATUS_FINAL,completed",
      limit: 200,
    })
    expect(screen.queryByText(STUB_HEADER_NOTE)).toBeNull()
  })

  it("shows the Limited header note for a stub chip", async () => {
    render(await HistoryPage({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(getGamesForLeagues).toHaveBeenCalledWith(["nhl"], {
      status: "STATUS_FINAL,completed",
      limit: 200,
    })
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
  })

  it("lists predicted-then-final games", async () => {
    getGamesForLeagues.mockResolvedValue([
      {
        id: 101,
        league: "nba",
        date: "2026-09-18T00:00:00Z",
        home_team_id: 9,
        away_team_id: 13,
        home_score: 110,
        away_score: 105,
        status: "STATUS_FINAL",
        home_team: { id: 9, league: "nba", name: "Golden State Warriors", abbreviation: "GSW" },
        away_team: { id: 13, league: "nba", name: "Los Angeles Lakers", abbreviation: "LAL" },
        prediction: {
          game_id: 101,
          home_win_prob: 0.58,
          away_win_prob: 0.42,
          draw_prob: null,
        },
      },
    ])
    render(await HistoryPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Picks vs Outcomes")).toBeTruthy()
    expect(screen.getByText(/n = 1/)).toBeTruthy()
  })
})
