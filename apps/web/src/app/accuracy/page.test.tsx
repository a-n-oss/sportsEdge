import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AccuracyPage from "./page"
import { STUB_HEADER_NOTE } from "../../lib/league"

const getLeagues = vi.fn()
const getAccuracy = vi.fn()
const getGamesForLeagues = vi.fn()

vi.mock("@/lib/api", () => ({
  getLeagues: (...args: unknown[]) => getLeagues(...args),
  getAccuracy: (...args: unknown[]) => getAccuracy(...args),
  getGamesForLeagues: (...args: unknown[]) => getGamesForLeagues(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("AccuracyPage", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getLeagues.mockReset()
    getAccuracy.mockReset()
    getGamesForLeagues.mockReset()
    getLeagues.mockResolvedValue([
      { key: "nfl", ready: false },
      { key: "nba", ready: true },
    ])
    getAccuracy.mockResolvedValue({ brier_score: 0.16, calibration: [], sample_size: 1 })
    getGamesForLeagues.mockResolvedValue([])
  })

  it("loads global accuracy for All and only queries ready leagues' games", async () => {
    render(await AccuracyPage({ searchParams: Promise.resolve({}) }))
    expect(getAccuracy).toHaveBeenCalledWith()
    expect(getGamesForLeagues).toHaveBeenCalledWith(["nba"], {
      status: "STATUS_FINAL,completed",
      limit: 100,
      hasPrediction: true,
    })
    expect(screen.queryByText(STUB_HEADER_NOTE)).toBeNull()
  })

  it("honors ?league= for accuracy and games, and notes Limited stubs", async () => {
    render(await AccuracyPage({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(getAccuracy).toHaveBeenCalledWith({ league: "nhl" })
    expect(getGamesForLeagues).toHaveBeenCalledWith(["nhl"], {
      status: "STATUS_FINAL,completed",
      limit: 100,
      hasPrediction: true,
    })
    expect(screen.getByText(STUB_HEADER_NOTE)).toBeTruthy()
  })

  it("renders Brier, calibration, and predicted-then-final rows", async () => {
    getAccuracy.mockResolvedValue({
      brier_score: 0.16,
      calibration: [{ predicted: 0.6, actual: 1 }],
      sample_size: 1,
    })
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
    render(await AccuracyPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("0.160")).toBeTruthy()
    expect(screen.getByText(/Pred 60%/)).toBeTruthy()
    expect(screen.getByText("Picks vs Outcomes")).toBeTruthy()
  })
})
