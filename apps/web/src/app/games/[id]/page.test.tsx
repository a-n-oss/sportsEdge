import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import MatchupPage from "./page"
import type { Game, RatingHistory, Standing } from "../../../lib/api"

const getGame = vi.fn()
const getGames = vi.fn()
const getStandings = vi.fn()
const getTeamRatingHistory = vi.fn()

vi.mock("@/lib/api", () => ({
  getGame: (...args: unknown[]) => getGame(...args),
  getGames: (...args: unknown[]) => getGames(...args),
  getStandings: (...args: unknown[]) => getStandings(...args),
  getTeamRatingHistory: (...args: unknown[]) => getTeamRatingHistory(...args),
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/components/RatingChart", () => ({
  RatingChart: () => <div>Elo chart</div>,
}))

function nbaGame(partial: Partial<Game> = {}): Game {
  return {
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
    ...partial,
  }
}

function historyPoint(teamId: number, date: string, elo = 1550): RatingHistory {
  return { id: teamId, team_id: teamId, game_id: 1, elo_rating: elo, date }
}

async function renderMatchup(game: Game, options?: {
  leagueGames?: Game[]
  homeHistory?: RatingHistory[]
  awayHistory?: RatingHistory[]
  standings?: Standing[]
}) {
  getGame.mockResolvedValue(game)
  getGames.mockResolvedValue(options?.leagueGames ?? [])
  getStandings.mockResolvedValue(options?.standings ?? [])
  getTeamRatingHistory.mockImplementation(async (teamId: number) => {
    if (teamId === game.home_team_id) return options?.homeHistory ?? []
    if (teamId === game.away_team_id) return options?.awayHistory ?? []
    return []
  })
  return render(await MatchupPage({ params: Promise.resolve({ id: String(game.id) }) }))
}

