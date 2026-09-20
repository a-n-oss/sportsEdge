import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Dashboard from "./page"
import type { Game } from "../lib/api"

const getLeagues = vi.fn()
const getGamesForLeagues = vi.fn()
const getStandings = vi.fn()

vi.mock("@/lib/api", () => ({
  getLeagues: (...args: unknown[]) => getLeagues(...args),
  getGamesForLeagues: (...args: unknown[]) => getGamesForLeagues(...args),
  getStandings: (...args: unknown[]) => getStandings(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

function upcomingGame(): Game {
  return {
    id: 102,
    league: "nba",
    date: "2026-09-21T00:00:00Z",
    home_team_id: 9,
    away_team_id: 13,
    home_score: null,
    away_score: null,
    status: "STATUS_SCHEDULED",
    home_team: { id: 9, league: "nba", name: "Golden State Warriors", abbreviation: "GSW" },
    away_team: { id: 13, league: "nba", name: "Los Angeles Lakers", abbreviation: "LAL" },
    prediction: {
      game_id: 102,
      home_win_prob: 0.65,
      away_win_prob: 0.35,
      draw_prob: null,
    },
  }
}

describe("Dashboard empty states and ready-only All", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getLeagues.mockReset()
    getGamesForLeagues.mockReset()
    getStandings.mockReset()
    getLeagues.mockResolvedValue([
      { key: "nfl", ready: false },
      { key: "nba", ready: true },
    ])
    getStandings.mockResolvedValue([])
  })

  it("does not tell the user to sync data when the board is empty", async () => {
    getGamesForLeagues.mockResolvedValue([])
    render(await Dashboard({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("No games on the board right now.")).toBeTruthy()
    expect(screen.queryByText(/Sync data or adjust the league filter/)).toBeNull()
  })

  it("uses seeding copy for a Limited league with no games", async () => {
    getGamesForLeagues.mockResolvedValue([])
    render(await Dashboard({ searchParams: Promise.resolve({ league: "nhl" }) }))
    expect(screen.getByText("Limited coverage — ratings still seeding.")).toBeTruthy()
    expect(screen.getByText("Check back after the next sync.")).toBeTruthy()
  })

  it("queries only ready leagues for All", async () => {
    getGamesForLeagues.mockResolvedValue([upcomingGame()])
    render(await Dashboard({ searchParams: Promise.resolve({}) }))
    expect(getGamesForLeagues).toHaveBeenCalledWith(["nba"], { limit: 100 })
    expect(screen.getByText("Featured Matchup")).toBeTruthy()
    expect(screen.getAllByText("GSW").length).toBeGreaterThan(0)
  })

  it("still features a matchup when standings fail to load", async () => {
    getGamesForLeagues.mockResolvedValue([upcomingGame()])
    getStandings.mockRejectedValue(new Error("standings down"))
    render(await Dashboard({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Featured Matchup")).toBeTruthy()
  })

  it("renders more games and recent predicted finals", async () => {
    const slate = Array.from({ length: 8 }, (_, i) => ({
      ...upcomingGame(),
      id: 200 + i,
      date: `2026-09-2${i}T00:00:00Z`,
      home_team_id: 9 + i,
      away_team_id: 13 + i,
    }))
    const finalGame: Game = {
      ...upcomingGame(),
      id: 101,
      date: "2026-09-18T00:00:00Z",
      status: "STATUS_FINAL",
      home_score: 110,
      away_score: 105,
      prediction: {
        game_id: 101,
        home_win_prob: 0.58,
        away_win_prob: 0.42,
        draw_prob: null,
      },
    }
    getGamesForLeagues.mockResolvedValue([...slate, finalGame])
    getStandings.mockResolvedValue([
      { rank: 1, team_id: 9, league: "nba", name: "Golden State Warriors", abbreviation: "GSW", elo_rating: 1600 },
      { rank: 2, team_id: 13, league: "nba", name: "Los Angeles Lakers", abbreviation: "LAL", elo_rating: 1550 },
    ])
    render(await Dashboard({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("More Games")).toBeTruthy()
    expect(screen.getByText("Picks vs Outcomes")).toBeTruthy()
  })
})