describe("MatchupPage game-detail polish", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getGame.mockReset()
    getGames.mockReset()
    getStandings.mockReset()
    getTeamRatingHistory.mockReset()
  })

  it("shows a human Final pill and History-matching score, not STATUS_FINAL", async () => {
    await renderMatchup(nbaGame())
    expect(screen.getByText("Final")).toBeTruthy()
    expect(screen.getByText("105 – 110")).toBeTruthy()
    expect(screen.queryByText("STATUS_FINAL")).toBeNull()
    expect(screen.queryByText("Crunching the numbers…")).toBeNull()
    expect(screen.queryByText("Predictions pending…")).toBeNull()
  })

  it("archives pre-game edge with Hit/Miss/Close on a predicted final", async () => {
    await renderMatchup(nbaGame())
    expect(screen.getByText("Pre-game edge")).toBeTruthy()
    expect(screen.getByText("Hit")).toBeTruthy()
    expect(screen.getByText(/Close 58%/)).toBeTruthy()
    expect(screen.getByText("← Back to board")).toBeTruthy()
  })

  it("hides scheduled 0-0 and STATUS_SCHEDULED, keeping kickoff only", async () => {
    await renderMatchup(
      nbaGame({
        id: 102,
        status: "STATUS_SCHEDULED",
        home_score: 0,
        away_score: 0,
        date: "2026-09-21T00:00:00Z",
      })
    )
    expect(screen.getByText("Scheduled")).toBeTruthy()
    expect(screen.queryByText("STATUS_SCHEDULED")).toBeNull()
    expect(screen.queryByText("0 – 0")).toBeNull()
    expect(screen.queryByText("Crunching the numbers…")).toBeNull()
    expect(screen.queryByText("Pre-game edge")).toBeNull()
  })

  it("tells the truth when a scheduled game has no stored probs", async () => {
    await renderMatchup(
      nbaGame({
        id: 102,
        status: "STATUS_SCHEDULED",
        home_score: null,
        away_score: null,
        prediction: null,
      })
    )
    expect(screen.getByText("Edge available closer to tip-off.")).toBeTruthy()
    expect(screen.queryByText("Predictions pending…")).toBeNull()
  })

  it("does not claim a pending pick on an unpredicted final", async () => {
    await renderMatchup(nbaGame({ prediction: null }))
    expect(screen.getByText("No pre-game pick stored for this match.")).toBeTruthy()
    expect(screen.queryByText("Predictions pending…")).toBeNull()
    expect(screen.queryByText("Pre-game edge")).toBeNull()
  })

  it("shows live score and a Live · 2H pill", async () => {
    await renderMatchup(
      nbaGame({
        status: "STATUS_SECOND_HALF",
        home_score: 2,
        away_score: 1,
      })
    )
    expect(screen.getByText("Live · 2H")).toBeTruthy()
    expect(screen.getByText("1 – 2")).toBeTruthy()
    expect(screen.queryByText("STATUS_SECOND_HALF")).toBeNull()
    expect(screen.getByText("Pre-game edge")).toBeTruthy()
  })

  it("hides Elo Trend until a team has at least two history points", async () => {
    await renderMatchup(nbaGame(), {
      homeHistory: [historyPoint(9, "2026-09-18T00:00:00Z")],
      awayHistory: [historyPoint(13, "2026-09-18T00:00:00Z")],
    })
    expect(screen.queryByText("Elo Trend")).toBeNull()
    expect(screen.queryByText("Elo chart")).toBeNull()
    expect(screen.queryByText("No history yet.")).toBeNull()
  })

  it("renders Elo Trend when rating history exists", async () => {
    await renderMatchup(nbaGame(), {
      homeHistory: [
        historyPoint(9, "2026-09-10T00:00:00Z", 1540),
        historyPoint(9, "2026-09-18T00:00:00Z", 1560),
      ],
    })
    expect(screen.getByText("Elo Trend")).toBeTruthy()
    expect(screen.getByText("Elo chart")).toBeTruthy()
  })

  it("shows recent form from real results and an honest empty without a fake 0-0", async () => {
    const viewed = nbaGame()
    const gswPrior = nbaGame({
      id: 50,
      away_team_id: 99,
      home_score: 100,
      away_score: 90,
      date: "2026-09-10T00:00:00Z",
      prediction: null,
    })
    const scheduledNoise = nbaGame({
      id: 200,
      status: "STATUS_SCHEDULED",
      home_score: 0,
      away_score: 0,
      date: "2026-09-20T00:00:00Z",
      prediction: null,
    })
    await renderMatchup(viewed, { leagueGames: [gswPrior, scheduledNoise] })
    expect(screen.getByText("W")).toBeTruthy()
    expect(screen.getAllByText("No recent results yet.").length).toBeGreaterThan(0)
    expect(screen.queryByText("0-0")).toBeNull()
  })

  it("shows Score unavailable rather than zeros when a final is missing scores", async () => {
    await renderMatchup(nbaGame({ home_score: null, away_score: null }))
    expect(screen.getByText("Final")).toBeTruthy()
    expect(screen.getByText("Score unavailable")).toBeTruthy()
    expect(screen.queryByText("0 – 0")).toBeNull()
  })

  it("identifies teams with one monogram plus name, abbr in subtler type", async () => {
    await renderMatchup(nbaGame())
    expect(screen.getByText("Golden State Warriors")).toBeTruthy()
    expect(screen.getByText("Los Angeles Lakers")).toBeTruthy()
    expect(screen.getByText("← Back to board")).toBeTruthy()
  })

  it("keeps EPL draw probability in the 3-way bar", async () => {
    await renderMatchup(
      nbaGame({
        league: "epl",
        prediction: {
          game_id: 101,
          home_win_prob: 0.4,
          away_win_prob: 0.35,
          draw_prob: 0.25,
        },
      })
    )
    expect(screen.getByText("Draw 25%")).toBeTruthy()
  })

  it("still renders the matchup when standings, history, and league games fail", async () => {
    getGame.mockResolvedValue(nbaGame())
    getGames.mockRejectedValue(new Error("games down"))
    getStandings.mockRejectedValue(new Error("standings down"))
    getTeamRatingHistory.mockRejectedValue(new Error("history down"))
    render(await MatchupPage({ params: Promise.resolve({ id: "101" }) }))
    expect(screen.getByText("Final")).toBeTruthy()
    expect(screen.getAllByText("No recent results yet.").length).toBeGreaterThan(0)
    expect(screen.queryByText("Elo Trend")).toBeNull()
  })
})
